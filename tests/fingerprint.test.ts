import { describe, expect, it } from 'vitest';

import { diffBuilds, fingerprint, stableContent } from '../scripts/lib/fingerprint.mjs';

/**
 * The fingerprint decides which URLs get submitted to IndexNow.
 *
 * Getting it wrong is worse than not having it. If it is too sensitive it tells
 * every search engine that all 83 pages changed on every deploy, which is the
 * exact abuse pattern IndexNow documents. If it is too blunt, real content
 * changes go unannounced and the integration quietly does nothing.
 *
 * These tests pin both directions.
 */

const page = ({ title = 'Merge PDF', body = 'Combine several PDFs into one.' } = {}) => `<!doctype html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="description" content="${body}" />
    <link rel="canonical" href="https://furtu.xyz/tools/pdf/merge-pdf" />
    <link rel="stylesheet" href="/assets/index-AAAA1111.css" />
    <script type="module" src="/assets/rolldown-runtime-BBBB2222.js"></script>
    <script type="module" src="/assets/index-CCCC3333.js"></script>
    <script type="application/ld+json">{"@type":"SoftwareApplication","name":"Merge PDF"}</script>
  </head>
  <body><div id="root"><h1>${title}</h1><p>${body}</p></div></body>
</html>`;

describe('the fingerprint ignores a change nobody can see', () => {
  it('is stable when only asset hashes change', () => {
    // A deploy that edits one line of React changes every bundle hash on every
    // page while changing no content whatsoever. This must not register.
    const before = page();
    const after = before
      .replace('index-AAAA1111.css', 'index-ZZZZ9999.css')
      .replace('rolldown-runtime-BBBB2222.js', 'rolldown-runtime-YYYY8888.js')
      .replace('index-CCCC3333.js', 'index-XXXX7777.js');

    expect(after).not.toBe(before);
    expect(fingerprint(after)).toBe(fingerprint(before));
  });

  it('keeps the inline JSON-LD, which is content a crawler reads', () => {
    const stripped = stableContent(page());
    expect(stripped).toContain('application/ld+json');
    expect(stripped).toContain('SoftwareApplication');
  });

  it('keeps the title, description and canonical', () => {
    const stripped = stableContent(page());
    expect(stripped).toContain('<title>Merge PDF</title>');
    expect(stripped).toContain('Combine several PDFs into one.');
    expect(stripped).toContain('https://furtu.xyz/tools/pdf/merge-pdf');
  });
});

describe('the fingerprint catches a change that matters', () => {
  it('differs when the title changes', () => {
    expect(fingerprint(page({ title: 'Merge PDF files' }))).not.toBe(fingerprint(page()));
  });

  it('differs when the body changes', () => {
    expect(fingerprint(page({ body: 'A completely different description.' }))).not.toBe(
      fingerprint(page()),
    );
  });
});

describe('diffing two builds', () => {
  const prev = new Map([
    ['/', 'aaa'],
    ['/tools', 'bbb'],
    ['/tools/pdf/merge-pdf', 'ccc'],
    ['/tools/pdf/split-pdf', 'ddd'],
  ]);

  it('reports a new page as added', () => {
    const next = new Map([...prev, ['/tools/image/crop-image', 'eee']]);
    expect(diffBuilds(prev, next)).toEqual({ added: ['/tools/image/crop-image'], modified: [], removed: [] });
  });

  it('reports a changed page as modified', () => {
    const next = new Map(prev);
    next.set('/tools/pdf/merge-pdf', 'changed');
    expect(diffBuilds(prev, next)).toEqual({ added: [], modified: ['/tools/pdf/merge-pdf'], removed: [] });
  });

  it('reports a deleted page as removed, so engines drop it', () => {
    const next = new Map([...prev].filter(([route]) => route !== '/tools/pdf/split-pdf'));
    expect(diffBuilds(prev, next).removed).toEqual(['/tools/pdf/split-pdf']);
  });

  it('reports nothing at all when a deploy changed only code', () => {
    // Every route present, every fingerprint identical: the signature of a
    // bundle-hash-only deploy, which must be silent.
    const next = new Map(prev);
    expect(diffBuilds(prev, next)).toEqual({ added: [], modified: [], removed: [] });
  });

  it('sorts its output so a submission is reproducible', () => {
    const next = new Map([
      ['/zebra', '1'],
      ['/apple', '2'],
    ]);
    const result = diffBuilds(new Map(), next);
    expect(result.added).toEqual(['/apple', '/zebra']);
  });
});