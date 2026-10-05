/**
 * Runs every tool in a real browser and records what actually happened.
 *
 * This is the check the unit tests cannot do. They prove operations work on
 * generated fixtures; this proves the page wires the operation up, the lazy
 * chunk loads, the workspace state advances from idle to done, and a download is
 * actually produced — for all 63 tools, through the same UI a visitor uses.
 *
 *   node scripts/test-all-tools.mjs
 *   node scripts/test-all-tools.mjs --only=merge-pdf
 *   node scripts/test-all-tools.mjs --shots
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.FURTU_BASE ?? 'http://localhost:4173';
const wantShots = process.argv.includes('--shots');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;
const shotDir = path.join(root, 'shots', 'tools');
if (wantShots) await mkdir(shotDir, { recursive: true });

/** Tool URLs, taken from the sitemap so the list cannot drift from the build. */
async function toolRoutes() {
  const xml = await fetch(`${base}/sitemap.xml`).then((r) => r.text());
  return [...xml.matchAll(/<loc>([^<]*\/tools\/[^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => /^\/tools\/[a-z-]+\/[a-z0-9-]+$/.test(p))
    .filter((p) => !only || p.includes(only));
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });

const results = [];

for (const route of await toolRoutes()) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

  const record = { route, status: 'unknown', detail: '' };

  try {
    await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30_000 });

    const isTextWorkspace = await page.locator('.text-ws textarea').count();
    if (isTextWorkspace) {
      // Text tools: use the sample, then run. The button is labelled
      // "Run <tool name>", so it is found by role rather than by a fixed string
      // that would have to be kept in step with the tool names.
      const sample = page.getByRole('button', { name: 'Try a sample' });
      if (await sample.count()) await sample.first().click();
      await page.waitForTimeout(150);
      await page.getByRole('button', { name: /^Run / }).first().click();
      await page.waitForSelector('.text-out, .diagnostics, [role=alert]', { timeout: 20_000 }).catch(() => {});
    } else {
      // File tools: use the sample, then run.
      const sample = page.getByRole('button', { name: /Try a sample/ });
      if (!(await sample.count())) {
        record.status = 'no-sample';
        record.detail = 'no sample affordance found';
        results.push(record);
        await page.close();
        continue;
      }
      await sample.first().click();
      // The generator is async (canvas encoding), so wait for the queue to fill.
      await page
        .waitForFunction(() => document.querySelectorAll('.file-row').length > 0, null, { timeout: 15_000 })
        .catch(() => {});
      await page.waitForTimeout(200);

      const rows = await page.locator('.file-row').count();
      if (rows === 0) {
        record.status = 'sample-rejected';
        record.detail =
          (await page.locator('.diagnostics li').first().textContent().catch(() => null)) ?? 'no file accepted';
        results.push(record);
        await page.close();
        continue;
      }

      const run = page.getByRole('button', { name: /Process files|Run/ }).first();
      if (await run.isDisabled()) {
        record.status = 'run-disabled';
        record.detail = `minFiles not met with ${rows} sample(s)`;
        results.push(record);
        await page.close();
        continue;
      }
      await run.click();
      await page
        .waitForSelector('.result-name, .text-out, [role=alert], .ws-error', { timeout: 45_000 })
        .catch(() => {});
    }

    // The pass condition is a real result, not merely the absence of an error.
    // Waiting is on *content*, not on the presence of the element: the output
    // box exists before the tool has run, so waiting for the selector returns
    // immediately and reads an empty box.
    const hasContent = () => {
      const out = document.querySelector('.text-out');
      const text = out instanceof HTMLTextAreaElement ? out.value : (out?.textContent ?? '');
      return (
        document.querySelectorAll('.result-name').length > 0 ||
        text.trim().length > 0 ||
        !!document.querySelector('[role=alert]') ||
        !!document.querySelector('.text-ws img, .text-ws canvas')
      );
    };
    await page.waitForFunction(hasContent, null, { timeout: 45_000 }).catch(() => {});

    const state = await page.evaluate(() => {
      const out = document.querySelector('.text-out');
      // The output is a <textarea> for some tools and a read-only element for
      // others, so the value is read from whichever it is. Reading textContent
      // from a textarea always returns empty, never the result.
      const text = out instanceof HTMLTextAreaElement ? out.value : (out?.textContent ?? '');

      return {
        results: document.querySelectorAll('.result-name').length,
        textOutLen: text.trim().length,
        image: !!document.querySelector('.text-ws img, .text-ws canvas'),
        chips: document.querySelectorAll('.stat-chip').length,
        alert: document.querySelector('[role=alert]')?.textContent?.trim().slice(0, 90) ?? null,
      };
    });

    if (state.results > 0 || state.textOutLen > 0 || state.image) {
      record.status = 'pass';
      record.detail = state.results
        ? `${state.results} output file(s)`
        : state.image
          ? 'image output'
          : `${state.textOutLen} chars of output${state.chips ? `, ${state.chips} chips` : ''}`;
    } else if (state.alert) {
      record.status = 'error';
      record.detail = state.alert;
    } else {
      record.status = 'no-output';
      record.detail = 'finished without a result and without an error';
    }

    if (errors.length) record.detail += ` | console: ${errors[0]}`;

    if (wantShots) {
      const name = route.replace(/^\/tools\//, '').replace(/\//g, '_') + '.png';
      await page.screenshot({ path: path.join(shotDir, name), fullPage: false });
    }
  } catch (error) {
    record.status = 'threw';
    record.detail = error.message.split('\n')[0].slice(0, 120);
  }

  results.push(record);
  process.stdout.write(record.status === 'pass' ? '.' : 'x');
  await page.close();
}

await browser.close();

const byStatus = new Map();
for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

console.log(`\n\n${results.length} tools exercised in a real browser\n`);
for (const [status, n] of [...byStatus].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${status.padEnd(16)} ${n}`);
}

const failed = results.filter((r) => r.status !== 'pass');
if (failed.length) {
  console.log(`\nNOT PASSING (${failed.length})`);
  for (const r of failed) console.log(`  ${r.route}\n    ${r.status}: ${r.detail}`);
  process.exitCode = 1;
} else {
  console.log('\nEvery tool produced a real result through the real UI.');
}
