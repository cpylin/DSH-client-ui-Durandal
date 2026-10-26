/**
 * dsh-client-ui-durandal - host half.
 *
 * The skin is browser-local: everything visible happens in lib/client.js, which the
 * client-modules host serves at /plugins/dsh-client-ui-durandal/client.js.
 *
 * This half exists for one reason: the Q-version Durandal desktop pet (lib/pet) is a native
 * Windows program, and only the host plane can start a process. Goals, in order:
 *
 *   1. never break the host - every failure here is swallowed;
 *   2. never fight the pet - it owns a single-instance mutex, so a second spawn simply brings
 *      the running pet forward instead of starting a second one;
 *   3. leave nothing behind - the process is terminated when the plugin unloads and when the
 *      host exits.
 *
 * The pet's own hooks (terminal automation) are intentionally NOT installed: it now lives and
 * dies with Harness. Turn autoStart off in lib/pet/config.json to keep the skin without it.
 *
 * A log is appended to lib/pet/.host.log (module load, apply, spawn result, child exit, stop):
 * the host plane has no console we can read, so this is the only way to see what happened.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-client-ui-durandal';

const DEFAULTS = { autoStart: true };
let child = null;

function petDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'pet');
}

/**
 * Where the log goes. Usually lib/pet/.host.log. If lib/pet is absent - the failure mode where
 * the loader resolves a stale package copy that predates the pet payload - writing inside it
 * would fail and hide the very problem worth seeing, so fall back to the OS temp directory.
 */
function logPath() {
  const dir = petDir();
  return existsSync(dir) ? path.join(dir, '.host.log') : path.join(os.tmpdir(), 'dsh-client-ui-durandal.host.log');
}

/** Append one line to the log; never throws, never blocks the caller. */
function log(message) {
  try {
    appendFileSync(logPath(), new Date().toISOString() + '  ' + message + '\n');
  } catch (err) { /* logging must never matter */ }
}

/**
 * config.json is optional: a missing or broken file must not stop the pet from starting.
 * A BOM is stripped first: tools that write UTF-8 with a BOM (PowerShell 5 among them) would
 * otherwise make JSON.parse throw and silently fall back to the defaults.
 */
function readConfig(dir) {
  try {
    const text = readFileSync(path.join(dir, 'config.json'), 'utf8').replace(/^\uFEFF/, '');
    return Object.assign({}, DEFAULTS, JSON.parse(text));
  } catch (err) {
    return Object.assign({}, DEFAULTS);
  }
}

/** Terminate the pet, best effort. Safe to call twice. */
function stop() {
  const pid = child && child.pid;
  child = null;
  if (!pid) return;
  log('stop  pid=' + pid);
  try { process.kill(pid); } catch (err) { /* already gone */ }
}

log('module loaded  pid=' + process.pid + '  platform=' + process.platform);

export function apply(ctx) {
  const dir = petDir();
  const exe = path.join(dir, 'bin', 'Pet.exe');
  const cfg = readConfig(dir);
  const hasEffect = !!(ctx && typeof ctx.effect === 'function');

  log('apply()  platform=' + process.platform + '  autoStart=' + cfg.autoStart +
      '  exeExists=' + existsSync(exe) + '  ctx.effect=' + hasEffect);

  if (process.platform !== 'win32' || cfg.autoStart === false || !existsSync(exe)) {
    log('apply() -> skipped');
    return stop;
  }

  try {
    child = spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore' });
    child.unref();
    log('spawn ok  pid=' + (child && child.pid));
    if (child && typeof child.on === 'function') {
      child.on('exit', (code, signal) => log('child exited  code=' + code + '  signal=' + signal));
      child.on('error', (err) => log('child error  ' + (err && err.message)));
    }
  } catch (err) {
    child = null;
    log('spawn FAILED  ' + (err && err.message));
  }

  if (hasEffect) {
    // Cordis runs the effect callback NOW and treats its return value as the disposer. Passing
    // the cleanup itself (the old shape) therefore killed the pet one millisecond after spawn.
    try {
      ctx.effect(() => {
        log('effect registered');
        return () => { log('effect dispose -> stop'); stop(); };
      });
    } catch (err) { log('ctx.effect threw  ' + (err && err.message)); }
  }
  process.once('exit', () => { log('host exit -> stop'); stop(); });
  return stop;
}
