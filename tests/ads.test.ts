import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AD_ORIGINS, ADS, CLIENT, adsEnabled } from '../src/lib/ads';

/**
 * The advertising contract, checked at build time.
 *
 * These are the assertions that catch a failure which is otherwise completely
 * silent. If the CSP does not allow the consent message's origins, the message
 * simply never renders: no console error, no failed request, no exception —
 * the request is just never made. The visible consequence is that traffic in the
 * EEA, UK and Switzerland quietly loses eligibility for personalised ads, which
 * is exactly the loss the certified CMP was adopted to prevent.
 *
 * So the CSP is asserted against the list of origins the ad stack actually
 * needs, rather than being trusted to have been updated by hand.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** The single CSP rule that applies to every route. */
function cspFromVercel(): string {
  const config = JSON.parse(read('vercel.json'));
  const catchAll = config.headers.find((h: { source: string }) => h.source === '/(.*)');
  if (!catchAll) throw new Error('vercel.json has no catch-all header block');
  const rule = catchAll.headers.find((h: { key: string }) => h.key === 'Content-Security-Policy');
  if (!rule) throw new Error('vercel.json catch-all block has no Content-Security-Policy');
  return rule.value;
}

/** The CSP value for one directive, e.g. `script-src`. */
function directive(csp: string, name: string): string {
  const found = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  if (!found) throw new Error(`CSP has no ${name} directive`);
  return found;
}

describe('advertising is configured', () => {
  it('has a publisher ID, so the feature is on', () => {
    expect(CLIENT).toMatch(/^ca-pub-\d+$/);
    expect(adsEnabled()).toBe(true);
  });

  it('names every placement the pages actually render', () => {
    expect(Object.keys(ADS)).toEqual(['home', 'tool', 'category']);
    for (const placement of Object.values(ADS)) {
      expect(placement.id).toBeTruthy();
      expect(placement.format).toBe('responsive');
    }
  });
});

describe('ads.txt', () => {
  it('is exactly the line Google asks for', () => {
    const expected = 'google.com, pub-5358754327162242, DIRECT, f08c47fec0942fa0';
    expect(read('public/ads.txt').trim()).toBe(expected);
  });

  it('has no byte order mark', () => {
    // A BOM makes the first record unreadable to AdSense, and it fails without
    // saying why.
    const bytes = readFileSync(path.join(root, 'public/ads.txt'));
    expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
  });
});

describe('Content-Security-Policy allows the whole ad stack', () => {
  const csp = cspFromVercel();

  it.each([
    ['script-src', AD_ORIGINS.script],
    ['frame-src', AD_ORIGINS.frame],
    ['img-src', AD_ORIGINS.image],
    ['connect-src', AD_ORIGINS.connect],
  ])('%s names every origin the ad stack uses', (name, origins) => {
    const rule = directive(csp, name);
    for (const origin of origins) {
      expect(rule, `${name} is missing ${origin}`).toContain(origin);
    }
  });

  it('allows the Google-certified consent message to load and frame itself', () => {
    // The single most consequential omission. Without these, enabling the CMP
    // in the AdSense dashboard appears to work and delivers nothing.
    expect(directive(csp, 'script-src')).toContain('fundingchoicesmessages.google.com');
    expect(directive(csp, 'connect-src')).toContain('fundingchoicesmessages.google.com');
    expect(directive(csp, 'frame-src')).toContain('fundingchoicesmessages.google.com');
  });

  it('allows the ad network latency probe', () => {
    // Discovered by running scripts/check-ads.mjs against production. The CSP
    // only exists at the edge, so this cannot be found from a local dist, and
    // it fails as a console violation on every page view rather than as a
    // missing feature.
    expect(directive(csp, 'connect-src')).toContain('adtrafficquality.google');
  });

  it('keeps the loader host out of the way of nothing else', () => {
    expect(directive(csp, 'script-src')).toContain('pagead2.googlesyndication.com');
  });

  it('still refuses to be framed, and still refuses plugins', () => {
    expect(directive(csp, 'frame-ancestors')).toContain("'none'");
    expect(directive(csp, 'object-src')).toContain("'none'");
  });
});

describe('the hand-rolled consent gate is gone', () => {
  it('has no local consent module left', () => {
    // Google requires a certified CMP for personalised ads in the EEA, UK and
    // Switzerland. A local banner emits no TCF string, so keeping one means two
    // banners on screen and traffic that is still downgraded anyway.
    for (const file of ['src/lib/ads-consent.ts', 'src/components/ConsentBanner.tsx']) {
      let exists = true;
      try {
        readFileSync(path.join(root, file));
      } catch {
        exists = false;
      }
      expect(exists, `${file} should have been removed`).toBe(false);
    }
  });

  it('has no consent gate left in either shell', () => {
    for (const file of ['src/App.tsx', 'src/components/AppShell.tsx']) {
      expect(read(file)).not.toContain('Consent');
    }
  });

  it('has no consent styles left behind', () => {
    expect(read('src/index.css')).not.toContain('.consent');
  });
});