/**
 * SEO audit.
 *
 * Crawls the built `dist/` tree and reports the problems the brief lists in
 * its final-audit section: missing or duplicate titles, missing or duplicate
 * descriptions, missing H1s, missing canonicals, broken internal links, orphan
 * pages, missing or invalid structured data, sitemap mismatches, and noindex
 * mistakes.
 *
 * Run it after `npm run build`. It fails with a non-zero exit code if a
 * blocking problem is found, so it can sit in CI.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

const problems = [];
const warnings = [];
const stats = { pages: 0, indexable: 0, tools: 0, bytes: 0 };

function fail(page, message) {
  problems.push({ page, message });
}

function warn(page, message) {
  warnings.push({ page, message });
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name === 'index.html') out.push(full);
  }
  return out;
}

/**
 * Routes are stored without a trailing slash so they compare cleanly with the
 * canonical URLs the pages emit, which are also slash-free.
 */
function routeOf(file) {
  const rel = path.relative(distDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  const route = '/' + rel.replace(/index\.html$/, '').replace(/\/$/, '');
  return route === '//' ? '/' : route;
}

function textOf(html, pattern) {
  const match = pattern.exec(html);
  return match ? match[1].trim() : null;
}

/**
 * The canonical origin every page is expected to use.
 *
 * This used to be a literal in three places, so moving the site to a new domain
 * failed 200+ audit checks that were reporting the audit's own stale copy of the
 * truth rather than anything about the build. The origin is now read from the
 * sitemap the build actually produced, so the auditor checks the build against
 * itself, and a stray origin anywhere else still fails the `single origin` check
 * below. Set VITE_SITE_ORIGIN to pin it explicitly in CI.
 */
const sitemapPath = path.join(distDir, 'sitemap.xml');
const sitemapXml = await readFile(sitemapPath, 'utf8').catch(() => '');
const ORIGIN = (
  process.env.VITE_SITE_ORIGIN?.replace(/\/$/, '') ||
  sitemapXml.match(/<loc>(https?:\/\/[^/]+)\//)?.[1] ||
  'https://furtu.xyz'
).replace(/\/$/, '');

async function main() {
  if (!existsSync(distDir)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exitCode = 1;
    return;
  }

  const files = await walk(distDir);
  const titles = new Map();
  const descriptions = new Map();
  const canonicals = new Map();
  const linked = new Set();
  const pages = [];

  for (const file of files) {
    const route = routeOf(file);
    const html = await readFile(file, 'utf8');
    const size = Buffer.byteLength(html);
    stats.pages += 1;
    stats.bytes += size;
    if (route.startsWith('/tools/') && route.split('/').filter(Boolean).length === 3) stats.tools += 1;

    const title = textOf(html, /<title>([^<]*)<\/title>/);
    const description = textOf(html, /<meta name="description" content="([^"]*)"/);
    const canonical = textOf(html, /<link rel="canonical" href="([^"]*)"/);
    const robots = textOf(html, /<meta name="robots" content="([^"]*)"/) ?? '';
    const h1s = html.match(/<h1[^>]*>/g) ?? [];
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? [];

    pages.push({ route, title, description, canonical, robots, h1: h1s.length, jsonLd: jsonLd.length, size, html });

    if (route !== '/404') {
      if (robots.startsWith('index')) stats.indexable += 1;
      else if (!robots.includes('noindex')) fail(route, 'no robots directive and not indexable by default');

      if (!title) fail(route, 'missing <title>');
      if (!description) fail(route, 'missing meta description');
      if (!canonical) fail(route, 'missing canonical');
      if (h1s.length === 0) fail(route, 'missing H1');
      if (h1s.length > 1) fail(route, `${h1s.length} H1 elements, expected exactly 1`);
      if (jsonLd.length === 0) warn(route, 'no structured data');

      if (title) {
        if (title.length > 70) warn(route, `title is ${title.length} chars (over 70)`);
        if (titles.has(title)) fail(route, `duplicate title, also on ${titles.get(title)}`);
        else titles.set(title, route);
      }
      if (description) {
        if (description.length > 175) warn(route, `description is ${description.length} chars (over 175)`);
        if (descriptions.has(description)) fail(route, `duplicate description, also on ${descriptions.get(description)}`);
        else descriptions.set(description, route);
      }
      if (canonical) {
        const expected = `${ORIGIN}${route === '/404' ? '/404' : route}`;
        if (canonical !== expected) fail(route, `canonical is ${canonical}, expected ${expected}`);
        if (canonicals.has(canonical)) fail(route, `duplicate canonical, also on ${canonicals.get(canonical)}`);
        else canonicals.set(canonical, route);
      }

      // Every JSON-LD block must parse. A malformed block is worse than none.
      for (const block of jsonLd) {
        const json = block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
        try {
          JSON.parse(json);
        } catch (error) {
          fail(route, `invalid JSON-LD: ${error.message}`);
        }
      }
    }

    // Record every internal link so orphans can be found.
    for (const match of html.matchAll(/href="(\/[^"#]*)"/g)) {
      linked.add(match[1].replace(/\/$/, '') || '/');
    }
  }

  // --- broken internal links ---------------------------------------------
  const known = new Set(pages.map((page) => page.route.replace(/\/$/, '') || '/'));
  for (const target of linked) {
    if (target === '/') continue;
    // A static asset is a legitimate link target and is not a route, so ask
    // the filesystem instead of maintaining an allowlist. An allowlist cannot
    // tell a file that exists from one that has been renamed, so it accepts
    // broken links and rejects good ones — which is how adding a favicon came
    // to be reported as a broken internal link.
    const relative = target.replace(/^\//, '');
    if (existsSync(path.join(distDir, relative))) continue;
    if (existsSync(path.join(distDir, relative, 'index.html'))) continue;
    if (!known.has(target)) {
      // Only report once; the source page is not essential to the finding.
      if (!problems.some((p) => p.message === `broken internal link -> ${target}`)) {
        fail('(link)', `broken internal link -> ${target}`);
      }
    }
  }

  // --- orphans ------------------------------------------------------------
  for (const page of pages) {
    if (page.route === '/404' || page.route === '/') continue;
    if (!linked.has(page.route)) warn(page.route, 'orphan page: nothing links to it');
  }

  // --- sitemap ------------------------------------------------------------
  if (!existsSync(sitemapPath)) {
    fail('(sitemap)', 'sitemap.xml is missing');
  } else {
    const xml = sitemapXml;
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    for (const loc of locs) {
      const route = loc.replace(ORIGIN, '') || '/';
      if (!known.has(route)) fail('(sitemap)', `sitemap lists a route that was not built: ${route}`);
    }
    for (const page of pages) {
      if (page.route === '/404') continue;
      const shouldBeListed = page.route === '/' || page.route === '/tools' || page.route.startsWith('/tools/') || page.route.startsWith('/guides');
      if (shouldBeListed && !locs.includes(`${ORIGIN}${page.route === '/' ? '/' : page.route}`)) {
        fail('(sitemap)', `built page is missing from the sitemap: ${page.route}`);
      }
    }
    // Every URL in the sitemap must sit on the one origin. Deriving ORIGIN from
    // the sitemap cannot catch a page that still emits the old domain, because
    // the per-page canonical check would then be comparing the old origin
    // against itself. This compares the two sources directly.
    const stray = locs.find((loc) => !loc.startsWith(`${ORIGIN}/`) && loc !== `${ORIGIN}/`);
    if (stray) fail('(sitemap)', `sitemap lists a URL on a different origin: ${stray}`);
  }

  // --- robots -------------------------------------------------------------
  const robotsPath = path.join(distDir, 'robots.txt');
  if (!existsSync(robotsPath)) fail('(robots)', 'robots.txt is missing');
  else {
    const text = await readFile(robotsPath, 'utf8');
    if (/^Disallow:\s*\/$/m.test(text)) fail('(robots)', 'robots.txt disallows the whole site');
    if (!/^Sitemap:/m.test(text)) fail('(robots)', 'robots.txt has no Sitemap directive');
  }

  // --- report -------------------------------------------------------------
  const largest = pages.sort((a, b) => b.size - a.size).slice(0, 5);
  console.log('FURTU SEO AUDIT');
  console.log('===============');
  console.log(`Pages built        ${stats.pages}`);
  console.log(`Indexable          ${stats.indexable}`);
  console.log(`Tool pages         ${stats.tools}`);
  console.log(`Total HTML bytes   ${(stats.bytes / 1024).toFixed(0)} KB`);
  console.log(`Unique titles      ${titles.size}`);
  console.log(`Unique descriptions${' '.repeat(1)}${descriptions.size}`);
  console.log('');
  console.log('Largest pages:');
  for (const page of largest) console.log(`  ${(page.size / 1024).toFixed(1).padStart(7)} KB  ${page.route}`);
  console.log('');

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length})`);
    for (const item of warnings.slice(0, 25)) console.log(`  ${item.page}: ${item.message}`);
    if (warnings.length > 25) console.log(`  … and ${warnings.length - 25} more`);
    console.log('');
  }

  // A page can pass every content check and still be inert if the entry script
  // tag is missing, so the bundle wiring is checked against the real files on
  // disk. This is not theoretical: the prerenderer once dropped the entry script
  // on every page because it resolved the manifest's output path as a manifest
  // key, and 84 pages of perfect, unclickable HTML shipped.
  const assetsDir = path.join(distDir, 'assets');
  if (!existsSync(assetsDir)) {
    fail('(build)', 'dist/assets is missing — the client bundle was not produced.');
  } else if (!readdirSync(assetsDir).some((f) => f.endsWith('.js'))) {
    fail('(build)', 'dist/assets contains no JavaScript — the client bundle is empty.');
  }

  const brokenScripts = [];
  const emptyRoot = [];
  for (const page of pages) {
    const src = /<script[^>]+src="\/assets\/([^"?]+)"/.exec(page.html)?.[1];
    if (!src) brokenScripts.push(page.route);
    else if (!existsSync(path.join(assetsDir, src))) brokenScripts.push(`${page.route} -> ${src}`);

    // A prerendered page with an empty #root has no visible content at all.
    if (page.route === '/' && !/<div id="root">\s*<(?!div>\s*<\/div>)/.test(page.html)) {
      emptyRoot.push(page.route);
    }
  }

  for (const route of brokenScripts.slice(0, 5)) {
    fail(route, 'no entry script tag, or it points at a file that was not built — this page cannot hydrate.');
  }
  if (brokenScripts.length > 5) {
    fail('(build)', `…and ${brokenScripts.length - 5} further pages with the same problem.`);
  }
  for (const route of emptyRoot) fail(route, 'the prerendered #root is empty.');

  console.log('Bundle wiring');
  console.log(`Pages with a live entry script  ${pages.length - brokenScripts.length}/${pages.length}`);

  // --- third-party origins ------------------------------------------------
  // The site makes exactly one third-party request, and it is deliberate:
  // Google AdSense. The privacy page discloses it, and the CSP in vercel.json
  // pins it to a named list.
  //
  // This check existed before advertising did, and it still earns its place —
  // it is what catches a stray analytics snippet, a CDN added without thought,
  // or a font link reintroduced by habit. The allowlist is the point: it is
  // narrower than "whatever AdSense happens to load today", so anything new
  // still fails the build and has to be argued for.
  const W3C = /^(?:www\.)?w3\.org$|^schema\.org$|^purl\.org$/;
  const AD_ALLOW = [
    /^pagead2\.googlesyndication\.com$/,
    /^tpc\.googlesyndication\.com$/,
    /^googleads\.g\.doubleclick\.net$/,
    /^www\.google\.(?:com|co\.[a-z]{2})$/,
    // Google's certified consent message. Required for personalised ads in the
    // EEA, UK and Switzerland. It is only ever requested for those visitors, so
    // a European build of the site legitimately hits it and other builds never
    // do — which is why it belongs here rather than being treated as a stray.
    /^(?:[a-z0-9-]+\.)*fundingchoicesmessages\.google\.com$/,
    /^ssl\.google\.com$/,
  ];

  // Only resources the page *fetches* count. A hyperlink to Google's ad-settings
  // page is not a request to Google — it is a link a person chooses to click, and
  // the privacy page is required to offer one. Matching bare `href=` reported
  // those as an unexpected third party, which is wrong, and a false positive is
  // how people learn to ignore a check.
  const FETCHERS = [
    /<(?:script|img|iframe|embed|object|source|track|audio|video)\b[^>]*?\bsrc="(https?:\/\/[^"]+)"/gi,
    /<link\b[^>]*?\bhref="(https?:\/\/[^"]+)"/gi,
    /<meta\b[^>]*?\bproperty="og:(?:image|video)[^"]*"[^>]*?\bcontent="(https?:\/\/[^"]+)"/gi,
  ];

  const offOrigin = new Map();
  for (const page of pages) {
    for (const pattern of FETCHERS) {
      pattern.lastIndex = 0;
      for (const match of page.html.matchAll(pattern)) {
        let host = '';
        try {
          host = new URL(match[1]).hostname;
        } catch {
          host = match[1].slice(0, 60);
        }
        if (host === new URL(ORIGIN).hostname) continue;
        if (W3C.test(host)) continue;
        if (AD_ALLOW.some((re) => re.test(host))) continue;
        if (!offOrigin.has(host)) offOrigin.set(host, page.route);
      }
    }
  }
  for (const [host, route] of offOrigin) {
    fail(route, `fetches a third-party resource from ${host}, which is neither AdSense nor exempt.`);
  }

  // An ad network with no ads.txt serves nothing and generates support mail.
  if (!existsSync(path.join(distDir, 'ads.txt'))) {
    warn('(build)', 'ads.txt is missing from dist/ — AdSense will not serve ads without it at the domain root.');
  }

  console.log('Third-party origins');
  const selfOrigin = new URL(ORIGIN).hostname;
  console.log(offOrigin.size === 0
    ? `Only AdSense (plus ${selfOrigin}). No unexpected third party.`
    : `${offOrigin.size} unexpected found`);

  if (problems.length > 0) {
    console.log(`PROBLEMS (${problems.length})`);
    for (const item of problems.slice(0, 40)) console.log(`  ${item.page}: ${item.message}`);
    if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
    process.exitCode = 1;
  } else {
    console.log('No blocking problems found.');
  }
}

await main();
void stat;
