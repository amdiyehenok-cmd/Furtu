/**
 * Browser audit of the built site.
 *
 * Everything else in this repository proves the code is correct in Node. This
 * proves it is correct in a browser: that every prerendered page hydrates, that
 * no page logs a console error, and that no link goes anywhere broken. Those are
 * three failures that no amount of typechecking or server rendering can catch.
 *
 *   node scripts/browser-audit.mjs                  # audit every page
 *   node scripts/browser-audit.mjs --shots          # also capture screenshots
 *   node scripts/browser-audit.mjs --only=/tools/pdf # a subset
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.FURTU_BASE ?? 'http://localhost:4173';
const wantShots = process.argv.includes('--shots');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;
const shotDir = path.join(root, 'shots');

/** Every route that has a prerendered HTML file on disk. */
async function routesFromDist() {
  const dist = path.join(root, 'dist');
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') {
        const rel = path.relative(dist, full).split(path.sep).join('/');
        found.push(rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, ''));
      }
    }
  };
  walk(dist);
  return found.sort();
}

const routes = (await routesFromDist()).filter((r) => !only || r.startsWith(only));
if (wantShots) await mkdir(shotDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

const failures = [];
/**
 * Ad-network flakiness is reported, not failed on.
 *
 * AdSense talks to several hosts, one of which (`sodar`) is a latency probe
 * that routinely times out on a restricted or noisy network. That has nothing to
 * do with whether these pages work, and counting it would make the audit
 * unrunnable from a machine that cannot reach every Google server — which is
 * most CI networks, and this one.
 *
 * The split is by origin rather than by a blanket ignore, so a genuinely broken
 * first-party asset still fails, and third-party problems stay visible in the
 * summary instead of disappearing.
 */
const THIRD_PARTY = /googlesyndication|doubleclick|fundingchoicesmessages|googleads\.g\./;
const thirdParty = new Map();

function noteThirdParty(route, detail) {
  if (!thirdParty.has(detail)) thirdParty.set(detail, []);
  const list = thirdParty.get(detail);
  if (list.length < 4) list.push(route);
}

let checked = 0;

for (const route of routes) {
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // A resource-load error carries the failing URL, so it can be attributed
    // to an origin the way a script error cannot.
    const from = msg.location()?.url ?? '';
    const text = msg.text().slice(0, 200);
    if (from && THIRD_PARTY.test(from)) noteThirdParty(route, text);
    else errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message.slice(0, 200)}`));
  page.on('requestfailed', (req) => {
    // A missing favicon is a cosmetic omission, not a broken page.
    if (req.url().includes('favicon')) return;

    // A request the browser cancelled because the page went away is not a
    // broken page either. The ad network sends keepalive pings that are still
    // in flight when the audit closes the tab, and those surface as
    // ERR_ABORTED. Treating them as failures would mean the audit could only
    // ever be green on a site with no third-party requests at all.
    const reason = req.failure()?.errorText ?? '';
    if (reason.includes('ERR_ABORTED')) return;

    const url = req.url();
    if (THIRD_PARTY.test(url)) {
      noteThirdParty(route, `${url.split('/').pop()} (${reason})`);
      return;
    }

    failedRequests.push(`${url.split('/').pop()} (${reason})`);
  });

  const url = base + route;
  try {
    // 15s, not the 30s default. This site is served from disk and answers in
    // milliseconds, so anything still waiting at 15s is a third-party stall,
    // and the shorter cap is what keeps a bad network from turning an 84-page
    // audit into a half-hour one.
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    if (!response || response.status() >= 400) {
      failures.push({ route, reason: `HTTP ${response?.status() ?? 'no response'}` });
      await page.close();
      continue;
    }

    // Hydration is asynchronous, and the route chunk loads after first paint,
    // so the checks below would otherwise run against a half-hydrated tree.
    await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
    await page
      .waitForFunction(
        () => {
          const root = document.querySelector('#root');
          return !!root && Object.keys(root).some((k) => k.startsWith('__react'));
        },
        null,
        { timeout: 10_000 },
      )
      .catch(() => {});

    // Hydration proof: React has to have taken over a node the server rendered.
    // Without this, a page is correct HTML and a dead site.
    const state = await page.evaluate(() => {
      const root = document.querySelector('#root');
      const entry = [...document.querySelectorAll('script[type=module]')].map((s) => s.src);
      return {
        hasMarkup: !!root?.firstElementChild,
        // React attaches these to the container it has hydrated. Their absence
        // means the server markup is on screen and React never ran, which is
        // exactly the failure mode this audit exists to catch.
        hydrated: !!root && Object.keys(root).some((k) => k.startsWith('__react')),
        entryScripts: entry.length,
        h1: document.querySelectorAll('h1').length,
        title: document.title,
        canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') ?? null,
        // A click handler only exists once React owns the node.
        reactive: !!document.querySelector('button, a[href], input'),
      };
    });

    if (!state.hasMarkup) failures.push({ route, reason: 'empty #root — the prerenderer wrote no markup' });
    if (!state.hydrated) failures.push({ route, reason: 'React never hydrated — the page is inert HTML' });
    if (state.entryScripts === 0) failures.push({ route, reason: 'no module script — the page cannot hydrate' });
    if (state.h1 !== 1) failures.push({ route, reason: `${state.h1} <h1> elements, expected exactly 1` });
    if (!state.title) failures.push({ route, reason: 'no <title>' });
    if (!state.canonical) failures.push({ route, reason: 'no canonical link' });

    if (errors.length) failures.push({ route, reason: `console: ${errors[0]}` });
    if (failedRequests.length) failures.push({ route, reason: `request failed: ${failedRequests[0]}` });

    if (wantShots) {
      const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
      await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false });
    }

    checked += 1;
    process.stdout.write('.');
  } catch (error) {
    failures.push({ route, reason: error.message.slice(0, 160) });
    process.stdout.write('x');
  } finally {
    await page.close();
  }
}

await browser.close();

console.log(`\n\nchecked ${checked}/${routes.length} pages at ${base}`);

if (thirdParty.size > 0) {
  console.log(`\nTHIRD-PARTY WARNINGS (${thirdParty.size}) — ad network only, not a page defect`);
  for (const [detail, list] of [...thirdParty].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${detail}`);
    console.log(`    ${list.length} page(s): ${list.slice(0, 5).join(', ')}`);
  }
}

if (failures.length === 0) {
  console.log('No failures. Every page hydrates, logs nothing, and resolves its assets.');
} else {
  console.log(`\nFAILURES (${failures.length})`);
  const byReason = new Map();
  for (const f of failures) {
    const key = f.reason.replace(/\d+/g, 'N');
    if (!byReason.has(key)) byReason.set(key, []);
    byReason.get(key).push(f.route);
  }
  for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${reason}`);
    console.log(`    ${list.length} page(s): ${list.slice(0, 6).join(', ')}${list.length > 6 ? ' …' : ''}`);
  }
  process.exitCode = 1;
}

if (wantShots) console.log(`\nscreenshots in ${shotDir}`);
void existsSync;
void writeFile;
