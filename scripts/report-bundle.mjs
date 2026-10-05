/**
 * Reports what a first visit actually costs, following static imports.
 *
 * The first version of this script counted only the entry chunk and the HTML,
 * which understated the real cost by a whole chunk: anything the entry imports
 * with `import` rather than a dynamic `import()` is downloaded before the page
 * is interactive. This walks the static import graph from the entry so the
 * number matches what a browser actually fetches.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const manifestPath = path.join(dist, '.vite', 'manifest.json');

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const measure = (buf) => ({
  raw: buf.length,
  gzip: gzipSync(buf).length,
  brotli: brotliCompressSync(buf).length,
});

/* --- work out the static import graph from the manifest ------------------ */

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
// `imports` entries are output filenames, not manifest keys, so both are
// indexed and lookups accept either form.
const byKey = new Map();
const byOutput = new Map();
for (const [key, value] of Object.entries(manifest)) {
  byKey.set(key, value);
  if (value.file) byOutput.set(value.file, value);
}
const resolve = (ref) => byKey.get(ref) ?? byOutput.get(ref);

const html = readFileSync(path.join(dist, 'index.html'));
const entryKey = [...byKey.entries()].find(([, v]) => v.isEntry)?.[0];
if (!entryKey) throw new Error('no entry chunk in the manifest');

/** Every chunk reachable from the entry by static import. */
function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const imported of resolve(key)?.imports ?? []) staticClosure(imported, seen);
  return seen;
}

const closure = staticClosure(entryKey);

/* --- report -------------------------------------------------------------- */

const htmlSizes = measure(html);
const chunks = [...closure]
  .map((key) => ({ file: resolve(key).file }))
  .filter((c) => c.file)
  .map((c) => ({ file: c.file, ...measure(readFileSync(path.join(dist, c.file))) }))
  .sort((a, b) => b.brotli - a.brotli);

const jsRaw = chunks.reduce((s, c) => s + c.raw, 0);
const jsGzip = chunks.reduce((s, c) => s + c.gzip, 0);
const jsBrotli = chunks.reduce((s, c) => s + c.brotli, 0);

console.log('FURTU first-load budget');
console.log('=======================');
console.log(`index.html            ${kb(htmlSizes.raw).padStart(9)}  ${kb(htmlSizes.gzip)} gzip  ${kb(htmlSizes.brotli)} brotli`);
for (const c of chunks) {
  console.log(`${c.file.padEnd(24)}${kb(c.raw).padStart(9)}  ${kb(c.gzip)} gzip  ${kb(c.brotli)} brotli`);
}
console.log(
  `\nfirst load            ${kb(htmlSizes.brotli + jsBrotli).padStart(9)}  ${kb(htmlSizes.gzip + jsGzip)} gzip  (html + static JS, brotli)`,
);

/* --- what waits for a later interaction ---------------------------------- */

const eager = new Set(chunks.map((c) => path.basename(c.file)));
const deferred = readdirSync(assets)
  .filter((f) => f.endsWith('.js') && !eager.has(f))
  .sort((a, b) => readFileSync(path.join(assets, b)).length - readFileSync(path.join(assets, a)).length);

console.log('\ndeferred until needed:');
for (const f of deferred) {
  console.log(`  ${f.padEnd(38)}${kb(readFileSync(path.join(assets, f)).length).padStart(9)}`);
}
