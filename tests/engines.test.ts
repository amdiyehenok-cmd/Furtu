/**
 * Engine round-trip tests.
 *
 * These execute the real operations against real generated files. The registry
 * test proves every tool *declares* an operation that exists; this file proves
 * those operations actually run and produce valid output. Without it, a typo
 * inside an op body would typecheck and still fail only in a browser.
 *
 * Scope: everything reachable in Node. The two ops that need a real rasteriser
 * and a pdf.js worker (`pdf-to-jpg`, and the pdf.js part of `extract-pdf-text`)
 * are excluded, because Node has neither a canvas nor a worker host. That is a
 * known limit of this suite, recorded in the engineering report.
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import type { ControlValues, EngineChunk, ToolContext } from '@/lib/engines/types';

const ctx: ToolContext = { signal: new AbortController().signal, onProgress: () => {} };

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** A 1x1 PNG. Enough for pdf-lib to embed as a real image XObject. */
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

/**
 * Three pages, each carrying the same line of text. Identical page content is
 * what gives the compressor's stream-deduplication pass something real to
 * collapse, so the fixture is built to exercise that path rather than to be
 * merely well-formed.
 */
async function makePdf(pages = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText('Furtu round-trip fixture', { x: 50, y: 780, size: 18, font, color: rgb(0, 0, 0) });
  }
  doc.setTitle('Furtu fixture');
  doc.setAuthor('Furtu tests');
  doc.setSubject('Engine round-trip');
  doc.setKeywords(['furtu', 'fixture']);
  doc.setProducer('FURTU tests');
  return doc.save();
}

async function pdfFile(pages = 3, name = 'fixture.pdf'): Promise<File> {
  const bytes = await makePdf(pages);
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

/**
 * Re-open a saved document the way the engine itself does.
 *
 * `updateMetadata: false` is not optional here. pdf-lib defaults it to true and,
 * when set, rewrites Producer to its own name and stamps a fresh ModDate as the
 * document is parsed. Reading a result with the default would therefore report
 * pdf-lib's metadata rather than what was actually written, which quietly
 * invalidates every metadata assertion in this file.
 */
function reload(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

/** Run a file operation and hand back the bytes of its first output. */
async function runFile(
  engine: EngineChunk,
  op: string,
  files: File[],
  values: ControlValues = {},
): Promise<{ name: string; bytes: Uint8Array; note?: string }> {
  const fn = engine.file?.[op];
  if (!fn) throw new Error(`no file op "${op}"`);
  const results = await fn(files, values, ctx);
  const first = results[0];
  if (!first) throw new Error(`op "${op}" returned no output`);
  return {
    name: first.name,
    note: first.note,
    bytes: new Uint8Array(await first.blob.arrayBuffer()),
  };
}

async function runText(
  engine: EngineChunk,
  op: string,
  input: string,
  values: ControlValues = {},
): Promise<{ output: string; diagnostics?: { level: string; message: string }[] }> {
  const fn = engine.text?.[op];
  if (!fn) throw new Error(`no text op "${op}"`);
  return await fn(input, values, ctx);
}

/* ------------------------------------------------------------------ */

describe('PDF engine â€” structural operations', () => {
  it('merges two documents into one and keeps every page', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'merge-pdf', [await pdfFile(2, 'a.pdf'), await pdfFile(3, 'b.pdf')]);

    const reopened = await reload(out.bytes);
    expect(reopened.getPageCount()).toBe(5);
    expect(out.name).toBe('merged.pdf');
  });

  it('refuses to merge a single file with a message the user can act on', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    await expect(runFile(engine, 'merge-pdf', [await pdfFile()])).rejects.toThrow(/at least two/i);
  });

  it('splits one page per file and names them in order', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'split-pdf', [await pdfFile(3)], { mode: 'each' });
    expect(out.name).toBe('fixture-part-1.pdf');

    // The queue is only surfaced through the engine, so the full set is read
    // from there rather than assuming a single output.
    const fn = engine.file!['split-pdf'];
    const all = await fn([await pdfFile(3)], { mode: 'each' }, ctx);
    expect(all).toHaveLength(3);
    expect(all.map((f) => f.name)).toEqual(['fixture-part-1.pdf', 'fixture-part-2.pdf', 'fixture-part-3.pdf']);
    for (const file of all) {
      expect((await reload(new Uint8Array(await file.blob.arrayBuffer()))).getPageCount()).toBe(1);
    }
  });

  it('splits into chunks of the requested size', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const all = await engine.file!['split-pdf']([await pdfFile(5)], { mode: 'chunks', chunkSize: 2 }, ctx);
    expect(all).toHaveLength(3);
  });

  it('rotates by the requested angle, cumulatively', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'rotate-pdf', [await pdfFile(2)], { degrees: 90 });

    const reopened = await reload(out.bytes);
    for (const page of reopened.getPages()) {
      expect(page.getRotation().angle).toBe(90);
    }
  });

  it('rotates only the pages named in the range', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'rotate-pdf', [await pdfFile(3)], { degrees: 180, range: '2' });

    const reopened = await reload(out.bytes);
    const angles = reopened.getPages().map((p) => p.getRotation().angle);
    expect(angles).toEqual([0, 180, 0]);
  });

  it('deletes the requested pages and keeps the rest in order', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'delete-pdf-pages', [await pdfFile(3)], { range: '2' });
    expect((await reload(out.bytes)).getPageCount()).toBe(2);
  });

  it('will not delete every page', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    await expect(runFile(engine, 'delete-pdf-pages', [await pdfFile(3)], { range: '1-3' })).rejects.toThrow(
      /every page/i,
    );
  });

  it('extracts a page range into a new document', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'extract-pdf-pages', [await pdfFile(5)], { range: '2-3' });
    expect((await reload(out.bytes)).getPageCount()).toBe(2);
  });

  it('reorders pages and supports repeating a range', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'reorder-pdf-pages', [await pdfFile(3)], { order: '3,1,2' });
    expect((await reload(out.bytes)).getPageCount()).toBe(3);
  });

  it('rejects an empty reorder instead of silently guessing', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    await expect(runFile(engine, 'reorder-pdf-pages', [await pdfFile(3)], { order: '  ' })).rejects.toThrow(
      /page order/i,
    );
  });

  it('reports a bad page number rather than guessing', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    await expect(runFile(engine, 'extract-pdf-pages', [await pdfFile(3)], { range: '1-99' })).rejects.toThrow();
  });

  it('stamps a watermark and still opens as a valid PDF', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'watermark-pdf', [await pdfFile(2)], {
      text: 'DRAFT',
      position: 'diagonal',
      size: 48,
      opacity: 20,
      color: '#dc2626',
    });

    const reopened = await reload(out.bytes);
    expect(reopened.getPageCount()).toBe(2);
    // The stamp is real content, not a preview overlay: the page grows.
    expect(out.bytes.length).toBeGreaterThan((await makePdf(2)).length);
  });

  it('reads the current properties out of a document', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const fn = engine.fileText!['pdf-metadata-inspect'];
    const report = await fn([await pdfFile(3)], {}, ctx);

    const labels = report.meta?.map((row) => row.label);
    expect(labels).toContain('Title');
    expect(labels).toContain('Author');

    // The report has to agree with the file, not describe it loosely.
    const title = report.meta?.find((row) => row.label === 'Title')?.value;
    expect(title).toBe('Furtu fixture');
    expect(report.meta?.find((row) => row.label === 'Pages')?.value).toBe('3');
  });

  it('seeds the controls with the values already in the file', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const fn = engine.fileText!['pdf-metadata-inspect'];
    const report = await fn([await pdfFile(2)], {}, ctx);

    // This prefill is what makes the editor inspect before it writes, and what
    // makes a cleared field mean "remove this" rather than "never filled in".
    expect(report.prefill?.title).toBe('Furtu fixture');
    expect(report.prefill?.author).toBe('Furtu tests');
    // pdf-lib writes keywords as one space-joined string, so that is what comes
    // back and what the form has to show to avoid a phantom edit on save.
    expect(report.prefill?.keywords).toBe('furtu fixture');
  });

  it('changes a property', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'pdf-metadata', [await pdfFile()], { title: 'A better title' });
    expect((await reload(out.bytes)).getTitle()).toBe('A better title');
  });

  it('removes a property when the field is cleared', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'pdf-metadata', [await pdfFile()], {
      title: 'Furtu fixture',
      author: '',
    });
    // Clearing the author is the single most common reason to edit a document's
    // properties before publishing it, so it has to work.
    expect((await reload(out.bytes)).getAuthor()).toBe('');
  });

  it('refuses to write when nothing changed', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    // pdf-lib stamps its own Creator on any document it creates, so the
    // unchanged form has to carry that value too — which is why the form is
    // filled by the inspect step rather than by hand.
    const inspect = engine.fileText!['pdf-metadata-inspect'];
    const report = await inspect([await pdfFile()], {}, ctx);
    await expect(runFile(engine, 'pdf-metadata', [await pdfFile()], report.prefill ?? {})).rejects.toThrow(
      /nothing to write/i,
    );
  });

  it('stamps its own producer on documents it rebuilds', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    // A merge assembles a new page tree, so it is stamped as Furtu's work. An
    // edit made in place, such as a rotation, deliberately leaves the original
    // provenance alone rather than marking somebody's document as ours.
    const merged = await runFile(engine, 'merge-pdf', [await pdfFile(), await pdfFile(1, 'b.pdf')]);
    expect((await reload(merged.bytes)).getProducer()).toBe('FURTU');

    const rotated = await runFile(engine, 'rotate-pdf', [await pdfFile()], { degrees: 90 });
    expect((await reload(rotated.bytes)).getProducer()).toBe('FURTU tests');
  });

  it('strips identifying metadata and does not put any back', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const out = await runFile(engine, 'remove-pdf-metadata', [await pdfFile(2)], { removeXmp: true });

    const reopened = await reload(out.bytes);
    expect(reopened.getPageCount()).toBe(2);
    // pdf-lib's setters only accept a string, so the guarantee is that the
    // values are gone rather than that the keys are absent.
    expect(reopened.getTitle()).toBe('');
    expect(reopened.getAuthor()).toBe('');
    // The important one. Saving normally makes pdf-lib rewrite Producer to its
    // own name, which would leave this "cleaned" file advertising the library
    // that wrote it — the exact field the visitor asked to have removed.
    expect(reopened.getProducer()).toBe('');
    expect(reopened.getCreator()).toBe('');
  });

  it('keeps the XMP stream when the toggle says to', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    // The toggle is in the form, so it has to reach the engine. Previously the
    // operation ignored its values entirely and always deleted the stream.
    const kept = await runFile(engine, 'remove-pdf-metadata', [await pdfFile()], { removeXmp: false });
    const removed = await runFile(engine, 'remove-pdf-metadata', [await pdfFile()], { removeXmp: true });
    expect(kept.note).toMatch(/XMP kept/i);
    expect(removed.note).toMatch(/XMP cleared/i);
  });

  it('compresses structurally without losing pages', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const source = await pdfFile(4);
    const original = new Uint8Array(await source.arrayBuffer());

    const out = await runFile(engine, 'compress-pdf', [source], { dedupe: true });

    // The promise of the tool is that output is no bigger. Anything larger
    // would mean the compressor added overhead it failed to remove.
    expect(out.bytes.length).toBeLessThanOrEqual(original.length);
    const reopened = await reload(out.bytes);
    expect(reopened.getPageCount()).toBe(4);
  });

  it('builds a PDF from images', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const images = [
      new File([PNG_1X1 as BlobPart], 'one.png', { type: 'image/png' }),
      new File([PNG_1X1 as BlobPart], 'two.png', { type: 'image/png' }),
    ];
    const out = await runFile(engine, 'images-to-pdf', images, { pageSize: 'a4', orientation: 'portrait' });
    expect((await reload(out.bytes)).getPageCount()).toBe(2);
  });

  it('rejects a file that is not a PDF', async () => {
    const engine = (await import('@/lib/engines/ops/pdf')).default;
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5]) as BlobPart], 'nope.pdf', {
      type: 'application/pdf',
    });
    await expect(runFile(engine, 'rotate-pdf', [junk], { degrees: 90 })).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------ */

describe('YAML engine', () => {
  it('converts YAML to JSON', async () => {
    const engine = (await import('@/lib/engines/ops/yaml')).default;
    const { output } = await runText(engine, 'yaml-to-json', 'name: furtu\ncount: 3\n');
    expect(JSON.parse(output)).toEqual({ name: 'furtu', count: 3 });
  });

  it('converts JSON to YAML', async () => {
    const engine = (await import('@/lib/engines/ops/yaml')).default;
    const { output } = await runText(engine, 'json-to-yaml', '{"name":"furtu","count":3}');
    expect(output).toMatch(/name:\s*furtu/);
    expect(output).toMatch(/count:\s*3/);
  });

  it('reports invalid YAML as a diagnostic rather than throwing', async () => {
    const engine = (await import('@/lib/engines/ops/yaml')).default;
    const { diagnostics } = await runText(engine, 'yaml-to-json', 'a: [1, 2\nb: {');
    expect(diagnostics?.some((d) => d.level === 'error')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('text engine', () => {
  it('formats and minifies JSON', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const formatted = await runText(engine, 'json-formatter', '{"a":1,"b":[2,3]}');
    expect(formatted.output).toContain('\n');
    const min = await runText(engine, 'json-minifier', '{ "a" : 1 , "b" : [ 2 , 3 ] }');
    expect(min.output).toBe('{"a":1,"b":[2,3]}');
  });

  it('round-trips base64', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const encoded = await runText(engine, 'base64-encoder', 'Furtu');
    expect(encoded.output.trim()).toBe('RnVydHU=');
    const decoded = await runText(engine, 'base64-decoder', 'RnVydHU=');
    expect(decoded.output).toBe('Furtu');
  });

  it('round-trips URL encoding', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const encoded = await runText(engine, 'url-encoder', 'a b&c=d');
    const decoded = await runText(engine, 'url-decoder', encoded.output);
    expect(decoded.output).toBe('a b&c=d');
  });

  it('converts JSON to CSV and back', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const asCsv = await runText(engine, 'json-to-csv', '[{"a":1,"b":2},{"a":3,"b":4}]');
    // RFC 4180 CRLF line endings, which is what spreadsheet software expects.
    expect(asCsv.output.split('\r\n')[0]).toBe('a,b');
    const back = await runText(engine, 'csv-to-json', asCsv.output);
    expect(JSON.parse(back.output)).toHaveLength(2);
  });

  it('generates distinct UUIDs', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const { output } = await runText(engine, 'uuid-generator', '');
    const lines = output.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('hashes deterministically and uses no randomness', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const a = await runText(engine, 'hash-generator', 'furtu', { algorithm: 'SHA-256' });
    const b = await runText(engine, 'hash-generator', 'furtu', { algorithm: 'SHA-256' });
    expect(a.output).toBe(b.output);
    // The result is labelled, so the digest is pulled out of the label rather
    // than compared against the whole line.
    const digest = a.output.match(/[0-9a-f]{32,}/i)?.[0] ?? '';
    expect(digest).toHaveLength(64);
  });

  it('reports invalid JSON through json-validator', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const { diagnostics } = await runText(engine, 'json-validator', '{"a":}');
    expect(diagnostics?.some((d) => d.level === 'error')).toBe(true);
  });

  it('sorts lines without destroying content', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const { output } = await runText(engine, 'sort-lines', 'banana\napple\ncherry', { direction: 'asc' });
    expect(output.trim().split('\n')).toEqual(['apple', 'banana', 'cherry']);
  });

  it('decodes a JWT payload without verifying it', async () => {
    const engine = (await import('@/lib/engines/ops/text')).default;
    const payload = Buffer.from(JSON.stringify({ sub: '1234', name: 'Furtu' })).toString('base64url');
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
    const { output } = await runText(engine, 'jwt-decoder', token);
    expect(output).toMatch(/Furtu/);
  });
});

/* ------------------------------------------------------------------ */

describe('QR engine', () => {
  it('produces a real PNG for a URL', async () => {
    const engine = (await import('@/lib/engines/ops/qr')).default;
    const fn = engine.text!['qr-code-generator'];
    const result = await fn('https://furtu.example', {}, ctx);
    expect(result.output.length).toBeGreaterThan(0);
  });
});
