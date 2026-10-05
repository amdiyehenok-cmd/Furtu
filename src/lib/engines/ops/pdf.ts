/**
 * PDF engine.
 *
 * Structural work (merge, split, rotate, watermark, metadata) is done with
 * pdf-lib, which is a small pure-JS library that rewrites the document object
 * graph without touching page content. Rendering and text extraction use
 * pdf.js, which is a much larger library and is only imported by the two tools
 * that genuinely need a rasteriser.
 *
 * The whole chunk is behind a dynamic import from the workspace, so a visitor
 * who never opens a PDF tool never downloads any of this.
 */

import {
  PDFDocument,
  PDFName,
  PDFRef,
  PDFRawStream,
  PDFContentStream,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import type { PDFImage, PDFFont, PDFPage } from 'pdf-lib';

import { parsePageRange, describeIndices } from '@/lib/paginate';
import { formatBytes, safeDownloadName, stripExtension, withExtension } from '@/lib/format';
import type {
  ControlValues,
  EngineChunk,
  FileOpMap,
  FileOutput,
  FileTextOpMap,
  TextResult,
  ToolContext,
} from '../types';

const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Stray C0 control characters, except tab, newline and carriage return.
 * pdf.js occasionally emits these from font hinting data, and they break
 * anything downstream that stores the text.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

class UserFacingError extends Error {}

/* --- loading ------------------------------------------------------------ */

async function loadDocument(file: File, ctx: ToolContext): Promise<PDFDocument> {
  if (file.size > MAX_BYTES) {
    throw new UserFacingError('This PDF is larger than the 500 MB limit for browser-based processing.');
  }
  ctx.onProgress(0.1, 'Reading file');

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    // `updateMetadata: false` keeps pdf-lib from rewriting the info dictionary
    // on load, which matters for the metadata tools and for compress.
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    if (doc.isEncrypted) {
      throw new UserFacingError(
        'This PDF is password protected. Enter the password and save an unlocked copy, then try again.',
      );
    }
    ctx.onProgress(0.35, 'Parsing document');
    return doc;
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError(
      'This file could not be read as a PDF. It may be corrupt, truncated, or not a real PDF despite its extension.',
    );
  }
}

function output(name: string, bytes: Uint8Array, note?: string): FileOutput {
  return {
    name: safeDownloadName(name),
    // A fresh copy: pdf-lib's save() hands back a view over its own buffer.
    blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    note,
  };
}

async function saveDoc(doc: PDFDocument, useObjectStreams = true): Promise<Uint8Array> {
  return doc.save({ useObjectStreams, addDefaultPage: false, updateFieldAppearances: false });
}

function pageCountNote(doc: PDFDocument, beforeBytes: number, afterBytes: number): string {
  const pages = doc.getPageCount();
  const saved = beforeBytes > 0 ? Math.max(0, (1 - afterBytes / beforeBytes) * 100) : 0;
  const size = `${formatBytes(beforeBytes)} → ${formatBytes(afterBytes)}`;
  return saved > 0.5
    ? `${pages} page${pages === 1 ? '' : 's'} · ${size} · ${saved.toFixed(0)}% smaller`
    : `${pages} page${pages === 1 ? '' : 's'} · ${size}`;
}

function describePages(doc: PDFDocument, count: number): string {
  const total = doc.getPageCount();
  return `${count} of ${total} page${total === 1 ? '' : 's'}`;
}

/* --- page selection shared by several tools ----------------------------- */

function selectPages(doc: PDFDocument, values: ControlValues, key = 'range'): number[] {
  const { indices, warnings } = parsePageRange(String(values[key] ?? ''), doc.getPageCount());
  if (warnings.length > 0) {
    throw new UserFacingError(warnings.join(' '));
  }
  if (indices.length === 0) {
    throw new UserFacingError('No pages matched. Check the page range and try again.');
  }
  return indices;
}

function bool(values: ControlValues, key: string, fallback: boolean): boolean {
  const value = values[key];
  if (value === undefined || value === '') return fallback;
  return Boolean(value);
}

function num(values: ControlValues, key: string, fallback: number): number {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : fallback;
}

function str(values: ControlValues, key: string, fallback = ''): string {
  const value = values[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/* --- operations --------------------------------------------------------- */

const mergePdf: FileOpMap[string] = async (files, values, ctx) => {
  if (files.length < 2) throw new UserFacingError('Add at least two PDFs to merge.');

  const merged = await PDFDocument.create();
  merged.setProducer('FURTU');
  let copied = 0;
  const total = files.length;

  for (const [index, file] of files.entries()) {
    ctx.onProgress((index / total) * 0.9, `Adding ${file.name}`);
    const source = await loadDocument(file, { ...ctx, onProgress: () => {} });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
    copied += pages.length;
  }

  ctx.onProgress(0.95, 'Writing file');
  const bytes = await saveDoc(merged);
  return [
    output('merged.pdf', bytes, `${copied} pages from ${total} files · ${formatBytes(bytes.length)}`),
  ];
};

const splitPdf: FileOpMap[string] = async (files, _values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  const total = doc.getPageCount();

  const mode = _values.mode as string;
  let groups: number[][] = [];
  let label = '';

  if (mode === 'chunks') {
    const size = Math.max(1, Math.floor(num(_values, 'chunkSize', 10)));
    for (let start = 0; start < total; start += size) {
      groups.push(Array.from({ length: Math.min(size, total - start) }, (_, i) => start + i));
    }
    label = `chunks of ${size}`;
  } else if (mode === 'each') {
    groups = Array.from({ length: total }, (_, i) => [i]);
    label = 'one file per page';
  } else {
    const { indices, warnings } = parsePageRange(String(_values.range ?? ''), total);
    if (warnings.length > 0) throw new UserFacingError(warnings.join(' '));
    if (indices.length === 0) throw new UserFacingError('No pages matched the range.');
    groups = [indices];
    label = describeIndices(indices);
  }

  ctx.onProgress(0.4, 'Building files');
  const base = stripExtension(file.name) || 'document';
  const outputs: FileOutput[] = [];

  for (const [index, indices] of groups.entries()) {
    const part = await PDFDocument.create();
    part.setProducer('FURTU');
    const copied = await part.copyPages(doc, indices);
    for (const page of copied) part.addPage(page);
    const bytes = await saveDoc(part);
    const suffix = groups.length === 1 ? '' : `-part-${index + 1}`;
    outputs.push(
      output(`${base}${suffix}.pdf`, bytes, `${describeIndices(indices)} · ${formatBytes(bytes.length)}`),
    );
    ctx.onProgress(0.4 + (0.5 * (index + 1)) / groups.length, `Built ${index + 1} of ${groups.length}`);
  }

  return outputs;
};

const rotatePdf: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  const angle = num(values, 'degrees', 90) as 90 | 180 | 270;
  const range = str(values, 'range');
  const targets = range ? selectPages(doc, values) : doc.getPageIndices();
  const pages = doc.getPages();

  targets.forEach((index, i) => {
    if (i % 20 === 0) ctx.onProgress(0.4 + (0.5 * i) / Math.max(1, targets.length), 'Rotating');
    pages[index].setRotation(degrees((pages[index].getRotation().angle + angle) % 360));
  });

  ctx.onProgress(0.95, 'Writing file');
  const bytes = await saveDoc(doc);
  return [output(file.name, bytes, `${describePages(doc, targets.length)} rotated ${angle}°`)];
};

const deletePdfPages: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  const total = doc.getPageCount();
  const targets = new Set(selectPages(doc, values));

  if (targets.size >= total) {
    throw new UserFacingError('That would remove every page, which is not a valid PDF. Keep at least one page.');
  }

  const remaining = doc.getPageIndices().filter((index) => !targets.has(index));
  const trimmed = await PDFDocument.create();
  trimmed.setProducer('FURTU');
  const copied = await trimmed.copyPages(doc, remaining);
  for (const page of copied) trimmed.addPage(page);

  ctx.onProgress(0.95, 'Writing file');
  const bytes = await saveDoc(trimmed);
  return [output(file.name, bytes, `${describePages(doc, remaining.length)} · ${targets.size} removed`)];
};

const extractPdfPages: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  const targets = selectPages(doc, values);

  const part = await PDFDocument.create();
  part.setProducer('FURTU');
  const copied = await part.copyPages(doc, targets);
  for (const page of copied) part.addPage(page);

  ctx.onProgress(0.95, 'Writing file');
  const bytes = await saveDoc(part);
  return [output(file.name, bytes, `Extracted ${describeIndices(targets)}`)];
};

const reorderPdfPages: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  const total = doc.getPageCount();
  const raw = str(values, 'order');

  if (!raw.trim()) throw new UserFacingError('Enter the page order you want, for example 3,1,2 or 1-5,6,1-5.');

  const { indices, warnings } = parsePageRange(raw, total);
  if (warnings.length > 0) throw new UserFacingError(warnings.join(' '));
  if (indices.length === 0) throw new UserFacingError('The page order did not contain any usable page numbers.');

  const reordered = await PDFDocument.create();
  reordered.setProducer('FURTU');
  const copied = await reordered.copyPages(doc, indices);
  for (const page of copied) reordered.addPage(page);

  ctx.onProgress(0.95, 'Writing file');
  const bytes = await saveDoc(reordered);
  return [output(file.name, bytes, `${indices.length} pages · order ${raw.trim()}`)];
};

/**
 * Structural compression.
 *
 * Two real, safe savings:
 *
 * 1. `useObjectStreams` packs small objects into compressed streams. Office
 *    generators emit a large number of tiny objects, so this is where most of
 *    the win comes from on text documents.
 *
 * 2. Deduplicating byte-identical streams. Exporters commonly write the same
 *    logo, header image or embedded font once per page. Streams with identical
 *    bytes are by definition the same object, so repointing every duplicate
 *    reference at the first one is lossless. This is safe because we only merge
 *    *identical* content — anything that differs is left alone.
 */
async function deduplicateStreams(doc: PDFDocument): Promise<number> {
  const context = doc.context;
  const canonicalByHash = new Map<string, PDFRef>();
  const duplicates: { ref: PDFRef; canonical: PDFRef }[] = [];

  for (const [ref, object] of context.enumerateIndirectObjects()) {
    const bytes = streamBytes(object);
    // Small streams are rarely duplicated and hashing them all is wasted work.
    if (!bytes || bytes.length < 64) continue;

    const digest = await sha256Hex(bytes);
    const canonical = canonicalByHash.get(digest);
    if (canonical && canonical.toString() !== ref.toString()) {
      duplicates.push({ ref, canonical });
    } else if (!canonical) {
      canonicalByHash.set(digest, ref);
    }
  }

  // Repoint every duplicate reference at the first identical object. Because
  // the streams are byte-identical this is lossless: same bytes, same dictionary,
  // same rendering. Anything that differs was never considered a duplicate.
  for (const { ref, canonical } of duplicates) {
    const target = context.lookup(canonical);
    if (target) context.assign(ref, target);
  }

  return duplicates.length;
}

/**
 * The bytes of a stream, for content comparison.
 *
 * pdf-lib exposes raw stream contents as bytes but decoded content streams as a
 * string, so both shapes have to be handled. Raw streams are the interesting
 * case for deduplication — that is where duplicated embedded images live.
 */
function streamBytes(object: unknown): Uint8Array | string | null {
  if (object instanceof PDFRawStream) return object.contents;
  if (object instanceof PDFContentStream) return object.getContentsString();
  return null;
}

async function sha256Hex(input: Uint8Array | string): Promise<string> {
  // A decoded content stream arrives as a string; hashing its UTF-8 encoding is
  // still a faithful content key, because the same content encodes identically.
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;

  if (globalThis.crypto?.subtle) {
    // Copy into a standalone ArrayBuffer: a `Uint8Array` over a shared buffer
    // is not a valid `BufferSource` in every lib.dom version.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // FNV-1a fallback for insecure contexts. Still a usable content key; it is
  // only ever compared, never relied upon for integrity.
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv:${hash.toString(16)}:${bytes.length.toString(16)}`;
}

const compressPdf: FileOpMap[string] = async (files, values, ctx) => {
  const outputs: FileOutput[] = [];
  const dedupe = bool(values, 'dedupe', true);
  const stripMetadata = bool(values, 'stripMetadata', true);

  for (const [index, file] of files.entries()) {
    ctx.onProgress((index / files.length) * 0.9, `Optimising ${file.name}`);
    const doc = await loadDocument(file, ctx);

    // The toggle is about the visible document properties, which is what a
    // compressor is allowed to drop. The XMP stream is left alone here: it is a
    // separate part, and silently deleting it is the metadata remover's job.
    if (stripMetadata) clearMetadata(doc, true);
    if (dedupe) {
      try {
        await deduplicateStreams(doc);
      } catch {
        // Dedup is an optimisation, never a correctness requirement. If a
        // malformed stream trips it up we still ship a valid, smaller file.
      }
    }

    ctx.onProgress((index / files.length) * 0.9 + 0.06, 'Writing file');
    const bytes = await saveDoc(doc, true);
    outputs.push(output(file.name, bytes, pageCountNote(doc, file.size, bytes.length)));
  }

  return outputs;
};

/**
 * Clears the document information dictionary.
 *
 * pdf-lib's setters only accept a string, so an existing value is overwritten
 * with an empty one rather than deleted. That is visually identical to an
 * absent field to every reader, and it is what the API allows.
 *
 * `keepXmp` exists because the XMP stream is a separate catalogue entry that
 * often holds more detail than the visible properties, including data the
 * document properties never carried. Leaving it behind while reporting the
 * document as cleaned would be misleading, so it is removed by default — but a
 * visitor keeping a PDF/A file may need the stream left intact, and the toggle
 * in the form has to actually do something.
 */
function clearMetadata(doc: PDFDocument, keepXmp: boolean): void {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  // A zero epoch reads as "unset" in every reader that displays the date.
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  if (keepXmp) return;
  try {
    doc.catalog.delete(PDFName.of('Metadata'));
  } catch {
    /* no metadata stream present */
  }
}

const removePdfMetadata: FileOpMap[string] = async (files, values, ctx) => {
  const keepXmp = values.removeXmp === false;
  const outputs: FileOutput[] = [];

  for (const [index, file] of files.entries()) {
    ctx.onProgress((index / files.length) * 0.9, `Cleaning ${file.name}`);
    const doc = await loadDocument(file, ctx);
    clearMetadata(doc, keepXmp);
    ctx.onProgress((index / files.length) * 0.9 + 0.06, 'Writing file');
    const bytes = await saveDoc(doc);
    outputs.push(
      output(
        file.name,
        bytes,
        `${keepXmp ? 'Properties cleared, XMP kept' : 'Properties and XMP cleared'} · ${formatBytes(file.size)} → ${formatBytes(bytes.length)}`,
      ),
    );
  }

  return outputs;
};

const pdfMetadata: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);

  // pdf-lib's getter returns keywords as a single decoded string, while its
  // setter takes an array. The two are not symmetric, so the round trip goes
  // through text rather than pretending the getter hands back an array.
  const keywordsOf = () => doc.getKeywords() ?? '';
  const current: Record<string, string> = {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: keywordsOf(),
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
  };

  const setters: Record<string, (value: string) => void> = {
    title: (v) => doc.setTitle(v),
    author: (v) => doc.setAuthor(v),
    subject: (v) => doc.setSubject(v),
    keywords: (v) => doc.setKeywords(v.split(',').map((k) => k.trim()).filter(Boolean)),
    creator: (v) => doc.setCreator(v),
    producer: (v) => doc.setProducer(v),
  };

  // The inspect step pre-fills each field with what the document already stores,
  // so a field that now reads empty means one value the visitor deliberately
  // removed, not one they forgot to fill in. That distinction is what makes it
  // possible to strip an author before publishing a document, which is the most
  // common reason to use this tool. An untouched field is skipped, so a partially
  // edited form still only writes the fields that actually changed.
  const edits: { key: string; before: string; after: string }[] = [];
  for (const [key, setter] of Object.entries(setters)) {
    const next = str(values, key).trim();
    const previous = current[key];
    if (next === previous) continue;
    setter(next);
    edits.push({ key, before: previous, after: next });
  }

  if (edits.length === 0) {
    throw new UserFacingError(
      'Nothing to write. Change at least one field, or clear a field to remove what is stored there.',
    );
  }

  ctx.onProgress(0.9, 'Writing file');
  const bytes = await saveDoc(doc);

  return [
    output(
      file.name,
      bytes,
      `Updated ${edits.length} field${edits.length === 1 ? '' : 's'}: ${edits.map((e) => e.key).join(', ')}`,
    ),
  ];
};


const watermarkPdf: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  const text = str(values, 'text', 'DRAFT');
  const position = str(values, 'position', 'diagonal');
  const size = Math.max(8, num(values, 'size', 48));
  const opacity = Math.min(1, Math.max(0.05, num(values, 'opacity', 20) / 100));
  const color = str(values, 'color', '#dc2626');

  let font: PDFFont;
  try {
    font = await doc.embedFont(StandardFonts.HelveticaBold);
  } catch {
    font = await doc.embedFont(StandardFonts.Helvetica);
  }

  const { r, g, b } = hexToRgb(color);
  const range = str(values, 'range');
  const targets = range ? selectPages(doc, values) : doc.getPageIndices();
  const pages = doc.getPages();

  for (const [i, index] of targets.entries()) {
    if (i % 10 === 0) ctx.onProgress(0.4 + (0.5 * i) / Math.max(1, targets.length), 'Stamping pages');
    const page = pages[index];
    const { width, height } = page.getSize();
    // Measure rather than estimate so long words never run off the page edge.
    const textWidth = font.widthOfTextAtSize(text, size);
    const fitScale = textWidth > width * 0.92 ? (width * 0.92) / textWidth : 1;
    const effectiveSize = size * fitScale;
    const drawWidth = font.widthOfTextAtSize(text, effectiveSize);

    let x = (width - drawWidth) / 2;
    let y = (height - effectiveSize) / 2;
    let rotation = degrees(0);

    if (position === 'top') {
      y = height - effectiveSize * 1.6;
    } else if (position === 'bottom') {
      y = effectiveSize * 0.7;
    } else if (position === 'diagonal') {
      rotation = degrees(45);
      // A 45° turn grows the bounding box, so centre on the rotated extent
      // rather than on the unrotated one, or the stamp sits off-centre.
      const cos = Math.cos(Math.PI / 4);
      const sin = Math.sin(Math.PI / 4);
      x = (width - (drawWidth * cos + effectiveSize * sin)) / 2;
      y = (height - (drawWidth * sin + effectiveSize * cos)) / 2;
    }

    page.drawText(text, { x, y, size: effectiveSize, font, color: rgb(r, g, b), opacity, rotate: rotation });
  }

  ctx.onProgress(0.95, 'Writing file');
  const bytes = await saveDoc(doc);
  return [output(file.name, bytes, `“${text}” on ${describePages(doc, targets.length)}`)];
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return { r: 0.86, g: 0.15, b: 0.15 };
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

const imagesToPdf: FileOpMap[string] = async (files, values, ctx) => {
  const orientation = str(values, 'orientation', 'auto');
  const pageSize = str(values, 'pageSize', 'a4');
  const margin = Math.max(0, num(values, 'margin', 0));

  // A4 and US Letter in PDF points (72 per inch).
  const SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

  const doc = await PDFDocument.create();
  doc.setProducer('FURTU');

  for (const [index, file] of files.entries()) {
    ctx.onProgress((index / files.length) * 0.9, `Placing ${file.name}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPng = file.name.toLowerCase().endsWith('.png');

    let image: PDFImage;
    try {
      image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch {
      throw new UserFacingError(
        `“${file.name}” could not be embedded. JPG and PNG files are supported; if this file has another format or an unusual colour profile, convert it to JPG or PNG first.`,
      );
    }

    const iw = image.width;
    const ih = image.height;

    let pageWidth: number;
    let pageHeight: number;

    if (pageSize === 'fit') {
      pageWidth = iw;
      pageHeight = ih;
    } else {
      const [baseW, baseH] = SIZES[pageSize] ?? SIZES.a4;
      const landscape = orientation === 'landscape' || (orientation === 'auto' && iw > ih);
      pageWidth = landscape ? Math.max(baseW, baseH) : Math.min(baseW, baseH);
      pageHeight = landscape ? Math.min(baseW, baseH) : Math.max(baseW, baseH);
    }

    const page: PDFPage = doc.addPage([pageWidth, pageHeight]);
    const availableW = Math.max(1, pageWidth - margin * 2);
    const availableH = Math.max(1, pageHeight - margin * 2);
    const scale = Math.min(availableW / iw, availableH / ih, 1);
    const drawW = iw * scale;
    const drawH = ih * scale;

    page.drawImage(image, {
      x: (pageWidth - drawW) / 2,
      y: (pageHeight - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  ctx.onProgress(0.95, 'Writing file');
  const saved = await saveDoc(doc);
  return [output('images.pdf', saved, `${files.length} page${files.length === 1 ? '' : 's'} · ${formatBytes(saved.length)}`)];
};

/* --- pdf.js backed operations ------------------------------------------- */

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/**
 * pdf.js is ~1 MB and pulls its own worker, so it is imported lazily and only
 * by the two tools that need a rasteriser. The worker is served as a hashed
 * asset by Vite rather than fetched from a CDN, which keeps the app
 * self-hosted and CSP-friendly.
 */
async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function openWithPdfjs(file: File, ctx: ToolContext) {
  const pdfjs = await getPdfjs();
  ctx.onProgress(0.15, 'Loading renderer');
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({
      data,
      // Keep everything in memory: the page count is only known after the
      // cross-reference table is parsed.
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
    }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name ?? '';
    if (name === 'PasswordException') {
      throw new UserFacingError('This PDF is password protected. Unlock it first, then convert the pages.');
    }
    throw new UserFacingError('This PDF could not be opened. It may be corrupt or only partially downloaded.');
  }
}

const pdfToJpg: FileOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const mime = str(values, 'format', 'image/jpeg') as 'image/jpeg' | 'image/png';
  const scale = num(values, 'scale', 2);
  const quality = Math.min(1, Math.max(0.4, num(values, 'quality', 92) / 100));

  const doc = await openWithPdfjs(file, ctx);
  const total = doc.numPages;
  const { indices, warnings } = parsePageRange(str(values, 'range'), total);
  if (warnings.length > 0) throw new UserFacingError(warnings.join(' '));
  if (indices.length === 0) throw new UserFacingError('No pages matched the range.');

  const base = stripExtension(file.name) || 'page';
  const outputs: FileOutput[] = [];

  for (const [i, pageNumber] of indices.entries()) {
    if (ctx.signal.aborted) throw new UserFacingError('Cancelled.');
    ctx.onProgress(0.2 + (0.75 * i) / indices.length, `Rendering page ${pageNumber + 1} of ${total}`);

    const page = await doc.getPage(pageNumber + 1);
    const viewport = page.getViewport({ scale });
    const pixelWidth = Math.max(1, Math.floor(viewport.width));
    const pixelHeight = Math.max(1, Math.floor(viewport.height));

    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d', { alpha: mime === 'image/png' });

    if (!context) {
      await doc.destroy();
      throw new UserFacingError('This browser did not provide a 2D canvas, which is needed to render PDF pages.');
    }

    if (mime === 'image/jpeg') {
      // JPEG has no alpha channel; without an explicit fill, transparent areas
      // render black in some browsers.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pixelWidth, pixelHeight);
    }

    await page.render({ canvasContext: context, viewport, background: mime === 'image/jpeg' ? '#ffffff' : undefined }).promise;
    page.cleanup();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    // Release the backing store immediately; a 200-page run at 288 dpi would
    // otherwise pin gigabytes of bitmap memory.
    canvas.width = 0;
    canvas.height = 0;

    if (!blob) {
      await doc.destroy();
      throw new UserFacingError('The browser could not encode the rendered page. Try a lower resolution or a different format.');
    }

    const ext = mime === 'image/png' ? 'png' : 'jpg';
    outputs.push({
      name: safeDownloadName(withExtension(`${base}-page-${pageNumber + 1}`, ext)),
      blob,
      previewUrl: URL.createObjectURL(blob),
      note: `${pixelWidth}×${pixelHeight} · ${formatBytes(blob.size)}`,
    });
  }

  await doc.destroy();
  return outputs;
};

const extractPdfText: FileTextOpMap[string] = async (files, values, ctx) => {
  const file = files[0];
  const preserveBreaks = bool(values, 'preserveBreaks', true);
  const pageMarkers = bool(values, 'pageMarkers', true);

  const doc = await openWithPdfjs(file, ctx);
  const totalPages = doc.numPages;
  const chunks: string[] = [];
  let pagesWithText = 0;

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    if (ctx.signal.aborted) {
      await doc.destroy();
      throw new UserFacingError('Cancelled.');
    }
    ctx.onProgress(0.2 + (0.75 * (pageNumber - 1)) / totalPages, `Reading page ${pageNumber} of ${totalPages}`);

    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    page.cleanup();

    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str;
      if (preserveBreaks && 'hasEOL' in item && item.hasEOL) text += '\n';
      else if (preserveBreaks && 'hasEOL' in item) text += ' ';
    }

    if (text.trim().length > 0) pagesWithText += 1;
    chunks.push(pageMarkers && totalPages > 1 ? `[Page ${pageNumber}]\n${text.trim()}` : text.trim());
  }

  await doc.destroy();

  const text = chunks.join(preserveBreaks ? '\n\n' : '\n');
  // pdf.js can emit control characters that break downstream consumers.
  const cleaned = text.replace(CONTROL_CHARS, '');

  return {
    output: cleaned,
    meta: [
      { label: 'Pages', value: String(totalPages) },
      { label: 'Pages with text', value: `${pagesWithText} of ${totalPages}` },
      { label: 'Characters', value: cleaned.length.toLocaleString('en-GB') },
    ],
    diagnostics:
      pagesWithText === 0
        ? [
            {
              level: 'warn' as const,
              message:
                'No text layer was found in this document, which usually means every page is a scanned image. Furtu reads existing text, it does not run OCR.',
            },
          ]
        : pagesWithText < totalPages
          ? [
              {
                level: 'warn' as const,
                message: `${totalPages - pagesWithText} of ${totalPages} pages have no text layer, so they contributed nothing.`,
              },
            ]
          : [{ level: 'ok' as const, message: `Text extracted from all ${pagesWithText} pages.` }],
    download: {
      name: `${stripExtension(file.name) || 'document'}.txt`,
      blob: new Blob([cleaned], { type: 'text/plain;charset=utf-8' }),
    },
  };
};

/**
 * Read-only report of a document's information dictionary.
 *
 * This is what makes the metadata editor honest about the word "inspect": the
 * current values are read out of the file, shown as chips, and pushed into the
 * form so the visitor edits what is actually there rather than typing blind.
 * Nothing is written, and the file is never modified.
 */
const inspectPdfMetadata: FileTextOpMap[string] = async (files, _values, ctx) => {
  const file = files[0];
  const doc = await loadDocument(file, ctx);
  ctx.onProgress(0.6, 'Reading properties');

  // pdf-lib returns keywords as one decoded string here, even though the
  // matching setter takes an array.
  const keywords = doc.getKeywords() ?? '';
  const created = doc.getCreationDate();
  const modified = doc.getModificationDate();

  // pdf-lib exposes no version getter, so the header is read from the bytes the
  // visitor actually handed over rather than guessed at from a saved copy.
  const head = new TextDecoder('latin1').decode(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
  const version = /^%PDF-(\d+\.\d+)/.exec(head)?.[1] ?? '—';

  // The XMP stream is a separate catalogue entry. Its presence is a fact worth
  // reporting, unlike a guess at conformance level from the producer string.
  let hasXmp = false;
  try {
    hasXmp = doc.catalog.get(PDFName.of('Metadata')) !== undefined;
  } catch {
    hasXmp = false;
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Title', value: doc.getTitle() || '—' },
    { label: 'Author', value: doc.getAuthor() || '—' },
    { label: 'Subject', value: doc.getSubject() || '—' },
    { label: 'Keywords', value: keywords || '—' },
    { label: 'Creator', value: doc.getCreator() || '—' },
    { label: 'Producer', value: doc.getProducer() || '—' },
    { label: 'Created', value: created ? created.toISOString().slice(0, 10) : '—' },
    { label: 'Modified', value: modified ? modified.toISOString().slice(0, 10) : '—' },
    { label: 'Pages', value: String(doc.getPageCount()) },
    { label: 'PDF version', value: version },
  ];

  // A field is "missing" when the document simply has no value for it. That is
  // the list worth surfacing, because those are the fields that leak identifying
  // information when a document is published as-is.
  const missing = ['Title', 'Author', 'Subject', 'Keywords', 'Creator']
    .filter((label) => rows.find((row) => row.label === label)?.value === '—');

  return {
    output: rows.map((row) => `${row.label}: ${row.value}`).join('\n'),
    meta: rows,
    prefill: {
      title: doc.getTitle() ?? '',
      author: doc.getAuthor() ?? '',
      subject: doc.getSubject() ?? '',
      keywords,
      creator: doc.getCreator() ?? '',
      producer: doc.getProducer() ?? '',
    },
    diagnostics: [
      ...(missing.length > 0
        ? [
            {
              level: 'warn' as const,
              message: `No ${missing.join(', no ')} stored. A published document with no title often shows up in search under its filename instead.`,
            },
          ]
        : []),
      ...(hasXmp
        ? [
            {
              level: 'warn' as const,
              message:
                'This file also carries an XMP metadata stream, which can hold more than the properties above. The PDF Metadata Remover tool clears that too.',
            },
          ]
        : []),
    ],
    download: {
      name: `${stripExtension(file.name) || 'document'}-properties.txt`,
      blob: new Blob([rows.map((row) => `${row.label}: ${row.value}`).join('\n')], {
        type: 'text/plain;charset=utf-8',
      }),
    },
  };
};

const fileText: FileTextOpMap = {
  'extract-pdf-text': extractPdfText,
  'pdf-metadata-inspect': inspectPdfMetadata,
};

const file: FileOpMap = {
  'merge-pdf': mergePdf,
  'split-pdf': splitPdf,
  'rotate-pdf': rotatePdf,
  'delete-pdf-pages': deletePdfPages,
  'extract-pdf-pages': extractPdfPages,
  'reorder-pdf-pages': reorderPdfPages,
  'compress-pdf': compressPdf,
  'watermark-pdf': watermarkPdf,
  'pdf-metadata': pdfMetadata,
  'remove-pdf-metadata': removePdfMetadata,
  'pdf-to-jpg': pdfToJpg,
  'images-to-pdf': imagesToPdf,
};

export default { file, fileText } satisfies EngineChunk;
