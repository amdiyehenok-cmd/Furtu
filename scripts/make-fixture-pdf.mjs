/**
 * Builds a small, valid multi-page PDF for the browser smoke test.
 * Run with: node scripts/make-fixture-pdf.mjs <out.pdf> <pages>
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'fixture.pdf';
const pages = Number(process.argv[3] ?? 3);

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

for (let i = 0; i < pages; i += 1) {
  const page = doc.addPage([595, 842]);
  page.drawText(`FURTU smoke test — page ${i + 1} of ${pages}`, {
    x: 50,
    y: 780,
    size: 16,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('This document exists so the browser test has something real to process.', {
    x: 50,
    y: 750,
    size: 11,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
}

doc.setTitle('FURTU smoke test');
doc.setAuthor('FURTU');
// pdf-lib's setter takes an array and its getter returns a space-joined string.
doc.setKeywords(['furtu', 'smoke', 'test', 'fixture']);

writeFileSync(out, await doc.save());
console.log(`wrote ${out} (${pages} pages)`);
