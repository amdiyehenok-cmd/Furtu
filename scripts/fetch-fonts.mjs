/**
 * Download the web fonts and rewrite the stylesheet to serve them locally.
 *
 * The site originally pulled Inter, IBM Plex Mono and Source Serif 4 from
 * Google Fonts. That put two things at odds with the product's own claims:
 * every page view handed the visitor's IP address to Google, and in the EU that
 * transfer without consent is a genuine GDPR exposure — which the privacy page
 * had to disclose, weakening the one claim the product is built around. It also
 * made first paint wait on a third party.
 *
 * Self-hosting fixes all three at once with no visual change: all three
 * families are permissively licensed, so the woff2 files can be redistributed
 * (see OFL.txt / Apache-2.0 notes in this directory).
 *
 * This script exists rather than a one-off download so the result is
 * reproducible and auditable. Run it only when the font set changes:
 *
 *     node scripts/fetch-fonts.mjs
 *
 * It writes public/fonts/*.woff2 and src/fonts.css. src/fonts.css is generated
 * — edit this script, not the output.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'public', 'fonts');
const cssOut = path.join(rootDir, 'src', 'fonts.css');

/**
 * The exact query the site shipped with, so the regenerated stylesheet covers
 * the same faces it always did. Changing a weight here changes the design; add
 * the weight to src/index.css as well or the face will be downloaded and never
 * used.
 */
const FAMILIES = [
  'IBM+Plex+Mono:wght@400;500;600',
  'Inter:wght@400;450;500;550;600;650;700',
  'Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,650',
];

/**
 * Every family this build depends on, checked against the response.
 *
 * Google Fonts silently ignores request parameters it does not recognise rather
 * than rejecting the request, so a malformed URL returns a *valid, shorter*
 * stylesheet instead of an error. An earlier version of this script omitted the
 * `family=` prefix on two of three entries, received a 200 containing only the
 * first family, and cheerfully reported "fetched 6 files". The build then
 * shipped with two of its three typefaces silently falling back to the system
 * stack — no error, no failed test, just wrong output. A script that regenerates
 * assets has to fail loudly when it gets less than it asked for.
 */
const EXPECTED_FAMILIES = ['IBM Plex Mono', 'Inter', 'Source Serif 4'];

// The `family=` prefix is applied here, per entry, rather than written into the
// array or the template by hand. Both of those are places to forget it, and
// forgetting is silent.
const GOOGLE_CSS = `https://fonts.googleapis.com/css2?${FAMILIES.map((f) => `family=${f}`).join('&')}&display=swap`;

/**
 * Only latin and latin-ext. The full response is ~88 files across cyrillic,
 * greek and vietnamese, which this English-language site never renders. Dropping
 * them is most of the reason self-hosting is faster than the CDN was.
 */
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

/**
 * A modern desktop UA. Google serves woff2 to browsers it believes understand
 * it, and older agents get ttf — which would have been a silent 4x size
 * regression, and would not have failed any test.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const LICENCE = `The font files in this directory are redistributed under their own licences,
not FURTU's. Each family keeps its original licence, reproduced in the files
below:

  Inter              SIL Open Font License 1.1
  IBM Plex Mono      SIL Open Font License 1.1
  Source Serif 4     SIL Open Font License 1.1

The OFL permits redistribution and embedding in web software, including
commercial use, provided the fonts are not sold on their own and the licence
travels with them. These files are unmodified as served by their upstream
project.
`;

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const response = await fetch(GOOGLE_CSS, { headers: { 'User-Agent': UA } });
  if (!response.ok) {
    throw new Error(`Google Fonts responded ${response.status} ${response.statusText}`);
  }
  const css = await response.text();

  // Google's stylesheet is a flat list of blocks, each preceded by a
  // `/* subset */` comment. Split on the comment so every rule keeps the subset
  // it belongs to — the same subset served as two files would collide.
  const blocks = css.split(/(?=\/\*\s*[a-z0-9-]+\s*\*\/)/i);
  const kept = [];
  const dropped = { otherSubset: 0, noSubset: 0, noRemote: 0 };
  // Inter and Source Serif 4 are variable fonts, so Google serves ONE file per
  // family+subset and references it from every weight's @font-face rule. Keying
  // the output filename on the URL hash means all those weights land on the same
  // filename naturally — and without this map the loop wrote 119 KB of
  // Source Serif out four times and 47 KB of Inter out seven times, then shipped
  // 800 KB of identical bytes to a CDN that never had to store more than one.
  const written = new Map();
  let downloaded = 0;
  let bytes = 0;

  for (const block of blocks) {
    const subset = block.match(/\/\*\s*([a-z0-9-]+)\s*\*\//i)?.[1];
    if (!subset) {
      if (block.includes('@font-face')) dropped.noSubset += 1;
      continue;
    }
    if (!KEEP_SUBSETS.has(subset)) {
      dropped.otherSubset += 1;
      continue;
    }

    const family = block.match(/font-family:\s*'([^']+)'/)?.[1] ?? 'font';
    const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim().replace(/\s+/g, '-') ?? '400';
    const remote = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!remote) {
      dropped.noRemote += 1;
      console.warn(`  ! no woff2 url in block: ${family} ${weight} ${subset}`);
      continue;
    }

    // The hash keeps two faces that differ only by weight from colliding, and
    // changes when upstream re-encodes, so a stale file is never silently reused.
    const hash = createHash('sha256').update(remote).digest('hex').slice(0, 8);

    let name = written.get(hash);
    if (!name) {
      // Variable fonts share a hash across weights, so the filename is keyed on
      // the family alone. The weight stays out of it deliberately: including it
      // is what produced the duplicate files.
      name = `${slug(family)}-${subset}-${hash}.woff2`;

      const file = await fetch(remote, { headers: { 'User-Agent': UA } });
      if (!file.ok) throw new Error(`font download failed ${file.status} for ${remote}`);
      const body = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(outDir, name), body);

      written.set(hash, name);
      downloaded += 1;
      bytes += body.length;
    }
    kept.push(
      block
        .replace(/^\/\*[^*]*\*\/\s*/, `/* ${family} ${weight} — ${subset}, served locally */\n`)
        .replace(remote, `/fonts/${name}`),
    );
  }

  if (downloaded === 0) throw new Error('no font files matched — refusing to write an empty stylesheet');

  // Fail loudly on a partial result. See the note on EXPECTED_FAMILIES: a
  // malformed query returns a valid but shorter stylesheet, and the build would
  // otherwise ship with whole typefaces silently missing.
  const got = new Set(kept.map((block) => block.match(/font-family:\s*'([^']+)'/)?.[1]));
  const missing = EXPECTED_FAMILIES.filter((family) => !got.has(family));
  if (missing.length > 0) {
    throw new Error(
      `stylesheet is missing ${missing.join(', ')}. Got: ${[...got].join(', ') || 'nothing'}. ` +
        'The request was probably malformed — Google Fonts ignores unrecognised parameters ' +
        'rather than rejecting them.',
    );
  }

  const header = `/**
 * Self-hosted web fonts. GENERATED by scripts/fetch-fonts.mjs — do not edit.
 *
 * These files used to be fetched from fonts.googleapis.com on every page view.
 * Serving them from this origin removes a third-party request that handed every
 * visitor's IP address to Google, which the privacy page previously had to
 * disclose. The rendered type is identical.
 */

`;

  await writeFile(cssOut, header + kept.join('\n\n').trim() + '\n', 'utf8');
  await writeFile(path.join(outDir, 'OFL.txt'), LICENCE, 'utf8');

  const kb = (bytes / 1024).toFixed(1);
  console.log(`stylesheet: ${blocks.length} blocks, ${dropped.otherSubset} other subset, ${dropped.noSubset} unlabelled, ${dropped.noRemote} without a url`);
  console.log(`fetched ${downloaded} woff2 files (${kb} KB) for ${[...KEEP_SUBSETS].join(', ')}`);
  console.log(`wrote ${path.relative(rootDir, cssOut)}`);
  console.log(`wrote ${path.relative(rootDir, outDir)}/*.woff2 and OFL.txt`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
