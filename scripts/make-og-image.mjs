/**
 * Render public/og-image.png (1200×630) from an HTML template.
 *
 * The card image was previously declared as `summary_large_image` with no image
 * attached, so every share rendered as a bare text card. Generating it from HTML
 * rather than shipping a hand-made PNG means the card cannot drift from the
 * site's own design tokens, and the two typefaces are the same files the site
 * serves — so the card looks like the site by construction.
 *
 *     node scripts/make-og-image.mjs
 *
 * Requires a build to have run first, because the self-hosted fonts live in
 * dist/. Playwright is already a dev dependency for the browser harnesses.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The same F as favicon.svg and the header Mark, so all three agree. */
const MARK = `
  <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="15" fill="url(#tile)" />
    <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="14.25" fill="none"
          stroke="#60A5FA" stroke-opacity="0.55" stroke-width="1.5" />
    <path fill="url(#mark)" d="M17 14h30v10H28v7h16v9H28v10H17V14Z" />
  </svg>`;

const HTML = (interHref, serifHref, monoHref) => `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  /* The site's own woff2 files, read out of the build. @font-face paths are
     absolute so the data: URL below can resolve them. */
  @font-face { font-family: Inter; src: url(${interHref}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Source Serif 4'; src: url(${serifHref}) format('woff2'); font-weight: 200 900; }
  @font-face { font-family: 'IBM Plex Mono'; src: url(${monoHref}) format('woff2'); font-weight: 100 700; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: #070c18;
    /* Two off-centre blue sources, matching the hero wash on the site itself. */
    background-image:
      radial-gradient(52% 62% at 84% 18%, rgba(59,124,232,.40) 0%, transparent 68%),
      radial-gradient(46% 54% at 12% 96%, rgba(36,71,176,.42) 0%, transparent 70%);
    color: #f1f5f9;
    font-family: Inter, system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 80px;
  }
  .top { display: flex; align-items: center; gap: 20px; }
  .mark { width: 76px; height: 76px; filter: drop-shadow(0 10px 26px rgba(59,124,232,.45)); }
  .word { font-size: 34px; font-weight: 700; letter-spacing: .2em; }
  h1 {
    font-family: 'Source Serif 4', Georgia, serif;
    font-size: 82px; font-weight: 600; line-height: 1.04;
    letter-spacing: -.045em; max-width: 15ch;
  }
  h1 em { font-style: normal; color: #7FB2F5; }
  .foot { display: flex; align-items: center; gap: 22px;
          font-family: 'IBM Plex Mono', monospace; font-size: 19px;
          color: #9CACBF; letter-spacing: .04em; }
  .foot .dot { width: 5px; height: 5px; border-radius: 50%; background: #3B7CE8; }
  .foot b { color: #E3F0FF; font-weight: 500; }
</style></head>
<body>
  <div class="top">${MARK}<span class="word">FURTU</span></div>
  <h1>Fast, private tools for <em>PDFs, images and data</em>.</h1>
  <div class="foot"><b>63 tools</b><span class="dot"></span>Processed on your device<span class="dot"></span>Never uploaded</div>

  <svg width="0" height="0" aria-hidden="true"><defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#111C33" /><stop offset="1" stop-color="#070C18" />
    </linearGradient>
    <linearGradient id="mark" x1=".15" y1="0" x2=".85" y2="1">
      <stop offset="0" stop-color="#E3F0FF" /><stop offset=".45" stop-color="#7FB2F5" /><stop offset="1" stop-color="#2C6BE0" />
    </linearGradient>
  </defs></svg>
</body></html>`;

async function main() {
  const dist = path.join(rootDir, 'dist', 'fonts');

  // One file per family per subset: the `latin` variants are what an English
  // card renders with. Hard-coded rather than globbed so a stray file in the
  // directory cannot silently change which face the card uses.
  const pick = async (family) => {
    const files = (await readFile(path.join(rootDir, 'src', 'fonts.css'), 'utf8'))
      .split(/\r?\n/)
      .join(' ');
    const match = files.match(new RegExp(`font-family:\\s*'${family}'[\\s\\S]{0,400}?url\\(([^)]+latin-[a-f0-9]+\\.woff2)\\)`));
    if (!match) throw new Error(`no latin face found for ${family} in src/fonts.css — run scripts/fetch-fonts.mjs`);
    const bytes = await readFile(path.join(rootDir, 'public', match[1]));
    return `data:font/woff2;base64,${bytes.toString('base64')}`;
  };

  const [inter, serif, mono] = await Promise.all([pick('Inter'), pick('Source Serif 4'), pick('IBM Plex Mono')]);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  // An inline document, so no request is made for the page itself. The fonts
  // travel as data URLs rather than as file requests for the same reason.
  await page.setContent(HTML(inter, serif, mono), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const out = path.join(rootDir, 'public', 'og-image.png');
  await page.screenshot({ path: out, type: 'png' });
  await browser.close();

  const bytes = await readFile(out);
  console.log(`wrote ${path.relative(rootDir, out)} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});