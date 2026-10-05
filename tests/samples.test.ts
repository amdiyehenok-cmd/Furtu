// @vitest-environment jsdom

/**
 * Sample-file integrity.
 *
 * The sample generators are the only part of the codebase that builds binary
 * files by hand rather than through a library that is known to be correct. The
 * ODF archive in particular has to place an uncompressed `mimetype` entry
 * first, which fflate cannot express, so it is assembled by hand — and a
 * hand-built ZIP is exactly the sort of thing that is subtly wrong in a way no
 * typechecker notices.
 *
 * Each archive is read back here with the same library the site uses, so a
 * broken sample fails the build rather than a visitor's first click.
 */

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { docxSample, odtSample, pdfSample, pptxSample, textControlValuesFor, textSampleFor, xlsxSample } from '@/lib/samples';

async function parts(file: File): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await file.arrayBuffer()));
}

describe('sample PDFs', () => {
  it('produces a PDF with a valid header, xref and trailer', async () => {
    const text = await pdfSample('Sample', 3).text();
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Count 3');
    expect(text).toContain('startxref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('builds a document every PDF engine can reopen', async () => {
    const bytes = new Uint8Array(await pdfSample('Sample', 2).arrayBuffer());
    const { PDFDocument } = await import('pdf-lib');
    const reopened = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(reopened.getPageCount()).toBe(2);
  });
});

describe('sample DOCX', () => {
  it('contains the parts Word requires to identify a document', async () => {
    const zipped = await parts(docxSample());
    expect(Object.keys(zipped)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']),
    );
  });

  it('carries real text rather than an empty body', async () => {
    const zipped = await parts(docxSample());
    const xml = strFromU8(zipped['word/document.xml']);
    expect(xml).toContain('Furtu sample document');
    expect(xml).toContain('<w:p>');
  });
});

describe('sample XLSX', () => {
  it('contains the workbook, its relationships and a shared string table', async () => {
    const zipped = await parts(xlsxSample());
    expect(Object.keys(zipped)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/sharedStrings.xml',
        'xl/worksheets/sheet1.xml',
      ]),
    );
  });
});

describe('sample PPTX', () => {
  it('contains a presentation and one slide', async () => {
    const zipped = await parts(pptxSample());
    expect(Object.keys(zipped)).toEqual(
      expect.arrayContaining(['ppt/presentation.xml', 'ppt/slides/slide1.xml']),
    );
  });
});

describe('sample ODT', () => {
  it('is a readable ZIP', async () => {
    await expect(parts(odtSample())).resolves.toBeTypeOf('object');
  });

  it('contains the parts an ODT reader looks for', async () => {
    const zipped = await parts(odtSample());
    expect(Object.keys(zipped)).toEqual(
      expect.arrayContaining(['mimetype', 'META-INF/manifest.xml', 'content.xml']),
    );
    expect(strFromU8(zipped.mimetype)).toBe('application/vnd.oasis.opendocument.text');
  });

  it('keeps every entry reachable through the central directory', async () => {
    // fflate reads the central directory, not the local headers, so an entry
    // that is present in the file but missing from the directory is invisible
    // to the reader. This is exactly how the archive was broken once already.
    const zipped = await parts(odtSample());
    expect(strFromU8(zipped['content.xml'])).toContain('Furtu sample document');
    expect(strFromU8(zipped['META-INF/manifest.xml'])).toContain('manifest:manifest');
  });

  it('carries real paragraphs, not an empty body', async () => {
    const zipped = await parts(odtSample());
    const xml = strFromU8(zipped['content.xml']);
    expect(xml).toContain('<text:h>');
    expect(xml.match(/<text:p>/g)?.length).toBe(4);
  });
});

/**
 * Sample *selection*.
 *
 * The generators above are checked for structural correctness. These check that
 * the right sample is chosen at all, which is the failure that does not throw:
 * a tool handed the wrong input still reports a confident, correct-looking
 * refusal, so nothing looks broken to anyone who is not comparing it against
 * the tool's own expectations.
 */
describe('sample selection', () => {
  it('gives a converter the format it reads, not the one it produces', () => {
    // "json-to-csv" contains the substring "csv". Matching on the substring hands
    // the converter its own output, which is the one input it cannot parse.
    expect(() => JSON.parse(textSampleFor('json-to-csv'))).not.toThrow();
    expect(() => JSON.parse(textSampleFor('json-to-yaml'))).not.toThrow();
    expect(textSampleFor('csv-to-json')).toContain('region,quarter');
    expect(textSampleFor('yaml-to-json')).toContain('privacy:');
  });

  it('gives a pattern tester text to match, not a pattern', () => {
    const seeded = textSampleFor('regex-tester');
    // A pattern is not matchable text. This used to return one.
    expect(seeded).not.toMatch(/\\s\*|\\d\+/);
    expect(seeded).toContain('#4821');
  });

  it('seeds the control a text tool refuses to run without', () => {
    const controls = textControlValuesFor('regex-tester');
    expect(typeof controls.pattern).toBe('string');

    // The seeded pattern must actually match the seeded text, or the sample
    // still demonstrates nothing.
    const re = new RegExp(controls.pattern as string, 'g');
    const matches = [...textSampleFor('regex-tester').matchAll(re)];
    expect(matches.length).toBeGreaterThan(0);
    // Both groups, so the tester has something to show rather than a bare match.
    expect(matches[0][1]).toBe('Order');
    expect(matches[0][2]).toBe('4821');
  });

  it('leaves text tools with no extra controls alone', () => {
    expect(textControlValuesFor('word-counter')).toEqual({});
  });
});

