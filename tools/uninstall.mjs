/**
 * uninstall.mjs — remove the Durandal skin from a DSH profile.
 *
 * Reverses tools/install.mjs: deselects the bundle, removes the profile dependency and the
 * node_modules link, and (unless --keep-files) deletes the installed copy. Profile files are
 * rewritten from scratch rather than restored from a backup, so a partially edited profile
 * still ends up clean.
 *
 * It also still strips a legacy hand-written loader entry from the profile's cordis.patch.yml:
 * installs made before the plugin became a bundle inserted the row there, and a leftover
 * insert would keep the plugin loading after uninstall.
 *
 * usage: node tools/uninstall.mjs [--profile desktop] [--keep-files] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripLegacyInsert } from './legacy-entry.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keepFiles = args.includes('--keep-files');
const profileArg = args.indexOf('--profile');
const profileName = profileArg >= 0 ? args[profileArg + 1] : (process.env.DSH_PROFILE || 'desktop');

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', profileName);
const pluginDest = path.join(dshHome, 'plugins', 'dsh-client-ui-durandal');
const PKG = 'dsh-client-ui-durandal';
const ENTRY_ID = 'dsh-client-ui-durandal';

const act = (msg) => console.log(dryRun ? `[dry-run] ${msg}` : msg);

// 1. legacy loader entry out of cordis.patch.yml
const patchFile = path.join(profileDir, 'cordis.patch.yml');
if (fs.existsSync(patchFile)) {
  const before = fs.readFileSync(patchFile, 'utf8');
  const { text: after, dropped } = stripLegacyInsert(before, { pkg: PKG, entryId: ENTRY_ID });
  if (dropped) {
    act('remove the legacy loader entry from cordis.patch.yml');
    if (!dryRun) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(patchFile, `${patchFile}.bak-${stamp}`);
      fs.writeFileSync(patchFile, after);
    }
  } else {
    console.log('cordis.patch.yml had no entry for this plugin');
  }
}

// 2. bundle selection + profile dependency out
const pkgFile = path.join(profileDir, 'package.json');
if (fs.existsSync(pkgFile)) {
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const bundles = pkg.dsh?.profile?.bundles;
  const deselected = Array.isArray(bundles) && bundles.includes(PKG);
  const depended = Boolean(pkg.dependencies && pkg.dependencies[PKG]);
  if (deselected) {
    act(`remove "${PKG}" from dsh.profile.bundles`);
    pkg.dsh.profile.bundles = bundles.filter((n) => n !== PKG);
  }
  if (depended) {
    act(`remove dependencies["${PKG}"] from the profile`);
    delete pkg.dependencies[PKG];
  }
  if (deselected || depended) {
    if (!dryRun) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(pkgFile, `${pkgFile}.bak-${stamp}`);
      fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
    }
  } else {
    console.log('profile package.json had no selection or dependency for this plugin');
  }
}

// 3. link + installed copy
const linkPath = path.join(profileDir, 'node_modules', PKG);
if (fs.existsSync(linkPath)) {
  act(`remove ${linkPath}`);
  if (!dryRun) fs.rmSync(linkPath, { recursive: true, force: true });
}
if (!keepFiles && fs.existsSync(pluginDest)) {
  act(`delete the installed copy ${pluginDest}`);
  if (!dryRun) fs.rmSync(pluginDest, { recursive: true, force: true });
}

console.log('\nDone. Restart the DeepSeek Harness app to unload the plugin.');
