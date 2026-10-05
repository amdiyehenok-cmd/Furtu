/**
 * Static server for `dist/`, matching how a real static host behaves.
 *
 * This exists because `vite preview` cannot be trusted to test a prerendered
 * site. It serves the SPA fallback — `index.html` — for any path it does not
 * recognise, so a request for `/tools/pdf/merge-pdf` is answered with the
 * *homepage*, not the tool page that was prerendered for it. Every page then
 * appeared to hydrate from the wrong markup, which looks exactly like a
 * hydration bug and is not one.
 *
 * The rules here are the ones a static host actually applies:
 *
 *   1. A real file wins:            /assets/x.js  -> dist/assets/x.js
 *   2. A directory serves its index: /tools/       -> dist/tools/index.html
 *   3. A directory redirects:        /tools        -> /tools/
 *   4. Anything else is a 404 page:  /nope         -> dist/404.html, status 404
 *
 * Rule 3 is the one that matters for the sitemap, because the prerenderer
 * writes canonical URLs without trailing slashes. Without it a crawler and a
 * visitor get different HTML for the same URL.
 *
 *   node scripts/serve-dist.mjs [--port 4173]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

async function resolve(urlPath) {
  // Normalise and refuse to escape dist/.
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const target = path.join(dist, clean);
  if (!target.startsWith(dist)) return null;

  // 1. A real file.
  if (await exists(target)) {
    const info = await stat(target);
    if (info.isFile()) return { file: target, status: 200 };
  }

  // 2. A directory serves its index directly.
  //
  // A redirect to the trailing-slash form would be tidier, but the prerenderer
  // writes canonical URLs *without* one, so redirecting would send every
  // canonical URL somewhere else than it claims to be. Serving the index keeps
  // the URL and the canonical in agreement.
  const index = path.join(target, 'index.html');
  if (await exists(index)) return { file: index, status: 200 };

  // A directory with no index: redirect once so the trailing slash is explicit.
  if (await exists(target)) return { file: null, status: 301, redirectTo: `${decoded}/` };

  return null;
}

const server = createServer(async (req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0].split('#')[0];

  if (urlPath === '/robots.txt' && !(await exists(path.join(dist, 'robots.txt')))) {
    res.writeHead(404).end('not found');
    return;
  }

  const found = await resolve(urlPath);

  if (found?.redirectTo) {
    res.writeHead(found.status, { Location: found.redirectTo }).end();
    return;
  }

  // 4. The prerendered 404 page, with a real 404 status.
  if (!found) {
    const notFound = path.join(dist, '404.html');
    const body = (await exists(notFound)) ? await readFile(notFound) : 'Not found';
    res.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(body);
    return;
  }

  const body = await readFile(found.file);
  const type = TYPES[path.extname(found.file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(found.status, {
    'Content-Type': type,
    // Hashed asset filenames are immutable, so they can be cached hard. HTML
    // must not be, or a deploy would never be seen.
    'Cache-Control': found.file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  res.end(body);
});

server.listen(port, () => {
  console.log(`FURTU static server on http://localhost:${port}`);
  console.log(`serving ${dist}`);
});