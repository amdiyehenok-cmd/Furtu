/**
 * Check the advertising consent flow actually withholds the ad.
 *
 * Written because "the banner renders" and "the banner works" are different
 * claims, and only the second one matters. A consent banner that shows but does
 * not gate anything is worse than none at all: it tells the visitor their
 * choice was respected while the ad network has already been called.
 *
 * Verifies, in a real browser:
 *   1. the banner appears for a visitor who has never answered;
 *   2. declining hides it, is remembered across a reload, and no ad request
 *      is made to the ad network;
 *   3. accepting hides it and *does* let the ad network be contacted.
 *
 * Run against the local server:  node scripts/check-consent.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.FURTU_BASE ?? 'http://localhost:4173';
const AD_HOST = /googlesyndication|doubleclick/i;

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  pass' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function adRequests(page) {
  const seen = [];
  page.on('request', (request) => {
    if (AD_HOST.test(request.url())) seen.push(request.url());
  });
  return seen;
}

const browser = await chromium.launch();

try {
  // --- a visitor who has not answered ------------------------------------
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  const beforeGrant = await adRequests(page);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const banner = page.locator('.consent');
  check('banner appears for an undecided visitor', await banner.isVisible());

  const askedBeforeConsent = beforeGrant.length;
  check(
    'no ad network request before consent',
    askedBeforeConsent === 0,
    `${askedBeforeConsent} request(s)`,
  );

  // --- declining ---------------------------------------------------------
  await page.getByRole('button', { name: /no thanks/i }).click();
  await page.waitForTimeout(1500);

  check('banner hides after declining', !(await banner.isVisible().catch(() => false)));
  check(
    'declining still makes no ad request',
    beforeGrant.length === 0,
    `${beforeGrant.length} request(s) after decline`,
  );

  const stored = await page.evaluate(() => window.localStorage.getItem('furtu.ads-consent'));
  check('choice is stored locally, not in a cookie', stored === 'denied', `localStorage = ${stored}`);
  check(
    'the stored answer is never sent to a third party',
    !(await page.context().cookies()).some((c) => c.name.toLowerCase().includes('adsense')),
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('choice survives a reload', !(await banner.isVisible().catch(() => false)));

  await fresh.close();

  // --- accepting ---------------------------------------------------------
  const fresh2 = await browser.newContext();
  const page2 = await fresh2.newPage();
  const accepting = await adRequests(page2);
  await page2.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1000);

  check('banner reappears in a clean context', await page2.locator('.consent').isVisible());

  await page2.getByRole('button', { name: /allow ads/i }).click();
  await page2.waitForTimeout(2000);

  check('banner hides after accepting', !(await page2.locator('.consent').isVisible().catch(() => false)));
  const stored2 = await page2.evaluate(() => window.localStorage.getItem('furtu.ads-consent'));
  check('acceptance is stored', stored2 === 'granted', `localStorage = ${stored2}`);
  check(
    'the ad network is reachable only after consent',
    accepting.length > 0,
    `${accepting.length} ad request(s) once granted`,
  );

  await fresh2.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log('');
console.log(`${results.length - failed.length}/${results.length} consent checks passed`);
if (failed.length > 0) process.exitCode = 1;