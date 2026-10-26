/**
 * install.mjs — install the Durandal skin into a DSH profile (default: desktop).
 *
 * The `desktop` profile is owned by the Electron app, so `dsh plugin --profile desktop
 * add` is refused by the CLI; this does the same three steps by hand, idempotently and
 * with backups:
 *
 *   1. copy the package to a persistent location   $DSH_HOME/plugins/dsh-client-ui-durandal
 *   2. declare it in the profile                   profiles/<name>/package.json + node_modules
 *   3. select it as a bundle                       profiles/<name>/package.json dsh.profile.bundles
 *
 * Step 3 is what makes the plugin a first-class plugin: app-boot composes the tree by applying
 * the `dsh.bundle.patch` of every package listed in `dsh.profile.bundles`, so the skin's own
 * cordis.patch.yml inserts its loader row. Listing it there is also what makes the app's
 * 插件 page show a card for it under 已安装 — a profile dependency that is merely *installed*
 * but not *selected* is deliberately not listed.
 *
 * This is why the plugin's loader row must NOT be inserted by the profile's own
 * cordis.patch.yml: that would be a second insert of the same id. Older installs did exactly
 * that, so step 3 first strips that legacy block.
 *
 * Close DeepSeek Harness before installing. The app watches its plugin files: rewriting one
 * while it runs disposes the mounted plugin (the pet is retired) without necessarily mounting
 * the new copy. `--force` skips that guard, for the rare case where only metadata changed.
 *
 * usage: node tools/install.mjs [--profile desktop] [--dry-run] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripLegacyInsert } from './legacy-entry.mjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const profileArg = args.indexOf('--profile');
const profileName = profileArg >= 0 ? args[profileArg + 1] : (process.env.DSH_PROFILE || 'desktop');

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', profileName);
const pluginDest = path.join(dshHome, 'plugins', 'dsh-client-ui-durandal');
const PKG = 'dsh-client-ui-durandal';
// The client-modules host serves /plugins/<entry id>/client.js and then demands that the
// bundle register exactly that id, so the entry id is the package name itself.
const ENTRY_ID = PKG;

const log = (msg) => console.log(msg);
function act(msg) { log(dryRun ? `[dry-run] ${msg}` : msg); }

function copyTree(from, to, skip = new Set(), rel = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const src = path.join(from, item.name);
    const dst = path.join(to, item.name);
    const itemRel = rel ? `${rel}/${item.name}` : item.name;
    if (item.isDirectory()) copyTree(src, dst, skip, itemRel);
    else if (!dryRun) {
      // Logs are runtime output, not payload: copying the workspace's .host.log over the
      // installed one would erase the evidence of what the last launch actually did.
      if (/\.log$/i.test(item.name)) continue;
      // pet/config.json is runtime state (position, scale, autoStart). Do not reset it on a
      // reinstall; the repository copy is only the default for a first install.
      if (itemRel === 'pet/config.json' && fs.existsSync(dst)) {
        log(`  keep existing runtime config: ${dst}`);
        continue;
      }
      // Leave identical files alone: their mtime drives the app's live reload, and a needless
      // rewrite disposes the mounted plugin (retiring the pet) even when nothing changed.
      if (fs.existsSync(dst)) {
        try { if (fs.readFileSync(src).equals(fs.readFileSync(dst))) continue; } catch { /* fall through to copy */ }
      }
      try {
        fs.copyFileSync(src, dst);
      } catch (err) {
        // A running pet holds its own executable open. Reinstalling while Harness is open is
        // otherwise fine (JS files are read once), so leave the binary and say so.
        if ((err.code === 'EBUSY' || err.code === 'EPERM') && itemRel === 'pet/bin/Pet.exe') {
          log('  Pet.exe is running; kept the running binary (close Harness to update it)');
          continue;
        }
        throw err;
      }
    }
  }
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.bak-${stamp}`;
  if (!dryRun) fs.copyFileSync(file, dest);
  return dest;
}

/**
 * Read UTF-8 text without a leading BOM. PowerShell's `Out-File`/`Set-Content` (5.1) writes a
 * BOM by default; the Harness host parses package.json with a bare JSON.parse, so a BOM there
 * is fatal at startup ("Unexpected token '\uFEFF'"). Reading defensively means an install
 * repairs a profile that a shell script touched earlier.
 */
function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}
function readJson(file) {
  return JSON.parse(readText(file));
}
/** Write text without a BOM; JSON.stringify output is already BOM-free. */
function writeText(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ''));
}
function realpathOrNull(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

/** Whether the desktop app is running (its Host rewrites plugin files as a live reload). */
function harnessRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" /NH', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return /DeepSeek Harness\.exe/i.test(out);
  } catch {
    return false;
  }
}

/** Drop a top-level `- id:` entry (and its comment header) naming one package. */
function stripPackageEntry(text, packageName) {
  const lines = text.split('\n');
  const kept = [];
  let dropped = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isOurs = /^-\s*(id|name):\s*['"]?/.test(line) && line.includes(packageName);
    if (isOurs) {
      dropped = true;
      while (kept.length && /^\s*#/.test(kept[kept.length - 1])) kept.pop();
      i++;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() === '' && !/^\s+\S/.test(lines[i + 1] ?? '')) break;
        i++;
      }
      continue;
    }
    kept.push(line);
    i++;
  }
  return { text: dropped ? kept.join('\n').replace(/\n{3,}/g, '\n\n') : text, dropped };
}

// ---------------------------------------------------------------- 0. sanity
if (!fs.existsSync(profileDir)) {
  console.error(`profile not found: ${profileDir}`);
  process.exit(1);
}
if (!dryRun && !force && harnessRunning()) {
  console.error('DeepSeek Harness is running. Close it (including the tray icon) and rerun.');
  console.error('Rewriting plugin files while it runs disposes the mounted plugin and retires the pet;');
  console.error('the running copy is not reloaded from the new files. Use --force to override.');
  process.exit(1);
}
const bundle = path.join(here, 'lib', 'client.js');
if (!fs.existsSync(bundle)) {
  console.error('lib/client.js missing — run `node tools/build.mjs` first');
  process.exit(1);
}

log(`package      ${here}`);
log(`profile      ${profileDir}`);
log(`plugin home  ${pluginDest}`);
log('');

// ---------------------------------------------------------------- 1. copy in
// The installed copy is a RUNTIME artifact: only what the host reads at boot. Sources,
// tools, artwork and build logs stay in the workspace so the profile tree stays clean.
const RUNTIME_FILES = ['package.json', 'cordis.patch.yml', 'README.md', 'lib'];
const STALE_ENTRIES = ['src', 'tools', 'art', 'check.log', 'check.err'];
act(`sync runtime files -> ${pluginDest}`);
fs.mkdirSync(pluginDest, { recursive: true });
for (const name of STALE_ENTRIES) {
  const stale = path.join(pluginDest, name);
  if (fs.existsSync(stale)) {
    act(`  drop stale ${name}`);
    if (!dryRun) fs.rmSync(stale, { recursive: true, force: true });
  }
}
for (const name of RUNTIME_FILES) {
  const src = path.join(here, name);
  if (!fs.existsSync(src)) continue;
  if (fs.statSync(src).isDirectory()) copyTree(src, path.join(pluginDest, name));
  else if (!dryRun) fs.copyFileSync(src, path.join(pluginDest, name));
}

// ---------------------------------------------------------------- 2. profile dependency
const pkgFile = path.join(profileDir, 'package.json');
const pkg = readJson(pkgFile);
pkg.dependencies = pkg.dependencies || {};
const relSpec = 'file:' + path.relative(profileDir, pluginDest).split(path.sep).join('/');
let pkgDirty = false;
if (pkg.dependencies[PKG] !== relSpec) {
  act(`profile package.json: dependencies["${PKG}"] = "${relSpec}"`);
  pkg.dependencies[PKG] = relSpec;
  pkgDirty = true;
} else {
  log(`profile package.json already declares ${PKG}`);
}

// Migration: an earlier workaround split the pet into a second, host-only package because the
// host half looked dead. It was not: the resolved copy lacked lib/pet. Remove every trace of
// the workaround so this package is again the only one that owns the pet.
const LEGACY_PET = 'dsh-client-ui-durandal-pet';
if (pkg.dependencies[LEGACY_PET]) {
  act(`profile package.json: remove legacy dependency "${LEGACY_PET}"`);
  delete pkg.dependencies[LEGACY_PET];
  pkgDirty = true;
}
if (Array.isArray(pkg.dsh?.profile?.bundles) && pkg.dsh.profile.bundles.includes(LEGACY_PET)) {
  act(`profile package.json: remove legacy bundle "${LEGACY_PET}"`);
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((name) => name !== LEGACY_PET);
  pkgDirty = true;
}
if (pkgDirty) {
  if (!dryRun) {
    const bak = backup(pkgFile);
    if (bak) log(`  backup: ${path.basename(bak)}`);
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  }
}

// node_modules projection — the Loader resolves the entry name from the profile directory.
// It must point at the installed copy, not at a stale projection: pnpm may have copied only
// lib/index.js + lib/client.js before the pet payload existed, and then the host half runs but
// cannot find lib/pet/bin/Pet.exe (and its log, which lives in lib/pet, cannot be written).
const linkPath = path.join(profileDir, 'node_modules', PKG);
const desired = realpathOrNull(pluginDest);
try {
  const st = fs.lstatSync(linkPath, { throwIfNoEntry: false });
  const resolved = realpathOrNull(linkPath);
  const isLink = st !== undefined && st.isSymbolicLink();
  if (st !== undefined && isLink && resolved === desired) {
    log(`node_modules link already points at the installed copy: ${linkPath}`);
  } else {
    const what = st === undefined ? 'missing' : isLink ? `link to ${resolved}` : 'stale copy';
    act(`replace ${what} at node_modules/${PKG} with a link to ${pluginDest}`);
    if (!dryRun) {
      if (st !== undefined) {
        if (isLink) fs.unlinkSync(linkPath);
        else fs.rmSync(linkPath, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(pluginDest, linkPath, 'junction');
    }
  }
} catch (err) {
  console.error(`could not create the node_modules link: ${err.message}`);
  console.error('create it manually (mklink /J) or run pnpm install inside the profile directory.');
}

// The legacy package's junction is inert once it leaves bundles, but remove it so a later
// `pnpm install` cannot resolve it by name.
const legacyLink = path.join(profileDir, 'node_modules', LEGACY_PET);
const legacySt = fs.lstatSync(legacyLink, { throwIfNoEntry: false });
if (legacySt !== undefined) {
  act(`remove legacy node_modules link ${LEGACY_PET}`);
  if (!dryRun) {
    if (legacySt.isSymbolicLink()) fs.unlinkSync(legacyLink);
    else fs.rmSync(legacyLink, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 3. bundle selection
// The skin is a bundle: its own cordis.patch.yml (declared by package.json's
// dsh.bundle.patch) is what inserts the loader row. The profile only has to select it.
const patchFile = path.join(profileDir, 'cordis.patch.yml');

// 3a. migration — drop the legacy hand-written insert from the profile patch. Leaving it
// in place would insert the same id twice, once from each layer.
if (fs.existsSync(patchFile)) {
  const raw = fs.readFileSync(patchFile, 'utf8');
  const hadBom = raw.charCodeAt(0) === 0xFEFF;
  const legacy = stripLegacyInsert(raw.replace(/^\uFEFF/, ''), { pkg: PKG, entryId: ENTRY_ID });
  const pet = stripPackageEntry(legacy.text, LEGACY_PET);
  if (legacy.dropped) {
    act(`remove the legacy loader entry from ${path.basename(patchFile)} (the bundle patch owns it now)`);
  } else {
    log(`${path.basename(patchFile)} has no legacy entry for ${PKG}`);
  }
  if (pet.dropped) act(`remove the legacy pet launcher entry from ${path.basename(patchFile)}`);
  if (hadBom) act(`remove the UTF-8 BOM from ${path.basename(patchFile)} (the host's YAML reader keeps it in the first key)`);
  if (legacy.dropped || pet.dropped || hadBom) {
    if (!dryRun) {
      const bak = backup(patchFile);
      if (bak) log(`  backup: ${path.basename(bak)}`);
      writeText(patchFile, pet.text);
    }
  }
}

// 3b. select the bundle
const profilePkg = readJson(pkgFile);
const bundles = profilePkg.dsh?.profile?.bundles;
if (!Array.isArray(bundles)) {
  console.error(`profile package.json has no dsh.profile.bundles array — refusing to guess`);
  process.exit(1);
}
if (bundles.includes(PKG)) {
  log(`profile package.json already selects ${PKG}`);
} else {
  act(`profile package.json: dsh.profile.bundles += "${PKG}"`);
  profilePkg.dsh.profile.bundles = [...bundles, PKG];
  if (!dryRun) {
    const bak = backup(pkgFile);
    if (bak) log(`  backup: ${path.basename(bak)}`);
    fs.writeFileSync(pkgFile, JSON.stringify(profilePkg, null, 2) + '\n');
  }
}

// The bundle's own patch has to be where app-boot reads it.
const manifest = readJson(path.join(pluginDest, 'package.json'));
const declaredPatch = manifest.dsh?.bundle?.patch;
if (declaredPatch !== './cordis.patch.yml') {
  act(`installed copy: dsh.bundle.patch is ${JSON.stringify(declaredPatch)} — expected "./cordis.patch.yml"`);
}

// ---------------------------------------------------------------- 4. verify resolution
log('');
log('verification');
if (dryRun) {
  log('  (dry run — nothing was written)');
} else {
  const profileRaw = fs.readFileSync(pkgFile);
  const hasBom = profileRaw[0] === 0xEF && profileRaw[1] === 0xBB && profileRaw[2] === 0xBF;
  log(`  profile package.json parses: ${(() => { try { readJson(pkgFile); return 'yes'; } catch (e) { return 'NO — ' + e.message; } })()}`);
  log(`  profile package.json BOM: ${hasBom ? 'PRESENT (fatal at startup)' : 'none'}`);
  if (hasBom) process.exitCode = 1;
  const outPkg = readJson(pkgFile);
  log(`  profile declares: ${(outPkg.dependencies || {})[PKG] || '(missing)'}`);
  log(`  legacy pet package selected: ${Array.isArray(outPkg.dsh?.profile?.bundles) && outPkg.dsh.profile.bundles.includes(LEGACY_PET) ? 'YES (should be gone)' : 'no'}`);
  const resolvedLink = realpathOrNull(linkPath);
  log(`  node_modules link: ${resolvedLink ? `-> ${resolvedLink}` : 'MISSING'}`);
  const resolvedPet = resolvedLink && path.join(resolvedLink, 'lib', 'pet', 'bin', 'Pet.exe');
  const payloadOk = !!resolvedPet && fs.existsSync(resolvedPet);
  log(`  resolved package carries the pet: ${payloadOk ? 'yes (lib/pet/bin/Pet.exe)' : 'NO — the Loader would run a copy without the payload'}`);
  if (!payloadOk) process.exitCode = 1;
  log(`  bundle selected: ${(outPkg.dsh?.profile?.bundles || []).includes(PKG) ? 'yes' : 'NO'}`);
  log(`  bundle patch: ${declaredPatch === './cordis.patch.yml' ? `declared (${declaredPatch}), file ${fs.existsSync(path.join(pluginDest, 'cordis.patch.yml')) ? 'present' : 'MISSING'}` : `WRONG (${JSON.stringify(declaredPatch)})`}`);
  log(`  profile patch free of a duplicate insert: ${/name:\s*['"]dsh-client-ui-durandal['"]/.test(fs.readFileSync(patchFile, 'utf8')) ? 'NO' : 'yes'}`);
  const head = fs.readFileSync(path.join(pluginDest, 'lib', 'index.js'), 'utf8');
  log(`  host half exports apply: ${/export function apply/.test(head) ? 'yes' : 'NO'}`);
  log(`  client bundle size: ${(fs.statSync(path.join(pluginDest, 'lib', 'client.js')).size / 1024).toFixed(1)} KB`);
}

log('');
log('Next: restart the DeepSeek Harness app so the boot manifest picks up the plugin,');
log('then open Settings → 幽兰黛尔 (or press Ctrl+Alt+Shift+D to toggle).');
log('The sidebar 插件 page should now list it under 已安装.');
log('');
log(`Rollback: node tools/uninstall.mjs --profile ${profileName}`);
