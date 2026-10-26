/**
 * legacy-entry.mjs — drop a hand-written loader insert from a profile's cordis.patch.yml.
 *
 * Installs made before the skin became a bundle inserted its row into the profile's own patch
 * layer by hand. A row inserted by a bundle layer AND by the profile patch is the same id in two
 * layers; the loader resolves that last-write-wins, but a leftover insert also keeps the plugin
 * loading after an uninstall, so install.mjs and uninstall.mjs both remove it.
 *
 * Only a top-level `- insert:` block whose first rows name this package is removed, together with
 * the comment lines directly above it. Neighbouring entries are left byte-identical — see the
 * regression check in verify.mjs, which exists because an earlier version advanced the cursor
 * twice per match and silently ate the `- id:` header of the entry that followed.
 */

/**
 * @param {string} text - the profile patch, as read from disk.
 * @param {{pkg: string, entryId?: string}} options - the package name and the loader row id to match.
 * @returns {{text: string, dropped: boolean}} the patch without the legacy block, and whether one was found.
 */
export function stripLegacyInsert(text, { pkg, entryId = pkg }) {
  const lines = text.split('\n');
  const kept = [];
  let dropped = false;

  // Index-driven on purpose: a `for (...; i++)` with a `continue` after the inner scan skips the
  // line the scan stopped on, which is the next entry's header.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isOurInsert = /^-\s*insert:\s*$/.test(line) &&
      lines.slice(i + 1, i + 4).some((l) => l.includes(pkg) || l.includes(entryId));
    if (isOurInsert) {
      dropped = true;
      while (kept.length && /^\s*#/.test(kept[kept.length - 1])) kept.pop();   // its comment header
      i++;                                                                     // past `- insert:`
      while (i < lines.length && /^\s+\S/.test(lines[i])) i++;                 // its indented rows
      continue;                                                                // do NOT advance again
    }
    kept.push(line);
    i++;
  }

  return { text: dropped ? kept.join('\n').replace(/\n{3,}/g, '\n\n') : text, dropped };
}
