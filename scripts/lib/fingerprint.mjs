/**
 * Content fingerprints for built pages.
 *
 * This exists because of one specific trap, and getting it wrong is worse than
 * having no IndexNow integration at all.
 *
 * Every prerendered page embeds the hashed filenames of its JS and CSS
 * bundles:
 *
 *     <script type="module" src="/assets/index-Bl-dcnUl.js"></script>
 *     <link rel="stylesheet" href="/assets/index-CM7XsCtW.css">
 *
 * The hashes change whenever *any* bundled code changes. Hash the raw HTML and
 * every deploy marks all 83 pages as modified even when not one word of
 * content changed. That is a lie, IndexNow's own documentation names repeated
 * submissions of unchanged URLs as the abuse pattern to avoid, and the
 * resulting lastmod is meaningless.
 *
 * So the fingerprint is taken over the page *minus* its hashed asset
 * references. What survives is the part a crawler actually judges: the title,
 * the description, the canonical, the structured data and the rendered body.
 * A code-only deploy now produces an identical fingerprint for every page, and
 * a real content change still produces a different one.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/** A `<script>` tag whose src is a hashed bundle. Contributes no content. */
const SCRIPT_TAG = /<script\b[^>]*\bsrc="\/assets\/[^"]*"[^>]*>\s*<\/script>/g;

/** A `<link>` to a hashed bundle: stylesheet, preload or modulepreload. */
const LINK_TAG = /<link\b[^>]*\bhref="\/assets\/[^"]*"[^>]*>/g;

/** Any surviving bare reference to a hashed bundle path. */
const ASSET_PATH = /\/assets\/[A-Za-z0-9_.-]+/g;

/**
 * Reduce a built HTML document to the part worth fingerprinting.
 *
 * Exported for tests: the invariant that matters is that this is stable across
 * an asset-hash-only change and unstable across a content change.
 */
export function stableContent(html) {
  return html
    .replace(SCRIPT_TAG, '')
    .replace(LINK_TAG, '')
    .replace(ASSET_PATH, '');
}

/** SHA-256 of a page's stable content, truncated for readability. */
export function fingerprint(html) {
  return createHash('sha256').update(stableContent(html)).digest('hex');
}

/** Route for a built `index.html`, stored without a trailing slash. */
function routeOf(distDir, file) {
  const rel = path.relative(distDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  // The trailing slash has to go. The site is served with `trailingSlash:
  // false`, so a canonical is `https://furtu.xyz/about` and never
  // `https://furtu.xyz/about/`. Leaving it on would submit URLs that do not
  // match anything the site itself claims, and it would stop the `/404`
  // exclusion below from ever matching.
  const route = `/${rel.replace(/index\.html$/, '').replace(/\/$/, '')}`;
  return route === '//' ? '/' : route;
}

/**
 * Fingerprint every prerendered page in a build directory.
 *
 * The 404 page is excluded: it is a response, not a page, and submitting it
 * would tell every participating engine to re-crawl a URL that should not
 * exist.
 */
export async function fingerprintBuild(distDir) {
  const found = new Map();

  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === 'index.html') {
        const route = routeOf(distDir, full);
        if (route === '/404') continue;
        found.set(route, fingerprint(await readFile(full, 'utf8')));
      }
    }
  };

  await walk(distDir);
  return found;
}

/**
 * What actually changed between two builds.
 *
 * `added`    — in the new build, absent (or different) in the old one
 * `modified` — present in both but the content fingerprint differs
 * `removed`  — in the old build, gone from the new one
 */
export function diffBuilds(previous, next) {
  const added = [];
  const modified = [];
  const removed = [];

  for (const [route, hash] of next) {
    if (!previous.has(route)) added.push(route);
    else if (previous.get(route) !== hash) modified.push(route);
  }

  for (const route of previous.keys()) {
    if (!next.has(route)) removed.push(route);
  }

  const byRoute = (a, b) => a.sort((x, y) => x.localeCompare(y));
  return { added: byRoute(added, added), modified: byRoute(modified, modified), removed: byRoute(removed, removed) };
}