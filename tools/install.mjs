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
 * usage: node tools/install.mjs [--profile desktop] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripLegacyInsert } from './legacy-entry.mjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
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

function copyTree(from, to, skip = new Set()) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const src = path.join(from, item.name);
    const dst = path.join(to, item.name);
    if (item.isDirectory()) copyTree(src, dst, skip);
    else if (!dryRun) fs.copyFileSync(src, dst);
  }
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.bak-${stamp}`;
  if (!dryRun) fs.copyFileSync(file, dest);
  return dest;
}

// ---------------------------------------------------------------- 0. sanity
if (!fs.existsSync(profileDir)) {
  console.error(`profile not found: ${profileDir}`);
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
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
const relSpec = 'file:' + path.relative(profileDir, pluginDest).split(path.sep).join('/');
if (pkg.dependencies[PKG] !== relSpec) {
  act(`profile package.json: dependencies["${PKG}"] = "${relSpec}"`);
  pkg.dependencies[PKG] = relSpec;
  if (!dryRun) {
    const bak = backup(pkgFile);
    if (bak) log(`  backup: ${path.basename(bak)}`);
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  }
} else {
  log(`profile package.json already declares ${PKG}`);
}

// node_modules link — the loader resolves the entry name from the profile directory
const linkPath = path.join(profileDir, 'node_modules', PKG);
let linkOk = false;
try {
  const existing = fs.existsSync(linkPath) || (fs.lstatSync(linkPath, { throwIfNoEntry: false }) !== undefined && fs.existsSync(linkPath));
  if (existing) {
    linkOk = true;
    log(`node_modules link already present: ${linkPath}`);
  } else {
    act(`link node_modules/${PKG} -> ${pluginDest}`);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(pluginDest, linkPath, 'junction');
    }
    linkOk = true;
  }
} catch (err) {
  console.error(`could not create the node_modules link: ${err.message}`);
  console.error('create it manually (mklink /J) or run pnpm install inside the profile directory.');
}

// ---------------------------------------------------------------- 3. bundle selection
// The skin is a bundle: its own cordis.patch.yml (declared by package.json's
// dsh.bundle.patch) is what inserts the loader row. The profile only has to select it.
const patchFile = path.join(profileDir, 'cordis.patch.yml');

// 3a. migration — drop the legacy hand-written insert from the profile patch. Leaving it
// in place would insert the same id twice, once from each layer.
if (fs.existsSync(patchFile)) {
  const { text: stripped, dropped } = stripLegacyInsert(fs.readFileSync(patchFile, 'utf8'), { pkg: PKG, entryId: ENTRY_ID });
  if (dropped) {
    act(`remove the legacy loader entry from ${path.basename(patchFile)} (the bundle patch owns it now)`);
    if (!dryRun) {
      const bak = backup(patchFile);
      if (bak) log(`  backup: ${path.basename(bak)}`);
      fs.writeFileSync(patchFile, stripped);
    }
  } else {
    log(`${path.basename(patchFile)} has no legacy entry for ${PKG}`);
  }
}

// 3b. select the bundle
const profilePkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
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
const manifest = JSON.parse(fs.readFileSync(path.join(pluginDest, 'package.json'), 'utf8'));
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
  const outPkg = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  log(`  profile declares: ${(outPkg.dependencies || {})[PKG] || '(missing)'}`);
  log(`  node_modules link: ${fs.existsSync(linkPath) ? 'present' : 'MISSING'}`);
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
