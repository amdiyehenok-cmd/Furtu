/**
 * Submit genuinely changed URLs to IndexNow.
 *
 *   node scripts/indexnow.mjs --old dist-old --new dist-new [--submit]
 *   node scripts/indexnow.mjs --new dist --all
 *
 * What this does *not* do is the important part.
 *
 * IndexNow's own documentation is explicit: submit only when content has
 * actually changed, and do not resubmit unchanged URLs. The protocol's abuse
 * handling treats repeated submissions of unchanged URLs as spam. So this
 * script never submits "every URL on the site". It fingerprints each page in
 * two builds, and submits only the pages whose content differs.
 *
 * The fingerprint deliberately excludes hashed asset URLs — see
 * scripts/lib/fingerprint.mjs for why that is mandatory rather than fussy.
 *
 * `--all` exists for one legitimate case: the very first submission, where
 * every URL genuinely is new to the engines. After that, use the diff.
 *
 * `--submit` is required to send anything. The default is a dry run, because a
 * script that posts to the internet should never do it as a side effect of
 * being run.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { diffBuilds, fingerprintBuild } from './lib/fingerprint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * IndexNow key. Kept here rather than imported so the build scripts do not need
 * a TypeScript loader; tests/indexnow.test.ts asserts the matching key file
 * exists and contains exactly this, so the two cannot drift.
 */
const KEY = '95d7067623d747378ba93025d5cccfcd';

const ORIGIN = (process.env.VITE_SITE_ORIGIN || 'https://furtu.xyz').replace(/\/$/, '');
const HOST = new URL(ORIGIN).host;
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** IndexNow accepts 10,000 URLs per POST. */
const MAX_BATCH = 10_000;

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function absolute(distDir) {
  return path.isAbsolute(distDir) ? distDir : path.join(root, distDir);
}

async function main() {
  const newDir = option('new');
  const oldDir = option('old');

  if (!newDir) {
    console.error('Usage: node scripts/indexnow.mjs --new <dist> [--old <dist>] [--all] [--submit]');
    process.exitCode = 1;
    return;
  }

  const next = await fingerprintBuild(absolute(newDir));

  let routes;
  if (oldDir) {
    const previous = await fingerprintBuild(absolute(oldDir));
    const diff = diffBuilds(previous, next);
    routes = [...diff.added, ...diff.modified];

    console.log(`IndexNow — comparing builds`);
    console.log(`  added    ${diff.added.length}`);
    console.log(`  modified ${diff.modified.length}`);
    console.log(`  removed  ${diff.removed.length}`);
    if (diff.removed.length > 0) {
      // Removed URLs are submitted too: the engine fetches them, gets a 404,
      // and drops them. Without this they linger in the index.
      console.log(`  (removed URLs are submitted so engines drop them)`);
      routes.push(...diff.removed);
    }
  } else if (flag('all')) {
    routes = [...next.keys()];
    console.log(`IndexNow — full submission of ${routes.length} URLs`);
  } else {
    console.error('Pass --old <dist> to submit only what changed, or --all for a first full submission.');
    process.exitCode = 1;
    return;
  }

  if (routes.length === 0) {
    console.log('\nNothing changed. No submission made — which is the correct outcome.');
    return;
  }

  const urlList = routes.map((route) => `${ORIGIN}${route === '/' ? '/' : route}`);
  const dryRun = !flag('submit');

  console.log(`\n${dryRun ? 'Dry run — add --submit to send.' : 'Submitting…'}`);
  console.log(`  host        ${HOST}`);
  console.log(`  keyLocation ${KEY_LOCATION}`);
  console.log(`  urls        ${urlList.length}`);
  for (const url of urlList.slice(0, 10)) console.log(`    ${url}`);
  if (urlList.length > 10) console.log(`    … and ${urlList.length - 10} more`);

  if (dryRun) return;

  // The key file has to be reachable before submitting, or every request comes
  // back 403 and there is nothing useful to diagnose.
  if (!existsSync(path.join(root, 'public', `${KEY}.txt`))) {
    console.error(`\nKey file public/${KEY}.txt is missing. Search engines cannot verify ownership.`);
    process.exitCode = 1;
    return;
  }

  for (let i = 0; i < urlList.length; i += MAX_BATCH) {
    const batch = urlList.slice(i, i + MAX_BATCH);
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: batch }),
    });

    const body = await response.text().catch(() => '');
    console.log(`\nHTTP ${response.status} ${response.statusText} — ${batch.length} url(s)`);
    if (body) console.log(`  ${body.slice(0, 400)}`);

    // 200 and 202 are both success: 202 means accepted while the engine
    // validates the key file for the first time.
    if (![200, 202].includes(response.status)) {
      const hint = {
        400: 'Malformed request — check host and urlList.',
        403: 'Key file not found or its contents do not match the key.',
        422: 'URLs do not belong to the host, or the key does not match the protocol schema.',
        429: 'Rate limited, or flagged for submitting unchanged URLs. Slow down.',
      }[response.status];
      if (hint) console.error(`  ${hint}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log('\nSubmitted. Confirm receipt in Bing Webmaster Tools → IndexNow.');
}

await main();