import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Run after the real Jekyll build. A private repo can still have a public Pages site.
// Fail if an internal document or prototype asset would be published accidentally.
const output = path.resolve('_site');
async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(filename));
    else files.push(path.relative(output, filename).split(path.sep).join('/'));
  }
  return files.sort();
}

const publicFiles = ['index.html', 'privacy.html'];
// GitHub Pages also emits its default theme CSS, already present on the public site.
const allowedOutput = ['assets/css/style.css', ...publicFiles];
assert.deepEqual(await filesUnder(output), allowedOutput,
  'Pages output must contain only the existing public pages and generated theme CSS. Check _config.yml exclusions.');
for (const filename of publicFiles) {
  assert.deepEqual(await readFile(path.join(output, filename)), await readFile(filename),
    `The Pages build unexpectedly transformed ${filename}`);
}
console.log('Pages boundary verified: unchanged landing/privacy HTML and the generated theme CSS only.');
