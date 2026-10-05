/**
 * Document engine.
 *
 * DOCX, XLSX, PPTX and ODT are all ZIP containers, so everything here starts
 * with one guarded `openZip` and then adds a format-specific reader on top.
 *
 * Two decisions are worth stating up front, because they are the difference
 * between a tool that works and one that quietly returns nonsense:
 *
 *  1. Extraction walks the XML with `DOMParser` rather than matching tags with
 *     a regular expression. XML entities, CDATA sections, namespace prefixes
 *     and attribute order all defeat regex scraping, and a word processor that
 *     loses a quotation mark or a whole table cell is worse than one that says
 *     it could not read the file.
 *  2. Nothing here touches the network. There is no `fetch`, no XHR and no
 *     remote URL anywhere in this file, because "processed in your browser" is
 *     a claim Furtu makes to people handling contracts and payslips.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { formatBytes, formatNumber, safeDownloadName, stripExtension, withExtension } from '@/lib/format';
import type { ControlValues, TextResult, ToolContext } from '../types';

type Unzipped = ReturnType<typeof unzipSync>;

/* --- limits -------------------------------------------------------------- */

/**
 * Zip-bomb ceiling, in decompressed bytes.
 *
 * A ZIP central directory can claim any size at all, and `unzipSync` allocates
 * the declared output buffer *before* inflating, so a 90 KB file can otherwise
 * ask the tab for 40 GB and take the whole session down with it. The claim is
 * checked in two places — from the central directory before anything is
 * expanded, and again through `unzipSync`'s filter as each part is considered —
 * so a lying header is caught whether it is the whole archive or one part of
 * many.
 */
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

/** A real Office package has tens of parts. Thousands means something else. */
const MAX_ZIP_PARTS = 10_000;

/** Sheet geometry limits from the XLSX specification, not arbitrary choices. */
const MAX_SHEET_ROWS = 1_048_576;
const MAX_SHEET_COLUMNS = 16_384;

/* --- ZIP signatures, little-endian --------------------------------------- */

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/* --- errors -------------------------------------------------------------- */

/** An error whose message is written for the person using the tool. */
class UserFacingError extends Error {}

function fail(message: string): never {
  throw new UserFacingError(message);
}

/**
 * Runs `work`, turning any low-level failure — a ZIP error, a parser error, a
 * `TypeError` from deep inside a parser — into prose the user can act on. A
 * `UserFacingError` raised inside the work is passed through untouched.
 */
function asUserError<T>(work: () => T, describe: () => string): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    void error;
    fail(describe());
  }
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

function checkAborted(ctx: ToolContext): void {
  if (ctx.signal.aborted) fail('Cancelled before the file finished processing.');
}

/* --- control values ------------------------------------------------------ */

function textValue(values: ControlValues, key: string, fallback: string): string {
  const value = values[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function flag(values: ControlValues, key: string, fallback: boolean): boolean {
  const value = values[key];
  return typeof value === 'boolean' ? value : fallback;
}

function num(values: ControlValues, key: string, fallback: number): number {
  const value = values[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* --- ZIP reading, with the bomb guard ------------------------------------ */

interface ZipInventory {
  entries: number;
  /** Sum of the declared uncompressed sizes, or -1 when it cannot be trusted. */
  uncompressedBytes: number;
}

/**
 * Reads the central directory by hand. `unzipSync` exposes the same numbers
 * through its filter, but only *after* it starts expanding, which is too late
 * for a whole-file check. The central directory is a flat list of fixed-size
 * records, so walking it is cheap and needs no decompression at all.
 */
function inspectZip(bytes: Uint8Array): ZipInventory {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchFloor = Math.max(0, bytes.length - 65_558);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= searchFloor; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail('This file is not a ZIP container, so it cannot be an Office or OpenDocument file.');

  let count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  // ZIP64: a locator record sits immediately before the classic EOCD.
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === SIG_EOCD64_LOCATOR) {
    const locator = eocd - 20;
    const eocd64 = Number(view.getBigUint64(locator + 8, true));
    if (eocd64 >= 0 && eocd64 + 56 <= bytes.length && view.getUint32(eocd64, true) === SIG_EOCD64) {
      count = Number(view.getBigUint64(eocd64 + 32, true));
      offset = Number(view.getBigUint64(eocd64 + 48, true));
    }
  }

  let total = 0;
  let trustworthy = true;
  for (let i = 0; i < count; i += 1) {
    if (offset < 0 || offset + 46 > bytes.length || view.getUint32(offset, true) !== SIG_CENTRAL) {
      trustworthy = false;
      break;
    }
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    // 0xffffffff in a size field means "ask the ZIP64 extra field", which this
    // reader does not parse. Those archives fall through to the filter guard.
    if (uncompressed === 0xffffffff) trustworthy = false;
    else total += uncompressed;
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { entries: count, uncompressedBytes: trustworthy ? total : -1 };
}

function openZip(bytes: Uint8Array, label: string): Unzipped {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    fail(`This file is not a valid ${label} — it may be corrupt, or saved in an older format.`);
  }

  const inventory = inspectZip(bytes);
  if (inventory.entries > MAX_ZIP_PARTS) {
    fail(
      `This archive lists ${formatNumber(inventory.entries)} parts, which is far beyond any real ${label}. It is probably not the document you think it is.`,
    );
  }
  if (inventory.uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    fail(
      `This ${label} claims to expand to ${formatBytes(inventory.uncompressedBytes)} once uncompressed, past the ${formatBytes(MAX_UNCOMPRESSED_BYTES)} ceiling Furtu will expand. A genuine document does not need that, so this is either a deliberately oversized archive or a file with a doctored header.`,
    );
  }

  // Second gate, and the one that holds for ZIP64 headers: fflate consults the
  // filter before allocating each part, so returning false here prevents the
  // allocation rather than noticing it afterwards.
  let expanding = 0;
  const parts = asUserError(
    () =>
      unzipSync(bytes, {
        filter: (info) => {
          expanding += info.originalSize;
          return expanding <= MAX_UNCOMPRESSED_BYTES;
        },
      }),
    () => `This ${label} could not be opened. The archive is damaged, or it is password-protected and encrypted.`,
  );

  let produced = 0;
  for (const part of Object.values(parts)) produced += part.length;
  if (produced > MAX_UNCOMPRESSED_BYTES) {
    fail(
      `This ${label} expands to more than ${formatBytes(MAX_UNCOMPRESSED_BYTES)} of text, which Furtu will not process. Split the document and try again.`,
    );
  }

  return parts;
}

/** Case- and prefix-tolerant part lookup, because writers disagree. */
function pick(files: Unzipped, name: string): Uint8Array | null {
  const direct = files[name];
  if (direct) return direct;
  for (const key of Object.keys(files)) {
    const normalised = key.replace(/^\.?\//, '');
    if (normalised === name || normalised.toLowerCase() === name.toLowerCase()) return files[key];
  }
  return null;
}

function trailingNumber(name: string): number {
  const match = /(\d+)(?=\.[^.]+$)/.exec(name);
  return match ? Number(match[1]) : 0;
}

/** Numeric part order, so slide10 and header3 sort after slide9 and header2. */
function byTrailingNumber(a: string, b: string): number {
  const difference = trailingNumber(a) - trailingNumber(b);
  if (difference !== 0) return difference;
  return a < b ? -1 : a > b ? 1 : 0;
}

function listParts(files: Unzipped, pattern: RegExp): string[] {
  return Object.keys(files)
    .filter((name) => pattern.test(name))
    .sort(byTrailingNumber);
}

/* --- XML helpers --------------------------------------------------------- */

/**
 * Parses one XML part and fails loudly if it is not XML. `DOMParser` reports
 * failures in-band, so a malformed part is detected here rather than showing up
 * later as a mysteriously empty document.
 */
function parseXml(source: string, description: string): Document {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0 || !document.documentElement) {
    fail(`The XML inside this ${description} is malformed, so Furtu cannot read it. The file is most likely truncated or damaged.`);
  }
  return document;
}

function parsePart(files: Unzipped, name: string, description: string): Document | null {
  const part = pick(files, name);
  if (!part) return null;
  return parseXml(strFromU8(part), description);
}

/** Every element with this local name, in document order, whatever namespace. */
function byLocalName(root: Element | Document, name: string): Element[] {
  const nodes = root.getElementsByTagName('*');
  const found: Element[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const element = nodes[i];
    if (element.localName === name) found.push(element);
  }
  return found;
}

function childrenNamed(element: Element, name: string): Element[] {
  const found: Element[] = [];
  for (const child of element.children) {
    if (child.localName === name) found.push(child);
  }
  return found;
}

function attribute(element: Element | null | undefined, name: string): string {
  return element?.getAttribute(name) ?? '';
}

/** Text content of a node, without the trim `attribute` implies elsewhere. */
function nodeText(node: Node | null | undefined): string {
  return node?.textContent ?? '';
}

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Removes the control characters XML 1.0 forbids and folds CRLF down to LF.
 * Left in place, a stray 0x0B from a scanned file produces a DOCX or a text file
 * that other tools refuse to open.
 */
function sanitise(value: string): string {
  return value.replace(CONTROL_CHARACTERS, '').replace(/\r\n?/g, '\n');
}

/** Drops trailing spaces and collapses runs of three or more blank lines. */
function tidy(value: string): string {
  return value
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

function joinLines(lines: string[], spacing: 'blank' | 'single'): string {
  return lines.join(spacing === 'blank' ? '\n\n' : '\n');
}

function textFile(name: string, body: string, note: string): FileOutput {
  return {
    name,
    blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
    note,
  };
}

function lineCount(value: string): number {
  if (value.length === 0) return 0;
  const breaks = value.split('\n').length - 1;
  return value.endsWith('\n') ? breaks : breaks + 1;
}

function plural(count: number, singular: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : `${singular}s`}`;
}

async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/* --- DOCX ---------------------------------------------------------------- */

/** `word/document.xml` is the body; these hold text the body does not. */
const DOCX_HEADER_PART = /^word\/header[\w-]*\.xml$/;
const DOCX_FOOTER_PART = /^word\/footer[\w-]*\.xml$/;

interface DocxOptions {
  includeTables: boolean;
  includeHeaders: boolean;
  includeFooters: boolean;
  includeNotes: boolean;
  includeComments: boolean;
  spacing: 'blank' | 'single';
}

function docxOptions(values: ControlValues): DocxOptions {
  return {
    includeTables: flag(values, 'includeTables', true),
    includeHeaders: flag(values, 'includeHeaders', false),
    includeFooters: flag(values, 'includeFooters', false),
    includeNotes: flag(values, 'includeNotes', false),
    includeComments: flag(values, 'includeComments', false),
    spacing: textValue(values, 'spacing', 'blank') === 'single' ? 'single' : 'blank',
  };
}

/** Walks a paragraph in document order, turning breaks and tabs into text. */
function docxInline(node: Node, parts: string[]): void {
  // Some generators write a paragraph's words as bare text under `w:p` instead
  // of inside a `w:t`. Deleted text is still excluded, because `w:delText` is
  // handled at the element level below.
  if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
    parts.push(node.nodeValue ?? '');
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const element = node as Element;
  switch (element.localName) {
    case 't':
      parts.push(element.textContent ?? '');
      return;
    case 'tab':
      parts.push('\t');
      return;
    case 'br':
    case 'cr':
      parts.push('\n');
      return;
    case 'noBreakHyphen':
      parts.push('-');
      return;
    // Property elements hold no text, and a `w:tab` inside `w:pPr` is a tab
    // *stop definition*, not a tab character. `delText` is text deleted under
    // track changes and must not reappear; `instrText` is the program code
    // behind a field rather than its result.
    case 'pPr':
    case 'rPr':
    case 'tblPr':
    case 'trPr':
    case 'tcPr':
    case 'delText':
    case 'instrText':
      return;
    default:
      break;
  }
  for (const child of node.childNodes) docxInline(child, parts);
}

function docxParagraphText(paragraph: Element): string {
  const parts: string[] = [];
  docxInline(paragraph, parts);
  return parts.join('');
}

function docxBlockText(container: Element, options: DocxOptions): string[] {
  const lines: string[] = [];
  for (const child of container.children) {
    const name = child.localName;
    if (name === 'del') continue;
    if (name === 'p') {
      lines.push(docxParagraphText(child));
      continue;
    }
    if (name === 'tbl') {
      if (options.includeTables) lines.push(...docxTableLines(child, options));
      continue;
    }
    // Structured document tags, custom XML wrappers and revision insertions all
    // nest paragraphs deeper than the body, so recurse through the rest.
    lines.push(...docxBlockText(child, options));
  }
  return lines;
}

function docxTableLines(table: Element, options: DocxOptions): string[] {
  const rows: string[] = [];
  for (const row of childrenNamed(table, 'tr')) {
    const cells: string[] = [];
    for (const cell of childrenNamed(row, 'tc')) {
      cells.push(docxBlockText(cell, options).join(' ').replace(/\s+/g, ' ').trim());
    }
    rows.push(cells.join('\t'));
  }
  return rows;
}

function docxPartLines(files: Unzipped, part: string, options: DocxOptions): string[] {
  const document = parsePart(files, part, 'Word document');
  if (!document) return [];
  return docxBlockText(document.documentElement, options);
}

function extractDocx(files: Unzipped, options: DocxOptions, ctx: ToolContext): string {
  checkAborted(ctx);
  const document = parsePart(files, 'word/document.xml', 'Word document');
  if (!document) {
    fail(
      'This file is a ZIP archive, but it has no word/document.xml part, so it is not a Word document. It may be a spreadsheet or a presentation with the wrong extension.',
    );
  }

  ctx.onProgress(0.35, 'Reading the document body');
  const sections: string[] = [...docxBlockText(document.documentElement, options)];

  if (options.includeHeaders) {
    checkAborted(ctx);
    ctx.onProgress(0.55, 'Reading headers');
    for (const part of listParts(files, DOCX_HEADER_PART)) {
      const lines = docxPartLines(files, part, options);
      if (tidy(lines.join('\n')).length > 0) sections.push(`[Header]\n${lines.join('\n')}`);
    }
  }

  if (options.includeFooters) {
    checkAborted(ctx);
    ctx.onProgress(0.7, 'Reading footers');
    for (const part of listParts(files, DOCX_FOOTER_PART)) {
      const lines = docxPartLines(files, part, options);
      if (tidy(lines.join('\n')).length > 0) sections.push(`[Footer]\n${lines.join('\n')}`);
    }
  }

  if (options.includeNotes) {
    checkAborted(ctx);
    ctx.onProgress(0.82, 'Reading notes');
    const pairs = [
      { part: 'word/footnotes.xml', element: 'footnote', label: 'Footnotes' },
      { part: 'word/endnotes.xml', element: 'endnote', label: 'Endnotes' },
    ];
    for (const { part, element, label } of pairs) {
      const notes = parsePart(files, part, 'Word document');
      if (!notes) continue;
      const entries = byLocalName(notes.documentElement, element).filter((node) => {
        // Separator and continuation records are the divider lines Word writes.
        const kind = attribute(node, 'w:type');
        return kind !== 'separator' && kind !== 'continuationSeparator' && kind !== 'continuationNotice';
      });
      const lines: string[] = [];
      for (const entry of entries) lines.push(...docxBlockText(entry, options));
      if (tidy(lines.join('\n')).length > 0) sections.push(`[${label}]\n${lines.join('\n')}`);
    }
  }

  if (options.includeComments) {
    checkAborted(ctx);
    ctx.onProgress(0.9, 'Reading comments');
    const comments = parsePart(files, 'word/comments.xml', 'Word document');
    if (comments) {
      const lines: string[] = [];
      for (const comment of byLocalName(comments.documentElement, 'comment')) {
        const body = docxBlockText(comment, options).join('\n').trim();
        if (body.length === 0) continue;
        const author = attribute(comment, 'w:author');
        const date = attribute(comment, 'w:date');
        const stamp = date ? date.slice(0, 10) : '';
        lines.push(`[Comment${author ? ` by ${author}` : ''}${stamp ? `, ${stamp}` : ''}]\n${body}`);
      }
      if (lines.length > 0) sections.push(`[Comments]\n${lines.join('\n\n')}`);
    }
  }

  return tidy(joinLines(sections, options.spacing));
}

/* --- XLSX ---------------------------------------------------------------- */

interface XlsxOptions {
  sheets: 'all' | 'first';
  includeEmptyRows: boolean;
  trimCells: boolean;
  quoteAll: boolean;
  dateFormat: 'iso' | 'serial';
  lineEndings: 'crlf' | 'lf';
}

function xlsxOptions(values: ControlValues): XlsxOptions {
  return {
    sheets: textValue(values, 'sheets', 'all') === 'first' ? 'first' : 'all',
    includeEmptyRows: flag(values, 'includeEmptyRows', true),
    trimCells: flag(values, 'trimCells', false),
    quoteAll: flag(values, 'quoteAll', false),
    dateFormat: textValue(values, 'dateFormat', 'iso') === 'serial' ? 'serial' : 'iso',
    lineEndings: textValue(values, 'lineEndings', 'crlf') === 'lf' ? 'lf' : 'crlf',
  };
}

/** `xl/_rels/workbook.xml.rels` for `xl/workbook.xml`. */
function relsPathFor(partName: string): string {
  const slash = partName.lastIndexOf('/');
  return `${partName.slice(0, slash + 1)}_rels/${partName.slice(slash + 1)}.rels`;
}

function readRelationships(files: Unzipped, partName: string): Map<string, string> {
  const relationships = new Map<string, string>();
  const document = parsePart(files, relsPathFor(partName), 'spreadsheet');
  if (!document) return relationships;
  for (const relationship of byLocalName(document.documentElement, 'Relationship')) {
    const id = relationship.getAttribute('Id');
    const target = relationship.getAttribute('Target');
    if (id && target) relationships.set(id, target);
  }
  return relationships;
}

/** Resolves a relationship target against the part that declared it. */
function resolveTarget(basePart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const directory = basePart.slice(0, basePart.lastIndexOf('/') + 1);
  const stack: string[] = [];
  for (const segment of `${directory}${target}`.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') stack.pop();
    else stack.push(segment);
  }
  return stack.join('/');
}

interface SheetReference {
  name: string;
  part: string;
}

function readSheetIndex(files: Unzipped): SheetReference[] {
  const workbook = parsePart(files, 'xl/workbook.xml', 'spreadsheet');
  if (!workbook) {
    fail(
      'This file is a ZIP archive, but it has no xl/workbook.xml part, so it is not an Excel workbook. It may be renamed, or produced by a tool that wrote a non-standard package.',
    );
  }
  const relationships = readRelationships(files, 'xl/workbook.xml');
  const worksheets = listParts(files, /^xl\/worksheets\/sheet[\w-]*\.xml$/);
  const sheets: SheetReference[] = [];

  byLocalName(workbook.documentElement, 'sheet').forEach((sheet, index) => {
    const name = attribute(sheet, 'name') || `Sheet${index + 1}`;
    const id = sheet.getAttributeNS(OFFICE_RELATIONSHIPS_NS, 'id') || attribute(sheet, 'r:id');
    const target = id ? relationships.get(id) : undefined;
    if (target) {
      sheets.push({ name, part: resolveTarget('xl/workbook.xml', target) });
      return;
    }
    // Some generators write a sheet element with no relationship id. Fall back
    // to the nth worksheet part rather than dropping a sheet silently.
    const fallback = worksheets[index];
    if (fallback) sheets.push({ name, part: fallback });
  });

  if (sheets.length === 0) fail('This workbook lists no sheets, so Furtu cannot tell which data to export.');
  return sheets;
}

function readSharedStrings(files: Unzipped): string[] {
  const document = parsePart(files, 'xl/sharedStrings.xml', 'spreadsheet');
  if (!document) return [];
  const strings: string[] = [];
  for (const item of byLocalName(document.documentElement, 'si')) {
    const parts: string[] = [];
    sharedStringText(item, parts);
    strings.push(parts.join(''));
  }
  return strings;
}

/** Joins every `<t>` in a shared string, skipping phonetic guides. */
function sharedStringText(node: Node, parts: string[]): void {
  if (node.nodeType === ELEMENT_NODE) {
    const element = node as Element;
    // `rPh` holds furigana and would otherwise be glued onto the word.
    if (element.localName === 'rPh') return;
    if (element.localName === 't') {
      parts.push(element.textContent ?? '');
      return;
    }
  }
  for (const child of node.childNodes) sharedStringText(child, parts);
}

/** Excel's built-in number format ids that mean date or time. */
const BUILT_IN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

function isDateFormatCode(code: string): boolean {
  // Strip colour blocks, quoted literals and escapes, then look for the letters
  // a date format needs. `#`, `0` and `.` survive, so a plain number format
  // correctly fails this test.
  const cleaned = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/\\./g, '');
  return /[ymdhs]/i.test(cleaned);
}

/** Per-cell-format flag: is this cell's number format a date or a time? */
function readDateStyles(files: Unzipped): boolean[] {
  const document = parsePart(files, 'xl/styles.xml', 'spreadsheet');
  if (!document) return [];
  const custom = new Map<number, string>();
  for (const format of byLocalName(document.documentElement, 'numFmt')) {
    const id = Number(attribute(format, 'numFmtId'));
    if (Number.isFinite(id)) custom.set(id, attribute(format, 'formatCode'));
  }
  const cellFormats = byLocalName(document.documentElement, 'cellXfs')[0];
  if (!cellFormats) return [];
  return Array.from(cellFormats.children).map((format) => {
    const id = Number(attribute(format, 'numFmtId'));
    if (BUILT_IN_DATE_FORMATS.has(id)) return true;
    const code = custom.get(id);
    return code !== undefined && isDateFormatCode(code);
  });
}

function uses1904Dates(files: Unzipped): boolean {
  const document = parsePart(files, 'xl/workbook.xml', 'spreadsheet');
  if (!document) return false;
  const value = attribute(byLocalName(document.documentElement, 'workbookPr')[0], 'date1904');
  return value === '1' || value === 'true';
}

/** Excel serial number to an ISO date, honouring the 1900 leap-year quirk. */
function serialToIso(serial: number, date1904: boolean): string {
  if (!Number.isFinite(serial)) return '';
  const totalSeconds = Math.round(serial * 86_400);
  let days = Math.floor(totalSeconds / 86_400);
  const seconds = totalSeconds - days * 86_400;
  // Excel's 1900 system keeps a phantom 29 February 1900, so every serial from
  // 61 onwards sits one day further from the epoch than it appears.
  if (!date1904 && days >= 61) days -= 1;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const date = new Date(epoch + days * 86_400_000 + seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const iso = date.toISOString();
  return seconds === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/** `B7` -> 1, so columns are zero-based. */
function columnFromReference(reference: string): number {
  let index = 0;
  for (let i = 0; i < reference.length; i += 1) {
    const code = reference.charCodeAt(i);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Everything a cell reader needs: the export options plus the workbook tables. */
interface CellContext {
  includeEmptyRows: boolean;
  trimCells: boolean;
  quoteAll: boolean;
  dateFormat: 'iso' | 'serial';
  lineEndings: 'crlf' | 'lf';
  sharedStrings: string[];
  dateStyles: boolean[];
  date1904: boolean;
}

function readCell(cell: Element, options: CellContext): string {
  const type = attribute(cell, 't') || 'n';
  const raw = nodeText(childrenNamed(cell, 'v')[0]).trim();

  switch (type) {
    case 's': {
      const index = Number(raw);
      return options.sharedStrings[index] ?? '';
    }
    case 'inlineStr': {
      const parts: string[] = [];
      for (const inline of childrenNamed(cell, 'is')) sharedStringText(inline, parts);
      return parts.join('');
    }
    case 'b':
      return raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : '';
    case 'e':
      // Error values such as #DIV/0! are real data, so pass them through.
      return raw;
    case 'str':
    case 'd':
      return raw;
    default: {
      if (raw === '') return '';
      if (options.dateFormat === 'iso') {
        const styleIndex = Number(attribute(cell, 's'));
        if (Number.isInteger(styleIndex) && options.dateStyles[styleIndex] === true) {
          const serial = Number(raw);
          if (Number.isFinite(serial)) return serialToIso(serial, options.date1904);
        }
      }
      return raw;
    }
  }
}

function csvField(value: string, quoteAll: boolean): string {
  // A value with leading or trailing spaces needs quoting too, or the spaces are
  // lost on the way in.
  const needsQuotes = quoteAll || /[",\n\r]/.test(value) || value !== value.trim();
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

interface SheetResult {
  name: string;
  csv: string;
  rows: number;
  columns: number;
}

function sheetToCsv(files: Unzipped, sheet: SheetReference, options: CellContext): SheetResult {
  const document = parsePart(files, sheet.part, 'spreadsheet');
  if (!document) fail(`The worksheet "${sheet.name}" is missing from this workbook, so it cannot be exported.`);

  const grid = new Map<number, Map<number, string>>();
  let lastRow = 0;
  let maxColumn = 0;

  for (const row of byLocalName(document.documentElement, 'row')) {
    const rowNumber = Math.min(MAX_SHEET_ROWS, Math.max(1, Number(attribute(row, 'r')) || lastRow + 1));
    const cells = new Map<number, string>();
    let cursor = 0;
    for (const cell of childrenNamed(row, 'c')) {
      const reference = attribute(cell, 'r');
      const column = reference ? columnFromReference(reference) : cursor;
      cursor = column + 1;
      if (column < 0 || column >= MAX_SHEET_COLUMNS) continue;
      cells.set(column, readCell(cell, options));
      if (column > maxColumn) maxColumn = column;
    }
    grid.set(rowNumber, cells);
    lastRow = Math.max(lastRow, rowNumber);
  }

  const width = maxColumn + 1;
  const lines: string[] = [];
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const cells = grid.get(rowNumber);
    const values: string[] = [];
    let empty = true;
    for (let column = 0; column < width; column += 1) {
      let value = cells?.get(column) ?? '';
      if (options.trimCells) value = value.trim();
      if (value !== '') empty = false;
      values.push(csvField(value, options.quoteAll));
    }
    if (empty && !options.includeEmptyRows) continue;
    lines.push(values.join(','));
  }

  const newline = options.lineEndings === 'lf' ? '\n' : '\r\n';
  return {
    name: sheet.name,
    csv: lines.length > 0 ? `${lines.join(newline)}${newline}` : '',
    rows: lines.length,
    columns: width,
  };
}

/* --- PPTX ---------------------------------------------------------------- */

interface PptxOptions {
  slideMarkers: boolean;
  includeNotes: boolean;
  includeTables: boolean;
  skipEmptySlides: boolean;
}

function pptxOptions(values: ControlValues): PptxOptions {
  return {
    slideMarkers: flag(values, 'slideMarkers', true),
    includeNotes: flag(values, 'includeNotes', false),
    includeTables: flag(values, 'includeTables', true),
    skipEmptySlides: flag(values, 'skipEmptySlides', false),
  };
}

function pptxInline(node: Node, parts: string[]): void {
  // DrawingML usually wraps words in `a:t`, but a bare text node under `a:p`
  // still carries text a person typed, so it is collected too.
  if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
    parts.push(node.nodeValue ?? '');
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const element = node as Element;
  switch (element.localName) {
    case 't':
      parts.push(element.textContent ?? '');
      return;
    case 'br':
      parts.push('\n');
      return;
    case 'tab':
      parts.push('\t');
      return;
    // Layout metadata: these never carry visible words.
    case 'endParaRPr':
    case 'pPr':
    case 'rPr':
    case 'lstStyle':
      return;
    default:
      break;
  }
  for (const child of node.childNodes) pptxInline(child, parts);
}

function pptxBlockText(container: Element, options: PptxOptions): string[] {
  const lines: string[] = [];
  for (const child of container.children) {
    const name = child.localName;
    if (name === 'p') {
      const parts: string[] = [];
      pptxInline(child, parts);
      lines.push(parts.join(''));
      continue;
    }
    if (name === 'tbl') {
      if (options.includeTables) lines.push(...pptxTableLines(child, options));
      continue;
    }
    // `p:sp`, `p:pic`, `p:graphicFrame` and `p:grpSp` all nest the shapes and
    // tables that hold the visible text.
    lines.push(...pptxBlockText(child, options));
  }
  return lines;
}

function pptxTableLines(table: Element, options: PptxOptions): string[] {
  const rows: string[] = [];
  for (const row of childrenNamed(table, 'tr')) {
    const cells: string[] = [];
    for (const cell of childrenNamed(row, 'tc')) {
      cells.push(pptxBlockText(cell, options).join(' ').replace(/\s+/g, ' ').trim());
    }
    rows.push(cells.join('\t'));
  }
  return rows;
}

/** Notes for one slide, matched by number, with placeholder furniture skipped. */
function pptxNotes(files: Unzipped, slideNumber: number, options: PptxOptions): string {
  const document = parsePart(files, `ppt/notesSlides/notesSlide${slideNumber}.xml`, 'presentation');
  if (!document) return '';
  const lines: string[] = [];
  for (const shape of byLocalName(document.documentElement, 'sp')) {
    const placeholder = byLocalName(shape, 'ph')[0];
    const type = attribute(placeholder, 'type');
    if (type === 'sldNum' || type === 'hdr' || type === 'ftr' || type === 'dt') continue;
    lines.push(...pptxBlockText(shape, options));
  }
  return tidy(lines.join('\n'));
}

function extractPptx(files: Unzipped, options: PptxOptions, ctx: ToolContext): { text: string; slides: number } {
  const slideParts = listParts(files, /^ppt\/slides\/slide\d+\.xml$/);
  if (slideParts.length === 0) {
    fail('This file is a ZIP archive, but it contains no slide parts, so it is not a PowerPoint presentation.');
  }

  const sections: string[] = [];
  slideParts.forEach((part, index) => {
    checkAborted(ctx);
    ctx.onProgress(0.15 + (0.75 * (index + 1)) / slideParts.length, `Slide ${index + 1} of ${slideParts.length}`);

    const document = parsePart(files, part, 'presentation');
    if (!document) return;
    const slideNumber = trailingNumber(part);
    const body = tidy(pptxBlockText(document.documentElement, options).join('\n'));

    const notes = options.includeNotes ? pptxNotes(files, slideNumber, options) : '';
    if (body.length === 0 && notes.length === 0) {
      if (!options.skipEmptySlides && options.slideMarkers) sections.push(`Slide ${slideNumber}`);
      return;
    }

    const block: string[] = [];
    if (options.slideMarkers) block.push(`Slide ${slideNumber}`);
    if (body.length > 0) block.push(body);
    if (notes.length > 0) block.push(`[Notes]\n${notes}`);
    sections.push(block.join('\n'));
  });

  return { text: tidy(sections.join('\n\n')), slides: slideParts.length };
}

/* --- ODT ----------------------------------------------------------------- */

const OD_TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const OD_TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';

interface OdtOptions {
  headings: 'plain' | 'markdown';
  listMarkers: boolean;
  includeTables: boolean;
  includeNotes: boolean;
}

function odtOptions(values: ControlValues): OdtOptions {
  return {
    headings: textValue(values, 'headings', 'plain') === 'markdown' ? 'markdown' : 'plain',
    listMarkers: flag(values, 'listMarkers', true),
    includeTables: flag(values, 'includeTables', true),
    includeNotes: flag(values, 'includeNotes', true),
  };
}

function isOdfTag(element: Element, namespace: string, name: string): boolean {
  return element.localName === name && (element.namespaceURI === namespace || element.namespaceURI === null);
}

function odtAttribute(element: Element, name: string): string {
  return element.getAttributeNS(OD_TEXT_NS, name) || element.getAttribute(`text:${name}`) || '';
}

function odtInline(node: Node, parts: string[], notes?: string[]): void {
  // OpenDocument keeps a paragraph's words in text nodes directly under
  // `text:p`, not inside a text element the way OOXML does. Skipping
  // non-element nodes here would silently return an empty document.
  if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
    parts.push(node.nodeValue ?? '');
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const element = node as Element;
  if (isOdfTag(element, OD_TEXT_NS, 's')) {
    // `text:s` is a run of spaces that most editors collapse into one. Without
    // expanding it, indentation in a code sample disappears entirely.
    const count = Number(odtAttribute(element, 'c'));
    parts.push(' '.repeat(clamp(Number.isFinite(count) && count > 0 ? count : 1, 1, 128)));
    return;
  }
  if (isOdfTag(element, OD_TEXT_NS, 'tab')) {
    parts.push('\t');
    return;
  }
  if (isOdfTag(element, OD_TEXT_NS, 'line-break')) {
    parts.push('\n');
    return;
  }
  if (isOdfTag(element, OD_TEXT_NS, 'note-citation')) {
    parts.push(`[${(element.textContent ?? '').trim()}]`);
    return;
  }
  // A footnote lives *inside* a paragraph, so the citation has to be resolved
  // here rather than only at block level. `notes` is absent when a caller does
  // not care, in which case the citation is still rendered inline.
  if (isOdfTag(element, OD_TEXT_NS, 'note')) {
    const citation = nodeText(byLocalName(element, 'note-citation')[0]).trim();
    const body = byLocalName(element, 'note-body')[0];
    if (notes && body) {
      const note = odtParagraphText(body, notes).replace(/\s+/g, ' ').trim();
      if (note.length > 0) notes.push(`${citation || notes.length + 1}. ${note}`);
    }
    parts.push(`[${citation || notes?.length || 0}]`);
    return;
  }
  for (const child of node.childNodes) odtInline(child, parts, notes);
}

function odtParagraphText(element: Element, notes?: string[]): string {
  const parts: string[] = [];
  odtInline(element, parts, notes);
  return parts.join('');
}

function odtHeadingLine(element: Element, options: OdtOptions, notes?: string[]): string {
  const body = odtParagraphText(element, notes);
  if (options.headings !== 'markdown') return body;
  const level = clamp(Math.round(Number(odtAttribute(element, 'outline-level'))) || 1, 1, 6);
  return `${'#'.repeat(level)} ${body}`;
}

function odtTableLines(table: Element, options: OdtOptions, notes: string[]): string[] {
  const rows: string[] = [];
  for (const row of childrenNamed(table, 'table-row')) {
    const cells: string[] = [];
    for (const cell of childrenNamed(row, 'table-cell')) {
      cells.push(odtBlockText(cell, options, notes).join(' ').replace(/\s+/g, ' ').trim());
    }
    rows.push(cells.join('\t'));
  }
  return rows;
}

function odtBlockText(container: Element, options: OdtOptions, notes: string[]): string[] {
  const out: string[] = [];
  for (const child of container.children) {
    if (isOdfTag(child, OD_TEXT_NS, 'h')) {
      out.push(odtHeadingLine(child, options, notes));
      continue;
    }
    if (isOdfTag(child, OD_TEXT_NS, 'p')) {
      out.push(odtParagraphText(child, notes));
      continue;
    }
    if (isOdfTag(child, OD_TEXT_NS, 'list')) {
      for (const item of childrenNamed(child, 'list-item')) {
        for (const line of odtBlockText(item, options, notes)) {
          if (line.length === 0) continue;
          out.push(options.listMarkers ? `• ${line}` : line);
        }
      }
      continue;
    }
    if (isOdfTag(child, OD_TABLE_NS, 'table')) {
      if (options.includeTables) out.push(...odtTableLines(child, options, notes));
      continue;
    }
    if (isOdfTag(child, OD_TEXT_NS, 'note')) {
      const citation = (byLocalName(child, 'note-citation')[0]?.textContent ?? '').trim();
      const body = byLocalName(child, 'note-body')[0];
      if (body) {
        const note = odtBlockText(body, options, notes).join(' ').replace(/\s+/g, ' ').trim();
        if (note.length > 0) notes.push(`${citation || notes.length + 1}. ${note}`);
      }
      out.push(`[${citation || notes.length}]`);
      continue;
    }
    // Frames hold text in a box, annotations are comments, and tracked changes
    // keep their records in containers. All three are deliberately not read.
    const name = child.localName;
    if (name === 'frame' || name === 'annotation' || name === 'tracked-changes' || name === 'changed-region') continue;
    out.push(...odtBlockText(child, options, notes));
  }
  return out;
}

function extractOdt(files: Unzipped, options: OdtOptions, ctx: ToolContext): string {
  checkAborted(ctx);
  const document = parsePart(files, 'content.xml', 'OpenDocument file');
  if (!document) fail('This file is a ZIP archive, but it has no content.xml part, so it is not an OpenDocument text file.');

  const body = byLocalName(document.documentElement, 'body')[0];
  if (!body) fail('This OpenDocument file has no body. It is probably a spreadsheet or presentation with an .odt extension.');

  ctx.onProgress(0.5, 'Reading the document body');
  const notes: string[] = [];
  const lines = odtBlockText(body, options, notes);

  const sections = [lines.join('\n')];
  if (options.includeNotes && notes.length > 0) sections.push(`[Footnotes]\n${notes.join('\n')}`);

  ctx.onProgress(0.9, 'Finishing up');
  return tidy(sections.join('\n\n'));
}

/* --- text file inspection ------------------------------------------------ */

interface EncodingReport {
  label: string;
  byteOrderMark: string;
  decode: (bytes: Uint8Array) => string;
  note?: string;
}

const ENCODING_LABELS: Record<string, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'windows-1252': 'Windows-1252',
};

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    fail(`This file could not be decoded as ${label}. Try a different encoding from the control above.`);
  }
}

function hasPrefix(bytes: Uint8Array, marker: number[]): boolean {
  return marker.every((byte, index) => bytes[index] === byte);
}

function detectEncoding(bytes: Uint8Array, override: string): EncodingReport {
  if (override === 'utf-8' || override === 'utf-16le' || override === 'utf-16be' || override === 'windows-1252') {
    return {
      label: ENCODING_LABELS[override],
      byteOrderMark: describeBom(bytes, override),
      decode: (data) => decodeText(data, override),
    };
  }

  if (hasPrefix(bytes, [0xef, 0xbb, 0xbf])) {
    return { label: 'UTF-8', byteOrderMark: 'UTF-8 byte-order mark (EF BB BF)', decode: (data) => decodeText(data, 'utf-8') };
  }
  if (hasPrefix(bytes, [0xff, 0xfe])) {
    return { label: 'UTF-16 LE', byteOrderMark: 'UTF-16 LE byte-order mark (FF FE)', decode: (data) => decodeText(data, 'utf-16le') };
  }
  if (hasPrefix(bytes, [0xfe, 0xff])) {
    return { label: 'UTF-16 BE', byteOrderMark: 'UTF-16 BE byte-order mark (FE FF)', decode: (data) => decodeText(data, 'utf-16be') };
  }

  try {
    // A strict decode is the honest test: if the bytes are valid UTF-8, say so.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, 65_536));
    return { label: 'UTF-8', byteOrderMark: 'None', decode: (data) => decodeText(data, 'utf-8') };
  } catch {
    // Not UTF-8. UTF-16 without a mark leaves a regular pattern of zero bytes.
    let evenZeros = 0;
    let oddZeros = 0;
    const sample = bytes.subarray(0, 2048);
    for (let i = 0; i < sample.length; i += 1) {
      if (sample[i] !== 0) continue;
      if (i % 2 === 0) evenZeros += 1;
      else oddZeros += 1;
    }
    if (oddZeros > evenZeros * 4 && oddZeros > 16) {
      return {
        label: 'UTF-16 LE (no byte-order mark)',
        byteOrderMark: 'None',
        decode: (data) => decodeText(data, 'utf-16le'),
        note: 'Detected from the pattern of zero bytes, not from a byte-order mark.',
      };
    }
    if (evenZeros > oddZeros * 4 && evenZeros > 16) {
      return {
        label: 'UTF-16 BE (no byte-order mark)',
        byteOrderMark: 'None',
        decode: (data) => decodeText(data, 'utf-16be'),
        note: 'Detected from the pattern of zero bytes, not from a byte-order mark.',
      };
    }
    return {
      label: 'Not valid UTF-8 — read as Windows-1252',
      byteOrderMark: 'None',
      decode: (data) => decodeText(data, 'windows-1252'),
      note: 'The bytes are not valid UTF-8. Windows-1252 is the most likely single-byte encoding, but it cannot be identified with certainty from the bytes alone.',
    };
  }
}

function describeBom(bytes: Uint8Array, label: string): string {
  if (label === 'utf-8' && hasPrefix(bytes, [0xef, 0xbb, 0xbf])) return 'UTF-8 byte-order mark (EF BB BF)';
  if (label === 'utf-16le' && hasPrefix(bytes, [0xff, 0xfe])) return 'UTF-16 LE byte-order mark (FF FE)';
  if (label === 'utf-16be' && hasPrefix(bytes, [0xfe, 0xff])) return 'UTF-16 BE byte-order mark (FE FF)';
  return 'None';
}

function lineEndingReport(value: string): string {
  const crlf = (value.match(/\r\n/g) ?? []).length;
  const stripped = value.replace(/\r\n/g, '');
  const bareLf = (stripped.match(/\n/g) ?? []).length;
  const bareCr = (stripped.match(/\r/g) ?? []).length;
  const kinds: string[] = [];
  if (crlf > 0) kinds.push(`${formatNumber(crlf)} CRLF`);
  if (bareLf > 0) kinds.push(`${formatNumber(bareLf)} LF`);
  if (bareCr > 0) kinds.push(`${formatNumber(bareCr)} CR`);
  if (kinds.length === 0) return 'None (single line)';
  if (kinds.length > 1) return `Mixed — ${kinds.join(', ')}`;
  if (kinds[0].endsWith('CRLF')) return 'CRLF (Windows)';
  if (kinds[0].endsWith('LF')) return 'LF (Unix, macOS, Linux)';
  return 'CR (classic Mac OS)';
}

/* --- metadata ------------------------------------------------------------ */

interface Chip {
  label: string;
  value: string;
}

/** Flattens a properties part into `localName -> text` for every leaf element. */
function flattenProperties(document: Document): Map<string, string> {
  const values = new Map<string, string>();
  const visit = (node: Node): void => {
    if (node.nodeType !== ELEMENT_NODE) return;
    const element = node as Element;
    if (element.children.length === 0) {
      const name = element.localName;
      const body = (element.textContent ?? '').trim();
      if (name && body && !values.has(name)) values.set(name, body);
      return;
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(document.documentElement);
  return values;
}

/**
 * Property names differ between the Office and OpenDocument formats — both
 * store an author, under different labels. Each chip lists the keys to try in
 * order, so one table covers all three.
 */
const PROPERTY_FIELDS: { label: string; keys: string[] }[] = [
  { label: 'Title', keys: ['title'] },
  { label: 'Author', keys: ['creator', 'initial-creator'] },
  { label: 'Last modified by', keys: ['lastModifiedBy'] },
  { label: 'Subject', keys: ['subject'] },
  { label: 'Description', keys: ['description'] },
  { label: 'Keywords', keys: ['keywords', 'keyword'] },
  { label: 'Category', keys: ['category'] },
  { label: 'Created', keys: ['created', 'creation-date'] },
  { label: 'Modified', keys: ['modified', 'date'] },
  { label: 'Last printed', keys: ['lastPrinted'] },
  { label: 'Revision', keys: ['revision'] },
  { label: 'Language', keys: ['language'] },
  { label: 'Application', keys: ['Application'] },
  { label: 'Application version', keys: ['AppVersion'] },
  { label: 'Company', keys: ['Company'] },
  { label: 'Manager', keys: ['Manager'] },
  { label: 'Template', keys: ['Template'] },
  { label: 'Pages', keys: ['Pages', 'page-count'] },
  { label: 'Words', keys: ['Words', 'word-count'] },
  { label: 'Characters', keys: ['Characters', 'character-count'] },
  { label: 'Paragraphs', keys: ['Paragraphs', 'paragraph-count'] },
  { label: 'Lines', keys: ['Lines'] },
  { label: 'Revision count', keys: ['editing-cycles'] },
  { label: 'Editing time', keys: ['TotalTime', 'editing-duration'] },
  { label: 'Tables', keys: ['table-count'] },
  { label: 'Images', keys: ['image-count'] },
];

function collectProperties(values: Map<string, string>): Chip[] {
  const chips: Chip[] = [];
  for (const field of PROPERTY_FIELDS) {
    for (const key of field.keys) {
      const value = values.get(key);
      if (value) {
        chips.push({ label: field.label, value });
        break;
      }
    }
  }
  return chips;
}

interface ContainerKind {
  label: string;
  probe: string;
}

const WORD_CONTAINER: ContainerKind = { label: 'Office Open XML — Word document', probe: 'word/document.xml' };
const SHEET_CONTAINER: ContainerKind = { label: 'Office Open XML — Excel workbook', probe: 'xl/workbook.xml' };
const SLIDE_CONTAINER: ContainerKind = { label: 'Office Open XML — PowerPoint presentation', probe: 'ppt/presentation.xml' };
const ODT_CONTAINER: ContainerKind = { label: 'OpenDocument text document', probe: 'content.xml' };

function identifyContainer(files: Unzipped): ContainerKind {
  if (pick(files, 'mimetype')) return ODT_CONTAINER;
  for (const kind of [WORD_CONTAINER, SHEET_CONTAINER, SLIDE_CONTAINER, ODT_CONTAINER]) {
    if (pick(files, kind.probe)) return kind;
  }
  fail(
    'This file is a ZIP archive, but it is not an Office or OpenDocument document. It looks like a renamed .zip — Furtu reads .docx, .xlsx, .pptx and .odt files.',
  );
}

function reportLines(title: string, entries: { label: string; value: string }[]): string {
  const width = entries.reduce((widest, entry) => Math.max(widest, entry.label.length), 0);
  return [`${title}`, ...entries.map((entry) => `${entry.label.padEnd(width + 2)}${entry.value}`)].join('\n');
}

function reportFor(name: string, meta: Chip[]): string {
  const sections = [reportLines(name, meta.map((chip) => ({ label: chip.label, value: chip.value })))];
  sections.push('', 'Every value above was measured in your browser from the file itself. Nothing was uploaded.');
  return sections.join('\n');
}

/* --- operations ---------------------------------------------------------- */

async function docxToText(files: File[], values: ControlValues, ctx: ToolContext): Promise<FileOutput[]> {
  const file = files[0];
  if (!file) fail('No file was selected. Add a .docx to continue.');

  const options = docxOptions(values);
  ctx.onProgress(0.1, 'Opening the document');
  const bytes = await readBytes(file);
  const parts = asUserError(
    () => openZip(bytes, 'DOCX'),
    () => 'This file could not be opened as a Word document. It may be corrupt, password-protected, or an older .doc file saved under a .docx name.',
  );

  ctx.onProgress(0.2, 'Parsing the document XML');
  const body = asUserError(
    () => extractDocx(parts, options, ctx),
    () => 'This Word document could not be read. It is most likely damaged, truncated, or encrypted.',
  );
  if (body.length === 0) {
    fail('No text was found in this document. Documents made from scans or screenshots contain no text to extract.');
  }

  ctx.onProgress(1, 'Done');
  const lines = lineCount(body);
  return [
    textFile(
      withExtension(safeDownloadName(stripExtension(file.name)), '.txt'),
      body,
      `${formatBytes(file.size)} · ${plural(lines, 'line')} extracted`,
    ),
  ];
}

async function xlsxToCsv(files: File[], values: ControlValues, ctx: ToolContext): Promise<FileOutput[]> {
  const file = files[0];
  if (!file) fail('No file was selected. Add an .xlsx to continue.');

  const options = xlsxOptions(values);
  ctx.onProgress(0.1, 'Opening the workbook');
  const bytes = await readBytes(file);
  const parts = asUserError(
    () => openZip(bytes, 'XLSX'),
    () => 'This file could not be opened as a workbook. It may be corrupt, password-protected, or an older .xls file saved under an .xlsx name.',
  );

  const workbook = asUserError(
    () => ({
      sheets: readSheetIndex(parts),
      sharedStrings: readSharedStrings(parts),
      dateStyles: readDateStyles(parts),
      date1904: uses1904Dates(parts),
    }),
    () => 'This workbook could not be read. Its sheet index or shared string table appears to be damaged.',
  );

  const selected = options.sheets === 'first' ? workbook.sheets.slice(0, 1) : workbook.sheets;
  const context: CellContext = {
    includeEmptyRows: options.includeEmptyRows,
    trimCells: options.trimCells,
    quoteAll: options.quoteAll,
    dateFormat: options.dateFormat,
    lineEndings: options.lineEndings,
    sharedStrings: workbook.sharedStrings,
    dateStyles: workbook.dateStyles,
    date1904: workbook.date1904,
  };

  const results: SheetResult[] = [];
  for (const [position, sheet] of selected.entries()) {
    checkAborted(ctx);
    ctx.onProgress(0.25 + (0.7 * (position + 1)) / selected.length, `Exporting ${sheet.name}`);
    results.push(
      asUserError(
        () => sheetToCsv(parts, sheet, context),
        () => `The worksheet "${sheet.name}" could not be converted. Its XML appears to be damaged.`,
      ),
    );
  }

  ctx.onProgress(1, 'Done');
  const base = safeDownloadName(stripExtension(file.name));
  return results.map((result) => {
    const name = results.length > 1 ? `${base}-${safeDownloadName(result.name)}.csv` : `${base}.csv`;
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
    return {
      name,
      blob,
      note: `${formatBytes(blob.size)} · ${plural(result.rows, 'row')} × ${plural(result.columns, 'column')}`,
    };
  });
}

async function pptxToText(files: File[], values: ControlValues, ctx: ToolContext): Promise<FileOutput[]> {
  const file = files[0];
  if (!file) fail('No file was selected. Add a .pptx to continue.');

  const options = pptxOptions(values);
  ctx.onProgress(0.1, 'Opening the presentation');
  const bytes = await readBytes(file);
  const parts = asUserError(
    () => openZip(bytes, 'PPTX'),
    () => 'This file could not be opened as a presentation. It may be corrupt, password-protected, or an older .ppt file saved under a .pptx name.',
  );

  ctx.onProgress(0.15, 'Reading the slides');
  const extracted = asUserError(
    () => extractPptx(parts, options, ctx),
    () => 'This presentation could not be read. Its slide XML appears to be damaged.',
  );
  if (extracted.text.length === 0) {
    fail('No text was found in this presentation. Every slide appears to be an image or a shape without text.');
  }

  ctx.onProgress(1, 'Done');
  const lines = lineCount(extracted.text);
  return [
    textFile(
      withExtension(safeDownloadName(stripExtension(file.name)), '.txt'),
      extracted.text,
      `${formatBytes(file.size)} · ${plural(extracted.slides, 'slide')} · ${plural(lines, 'line')} extracted`,
    ),
  ];
}

async function odtToText(files: File[], values: ControlValues, ctx: ToolContext): Promise<FileOutput[]> {
  const file = files[0];
  if (!file) fail('No file was selected. Add an .odt to continue.');

  const options = odtOptions(values);
  ctx.onProgress(0.1, 'Opening the document');
  const bytes = await readBytes(file);
  const parts = asUserError(
    () => openZip(bytes, 'ODT'),
    () => 'This file could not be opened as an OpenDocument file. It may be corrupt, or an old binary .odt from before 2005.',
  );

  const body = asUserError(
    () => extractOdt(parts, options, ctx),
    () => 'This OpenDocument file could not be read. Its content.xml appears to be damaged.',
  );
  if (body.length === 0) {
    fail('No text was found in this document. It may contain only images or embedded objects.');
  }

  ctx.onProgress(1, 'Done');
  const lines = lineCount(body);
  return [
    textFile(
      withExtension(safeDownloadName(stripExtension(file.name)), '.txt'),
      body,
      `${formatBytes(file.size)} · ${plural(lines, 'line')} extracted`,
    ),
  ];
}

/* --- text to DOCX -------------------------------------------------------- */

interface DocxBuildOptions {
  pageSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  markdown: boolean;
}

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

interface SourceParagraph {
  /** Each source line, already split into runs. */
  lines: Run[][];
  marker: string;
  indent: boolean;
  headingLevel: number;
}

const INLINE_EMPHASIS = /\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|_[^_\n]+_/g;
const HEADING_MARKER = /^(#{1,6})\s+/;
const BULLET_MARKER = /^[-*+]\s+/;
const ORDERED_MARKER = /^(\d{1,3})[.)]\s+/;

/** Heading size multipliers. Word has no notion of "level 1" without styles. */
const HEADING_SCALE: Record<number, number> = { 1: 1.6, 2: 1.4, 3: 1.25, 4: 1.1, 5: 1.05, 6: 1 };

/**
 * Splits one line into runs, honouring the Markdown subset that changes what a
 * word processor shows. Boundaries are checked with plain character tests
 * rather than a lookbehind, so `file_name.txt` keeps its underscores.
 */
function inlineRuns(source: string): Run[] {
  const runs: Run[] = [];
  let cursor = 0;
  INLINE_EMPHASIS.lastIndex = 0;

  for (let match = INLINE_EMPHASIS.exec(source); match !== null; match = INLINE_EMPHASIS.exec(source)) {
    const token = match[0];
    const start = match.index;
    if (token.startsWith('_')) {
      const before = start > 0 ? source[start - 1] : '';
      const after = source[start + token.length] ?? '';
      if (/\w/.test(before) || /\w/.test(after)) continue;
    }
    if (start > cursor) runs.push({ text: source.slice(cursor, start), bold: false, italic: false });
    if (token.startsWith('**')) runs.push({ text: token.slice(2, -2), bold: true, italic: false });
    else if (token.startsWith('`')) runs.push({ text: token.slice(1, -1), bold: false, italic: false });
    else runs.push({ text: token.slice(1, -1), bold: false, italic: true });
    cursor = start + token.length;
  }

  if (cursor < source.length) runs.push({ text: source.slice(cursor), bold: false, italic: false });
  return runs;
}

/** Blank-line-separated blocks become paragraphs; Markdown block markers split. */
function sourceParagraphs(source: string, options: DocxBuildOptions): SourceParagraph[] {
  const paragraphs: SourceParagraph[] = [];
  let lines: Run[][] = [];

  const flush = (): void => {
    if (lines.length === 0) return;
    paragraphs.push({ lines, marker: '', indent: false, headingLevel: 0 });
    lines = [];
  };

  for (const raw of source.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      flush();
      continue;
    }

    if (options.markdown) {
      const heading = HEADING_MARKER.exec(trimmed);
      if (heading) {
        flush();
        paragraphs.push({
          lines: [inlineRuns(trimmed.slice(heading[0].length))],
          marker: '',
          indent: false,
          headingLevel: heading[1].length,
        });
        continue;
      }
      if (BULLET_MARKER.test(trimmed)) {
        flush();
        paragraphs.push({
          lines: [inlineRuns(trimmed.replace(BULLET_MARKER, ''))],
          marker: '•\t',
          indent: true,
          headingLevel: 0,
        });
        continue;
      }
      const ordered = ORDERED_MARKER.exec(trimmed);
      if (ordered) {
        flush();
        paragraphs.push({
          lines: [inlineRuns(trimmed.slice(ordered[0].length))],
          marker: `${ordered[1]}.\t`,
          indent: true,
          headingLevel: 0,
        });
        continue;
      }
    }

    lines.push(inlineRuns(trimmed));
  }

  flush();
  return paragraphs;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Word stores type sizes in half-points, and accepts 1 pt to 72 pt. */
function halfPoints(points: number): number {
  return clamp(Math.round(points * 2), 2, 144);
}

function runProperties(options: DocxBuildOptions, size: number, bold: boolean, italic: boolean): string {
  const fonts = escapeXml(options.fontFamily);
  return [
    `<w:rFonts w:ascii="${fonts}" w:hAnsi="${fonts}" w:cs="${fonts}"/>`,
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
    `<w:sz w:val="${halfPoints(size)}"/>`,
    `<w:szCs w:val="${halfPoints(size)}"/>`,
  ]
    .filter((part) => part.length > 0)
    .join('');
}

function runXml(options: DocxBuildOptions, run: Run, size: number, forceBold: boolean): string {
  const properties = runProperties(options, size, run.bold || forceBold, run.italic);
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

function paragraphXml(paragraph: SourceParagraph, options: DocxBuildOptions): string {
  const headingScale = paragraph.headingLevel > 0 ? (HEADING_SCALE[paragraph.headingLevel] ?? 1) : 1;
  const size = options.fontSize * headingScale;

  const runs: string[] = [];
  if (paragraph.marker) {
    runs.push(
      `<w:r><w:rPr>${runProperties(options, size, false, false)}</w:rPr><w:t xml:space="preserve">${escapeXml(paragraph.marker)}</w:t></w:r>`,
    );
  }
  paragraph.lines.forEach((line, index) => {
    // Lines inside one block are separated by a break rather than a new
    // paragraph, which is exactly how the source block was written.
    if (index > 0) runs.push('<w:r><w:br/></w:r>');
    for (const run of line) runs.push(runXml(options, run, size, paragraph.headingLevel > 0));
  });

  // CT_PPr requires `spacing` before `ind`; Word rejects the part otherwise.
  const properties = [
    `<w:spacing w:after="120" w:line="${Math.round(240 * options.lineSpacing)}" w:lineRule="auto"/>`,
    paragraph.indent ? '<w:ind w:left="720" w:hanging="360"/>' : '',
  ]
    .filter((part) => part.length > 0)
    .join('');

  return `<w:p><w:pPr>${properties}</w:pPr>${runs.join('')}</w:p>`;
}

/** A4 and US Letter in twips, with the axes swapped for landscape. */
function sectionProperties(options: DocxBuildOptions): string {
  const a4 = { width: 11_906, height: 16_838 };
  const letter = { width: 12_240, height: 15_840 };
  const base = options.pageSize === 'letter' ? letter : a4;
  const width = options.orientation === 'landscape' ? base.height : base.width;
  const height = options.orientation === 'landscape' ? base.width : base.height;
  const orientation = options.orientation === 'landscape' ? ' w:orient="landscape"' : '';
  return [
    '<w:sectPr>',
    `<w:pgSz w:w="${width}" w:h="${height}"${orientation}/>`,
    '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/>',
    '<w:cols w:space="708"/>',
    '<w:docGrid w:linePitch="360"/>',
    '</w:sectPr>',
  ].join('');
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD_MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const STYLES_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml';
const CORE_CONTENT_TYPE = 'application/vnd.openxmlformats-package.core-properties+xml';

function buildDocumentXml(source: string, options: DocxBuildOptions): string {
  const body = sourceParagraphs(source, options).map((paragraph) => paragraphXml(paragraph, options)).join('');
  return [
    XML_DECLARATION,
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}">`,
    `<w:body>${body}${sectionProperties(options)}</w:body>`,
    '</w:document>',
  ].join('');
}

/** `[Content_Types].xml` — the manifest a consumer reads to find the main part. */
function contentTypesXml(): string {
  return [
    XML_DECLARATION,
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    `<Override PartName="/word/document.xml" ContentType="${WORD_MAIN_CONTENT_TYPE}"/>`,
    `<Override PartName="/word/styles.xml" ContentType="${STYLES_CONTENT_TYPE}"/>`,
    `<Override PartName="/docProps/core.xml" ContentType="${CORE_CONTENT_TYPE}"/>`,
    '</Types>',
  ].join('');
}

/** `_rels/.rels` — the package-level relationships, one per top-level part. */
function packageRelationshipsXml(): string {
  return [
    XML_DECLARATION,
    `<Relationships xmlns="${RELATIONSHIPS_NS}">`,
    `<Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS_NS}/officeDocument" Target="word/document.xml"/>`,
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '</Relationships>',
  ].join('');
}

/** `word/_rels/document.xml.rels` — the document's own relationships. */
function documentRelationshipsXml(): string {
  return [
    XML_DECLARATION,
    `<Relationships xmlns="${RELATIONSHIPS_NS}">`,
    `<Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS_NS}/styles" Target="styles.xml"/>`,
    '</Relationships>',
  ].join('');
}

/** `word/styles.xml` — document defaults, so a reader has a base to start from. */
function stylesXml(options: DocxBuildOptions): string {
  const fonts = escapeXml(options.fontFamily);
  const size = halfPoints(options.fontSize);
  return [
    XML_DECLARATION,
    `<w:styles xmlns:w="${WORD_NS}">`,
    '<w:docDefaults>',
    '<w:rPrDefault>',
    `<w:rPr><w:rFonts w:ascii="${fonts}" w:hAnsi="${fonts}" w:cs="${fonts}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`,
    '</w:rPrDefault>',
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
    '</w:docDefaults>',
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">',
    '<w:name w:val="Normal"/><w:qFormat/>',
    '</w:style>',
    '</w:styles>',
  ].join('');
}

/** `docProps/core.xml` — the properties a file manager shows on hover. */
function corePropertiesXml(title: string): string {
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return [
    XML_DECLARATION,
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"',
    ' xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<dc:title>${escapeXml(title)}</dc:title>`,
    '<dc:creator>Furtu</dc:creator>',
    '<cp:lastModifiedBy>Furtu</cp:lastModifiedBy>',
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>`,
    '<cp:revision>1</cp:revision>',
    '</cp:coreProperties>',
  ].join('');
}

/**
 * The complete set of parts Furtu writes for a new document:
 *
 *   [Content_Types].xml        declares the main document part and the defaults
 *   _rels/.rels                officeDocument + core-properties relationships
 *   docProps/core.xml          title, creator and timestamps
 *   word/document.xml          w:body of w:p / w:r / w:t, ending in w:sectPr
 *   word/styles.xml            docDefaults carrying the chosen font and size
 *   word/_rels/document.xml.rels  the document's own styles relationship
 *
 * Every one of these is declared in the content types and reachable through a
 * relationship, which is the condition Word actually checks when it decides
 * whether a file is a document or a renamed ZIP.
 */
function buildDocxPackage(documentXml: string, title: string, options: DocxBuildOptions): Record<string, Uint8Array> {
  return {
    '[Content_Types].xml': strToU8(contentTypesXml()),
    '_rels/.rels': strToU8(packageRelationshipsXml()),
    'docProps/core.xml': strToU8(corePropertiesXml(title)),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml(options)),
    'word/_rels/document.xml.rels': strToU8(documentRelationshipsXml()),
  };
}

async function textToDocx(files: File[], values: ControlValues, ctx: ToolContext): Promise<FileOutput[]> {
  const file = files[0];
  if (!file) fail('No file was selected. Add a .txt or .md file to continue.');

  ctx.onProgress(0.15, 'Reading the file');
  const bytes = await readBytes(file);
  const source = sanitise(new TextDecoder('utf-8').decode(bytes));
  if (source.trim().length === 0) fail('This file has no text in it, so there is nothing to turn into a document.');

  const options: DocxBuildOptions = {
    pageSize: textValue(values, 'pageSize', 'a4') === 'letter' ? 'letter' : 'a4',
    orientation: textValue(values, 'orientation', 'portrait') === 'landscape' ? 'landscape' : 'portrait',
    fontFamily: textValue(values, 'fontFamily', 'Calibri'),
    fontSize: clamp(Math.round(num(values, 'fontSize', 11)), 8, 24),
    lineSpacing: clamp(num(values, 'lineSpacing', 1.15), 1, 2),
    markdown: flag(values, 'markdown', true),
  };

  checkAborted(ctx);
  ctx.onProgress(0.5, 'Building the document');
  const documentXml = buildDocumentXml(source, options);
  if (documentXml.length > 40 * 1024 * 1024) {
    fail('This text file is too large to convert in one go. Split it into smaller files and convert them separately.');
  }

  const archive = zipSync(buildDocxPackage(documentXml, stripExtension(file.name), options), { level: 6 });
  ctx.onProgress(1, 'Done');

  const blob = new Blob([archive], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return [
    {
      name: `${safeDownloadName(stripExtension(file.name))}.docx`,
      blob,
      note: `${formatBytes(file.size)} of text · ${formatBytes(blob.size)} Word document`,
    },
  ];
}

/* --- document metadata --------------------------------------------------- */

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.xml', '.yaml', '.yml', '.mdx', '.rst', '.ini', '.conf', '.text'];
const CONTAINER_EXTENSIONS = ['.docx', '.xlsx', '.pptx', '.odt', '.docm', '.xlsm', '.pptm'];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot).toLowerCase() : '';
}

async function describeFile(file: File, values: ControlValues, ctx: ToolContext): Promise<TextResult> {
  ctx.onProgress(0.15, 'Reading the file');
  const bytes = await readBytes(file);
  return isZipBytes(bytes)
    ? describeOfficePackage(file, bytes, values, ctx)
    : describePlainText(file, bytes, values, ctx);
}

function textChips(bytes: Uint8Array, decoded: string, encoding: EncodingReport): Chip[] {
  const lines = decoded.split('\n');
  return [
    { label: 'Size', value: `${formatBytes(bytes.length)} (${formatNumber(bytes.length)} bytes)` },
    { label: 'Characters', value: formatNumber(Array.from(decoded).length) },
    { label: 'Lines', value: formatNumber(lineCount(decoded)) },
    { label: 'Encoding', value: encoding.label },
    { label: 'Line endings', value: lineEndingReport(decoded) },
    { label: 'Byte-order mark', value: encoding.byteOrderMark },
    { label: 'Longest line', value: `${plural(lines.reduce((longest, line) => Math.max(longest, line.length), 0), 'character')}` },
  ];
}

function describePlainText(file: File, bytes: Uint8Array, values: ControlValues, ctx: ToolContext): TextResult {
  ctx.onProgress(0.45, 'Decoding and counting');
  const encoding = detectEncoding(bytes, textValue(values, 'encoding', 'auto'));
  const decoded = encoding.decode(bytes);
  const meta = textChips(bytes, decoded, encoding);

  const previewLines = clamp(Math.round(num(values, 'previewLines', 25)), 5, 200);
  const preview = flag(values, 'includePreview', true)
    ? decoded
        .split('\n')
        .slice(0, previewLines)
        .map((line) => sanitise(line))
        .join('\n')
    : '';

  const output = [
    reportFor(file.name, meta),
    ...(encoding.note ? ['', `Note: ${encoding.note}`] : []),
    ...(preview ? ['', `First ${plural(previewLines, 'line')}`, '----------------', preview] : []),
  ].join('\n');

  const diagnostics: TextResult['diagnostics'] = [];
  if (/\r\n/.test(decoded) && /(^|[^\r])\n/.test(decoded)) {
    diagnostics.push({
      level: 'warn',
      message: 'This file mixes CRLF and LF line endings. That is legal, but some older tools struggle with it.',
    });
  }
  if (encoding.label.startsWith('Not valid UTF-8')) {
    diagnostics.push({
      level: 'warn',
      message: 'This file is not valid UTF-8. It was read as Windows-1252; check the preview and override the encoding if the text looks wrong.',
    });
  }
  if (bytes.length < 4) {
    diagnostics.push({ level: 'warn', message: 'This file is only a couple of bytes long, so there is very little to inspect.' });
  }

  return {
    output,
    meta,
    diagnostics,
    download: {
      name: `${safeDownloadName(stripExtension(file.name))}-report.txt`,
      blob: new Blob([output], { type: 'text/plain;charset=utf-8' }),
    },
  };
}

function describeOfficePackage(file: File, bytes: Uint8Array, values: ControlValues, ctx: ToolContext): TextResult {
  const parts = asUserError(
    () => openZip(bytes, 'document'),
    () => 'This file is a ZIP archive, but it could not be opened. It is damaged, or password-protected and encrypted.',
  );

  checkAborted(ctx);
  ctx.onProgress(0.5, 'Reading the package');
  const kind = identifyContainer(parts);
  const names = Object.keys(parts).sort();
  let expanded = 0;
  for (const name of names) expanded += parts[name].length;

  const meta: Chip[] = [
    { label: 'Size', value: `${formatBytes(bytes.length)} (${formatNumber(bytes.length)} bytes)` },
    { label: 'Container', value: kind.label },
    { label: 'Parts', value: formatNumber(names.length) },
    { label: 'Uncompressed', value: formatBytes(expanded) },
  ];

  if (flag(values, 'officeProperties', true)) {
    const properties = new Map<string, string>();
    for (const name of ['docProps/core.xml', 'docProps/app.xml', 'meta.xml']) {
      const document = parsePart(parts, name, 'document');
      if (!document) continue;
      for (const [key, value] of flattenProperties(document)) {
        if (!properties.has(key)) properties.set(key, value);
      }
    }
    if (properties.size === 0) meta.push({ label: 'Properties', value: 'None stored in this file' });
    else meta.push(...collectProperties(properties));
  }

  ctx.onProgress(1, 'Done');
  const output = [
    reportFor(file.name, meta),
    '',
    'Package parts',
    '-------------',
    ...names.map((name) => `  ${name} — ${formatBytes(parts[name].length)}`),
  ].join('\n');

  return {
    output,
    meta,
    download: {
      name: `${safeDownloadName(stripExtension(file.name))}-report.txt`,
      blob: new Blob([output], { type: 'text/plain;charset=utf-8' }),
    },
  };
}

/**
 * The `text` map entry. The tool renders on the files workspace, which uses the
 * file operation below; this exists so the same inspection is available to a
 * text-workspace caller, which has a string and no bytes to measure.
 */
function describeSuppliedText(input: string, values: ControlValues): TextResult {
  const supplied = input ?? '';
  const withoutBom = supplied.startsWith('\uFEFF') ? supplied.slice(1) : supplied;
  const lines = withoutBom.split('\n');

  const meta: Chip[] = [
    { label: 'Characters', value: formatNumber(Array.from(withoutBom).length) },
    { label: 'Lines', value: formatNumber(lineCount(withoutBom)) },
    { label: 'Line endings', value: lineEndingReport(withoutBom) },
    { label: 'Byte-order mark', value: supplied.startsWith('\uFEFF') ? 'UTF-8 byte-order mark (U+FEFF)' : 'None' },
    { label: 'Longest line', value: plural(lines.reduce((longest, line) => Math.max(longest, line.length), 0), 'character') },
    { label: 'Encoding', value: 'Supplied as text, already decoded as UTF-8 by the browser' },
  ];

  const previewLines = clamp(Math.round(num(values, 'previewLines', 25)), 5, 200);
  const preview = flag(values, 'includePreview', true) ? lines.slice(0, previewLines).join('\n') : '';
  const output = [
    reportFor('Supplied text', meta),
    ...(preview ? ['', `First ${plural(previewLines, 'line')}`, '----------------', preview] : []),
  ].join('\n');

  return { output, meta };
}

async function documentMetadata(files: File[], values: ControlValues, ctx: ToolContext): Promise<FileOutput[]> {
  const file = files[0];
  if (!file) fail('No file was selected. Add a text, Office or OpenDocument file to continue.');

  const extension = extensionOf(file.name);
  if (!TEXT_EXTENSIONS.includes(extension) && !CONTAINER_EXTENSIONS.includes(extension)) {
    fail(`Furtu reads text, Office and OpenDocument files. "${file.name}" is none of those, so there is nothing to inspect.`);
  }

  const result = await describeFile(file, values, ctx);
  const blob = result.download?.blob ?? new Blob([result.output], { type: 'text/plain;charset=utf-8' });
  return [
    {
      name: result.download?.name ?? `${safeDownloadName(stripExtension(file.name))}-report.txt`,
      blob,
      note: (result.meta ?? []).slice(0, 3).map((chip) => `${chip.label} ${chip.value}`).join(' · '),
    },
  ];
}

/* --- export maps --------------------------------------------------------- */

const file: FileOpMap = {
  'docx-to-text': docxToText,
  'xlsx-to-csv': xlsxToCsv,
  'pptx-to-text': pptxToText,
  'odt-to-text': odtToText,
  'text-to-docx': textToDocx,
  'document-metadata': documentMetadata,
};

const text: TextOpMap = {
  'document-metadata': describeSuppliedText,
};

import type { EngineChunk, FileOpMap, FileOutput, TextOpMap } from '../types';

export default { file, text } satisfies EngineChunk;
