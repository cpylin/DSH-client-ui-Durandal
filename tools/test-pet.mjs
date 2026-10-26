/**
 * test-pet.mjs — end-to-end check of the host half, without launching Harness.
 *
 * It imports lib/index.js exactly as the Loader does, gives it a stub `ctx` whose `effect()`
 * follows Cordis's real contract (run the setup now, keep the returned disposer), and then:
 *
 *   1. asserts a Pet.exe process appears after apply();
 *   2. asserts the effect callback returned a disposer rather than having been the disposer;
 *   3. calls the disposer and asserts the process is gone.
 *
 * Step 2 is the regression this script exists for: passing the cleanup straight to ctx.effect()
 * makes Cordis run it immediately, so the pet was killed one millisecond after spawn.
 *
 * The pet owns a single-instance mutex, so an already-running Pet.exe (for example from a live
 * Harness) would make this test meaningless - close Harness first.
 *
 * usage: node tools/test-pet.mjs
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function petProcesses() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Pet.exe" /NH', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return out.split('\n').map((line) => line.trim()).filter((line) => /^Pet\.exe\b/i.test(line));
  } catch {
    return [];
  }
}

let failures = 0;
const check = (name, pass, detail) => {
  if (pass) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
};

if (process.platform !== 'win32') {
  console.log('test-pet: skipped (the bundled pet is a Windows program)');
  process.exit(0);
}
if (petProcesses().length) {
  console.error('test-pet: a Pet.exe is already running (Harness may be open). Close it and retry.');
  process.exit(2);
}

const mod = await import(pathToFileURL(path.join(root, 'lib', 'index.js')).href);
check('lib/index.js exports apply()', typeof mod.apply === 'function');

let setupRan = false;
let disposer = null;
const ctx = {
  effect(setup) {
    setupRan = true;
    const returned = setup();
    disposer = typeof returned === 'function' ? returned : null;
    return returned;
  }
};

const stop = mod.apply(ctx);
await sleep(2500);

check('effect() setup ran', setupRan);
check('effect() returned a disposer', typeof disposer === 'function');
const started = petProcesses();
check('Pet.exe is running after apply()', started.length > 0, 'tasklist: ' + (started.join(' | ') || '(none)'));

if (typeof disposer === 'function') disposer();
else if (typeof stop === 'function') stop();
await sleep(1000);

const stopped = petProcesses();
check('Pet.exe is gone after the disposer runs', stopped.length === 0, 'still running: ' + stopped.join(' | '));

// The module's own process.once('exit') is a second safety net; it also runs when this script ends.
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll pet process checks passed.');
process.exit(failures ? 1 : 0);
