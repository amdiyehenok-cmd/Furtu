/**
 * Screenshot a set of representative pages at a given viewport.
 *
 *   node scripts/shoot.mjs home /tools/pdf/merge-pdf
 *   node scripts/shoot.mjs --dark --mobile / /tools/image/compress-image
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.FURTU_BASE ?? 'http://localhost:4173';
const dir = path.join(root, 'shots');
await mkdir(dir, { recursive: true });

const args = process.argv.slice(2);
const dark = args.includes('--dark');
const mobile = args.includes('--mobile');
const routes = args.filter((a) => a.startsWith('/'));
if (routes.length === 0) routes.push('/');

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 },
  deviceScaleFactor: 2,
  colorScheme: dark ? 'dark' : 'light',
});

for (const route of routes) {
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30_000 });
  if (dark) {
    // The site stores its own theme, so the OS preference alone is not enough.
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('furtu-theme', 'dark');
    });
    await page.waitForTimeout(250);
  }
  const name =
    (route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_')) +
    (dark ? '.dark' : '') +
    (mobile ? '.mobile' : '') +
    '.png';
  await page.screenshot({ path: path.join(dir, name), fullPage: !mobile });
  console.log(name);
  await page.close();
}

await browser.close();
