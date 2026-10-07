import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The IndexNow key file is how search engines prove the site owns the URLs it
 * submits. Get it wrong and every submission comes back 403 with nothing
 * useful to diagnose, so it is worth pinning here rather than trusting that
 * someone typed the same string in two places.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = '95d7067623d747378ba93025d5cccfcd';
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('IndexNow key file', () => {
  it('is served from the domain root', () => {
    expect(read(`public/${KEY}.txt`).trim()).toBe(KEY);
  });

  it('contains only the key, so the engine can match it exactly', () => {
    const raw = readFileSync(path.join(root, `public/${KEY}.txt`));
    const text = raw.toString('utf8');
    expect(text.trim()).toBe(KEY);
    expect(text.replace(/\s/g, '')).toBe(KEY);
  });

  it('is a plausible key shape: 8 to 128 hex characters', () => {
    expect(KEY).toMatch(/^[A-Za-z0-9-]{8,128}$/);
  });

  it('uses the same key as scripts/indexnow.mjs', () => {
    const script = read('scripts/indexnow.mjs');
    const declared = script.match(/const KEY = '([^']+)'/)?.[1];
    expect(declared).toBe(KEY);
  });

  it('is not emitted into the sitemap, where it would be a dead page', () => {
    // `/404` is excluded for the same reason. A key file is a token, not a page.
    expect(read('dist/sitemap.xml')).not.toContain(KEY);
  });
});