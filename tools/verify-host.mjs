/**
 * verify-host.mjs — the host half and the pet payload, checked without launching anything.
 *
 * The lesson from the community ("materials must be committed, or a GitHub-direct install
 * arrives with 404s") is enforced here: a missing executable, sprite or config fails the build
 * instead of being discovered at runtime.
 *
 * usage: node tools/verify-host.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const petDir = path.join(root, 'lib', 'pet');
let checks = 0, fails = 0;
const ok = (name, pass, detail) => {
  checks++;
  if (pass) console.log('  PASS  ' + name);
  else { fails++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
};
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const readJson = (file) => JSON.parse(readText(file));
/** A BOM is fatal where the host uses a bare JSON.parse (profile package.json at startup). */
const hasBom = (file) => {
  const b = fs.readFileSync(file).subarray(0, 3);
  return b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
};

console.log('\nA. payload (must be committed, or a GitHub-direct install arrives broken)');
const must = ['bin/Pet.exe', 'assets/pet.png', 'assets/pet.json', 'config.json', 'src/Pet.cs', 'NOTICE.md'];
for (const rel of must) {
  const p = path.join(petDir, rel);
  ok(`lib/pet/${rel} exists`, fs.existsSync(p), p);
}
const exe = path.join(petDir, 'bin', 'Pet.exe');
const head = fs.existsSync(exe) ? fs.readFileSync(exe).subarray(0, 2).toString('latin1') : '';
ok('Pet.exe is a Windows executable (MZ header)', head === 'MZ', JSON.stringify(head));

console.log('\nB. sprite manifest points at a real file');
let sheet = null;
try { sheet = readJson(path.join(petDir, 'assets', 'pet.json')).sheet; } catch (e) { sheet = null; }
ok('pet.json parses and declares a sheet', typeof sheet === 'string', String(sheet));
ok('the declared sheet exists next to the manifest', !!sheet && fs.existsSync(path.join(petDir, 'assets', sheet)), String(sheet));

console.log('\nC. config carries the switch the host reads');
let cfg = null;
try { cfg = readJson(path.join(petDir, 'config.json')); } catch (e) { cfg = null; }
ok('config.json parses', !!cfg);
ok('config.autoStart is a boolean', !!cfg && typeof cfg.autoStart === 'boolean', cfg && String(cfg.autoStart));
ok('config.json has no UTF-8 BOM', !hasBom(path.join(petDir, 'config.json')));

console.log('\nD. host half');
const hostSrc = fs.readFileSync(path.join(root, 'lib', 'index.js'), 'utf8');
const mod = await import('file:///' + path.join(root, 'lib', 'index.js').replace(/\\/g, '/'));
ok('lib/index.js exports apply()', typeof mod.apply === 'function');
ok('names the plugin (so the loader mounts the right fibre)', mod.name === 'dsh-client-ui-durandal');
ok('guards the platform (non-Windows degrades quietly)', /process\.platform !== "win32"|process\.platform !== 'win32'/.test(hostSrc));
ok('honours config.autoStart === false', /autoStart === false/.test(hostSrc));
ok('spawn is wrapped in try/catch (a pet failure cannot break the host)', /try \{\s*child = spawn/.test(hostSrc));
ok('terminates on unload (ctx.effect)', /ctx\.effect\(/.test(hostSrc));
ok('effect returns the disposer (Cordis runs the callback immediately)', /ctx\.effect\(\(\)\s*=>\s*\{[\s\S]*?return\s*\(\)\s*=>/.test(hostSrc));
ok('config reader tolerates a UTF-8 BOM', /replace\(\/\^\\uFEFF\//.test(hostSrc));
ok('a missing pet directory still leaves a log (os.tmpdir fallback)', /tmpdir\(\)/.test(hostSrc));
ok('terminates on host exit (process.once)', /process\.once\('exit'/.test(hostSrc));

console.log('\nE. packaging');
const pkg = readJson(path.join(root, 'package.json'));
ok('package.json files[] ships lib/pet', Array.isArray(pkg.files) && pkg.files.includes('lib/pet'));
ok('package.json has no UTF-8 BOM', !hasBom(path.join(root, 'package.json')));
ok('package.json declares repository/homepage/bugs',
  !!pkg.repository && !!pkg.homepage && !!pkg.bugs, JSON.stringify(pkg.repository));
ok('no split pet-host workaround package', !fs.existsSync(path.join(root, 'pet-host')));
const residue = ['hooks', 'install-hooks.ps1', 'install-autostart.ps1'];
for (const r of residue) ok(`no terminal-automation residue: ${r}`, !fs.existsSync(path.join(root, r)) && !fs.existsSync(path.join(petDir, r)));
ok('no .lnk shortcuts shipped', !fs.readdirSync(petDir).some((f) => f.endsWith('.lnk')));

console.log(`\nverdict: ${checks - fails}/${checks} host checks passed`);
if (fails) { console.log('\n' + fails + ' CHECK(S) FAILED - do not install this build.'); process.exit(1); }
console.log('\nAll host checks passed.');
