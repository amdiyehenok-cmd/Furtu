/**
 * Captures the full, unminified hydration error.
 *
 * Production React reports only "Minified React error #418", which does not say
 * what actually mismatched. The development build has the same components and
 * the same server rendering, but reports the real message, so the dev server is
 * driven here rather than guessing at the cause.
 *
 *   node scripts/debug-hydration.mjs /tools/pdf/merge-pdf
 */
import { chromium } from 'playwright';

const dev = process.env.FURTU_DEV ?? 'http://localhost:5199';
const route = process.argv[2] ?? '/tools/pdf/merge-pdf';

const browser = await chromium.launch();
const page = await browser.newPage();

const messages = [];
page.on('console', (m) => messages.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.message}`));

await page.goto(dev + route, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(1500);

const relevant = messages.filter((m) => /hydrat|did not match|418|419|423|server HTML|Warning/i.test(m));

console.log(`dev route: ${route}`);
console.log(`messages: ${messages.length}, relevant: ${relevant.length}\n`);

for (const m of relevant) console.log(m + '\n');

if (relevant.length === 0) {
  console.log('No hydration messages in development either.');
}

await browser.close();