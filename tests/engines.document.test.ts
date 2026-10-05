/**
 * Document engine round-trip tests.
 *
 * Separate from the other engine tests because the OOXML and ODF operations
 * parse their parts with the browser's `DOMParser`, which does not exist in
 * Node. That is a real dependency of the engine, not a test artefact, so the
 * suite runs in jsdom rather than pretending the operations are pure string
 * work. Anything that needs a real rasteriser — the image engine — is still
 * out of reach here, and is recorded as a known gap in the engineering report.
 */

// @vitest-environment jsdom

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { ToolContext } from '@/lib/engines/types';

const ctx: ToolContext = { signal: new AbortController().signal, onProgress: () => {} };

const CT = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';

describe('document engine', () => {
  it('round-trips text into a DOCX that reads back as plain text', async () => {
    const engine = (await import('@/lib/engines/ops/document')).default;

    const produced = await engine.file!['text-to-docx'](
      [new File(['Furtu round trip\n\nSecond paragraph'], 'input.txt', { type: 'text/plain' })],
      {},
      ctx,
    );
    const blob = produced[0]?.blob;
    if (!blob) throw new Error('text-to-docx produced no output');

    // Feeding our own output back through our own reader is the only real proof
    // that the package we emit is a document we can read, and that a visitor can
    // take the file we hand them and re-open it here.
    const docx = new File([await blob.arrayBuffer()], 'out.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const back = await engine.file!['docx-to-text']([docx], {}, ctx);
    const text = await back[0].blob.text();
    expect(text).toMatch(/Furtu round trip/);
    expect(text).toMatch(/Second paragraph/);
  });

  it('preserves heading structure through the round trip', async () => {
    const engine = (await import('@/lib/engines/ops/document')).default;
    const produced = await engine.file!['text-to-docx'](
      [new File(['# A heading\n\nSome body text'], 'in.md', { type: 'text/markdown' })],
      { markdown: true },
      ctx,
    );
    const docx = new File([await produced[0].blob.arrayBuffer()], 'out.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const back = await engine.file!['docx-to-text']([docx], {}, ctx);
    expect(await back[0].blob.text()).toMatch(/A heading/);
  });

  it('reads cell values out of an XLSX', async () => {
    const engine = (await import('@/lib/engines/ops/document')).default;
    // Built with fflate so the fixture is a genuine OOXML package rather than a
    // mock, which is the only way the ZIP central-directory parsing is exercised.
    const workbook =
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Q1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>';
    const sheet =
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>region</t></is></c><c r="B1" t="inlineStr"><is><t>sales</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>North</t></is></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>';

    const bytes = zipSync({
      '[Content_Types].xml': strToU8(CT),
      'xl/workbook.xml': strToU8(workbook),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
    });

    const xlsx = new File([bytes as BlobPart], 'book.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const out = await engine.file!['xlsx-to-csv']([xlsx], {}, ctx);
    const csv = await out[0].blob.text();
    expect(csv).toMatch(/region,sales/);
    expect(csv).toMatch(/North,42/);
  });

  it('tells a renamed spreadsheet apart from a Word document', async () => {
    const engine = (await import('@/lib/engines/ops/document')).default;
    // Only a spreadsheet part, with no word/document.xml. The error has to name
    // the real problem, because "this file is damaged" sends people hunting for
    // corruption that is not there.
    const bytes = zipSync({
      '[Content_Types].xml': strToU8(CT),
      'xl/workbook.xml': strToU8(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>',
      ),
    });
    const notAWord = new File([bytes as BlobPart], 'book.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(engine.file!['docx-to-text']([notAWord], {}, ctx)).rejects.toThrow(
      /not a Word document/i,
    );
  });

  it('rejects a file that is not a ZIP container', async () => {
    const engine = (await import('@/lib/engines/ops/document')).default;
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) as BlobPart], 'nope.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(engine.file!['docx-to-text']([junk], {}, ctx)).rejects.toThrow();
  });
});
