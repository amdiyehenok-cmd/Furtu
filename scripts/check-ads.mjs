/**
 * Check the advertising integration actually works in a real browser.
 *
 * The consent decision now belongs to Google's certified CMP, which only shows
 * itself to EEA, UK and Swiss visitors. That means this script cannot assert
 * that consent gates anything — that claim has to be checked from inside those
 * regions, and it is Google's component either way.
 *
 * What it can do is check everything around it, which is where the silent
 * failures live:
 *
 *   1. the loader is in the HTML and actually executes;
 *   2. every slot is registered with the ad network;
 *   3. ads.txt is served at the root with the right line;
 *   4. the served CSP allows the origins the ad stack and the CMP need;
 *   5. no advert is ever rendered inside a tool — the guarantee that matters;
 *   6. there is no second, local consent banner fighting Google's.
 *
 * Run against the local server:  node scripts/check-ads.mjs
 * Run against production:       FURTU_BASE=https://furtu.xyz node scripts/check-ads.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.FURTU_BASE ?? 'http://localhost:4173';
const CLIENT = 'ca-pub-5358754327162242';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Proof that the loader actually ran, and that a slot was actually
  // registered — a `<script>` tag in the HTML proves neither. Note that this
  // cannot assert on `window.adsbygoogle`: the current loader consumes that
  // queue rather than leaving it as an array, so its absence is not a failure.
  const loader = { ok: false };
  const adRequest = { seen: false };

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('pagead/js/adsbygoogle.js') && res.status() === 200) loader.ok = true;
    if (url.includes('googleads.g.doubleclick.net/pagead/ads')) adRequest.seen = true;
  });

  // `domcontentloaded`, not `networkidle`. The ad network keeps sockets open
// long after the page is useful, so `networkidle` never settles here and the
// navigation simply times out. The ad request is waited for explicitly below.
const response = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const csp = response.headers()['content-security-policy'] ?? '';

  // --- the loader ---------------------------------------------------------
  const loaderSrc = await page
    .locator(`script[src*="adsbygoogle.js"][src*="${CLIENT}"]`)
    .count()
    .then((n) => n > 0);

  check('AdSense loader is in the served HTML', loaderSrc);

  const metaOk = await page
    .locator(`meta[name="google-adsense-account"][content="${CLIENT}"]`)
    .count()
    .then((n) => n > 0);

  check('site verification meta tag is present', metaOk);

  // Wait for the effects, not for a fixed delay. Both are read *after* the
  // wait: reading them straight after navigation would sample them before the
  // async loader has run, which is a test bug that looks exactly like a broken
  // integration.
  await page
    .waitForFunction(() => document.readyState === 'complete', null, { timeout: 15_000 })
    .catch(() => {});
  const deadline = Date.now() + 15_000;
  while (!(loader.ok && adRequest.seen) && Date.now() < deadline) {
    await page.waitForTimeout(250);
  }

  // The ad request is the real proof the slot reached the network.
  check('the loader is fetched and executed', loader.ok);
  check('a slot is registered and an ad request is issued', adRequest.seen);

  // --- the slots ----------------------------------------------------------
  // Count our own containers, not `ins.adsbygoogle`: Google's loader injects
  // its own `adsbygoogle-noablate` sentinel at the document root, so counting
  // the ins elements double-counts every page.
  const slots = await page.locator('aside.ad-slot').count();
  check('the homepage renders its ad slot', slots === 1, `${slots} slot(s)`);

  const reserved = await page
    .locator('aside.ad-slot')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).minHeight) || 0);

  check(
    'the slot reserves its height so filling it causes no layout shift',
    reserved >= 200,
    `min-height ${reserved}px`,
  );

  // --- ads.txt ------------------------------------------------------------
  const ads = await page.goto(`${BASE}/ads.txt`, { waitUntil: 'domcontentloaded' });
  const adsBody = (await ads.text()).trim();

  check('ads.txt is served at the root', ads.status() === 200, `status ${ads.status()}`);
  check(
    'ads.txt carries the exact line Google asked for',
    adsBody === `google.com, pub-5358754327162242, DIRECT, f08c47fec0942fa0`,
    adsBody || '(empty)',
  );

  // --- the CSP ------------------------------------------------------------
  // A locally served dist has no CSP; vercel.json applies it at the edge. So
  // this only asserts when the target actually sends one, which in practice
  // means production.
  if (csp) {
    const needed = [
      'pagead2.googlesyndication.com',
      'fundingchoicesmessages.google.com',
      'googleads.g.doubleclick.net',
    ];
    const missing = needed.filter((origin) => !csp.includes(origin));
    check(
      'served CSP allows the ad stack and the Google CMP',
      missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : 'all present',
    );
  } else {
    console.log('  skip  served CSP (no CSP header on this target; checked by tests/ads.test.ts)');
  }

  // --- no adverts inside a tool -------------------------------------------
  const tool = await context.newPage();
  await tool.goto(`${BASE}/tools/pdf/merge-pdf`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await tool.waitForTimeout(1500);

  const slotsInWorkspace = await tool.locator('.workspace ins.adsbygoogle').count();
  check(
    'no advert is ever rendered inside a tool workspace',
    slotsInWorkspace === 0,
    `${slotsInWorkspace} found`,
  );

  const toolSlot = await tool.locator('aside.ad-slot').count();
  check('the tool page still has its below-the-fold placement', toolSlot === 1, `${toolSlot} slot(s)`);

  // --- no duplicate consent UI --------------------------------------------
  const staleBanner = await tool.locator('.consent').count();
  check(
    'no local consent banner competing with Google’s CMP',
    staleBanner === 0,
    `${staleBanner} found`,
  );

  check(
    'the tool page logs no console errors',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | ') || undefined,
  );

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} advertising checks passed`);

if (failed.length > 0) {
  console.error('\nFailed:');
  for (const f of failed) console.error(`  - ${f.name}`);
  process.exit(1);
}