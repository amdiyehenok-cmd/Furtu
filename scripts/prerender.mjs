/**
 * Static prerenderer.
 *
 * Runs after the client and server builds. For every route in the registry it
 * renders the real React tree on the server, injects the head tags, and writes
 * `dist/<route>/index.html`. The result is a fully formed HTML file: correct
 * title, meta description, canonical, Open Graph, structured data, and all of
 * the page's visible text.
 *
 * It also writes `sitemap.xml` and `robots.txt` from the routes that actually
 * rendered, so the HTML on disk and the sitemap cannot disagree about which
 * URLs exist.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const ssrEntry = path.join(rootDir, 'dist-ssr', 'entry-server.js');

async function readManifest() {
  const manifestPath = path.join(distDir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}. Run the client build before the prerenderer.`);
  }
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

/**
 * The module scripts and stylesheet every prerendered page needs.
 *
 * The manifest is keyed by source path (`index.html`, `_engine-loader-x.js`),
 * while each record's `file` is an output path (`assets/index-x.js`). Those two
 * are not interchangeable: resolving `entry.file` against the manifest returns
 * nothing, which drops the entry script and leaves every page as inert HTML
 * that never hydrates. The entry's own path is therefore used directly, and
 * only `imports` — which are manifest keys — are looked up.
 */
function assetTags(manifest, cssHref) {
  const entry = manifest['index.html'];
  if (!entry) throw new Error('The client build produced no index.html entry in its manifest.');

  const scripts = [
    `    <script type="module" src="/${entry.file}"></script>`,
    ...(entry.imports ?? []).map((key) => {
      const chunk = manifest[key];
      if (!chunk?.file) throw new Error(`Manifest import "${key}" has no output file.`);
      return `    <script type="module" src="/${chunk.file}"></script>`;
    }),
  ];

  return [...scripts, cssHref ? `    <link rel="stylesheet" href="${cssHref}">` : '']
    .filter(Boolean)
    .join('\n');
}

function outputPathFor(route) {
  if (route === '/') return path.join(distDir, 'index.html');
  return path.join(distDir, route.replace(/^\//, ''), 'index.html');
}

function lastmodFor(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

/**
 * Sitemap priority and change frequency, derived from the shape of the route.
 *
 * Kept as a pure function of the path so the sitemap cannot drift from the set
 * of routes the site actually publishes. A new static page gets a sensible
 * entry automatically instead of needing to be added to a hand-maintained list.
 */
function priorityFor(route) {
  const depth = route.split('/').filter(Boolean).length;

  if (route === '/') return { priority: '1.0', changefreq: 'weekly' };
  if (route === '/tools') return { priority: '0.9', changefreq: 'weekly' };

  // A category hub (/tools/pdf) is a real destination; a tool leaf
  // (/tools/pdf/merge-pdf) is the long tail.
  if (route.startsWith('/tools/')) {
    return depth > 2
      ? { priority: '0.8', changefreq: 'monthly' }
      : { priority: '0.9', changefreq: 'weekly' };
  }

  if (route.startsWith('/guides/')) return { priority: '0.6', changefreq: 'monthly' };
  if (route === '/guides') return { priority: '0.7', changefreq: 'monthly' };

  // Static pages. /pricing is a genuine destination; the rest are trust and
  // compliance pages that rank rarely but should still be discoverable.
  if (route === '/pricing') return { priority: '0.6', changefreq: 'monthly' };
  return { priority: '0.4', changefreq: 'monthly' };
}

async function main() {
  if (!existsSync(ssrEntry)) {
    throw new Error(`Missing ${ssrEntry}. Run "npm run build:ssr" before the prerenderer.`);
  }

  const { render, prerenderRoutes, renderTags, SITE, absUrl } = await import(pathToFileURL(ssrEntry).href);
  const manifest = await readManifest();

  const cssEntry = Object.values(manifest).find(
    (chunk) => chunk.isEntry && Array.isArray(chunk.css) && chunk.css.length > 0,
  );
  const cssHref = cssEntry?.css?.length ? `/${cssEntry.css[0]}` : null;

  const routes = prerenderRoutes();
  const failures = [];
  /** Routes that produced a file on disk. The sitemap is built from this. */
  const rendered = [];
  let written = 0;

  for (const route of routes) {
    try {
      const { html, head, status } = await render(route);
      const file = outputPathFor(route);
      await mkdir(path.dirname(file), { recursive: true });

      const document = `<!doctype html>
<html lang="en"${route === '/404' ? ' data-status="404"' : ''}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${renderTags(head, cssHref)}
    ${assetTags(manifest, cssHref)}
  </head>
  <body>
    <div id="root">${html}</div>
  </body>
</html>
`;

      await writeFile(file, document, 'utf8');
      rendered.push(route);
      written += 1;
      if (status === 404) await writeFile(path.join(distDir, '404.html'), document, 'utf8');
    } catch (error) {
      failures.push({ route, message: error?.message ?? String(error) });
    }
  }

  // --- sitemap ---------------------------------------------------------
  // Built from the routes that actually rendered a file on disk. That is the
  // only list guaranteed to match the HTML, which is the point: this used to
  // filter down to `/tools/` and `/guides/` and drop the seven static pages,
  // while a comment above claimed it could never disagree with what was built.
  // Deriving from `rendered` makes the claim true by construction instead.
  //
  // `/404` is excluded because it is a response, not a page.
  const origin = SITE.origin;
  const today = new Date().toISOString().slice(0, 10);
  const indexable = rendered.filter((route) => route !== '/404');

  const entries = indexable
    .map((route) => ({ route, loc: `${origin}${route === '/' ? '/' : route}`, ...priorityFor(route) }))
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(
      (entry) =>
        `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    )
    .join('\n');

  await writeFile(
    path.join(distDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    'utf8',
  );

  // --- robots ----------------------------------------------------------
  await writeFile(
    path.join(distDir, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      '',
      '# Furtu is a static site. Every tool runs in the visitor browser, so there',
      '# are no processing URLs, account pages or dashboards to hide.',
      'Disallow: /404',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`[prerender] ${written}/${routes.length} routes written to dist/`);
  console.log(`[prerender] sitemap: ${indexable.length} URLs`);

  if (failures.length > 0) {
    console.error(`[prerender] ${failures.length} route(s) failed:`);
    for (const failure of failures) console.error(`  ${failure.route}: ${failure.message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[prerender] failed:', error);
  process.exitCode = 1;
});
