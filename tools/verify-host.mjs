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
try { sheet = JSON.parse(fs.readFileSync(path.join(petDir, 'assets', 'pet.json'), 'utf8')).sheet; } catch (e) { sheet = null; }
ok('pet.json parses and declares a sheet', typeof sheet === 'string', String(sheet));
ok('the declared sheet exists next to the manifest', !!sheet && fs.existsSync(path.join(petDir, 'assets', sheet)), String(sheet));

console.log('\nC. config carries the switch the host reads');
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(path.join(petDir, 'config.json'), 'utf8')); } catch (e) { cfg = null; }
ok('config.json parses', !!cfg);
ok('config.autoStart is a boolean', !!cfg && typeof cfg.autoStart === 'boolean', cfg && String(cfg.autoStart));

console.log('\nD. host half');
const hostSrc = fs.readFileSync(path.join(root, 'lib', 'index.js'), 'utf8');
const mod = await import('file:///' + path.join(root, 'lib', 'index.js').replace(/\\/g, '/'));
ok('lib/index.js exports apply()', typeof mod.apply === 'function');
ok('names the plugin (so the loader mounts the right fibre)', mod.name === 'dsh-client-ui-durandal');
ok('guards the platform (non-Windows degrades quietly)', /process\.platform !== "win32"|process\.platform !== 'win32'/.test(hostSrc));
ok('honours config.autoStart === false', /autoStart === false/.test(hostSrc));
ok('spawn is wrapped in try/catch (a pet failure cannot break the host)', /try \{\s*child = spawn/.test(hostSrc));
ok('terminates on unload (ctx.effect)', /ctx\.effect\(/.test(hostSrc));
ok('terminates on host exit (process.once)', /process\.once\('exit'/.test(hostSrc));

console.log('\nE. packaging');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
ok('package.json files[] ships lib/pet', Array.isArray(pkg.files) && pkg.files.includes('lib/pet'));
ok('package.json declares repository/homepage/bugs',
  !!pkg.repository && !!pkg.homepage && !!pkg.bugs, JSON.stringify(pkg.repository));
const residue = ['hooks', 'install-hooks.ps1', 'install-autostart.ps1'];
for (const r of residue) ok(`no terminal-automation residue: ${r}`, !fs.existsSync(path.join(root, r)) && !fs.existsSync(path.join(petDir, r)));
ok('no .lnk shortcuts shipped', !fs.readdirSync(petDir).some((f) => f.endsWith('.lnk')));

console.log(`\nverdict: ${checks - fails}/${checks} host checks passed`);
if (fails) { console.log('\n' + fails + ' CHECK(S) FAILED - do not install this build.'); process.exit(1); }
console.log('\nAll host checks passed.');
