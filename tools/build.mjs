/**
 * build.mjs — inline the artwork into the servable client bundle.
 *
 * The DSH client-modules host serves exactly one file per plugin
 * (`/plugins/<id>/client.js`), so the two wallpapers travel inside the bundle as data URLs.
 *
 * usage: node tools/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcFile = path.join(root, 'src', 'skin.js');
const outFile = path.join(root, 'lib', 'client.js');
/* The artwork is the user's to supply: it is a character illustration, not part of the code.
   Look for it inside the package first (a clone that carries its own art/), then beside it
   (the layout this skin was developed in, where art/ is shared with tools/make-art.py). */
const art = [path.join(root, 'art'), path.resolve(root, '..', 'art')]
  .find((dir) => fs.existsSync(path.join(dir, 'durandal-light.jpg')));
if (!art) {
  throw new Error([
    'build: artwork not found.',
    'Put durandal-light.jpg and durandal-dark.jpg in one of:',
    `  ${path.join(root, 'art')}`,
    `  ${path.resolve(root, '..', 'art')}`,
    'They are the user-supplied artwork described under 素材 in README.md.',
  ].join('\n'));
}

const dataUrl = (file, mime) => {
  const buf = fs.readFileSync(path.join(art, file));
  return { url: `data:${mime};base64,${buf.toString('base64')}`, bytes: buf.length };
};

const light = dataUrl('durandal-light.jpg', 'image/jpeg');
const dark = dataUrl('durandal-dark.jpg', 'image/jpeg');

let code = fs.readFileSync(srcFile, 'utf8');
const before = code.length;

for (const [token, value] of [
  ['__DURANDAL_ART_LIGHT__', light.url], ['__DURANDAL_ART_DARK__', dark.url]
]) {
  if (!code.includes(token)) throw new Error(`build: placeholder ${token} missing from src/skin.js`);
  code = code.split(token).join(value);
}
if (/__[A-Z_]+__/.test(code)) throw new Error('build: unresolved placeholder in output');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, code);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`src/skin.js   ${kb(before)} (source)`);
console.log(`art light     ${kb(light.bytes)} -> inline`);
console.log(`art dark      ${kb(dark.bytes)} -> inline`);
console.log(`lib/client.js ${kb(code.length)} (bundle)`);
