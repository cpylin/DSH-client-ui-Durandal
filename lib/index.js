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
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-client-ui-durandal';

const DEFAULTS = { autoStart: true };
let child = null;

/** lib/pet next to this file. */
function petDir() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'pet');
}

/** config.json is optional: a missing or broken file must not stop the pet from starting. */
function readConfig(dir) {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8')));
  } catch (err) {
    return Object.assign({}, DEFAULTS);
  }
}

/** Terminate the pet, best effort. Safe to call twice. */
function stop() {
  const pid = child && child.pid;
  child = null;
  if (!pid) return;
  try { process.kill(pid); } catch (err) { /* already gone */ }
}

export function apply(ctx) {
  const dir = petDir();
  const exe = path.join(dir, 'bin', 'Pet.exe');
  const cfg = readConfig(dir);

  // Non-Windows hosts, a turned-off switch, or a checkout without the payload: do nothing, and
  // do it quietly - the skin itself does not depend on the pet.
  if (process.platform !== 'win32' || cfg.autoStart === false || !existsSync(exe)) return stop;

  try {
    child = spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore' });
    child.unref();
  } catch (err) {
    child = null;
  }

  if (ctx && typeof ctx.effect === 'function') ctx.effect(() => stop);
  process.once('exit', stop);
  return stop;
}
