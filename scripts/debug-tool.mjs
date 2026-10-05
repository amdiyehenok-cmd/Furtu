/**
 * Prints what a single text tool actually renders after a run.
 *
 * Used to tell a genuine product failure from a gap in the test harness — the
 * two look identical from the outside but need completely different fixes.
 *
 *   node scripts/debug-tool.mjs /tools/developer/markdown-preview
 */
import { chromium } from 'playwright';

const base = process.env.FURTU_BASE ?? 'http://localhost:4173';
const route = process.argv[2] ?? '/tools/developer/markdown-preview';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160));
});

await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30_000 });

const sample = page.getByRole('button', { name: 'Try a sample' });
if (await sample.count()) await sample.first().click();
await page.waitForTimeout(300);

const before = await page.evaluate(() => ({
  textareaLen: document.querySelector('.text-ws textarea')?.value.length ?? 0,
  buttons: [...document.querySelectorAll('.ws-actions button')].map((b) => ({
    label: b.textContent.trim(),
    disabled: b.disabled,
  })),
}));

const run = page.getByRole('button', { name: /^Run / });
if (await run.count()) await run.first().click();
await page.waitForTimeout(2500);

const after = await page.evaluate(() => ({
  textOut: document.querySelector('.text-out') ? (document.querySelector('.text-out').value ?? document.querySelector('.text-out').textContent ?? '').slice(0, 200) : null,
  textOutExists: !!document.querySelector('.text-out'),
  outputBoxes: [...document.querySelectorAll('[class*="out"], [class*="result"]')].map((e) => e.className).slice(0, 12),
  stats: [...document.querySelectorAll('.stat-chip')].map((e) => e.textContent).slice(0, 6),
  diagnostics: [...document.querySelectorAll('.diagnostics li')].map((e) => e.textContent.slice(0, 80)),
  alert: document.querySelector('[role=alert]')?.textContent?.slice(0, 120) ?? null,
  phase: document.querySelector('.ws-status')?.textContent?.slice(0, 80) ?? null,
  wsClasses: document.querySelector('.ws-body > *')?.className ?? null,
}));

console.log(route);
console.log('\nbefore run:', JSON.stringify(before, null, 1));
console.log('\nafter run:', JSON.stringify(after, null, 1));
if (errors.length) console.log('\nerrors:', errors);

await browser.close();
