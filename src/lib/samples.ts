/**
 * Sample files, generated in the browser.
 *
 * A tool that needs a file before it can show anything is hard to evaluate: you
 * have to find a suitable file, then wait to see whether it works. These let a
 * visitor press one button and watch the tool actually do its job.
 *
 * The files are *generated*, not fetched. That is a deliberate constraint rather
 * than a shortcut â€” the product's central claim is that nothing leaves the
 * device, and a sample file pulled over the network would undercut the one page
 * making that claim. It also means the feature costs no bytes until it is used.
 *
 * Each generator returns real files with correct magic bytes, because the file
 * validator is strict on purpose and a fake file would be rejected.
 */

import { zipSync } from 'fflate';
import { SITE } from '@/lib/site';

/** Minimal, valid 1Ã—1 PNG. */
const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

/**
 * Wraps bytes in a `File`.
 *
 * The `ArrayBuffer` is sliced out explicitly rather than handing the
 * `Uint8Array` straight to `Blob`: a `Uint8Array` can be backed by a
 * `SharedArrayBuffer`, which a `Blob` will not accept, and several of the
 * generators here come from libraries typed that way. Copying into a plain
 * buffer keeps the call sites honest instead of casting at each one.
 */
function file(parts: BlobPart[], name: string, type: string): File {
  return new File(parts, name, { type });
}

function bytesFile(bytes: Uint8Array, name: string, type: string): File {
  return file([bytes.slice().buffer], name, type);
}

/* ---------------------------------------------------------------- images */

let pngCounter = 0;

/**
 * A generated PNG, drawn on a canvas so the bytes are a real encoded image
 * rather than a constant one-pixel square that would make every image tool look
 * like it did nothing.
 */
async function makePng(width: number, height: number, label: string): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PNG_1X1;

  // A gradient plus shapes, so compression and conversion have real work to do
  // and the before/after preview is something a person can look at.
  const hue = (pngCounter * 47) % 360;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue} 70% 62%)`);
  gradient.addColorStop(1, `hsl(${(hue + 70) % 360} 65% 42%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(((i * 137) % width) + 12, ((i * 211) % height) + 12, 10 + ((i * 13) % 34), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(15,23,42,.86)';
  ctx.font = `600 ${Math.max(14, Math.round(width / 14))}px system-ui, sans-serif`;
  ctx.fillText(label, 18, height - 22);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return PNG_1X1;
  return new Uint8Array(await blob.arrayBuffer());
}

async function pngSample(label: string, width = 640, height = 420): Promise<File> {
  pngCounter += 1;
  const bytes = await makePng(width, height, label);
  return bytesFile(bytes, `sample-${label.toLowerCase().replace(/\s+/g, '-')}.png`, 'image/png');
}

async function jpgSample(label: string, width = 640, height = 420): Promise<File> {
  pngCounter += 1;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return bytesFile(PNG_1X1, 'sample.jpg', 'image/jpeg');

  const hue = (pngCounter * 47) % 360;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue} 68% 60%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 60% 40%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(20 + i * 40, 30 + ((i * 57) % (height - 90)), 26, 26);
  }
  ctx.fillStyle = 'rgba(15,23,42,.86)';
  ctx.font = `600 ${Math.max(14, Math.round(width / 14))}px system-ui, sans-serif`;
  ctx.fillText(label, 18, height - 20);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) return bytesFile(PNG_1X1, 'sample.jpg', 'image/jpeg');
  return bytesFile(new Uint8Array(await blob.arrayBuffer()), 'sample-photo.jpg', 'image/jpeg');
}

async function webpSample(label: string): Promise<File> {
  pngCounter += 1;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');
  if (!ctx) return bytesFile(PNG_1X1, 'sample.webp', 'image/webp');

  const hue = (pngCounter * 47) % 360;
  ctx.fillStyle = `hsl(${hue} 70% 58%)`;
  ctx.fillRect(0, 0, 640, 420);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText(label, 24, 220);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  if (!blob) return bytesFile(PNG_1X1, 'sample.webp', 'image/webp');
  return bytesFile(new Uint8Array(await blob.arrayBuffer()), 'sample-image.webp', 'image/webp');
}

/* ------------------------------------------------------------------ text */

function textFile(name: string, content: string): File {
  return file([content], name, 'text/plain');
}

const SAMPLE_JSON = JSON.stringify(
  {
    project: 'Furtu',
    version: '1.0.0',
    private: true,
    tags: ['pdf', 'images', 'documents'],
    limits: { maxFiles: 50, maxBytes: 524288000 },
    nested: { engines: 6, tools: 63, tested: true },
  },
  null,
  2,
);

const SAMPLE_CSV = `region,quarter,sales,change
North,Q1,18400,4.2
South,Q1,12750,-1.8
East,Q1,21300,9.4
West,Q1,9880,0.6
North,Q2,20150,9.5
South,Q2,13300,4.3`;

const SAMPLE_YAML = `# Furtu engine configuration
name: furtu
version: 1.0.0
privacy:
  local: true
  uploads: false
engines:
  - id: pdf
    size: large
  - id: image
    size: medium
  - id: text
    size: small
limits:
  maxFiles: 50
  maxBytes: 524288000`;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<catalogue xmlns="https://furtu.example/schema">
  <item id="1">
    <name>Merge PDF</name>
    <category>pdf</category>
    <local>true</local>
  </item>
  <item id="2">
    <name>Compress Image</name>
    <category>image</category>
    <local>true</local>
  </item>
</catalogue>`;

const SAMPLE_MARKDOWN = `# Release notes

Furtu now processes every file **in your browser**.

## What changed

- Added a drag-to-reorder queue for tools where order matters
- Made every file limit visible before you choose a file
- Removed the last place a file could be sent anywhere

## Why

Because a document you compress should never have to be uploaded to be
compressed.

> Nothing is uploaded. Not the file, not its name, not its size.
`;

const SAMPLE_WORDS = `The quick brown fox jumps over the lazy dog.
Pack my box with five dozen liquor jugs.
How vexingly quick daft zebras jump!
Sphinx of black quartz, judge my vow.
The five boxing wizards jump quickly.`;

/* ------------------------------------------------------------------- pdf */

const esc = (s: string) => s.replace(/([\\()])/g, '\\$1');

/**
 * A real PDF, assembled by hand.
 *
 * pdf-lib is already in the page for the PDF tools, but a sample generator that
 * depended on it could not be shared with the image and document tools, and the
 * whole point is to have one generator that works for every tool. A minimal
 * document with correct xref offsets is enough to be accepted by pdf-lib and by
 * every operation on this site.
 */
export function pdfSample(title = 'Furtu sample document', pages = 1): File {
  const objects: string[] = [];
  const pageCount = Math.max(1, Math.min(pages, 8));

  // 1 catalog, 2 page tree, then font + page objects, then content streams.
  const firstPageObj = 4;
  const fontObj = 3;
  const pageIds = Array.from({ length: pageCount }, (_, i) => firstPageObj + i * 2);
  const contentIds = pageIds.map((id) => id + 1);
  const totalObjects = 3 + pageCount * 2;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[fontObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  for (let i = 0; i < pageCount; i += 1) {
    const content =
      `BT /F1 22 Tf 64 720 Td (${esc(title)}) Tj ` +
      `/F1 12 Tf 0 -30 Td (Page ${i + 1} of ${pageCount}) Tj ` +
      `0 -22 Td (This is a sample file generated in your browser.) Tj ` +
      `0 -18 Td (Nothing was downloaded to create it.) Tj ET`;

    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;

    objects[contentIds[i]] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjects; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info << /Title (${esc(title)}) /Producer (FURTU sample) >> >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;

  return bytesFile(new TextEncoder().encode(pdf), `sample-${title.toLowerCase().replace(/\s+/g, '-')}.pdf`, 'application/pdf');
}

/* -------------------------------------------------------------- documents */

/**
 * A minimal but genuinely valid DOCX.
 *
 * Written by hand from the OOXML part list rather than with a library, because
 * the point is to prove the document tools can read a real package, and a
 * package assembled here is more obviously real than a mocked one.
 */
export function docxSample(): File {
  const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    paragraph('Furtu sample document') +
    paragraph('This file was generated in your browser to demonstrate the document tools.') +
    paragraph('It contains real text in a real Word package, so extraction returns it correctly.') +
    paragraph('') +
    paragraph('First paragraph of body copy, written to check that line breaks survive extraction.') +
    paragraph('Second paragraph, so there is more than one block to read back.') +
    `</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const encoder = new TextEncoder();
  const bytes = zipSync({
    '[Content_Types].xml': encoder.encode(contentTypes),
    '_rels/.rels': encoder.encode(rels),
    'word/document.xml': encoder.encode(documentXml),
  });

  return bytesFile(
    bytes,
    'sample-document.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
}
/**
 * A minimal but genuine ODT.
 *
 * The OpenDocument specification asks for a `mimetype` entry, stored
 * uncompressed as the first entry, so a reader can identify the format without
 * inflating the archive. fflate cannot express "store only this one entry", and
 * an earlier hand-built archive did exactly that and produced a file whose
 * central directory pointed past its own end — invisible to every reader. The
 * mimetype is included as an ordinary deflated entry instead, which is what
 * this site's own ODT reader and LibreOffice both open, and which cannot go
 * wrong the same way.
 */
export function odtSample(): File {
  const content =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">` +
    `<office:body><office:text>` +
    `<text:h>Furtu sample document</text:h>` +
    `<text:p>This OpenDocument file was generated in your browser.</text:p>` +
    `<text:p>It contains real text in a real ODF package, so extraction returns it correctly.</text:p>` +
    `<text:p>First paragraph of body copy, written to check that paragraph breaks survive extraction.</text:p>` +
    `<text:p>Second paragraph, so there is more than one block to read back.</text:p>` +
    `</office:text></office:body></office:document-content>`;

  const manifest =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">` +
    `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `</manifest:manifest>`;

  const encoder = new TextEncoder();
  const bytes = zipSync({
    mimetype: encoder.encode('application/vnd.oasis.opendocument.text'),
    'META-INF/manifest.xml': encoder.encode(manifest),
    'content.xml': encoder.encode(content),
  });

  return bytesFile(bytes, 'sample-document.odt', 'application/vnd.oasis.opendocument.text');
}

/** A minimal XLSX with a shared string table, which is what real workbooks use. */
export function xlsxSample(): File {
  const strings = ['Region', 'Quarter', 'Sales', 'Change', 'North', 'Q1', 'South', 'Q2', 'West', 'Q3'];
  const sharedStrings =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map((s) => `<si><t>${s}</t></si>`).join('') +
    `</sst>`;

  const cell = (ref: string, value: number | string, shared: boolean) =>
    shared
      ? `<c r="${ref}" t="s"><v>${value}</v></c>`
      : `<c r="${ref}"><v>${value}</v></c>`;

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1">${cell('A1', 0, true)}${cell('B1', 1, true)}${cell('C1', 2, true)}${cell('D1', 3, true)}</row>` +
    `<row r="2">${cell('A2', 4, true)}${cell('B2', 5, true)}${cell('C2', 18400, false)}${cell('D2', 4.2, false)}</row>` +
    `<row r="3">${cell('A3', 6, true)}${cell('B3', 7, true)}${cell('C3', 12750, false)}${cell('D3', -1.8, false)}</row>` +
    `<row r="4">${cell('A4', 8, true)}${cell('B4', 9, true)}${cell('C4', 21300, false)}${cell('D4', 9.4, false)}</row>` +
    `</sheetData></worksheet>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const bytes = zipSync({
    '[Content_Types].xml': new TextEncoder().encode(contentTypes),
    '_rels/.rels': new TextEncoder().encode(rootRels),
    'xl/workbook.xml': new TextEncoder().encode(workbook),
    'xl/_rels/workbook.xml.rels': new TextEncoder().encode(workbookRels),
    'xl/sharedStrings.xml': new TextEncoder().encode(sharedStrings),
    'xl/worksheets/sheet1.xml': new TextEncoder().encode(sheet),
  });

  return bytesFile(
    bytes,
    'sample-workbook.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

/** A minimal PPTX with one slide. */
export function pptxSample(): File {
  const slide =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree>` +
    `<p:sp><p:txBody><a:p><a:r><a:t>Furtu sample slide</a:t></a:r></a:p>` +
    `<a:p><a:r><a:t>Generated in your browser, for the presentation tools.</a:t></a:r></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld></p:sld>`;

  const presentation =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`;

  const bytes = zipSync({
    '[Content_Types].xml': new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
        `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
        `</Types>`,
    ),
    '_rels/.rels': new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
        `</Relationships>`,
    ),
    'ppt/presentation.xml': new TextEncoder().encode(presentation),
    'ppt/_rels/presentation.xml.rels': new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
        `</Relationships>`,
    ),
    'ppt/slides/slide1.xml': new TextEncoder().encode(slide),
  });

  return bytesFile(
    bytes,
    'sample-slides.pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
}

/* --------------------------------------------------------------- dispatch */

/**
 * A sample result: the files, plus any control values the tool needs before it
 * can do anything.
 *
 * A file on its own is not enough for the page-range tools. Handing
 * `reorder-pdf-pages` a PDF and nothing else produces a refused run, because
 * there is no order to apply — which is correct behaviour but a poor first
 * impression. Filling the control alongside the file is what makes "try a
 * sample" actually demonstrate the tool.
 */
export interface SampleBundle {
  files: File[];
  /** Control ids and values to seed at the same time as the files. */
  values?: Record<string, string | number | boolean>;
}

/**
 * Which sample to offer, given what the tool accepts.
 *
 * Chosen from the declared extensions rather than the slug, so a new tool that
 * accepts `.pdf` gets a PDF sample without anyone remembering to add a case.
 */
export function sampleFor(
  extensions: string[],
  minFiles = 1,
  operation = '',
): () => Promise<SampleBundle> {
  const ext = extensions.map((e) => e.toLowerCase());
  const count = Math.max(1, Math.min(minFiles, 3));

  return async () => {
    if (ext.includes('.pdf')) {
      // A single one-page document gives the page-range tools nothing to work
      // with, so anything in that family gets a multi-page sample.
      const pages = /delete-pdf-pages|extract-pdf-pages|reorder-pdf-pages|split-pdf|watermark-pdf|rotate-pdf|pdf-to-jpg|extract-pdf-text/.test(
        operation,
      )
        ? 4
        : 1;
      const files = Array.from({ length: count }, (_, i) =>
        pdfSample(count > 1 ? `Furtu sample document ${i + 1}` : 'Furtu sample document', pages),
      );
      return { files, values: pdfControlValues(operation, pages) };
    }
    if (ext.includes('.docx')) return { files: [docxSample()] };
    if (ext.includes('.odt')) return { files: [odtSample()] };
    if (ext.includes('.xlsx')) return { files: [xlsxSample()] };
    if (ext.includes('.pptx')) return { files: [pptxSample()] };
    if (ext.includes('.webp')) return { files: [await webpSample('Furtu sample')] };
    if (ext.includes('.jpg') || ext.includes('.jpeg')) return { files: [await jpgSample('Furtu sample photo')] };
    if (ext.includes('.png')) return { files: [await pngSample('Furtu sample image')] };
    if (ext.includes('.csv')) return { files: [textFile('sample-data.csv', SAMPLE_CSV)] };
    if (ext.includes('.yaml') || ext.includes('.yml')) return { files: [textFile('sample-config.yaml', SAMPLE_YAML)] };
    if (ext.includes('.json')) return { files: [textFile('sample-data.json', SAMPLE_JSON)] };
    if (ext.includes('.xml')) return { files: [textFile('sample-catalogue.xml', SAMPLE_XML)] };
    if (ext.includes('.md')) return { files: [textFile('sample-notes.md', SAMPLE_MARKDOWN)] };
    return { files: [textFile('sample.txt', SAMPLE_WORDS)] };
  };
}

/**
 * A control value that makes the sample useful for a particular PDF operation.
 *
 * Every one of these picks something a person would actually type. The point is
 * not that the tool stops refusing bad input — refusing is correct — but that
 * the first thing someone sees is the tool working.
 */
function pdfControlValues(operation: string, pages: number): Record<string, string | number | boolean> {
  switch (operation) {
    case 'reorder-pdf-pages':
      return { order: pages > 2 ? `${pages},1,2` : '1' };
    case 'delete-pdf-pages':
      return { range: String(pages) };
    case 'extract-pdf-pages':
      return { range: pages > 1 ? '1-2' : '1' };
    case 'split-pdf':
      return { mode: 'each' };
    case 'watermark-pdf':
      return { text: 'DRAFT', position: 'diagonal', size: 48, opacity: 20, color: '#dc2626' };
    case 'rotate-pdf':
      return { degrees: 90 };
    case 'compress-pdf':
      return { dedupe: true, stripMetadata: true };
    case 'pdf-to-jpg':
      return { scale: 1.5, format: 'jpeg', quality: 82 };
    case 'remove-pdf-metadata':
      return { removeXmp: true };
    case 'pdf-metadata':
      // The inspect step pre-fills the form with what the file already stores,
      // so an untouched run is correctly refused as "nothing to write". The
      // sample therefore arrives with a real correction to see applied.
      return { title: 'Annual report 2026', author: 'Furtu sample', subject: 'Demonstration document' };
    default:
      return {};
  }
}

/**
 * Sample input for the text workspace, where there is no file to choose.
 *
 * Order matters: the checks are ordered from most specific to least, because
 * several slugs share a substring. A tool that expects a number and is handed
 * a paragraph produces a correct-but-useless error, which is the opposite of
 * what a sample is for — so every tool family has a value it can actually do
 * something with.
 */
export function textSampleFor(slug: string): string {
  // A converter slug names two formats and reads the one on the left. "json-to-csv"
  // contains "csv", so a bare substring scan hands the tool precisely the input it
  // cannot parse — and the failure is a correct-but-useless parse error, which is
  // the opposite of what a sample is for. Resolve the source format before any of
  // the format checks below can match the target.
  const converter = slug.match(/^([a-z0-9]+)-to-([a-z0-9]+)$/);
  if (converter) {
    const source = sampleForFormat(converter[1]);
    if (source) return source;
  }

  // Most specific first.
  if (slug.includes('jwt')) {
    const payload = btoa(JSON.stringify({ sub: '1234567890', name: 'Furtu', iat: 1757000000 })).replace(
      /=+$/,
      '',
    );
    return `${btoa('{"alg":"HS256","typ":"JWT"}').replace(/=+$/, '')}.${payload}.demo-signature-not-verified`;
  }
  if (slug.includes('timestamp')) return '1757000000';
  if (slug.includes('unit')) return '12.5 km';
  if (slug.includes('file-size')) return '2.5 MB';
  if (slug.includes('percentage')) return '18';
  if (slug.includes('regex')) {
    // Text to match against, not a pattern. This used to return a pattern here,
    // which seeded the input box with something the tester could never match.
    return 'Order #4821 - Water filter cartridges\nOrder #4822 - Replacement seals\nOrder #4830 - Inline housing\n';
  }
  if (slug.includes('color')) return '#1e3a8a';
  if (slug.includes('url')) {
    // Built from the canonical origin rather than written out, so the sample a
    // visitor parses is the site they are standing on.
    return `${SITE.origin}/tools/pdf/merge-pdf?ref=home&utm_source=newsletter`;
  }
  if (slug.includes('base64')) return btoa('Furtu processes files in your browser.');
  if (slug.includes('markdown')) return SAMPLE_MARKDOWN;
  if (slug.includes('csv')) return SAMPLE_CSV;
  if (slug.includes('yaml')) return SAMPLE_YAML;
  if (slug.includes('xml')) return SAMPLE_XML;
  if (slug.includes('json')) return SAMPLE_JSON;
  if (slug.includes('mime')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (slug.includes('case')) return 'the quick brown fox jumps over the lazy dog';
  if (slug.includes('password')) return SAMPLE_WORDS;
  return SAMPLE_WORDS;
}

/** The sample text for a named format, or null when the name is not a format. */
function sampleForFormat(format: string): string | null {
  switch (format) {
    case 'json':
      return SAMPLE_JSON;
    case 'csv':
      return SAMPLE_CSV;
    case 'yaml':
    case 'yml':
      return SAMPLE_YAML;
    case 'xml':
      return SAMPLE_XML;
    case 'md':
    case 'markdown':
      return SAMPLE_MARKDOWN;
    default:
      return null;
  }
}

/**
 * Control values for the text workspace, where filling the box is not enough.
 *
 * Most text tools need nothing extra. A pattern tester does: with an empty pattern
 * field the run is refused, and correctly so, because there is no pattern to
 * apply. The refusal is right but useless as a demonstration, so the sample
 * arrives with a pattern already written — two groups over the seeded text, which
 * is what the tool is actually for.
 */
export function textControlValuesFor(slug: string): Record<string, string | number | boolean> {
  if (slug.includes('regex')) return { pattern: '(\\w+)\\s+#(\\d+)' };
  return {};
}
