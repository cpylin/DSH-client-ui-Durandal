/**
 * merge-pet.mjs — step 1: put the pet inside the plugin and give the plugin its host half.
 *
 * Layout choice: the payload goes to `lib/pet/` on purpose. `tools/install.mjs` copies the
 * runtime whitelist ['package.json','cordis.patch.yml','README.md','lib'], so `lib/pet` is
 * already covered by the existing installer - no change to a tool that is known-good.
 *
 * Host half: `lib/index.js` currently exports a no-op apply(). It now launches `Pet.exe` when
 * the plugin mounts and terminates it when the plugin unloads or the host exits. The pet keeps
 * its own single-instance mutex, so a repeated spawn only makes the existing pet surface.
 */
import fs from 'node:fs';
import path from 'node:path';

const plugin = 'D:/deepseek/工作区01/durandal-skin/dsh-client-ui-durandal';
const pet = 'D:/ClaudePet';
const dest = path.join(plugin, 'lib', 'pet');
const notes = [];
let bad = 0;

const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const copy = (rel, required = true) => {
  const from = path.join(pet, rel), to = path.join(dest, rel);
  if (!fs.existsSync(from)) { if (required) { notes.push('MISSING ' + rel); bad++; } return; }
  mkdir(path.dirname(to));
  fs.copyFileSync(from, to);
  notes.push('copied ' + rel);
};

// ---- payload: runtime binaries, sprites, sources (audit), docs, manual launcher
for (const exe of ['Pet.exe', 'PetNotify.exe', 'Cutout.exe', 'MakeSprites.exe', 'SheetGen.exe', 'Zoom.exe']) {
  copy('bin/' + exe, exe === 'Pet.exe' || exe === 'PetNotify.exe');
}
for (const a of ['pet.png', 'pet.json', 'pet.ico']) copy('assets/' + a);
for (const s of fs.readdirSync(path.join(pet, 'src'))) if (s.endsWith('.cs')) copy('src/' + s);
copy('build.sh');
copy('ASSET-USAGE.md');
copy('NOTICE.md');
copy('启动桌宠.cmd', false);

// ---- config: keep the user's position/scale, add the switch the host reads
let cfg = { autoStart: true };
try { Object.assign(cfg, JSON.parse(fs.readFileSync(path.join(pet, 'config.json'), 'utf8'))); } catch (e) { /* defaults */ }
cfg.autoStart = true;
fs.writeFileSync(path.join(dest, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');
notes.push('wrote lib/pet/config.json (autoStart:true)');

// ---- host half
mkdir(path.join(plugin, 'lib'));
fs.writeFileSync(path.join(plugin, 'lib', 'index.js'), `/**
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
`);
notes.push('wrote lib/index.js (host half)');

// ---- gitignore for the plugin as a repository
const ignore = [
  '# skin build artifacts',
  'bak/',
  'art/',
  'ref/',
  'node_modules/',
  '__pycache__/',
  '*.log',
  '',
  '# the pet payload ships WITH the plugin (bin/, assets/, config.json included on purpose:',
  '# a GitHub-direct install must not arrive without an executable)',
  ''
].join('\n');
fs.writeFileSync(path.join(plugin, '.gitignore'), ignore);
notes.push('wrote .gitignore (pet payload explicitly kept)');

// ---- package.json: name/description/repo/version/files
const pkgFile = path.join(plugin, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = '1.1.1';
pkg.description = 'DSH plugin: Durandal (Honkai Impact 3rd) skin - royal-blue/gold palette, character-art chat background, gated CSS, a click-through self test - plus the bundled Q-version Durandal desktop pet, launched with Harness and retired with it.';
pkg.repository = { type: 'git', url: 'git+https://github.com/cpylin/dsh-client-ui-durandal.git' };
pkg.homepage = 'https://github.com/cpylin/dsh-client-ui-durandal#readme';
pkg.bugs = { url: 'https://github.com/cpylin/dsh-client-ui-durandal/issues' };
pkg.keywords = ['dsh', 'dsh-client-plugin', 'skin', 'theme', 'honkai-impact-3rd', 'durandal', 'desktop-pet', 'windows'];
if (!pkg.files.includes('lib/pet')) pkg.files.push('lib/pet');
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
notes.push('package.json -> 1.1.0 + repository/homepage/bugs + files/lib/pet');

console.log(notes.join('\n'));
if (bad) { console.error(bad + ' required file(s) missing'); process.exit(1); }
