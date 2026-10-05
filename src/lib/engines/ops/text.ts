/**
 * Text engine — every FURTU tool whose `engine` is `'text'`.
 *
 * Two rules hold for every operation in this file:
 *
 * 1. Nothing leaves the browser. There is no network request of any kind in this
 *    chunk, and the Markdown renderer at the bottom is included in that promise.
 * 2. Nothing throws at the visitor. Empty input, malformed input and hostile
 *    input all come back as a `Diagnostic`, never as an exception with a raw
 *    `SyntaxError` message attached to it.
 */

import { createElement } from 'react';
import type { ReactNode } from 'react';

import { formatBytes, formatNumber } from '@/lib/format';

import type { ControlValues, Diagnostic, TextResult, ToolContext } from '../types';

/* ===================================================================== */
/* control readers                                                       */
/* ===================================================================== */

function controlText(values: ControlValues, id: string, fallback = ''): string {
  const value = values[id];
  return typeof value === 'string' ? value : fallback;
}

function controlNumber(values: ControlValues, id: string, fallback: number): number {
  const value = values[id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function controlBool(values: ControlValues, id: string, fallback: boolean): boolean {
  const value = values[id];
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ===================================================================== */
/* small shared helpers                                                  */
/* ===================================================================== */

const utf8 = new TextEncoder();

/** Byte length of a string once encoded as UTF-8. */
function utf8Bytes(text: string): number {
  return utf8.encode(text).length;
}

function textBlob(text: string, type: string): Blob {
  return new Blob([text], { type });
}

/** Every tool answers empty input the same way: a warning, never an error. */
function nothingToDo(what: string): TextResult {
  return {
    output: '',
    diagnostics: [
      {
        level: 'warn',
        message: `Nothing to work on yet. Add ${what} and the result appears as you type — everything below runs in this tab.`,
      },
    ],
  };
}

/** Accepts a sentence or a ready-made diagnostic, so callers cannot get the two the wrong way round. */
function errorResult(problem: string | Diagnostic, partial = ''): TextResult {
  return {
    output: partial,
    diagnostics: [typeof problem === 'string' ? { level: 'error', message: problem } : problem],
  };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const numberFormatters = new Map<number, Intl.NumberFormat>();

/**
 * Formats a number with a chosen number of decimal places.
 *
 * `Intl.NumberFormat` caps at three decimal places by default, which silently
 * ignores a decimal-places control and quietly rounds a conversion. The
 * formatter is built with the requested precision and cached, because building
 * one is not free and these run on every keystroke.
 */
function decimal(value: number, places: number): string {
  if (!Number.isFinite(value)) return '—';
  const digits = clamp(Math.round(places), 0, 20);
  let formatter = numberFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits });
    numberFormatters.set(digits, formatter);
  }
  return formatter.format(value);
}

/* --- JSON ------------------------------------------------------------ */

interface JsonProblem {
  /** Human sentence, with V8's `in JSON at position 41` tail removed. */
  prose: string;
  line: number;
  column: number;
  offset: number;
  /** True when the engine gave no position and this is the best available match. */
  approximate: boolean;
}

function jsonProse(raw: string): string {
  return raw
    .replace(/^JSON\.parse:\s*/i, '')
    // V8 12 reports `Unexpected token 'x', ..."context" is not valid JSON` with no
    // position at all. The context is used for the position, and dropped here.
    .replace(/,\s*\.\.\."[\s\S]*"\s+is not valid JSON\.?$/i, '')
    .replace(/\s+in JSON at (?:position \d+|line \d+ column \d+).*$/i, '')
    .replace(/^Unexpected end of JSON input$/i, 'The document stops in the middle of a value — a brace, bracket or quote is probably missing')
    .replace(/^Unexpected end of input$/i, 'The document stops in the middle of a value — a brace, bracket or quote is probably missing')
    .replace(/^Unexpected token ['"`]?([\s\S])['"`]?$/i, 'Unexpected character “$1”')
    .replace(/^Unexpected (?:token|character) ['"`]?([\s\S])['"`]?$/i, 'Unexpected character “$1”')
    .replace(/^Unexpected non-whitespace character after JSON at position \d+$/i, 'There is extra text after the end of the JSON value')
    .replace(/^Unexpected (non-whitespace )?character after JSON$/i, 'There is extra text after the end of the JSON value')
    .trim();
}

/** Characters V8 puts in front of the offending character in its context snippet. */
const V8_CONTEXT = 10;

/**
 * Turns a thrown `SyntaxError` into a line and column.
 *
 * Three message shapes have to be handled, because engines differ and V8 has
 * changed its format more than once:
 *
 *  1. `... at position N` — a zero-based character offset. Preferred, and the
 *     line and column are computed from the source.
 *  2. `... at line L column C` — trusted directly.
 *  3. `Unexpected token 'x', ..."context" is not valid JSON` — no position at
 *     all, but the snippet contains up to ten characters on each side of the
 *     error. The snippet is located in the source, the offset is taken ten
 *     characters in, and the character found there is checked against the
 *     character the engine named. If it does not match, the snippet is
 *     searched instead, and the result is marked as approximate.
 */
function locateJsonError(source: string, error: unknown): JsonProblem {
  const raw = error instanceof Error ? error.message : String(error);
  const offsetMatch = /position (\d+)/.exec(raw);
  const lineColumnMatch = /line (\d+) column (\d+)/.exec(raw);
  const giveUp = (): JsonProblem => ({ prose: jsonProse(raw), line: 1, column: 1, offset: -1, approximate: true });

  if (lineColumnMatch && !offsetMatch) {
    return { prose: jsonProse(raw), line: Number(lineColumnMatch[1]), column: Number(lineColumnMatch[2]), offset: -1, approximate: false };
  }

  let offset: number;
  let approximate = false;
  if (offsetMatch) {
    offset = clamp(Number(offsetMatch[1]), 0, source.length);
  } else {
    const token = /Unexpected (?:token|character) ['"`]?([\s\S])['"`]?/.exec(raw);
    // Greedy, and anchored on the closing phrase: the snippet itself routinely
    // contains quotes, so a lazy capture would stop at the first one and return
    // a fragment. The trailing `" is not valid JSON` is unambiguous.
    const tail = /,\s*(?:\.\.\.)?"([\s\S]*)"\s+is not valid JSON\.?$/i.exec(raw);
    if (!token || !tail) return giveUp();
    const bad = token[1];
    const snippet = tail[1];
    const start = source.indexOf(snippet);
    if (start === -1) {
      // The snippet is not in the source, which happens when the document was
      // altered after the parse. The first occurrence of the offending
      // character is the best guess available.
      const found = source.indexOf(bad);
      if (found === -1) return giveUp();
      offset = found;
      approximate = true;
    } else {
      // The snippet begins V8_CONTEXT characters before the error unless the
      // error is closer than that to the start of the document.
      const candidate = start === 0 ? -1 : start + V8_CONTEXT;
      if (candidate !== -1 && source[candidate] === bad) {
        offset = candidate;
      } else {
        const found = source.indexOf(bad, start);
        if (found === -1) return giveUp();
        offset = found;
        approximate = start === 0;
      }
    }
  }

  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { prose: jsonProse(raw), line, column, offset, approximate };
}

function jsonErrorDiagnostic(problem: JsonProblem, label: string): Diagnostic {
  return {
    level: 'error',
    message: `${label}: ${problem.prose}. Reported at line ${problem.line}, column ${problem.column}.${problem.approximate ? ' The parser gave no position for this one, so treat the line as a guide rather than an exact pointer.' : ''}`,
  };
}
interface JsonRead {
  value: unknown;
  error?: Diagnostic;
}

function readJson(source: string, label = 'This is not valid JSON'): JsonRead {
  try {
    return { value: JSON.parse(source) as unknown };
  } catch (error) {
    return { value: undefined, error: jsonErrorDiagnostic(locateJsonError(source, error), label) };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursively sorts object keys. Arrays keep their order — their index is data. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareStrings)) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

function describeJsonShape(value: unknown): {
  counts: { objects: number; arrays: number; keys: number; values: number };
  depth: number;
  rootType: string;
  largestArray: number;
} {
  const counts = { objects: 0, arrays: 0, keys: 0, values: 0 };
  let depth = 0;
  let largestArray = 0;

  const walk = (node: unknown, level: number): void => {
    if (level > depth) depth = level;
    if (Array.isArray(node)) {
      counts.arrays += 1;
      counts.values += node.length;
      if (node.length > largestArray) largestArray = node.length;
      for (const item of node) walk(item, level + 1);
      return;
    }
    if (isPlainObject(node)) {
      counts.objects += 1;
      const keys = Object.keys(node);
      counts.keys += keys.length;
      counts.values += keys.length;
      for (const key of keys) walk(node[key], level + 1);
    }
  };
  walk(value, 1);

  const rootType = Array.isArray(value) ? 'array' : isPlainObject(value) ? 'object' : value === null ? 'null' : typeof value;
  return { counts, depth, rootType, largestArray };
}

/** Pretty-printer that honours a tab indent as well as spaces. */
function indentString(choice: string): string {
  if (choice === 'tab') return '\t';
  const width = Number(choice);
  return ' '.repeat(Number.isFinite(width) && width > 0 ? Math.min(width, 8) : 2);
}

/* --- CSV ------------------------------------------------------------- */

type CsvCell = string | number | boolean | null;

interface CsvParse {
  rows: string[][];
  delimiter: string;
  truncated: boolean;
  diagnostics: Diagnostic[];
}

/**
 * Counts candidate separators in the first few logical records, ignoring any
 * that sit inside quoted fields. Ties resolve to the earlier candidate, so a
 * single-column file stays comma-separated.
 */
function detectCsvDelimiter(source: string): string {
  const candidates = [',', ';', '\t', '|'];
  const tally = new Map<string, number>();
  let inQuotes = false;
  let records = 0;

  for (let i = 0; i < source.length && records < 5; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (inQuotes && source[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === '\r') continue;
    if (char === '\n') {
      records += 1;
      continue;
    }
    if (candidates.includes(char)) tally.set(char, (tally.get(char) ?? 0) + 1);
  }

  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = tally.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180 parser.
 *
 * Hand-written on purpose. `String.prototype.split(',')` is wrong for every CSV
 * that contains any of the following, all of which are legal and all of which
 * occur in real exports:
 *
 *  - a quoted field containing the delimiter      `a,"b,c",d`
 *  - an escaped quote inside a quoted field      `a,"say ""hi""",d`
 *  - a newline inside a quoted field              `a,"line one\nline two",d`
 *  - CRLF row endings                             `a,b\r\nc,d`
 *  - a quoted field that ends the file            `a,"unterminated`
 *  - text immediately after a closing quote       `a,"b"c,d`  (not legal, but
 *    written by plenty of exporters)
 *
 * Each of those is handled explicitly below. `split(',')` handles none of them.
 */
function parseCsv(source: string, delimiter: string): CsvParse {
  const rows: string[][] = [];
  const diagnostics: Diagnostic[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawTextAfterClosingQuote = false;
  let unterminatedQuoteLine = 0;
  let line = 1;
  let i = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < source.length) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        // Legal: only a delimiter, a row break or the end of the file may follow.
        // Anything else means the exporter lost a quote; drop the stray
        // character rather than gluing it onto the field, and say so later.
        const next = source[i];
        if (next !== undefined && next !== delimiter && next !== '\n' && next !== '\r') {
          sawTextAfterClosingQuote = true;
          i += 1;
        }
        continue;
      }
      if (char === '\n') line += 1;
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      if (field === '') {
        inQuotes = true;
        i += 1;
        continue;
      }
      // A quote in the middle of an unquoted field is not a quote at all.
      field += char;
      i += 1;
      continue;
    }

    if (char === delimiter) {
      endField();
      i += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (inQuotes) {
    unterminatedQuoteLine = line;
    // Excel and most libraries accept the partial field. So do we, loudly.
    endRow();
  } else if (field !== '' || row.length > 0) {
    endRow();
  }

  if (sawTextAfterClosingQuote) {
    diagnostics.push({
      level: 'warn',
      message:
        'At least one quoted field is followed immediately by more text (for example "b"c). That is not valid CSV. The stray characters were dropped rather than merged into the field.',
    });
  }
  if (unterminatedQuoteLine > 0) {
    diagnostics.push({
      level: 'warn',
      message: `A quoted field starting before line ${unterminatedQuoteLine} is never closed. Furtu treated everything to the end of the file as that field, which is what spreadsheet applications do.`,
    });
  }

  return { rows, delimiter, truncated: false, diagnostics };
}

function csvCell(value: CsvCell, delimiter: string, quoteAll: boolean, neutralise: boolean): string {
  let text: string;
  if (value === null || value === undefined) text = '';
  else if (typeof value === 'string') text = value;
  else text = String(value);

  if (neutralise && /^[=+\-@\t\r]/.test(text)) {
    // A cell beginning with =, +, - or @ is executed as a formula by Excel,
    // Sheets and LibreOffice. Prefixing an apostrophe neutralises it.
    text = `'${text}`;
  }
  const mustQuote =
    quoteAll || text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text) || text !== text.trim();
  if (!mustQuote) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: CsvCell[][], delimiter: string, lineEnding: string, quoteAll: boolean, neutralise: boolean): string {
  return rows.map((row) => row.map((cell) => csvCell(cell, delimiter, quoteAll, neutralise)).join(delimiter)).join(lineEnding);
}

/** A nested value that will not fit in a column. Honest about what happens. */
function cellValue(value: unknown): CsvCell {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  return JSON.stringify(value);
}

/* --- Base64 ---------------------------------------------------------- */

const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64URL_ALPHABET = /^[A-Za-z0-9\-_]*={0,2}$/;

/**
 * UTF-8 safe Base64 encoding.
 *
 * `btoa` only accepts Latin-1 code points, so `btoa('日本')` throws and the
 * usual `btoa(unescape(encodeURIComponent(s)))` workaround depends on
 * `escape`/`unescape`, which are Annex B legacy and can corrupt lone
 * surrogates. Encoding to UTF-8 bytes first and mapping those bytes one to one
 * onto characters is the only approach that round-trips every string JavaScript
 * can hold.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

interface Base64Read {
  bytes?: Uint8Array;
  error?: string;
}

function base64ToBytes(input: string, urlSafe: boolean, stripWhitespace: boolean): Base64Read {
  let cleaned = stripWhitespace ? input.replace(/[\s]/g, '') : input;
  if (urlSafe) cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  // Padding is optional in the wild (JWTs and many APIs strip it).
  cleaned = cleaned.replace(/=+$/, '');

  if (cleaned === '') return { bytes: new Uint8Array(0) };
  if (urlSafe ? !BASE64URL_ALPHABET.test(cleaned) : !BASE64_ALPHABET.test(cleaned)) {
    const bad = cleaned.search(urlSafe ? /[^A-Za-z0-9\-_=]/ : /[^A-Za-z0-9+/=]/);
    return {
      error: `That is not valid Base64. The first character that cannot appear in Base64 is “${cleaned[bad] ?? '?'}” at position ${bad + 1}. Base64 uses A–Z, a–z, 0–9 and, in the standard alphabet, + and /.`,
    };
  }
  if (cleaned.length % 4 === 1) {
    return {
      error: `That is not valid Base64: ${cleaned.length} characters is impossible, because a Base64 group is four characters wide. The last group is usually one character short.`,
    };
  }

  const padded = cleaned.padEnd(cleaned.length + ((4 - (cleaned.length % 4)) % 4), '=');
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes };
  } catch {
    return { error: 'That string could not be decoded as Base64. It may have been truncated in transit.' };
  }
}

/* --- URL percent encoding -------------------------------------------- */

/**
 * Manual percent-decoding into a byte buffer, then one UTF-8 decode.
 *
 * `decodeURIComponent` throws a `URIError` with the position buried in the
 * message, and it cannot express “leave `+` alone”. Decoding bytes by hand
 * gives both the offending offset and full control over `+`.
 */
function percentDecode(input: string, plusAsSpace: boolean): { text?: string; error?: string; bytes?: number } {
  const bytes: number[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === '%') {
      const hex = input.slice(i + 1, i + 3);
      if (hex.length < 2 || !/^[0-9A-Fa-f]{2}$/.test(hex)) {
        return { error: `The escape at position ${i + 1} is incomplete or not hexadecimal. “%” must be followed by two hex digits, as in %20.` };
      }
      bytes.push(Number.parseInt(hex, 16));
      i += 3;
      continue;
    }
    if (char === '+' && plusAsSpace) {
      bytes.push(0x20);
      i += 1;
      continue;
    }
    // Everything else goes through UTF-8 so that unescaped non-ASCII survives.
    for (const byte of utf8.encode(char)) bytes.push(byte);
    i += 1;
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)), bytes: bytes.length };
  } catch {
    // Valid escapes, invalid UTF-8. Fall back to a lossy read and say so.
    return { text: new TextDecoder('utf-8').decode(new Uint8Array(bytes)), bytes: bytes.length, error: 'The decoded bytes are not valid UTF-8, so some characters were replaced with �. The source may be Latin-1 rather than UTF-8.' };
  }
}

/* --- colours --------------------------------------------------------- */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampChannel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function parseAngle(raw: string): number {
  const value = raw.trim().replace(/deg$/i, '');
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return ((parsed % 360) + 360) % 360;
}

function parseChannelNumber(raw: string): number {
  const value = Number(raw.trim().replace(/%$/, ''));
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * HSL and HSV saturation and lightness.
 *
 * Two notations are in use: `hsl(221, 83%, 53%)` and `hsl(221, 0.83, 0.53)`.
 * A number above 1 can only be a percentage, so it is divided by 100 — without
 * that, `hsl(221, 83%, 53%)` clamps both values to 1 and returns white.
 */
function parsePercent(raw: string): number {
  const text = raw.trim();
  const isPercent = text.endsWith('%');
  const value = Number(isPercent ? text.slice(0, -1) : text);
  if (!Number.isFinite(value)) return Number.NaN;
  if (isPercent) return value / 100;
  return Math.abs(value) > 1 ? value / 100 : value;
}
function parseAlpha(raw: string): number {
  const value = raw.trim();
  if (value === '') return 1;
  const parsed = Number(value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return clamp(parsed, 0, 1);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor(hue / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[sector] ?? [0, 0, 0];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);
  return { h: ((h % 360) + 360) % 360, s, l };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const sector = Math.floor(hue / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[sector] ?? [0, 0, 0];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, v: max };
  const s = max === 0 ? 0 : delta / max;
  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);
  return { h: ((h % 360) + 360) % 360, s, v: max };
}

function parseColor(input: string, declared: string): { color?: Rgba; error?: string; detected?: string } {
  const text = input.trim();
  if (text === '') return { error: 'No colour found in the input.' };

  const hexMatch = /^#?([0-9a-f]{3,8})$/i.exec(text);
  const isHex = hexMatch !== null && declared !== 'rgb' && declared !== 'hsl' && declared !== 'hsv';
  if (hexMatch && isHex) {
    const digits = hexMatch[1];
    const expand = (value: string): number => Number.parseInt(value.length === 1 ? value + value : value, 16);
    if (digits.length === 3 || digits.length === 4) {
      return { color: { r: expand(digits[0]), g: expand(digits[1]), b: expand(digits[2]), a: digits.length === 4 ? expand(digits[3]) / 255 : 1 }, detected: 'HEX' };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        color: {
          r: Number.parseInt(digits.slice(0, 2), 16),
          g: Number.parseInt(digits.slice(2, 4), 16),
          b: Number.parseInt(digits.slice(4, 6), 16),
          a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
        },
        detected: digits.length === 8 ? 'HEX with alpha' : 'HEX',
      };
    }
    return { error: `“${text}” is not a usable hex colour. HEX is written as #RGB, #RGBA, #RRGGBB or #RRGGBBAA.` };
  }

  const fnMatch = /^(rgba?|hsla?|hsva?|hsba?)\s*\(\s*(.*)\)$/i.exec(text);
  if (fnMatch) {
    const name = fnMatch[1].toLowerCase();
    const parts = fnMatch[2].split(/[,/]/).map((part) => part.trim()).filter((part) => part !== '');
    if (parts.length < 3) return { error: `${name}() needs at least three values, as in ${name}(255, 0, 0).` };
    const alpha = parts.length > 3 ? parseAlpha(parts[3]) : 1;
    if (!Number.isFinite(alpha)) return { error: `“${parts[3]}” is not a usable alpha value. Use 0 to 1, or a percentage such as 50%.` };

    if (name.startsWith('rgb')) {
      const channels = parts.slice(0, 3).map((part) => parseChannelNumber(part));
      if (channels.some((channel) => !Number.isFinite(channel))) return { error: 'Each RGB channel must be a number between 0 and 255.' };
      return { color: { r: clampChannel(channels[0]), g: clampChannel(channels[1]), b: clampChannel(channels[2]), a: roundTo(alpha, 4) }, detected: name.toUpperCase() };
    }
    if (name.startsWith('hsl')) {
      const h = parseAngle(parts[0]);
      const s = parsePercent(parts[1]);
      const l = parsePercent(parts[2]);
      if (![h, s, l].every((value) => Number.isFinite(value))) return { error: 'HSL is written as hsl(hue, saturation%, lightness%) with a hue in degrees.' };
      const rgb = hslToRgb(h, s, l);
      return { color: { r: clampChannel(rgb.r), g: clampChannel(rgb.g), b: clampChannel(rgb.b), a: roundTo(alpha, 4) }, detected: name.toUpperCase() };
    }
    const h = parseAngle(parts[0]);
    const s = parsePercent(parts[1]);
    const v = parsePercent(parts[2]);
    if (![h, s, v].every((value) => Number.isFinite(value))) return { error: 'HSV is written as hsv(hue, saturation%, value%).' };
    const rgb = hsvToRgb(h, s, v);
    return { color: { r: clampChannel(rgb.r), g: clampChannel(rgb.g), b: clampChannel(rgb.b), a: roundTo(alpha, 4) }, detected: name.toUpperCase() };
  }

  const bare = text.split(/[,\s]+/).filter((part) => part !== '');
  if (bare.length >= 3) {
    const channels = bare.slice(0, 3).map((part) => parseChannelNumber(part));
    if (channels.every((channel) => Number.isFinite(channel))) {
      const alpha = bare.length > 3 ? parseAlpha(bare[3]) : 1;
      return { color: { r: clampChannel(channels[0]), g: clampChannel(channels[1]), b: clampChannel(channels[2]), a: roundTo(alpha, 4) }, detected: 'RGB' };
    }
  }

  return { error: `“${text}” is not a colour Furtu can read. Accepted forms are #1a2b3c, rgb(26, 43, 60), hsl(210, 40%, 17%) and hsv(210, 74%, 24%).` };
}

function toHex(color: Rgba, withAlpha: boolean): string {
  const pair = (value: number): string => clampChannel(value).toString(16).padStart(2, '0');
  const base = `#${pair(color.r)}${pair(color.g)}${pair(color.b)}`;
  if (!withAlpha || color.a >= 1) return base.toUpperCase();
  return `${base}${Math.round(clamp(color.a, 0, 1) * 255).toString(16).padStart(2, '0')}`.toUpperCase();
}

const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Crimson', hex: '#DC143C' },
  { name: 'Orange', hex: '#FFA500' },
  { name: 'Amber', hex: '#FFBF00' },
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Lime', hex: '#00FF00' },
  { name: 'Green', hex: '#008000' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Cyan', hex: '#00FFFF' },
  { name: 'Sky', hex: '#0EA5E9' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Magenta', hex: '#FF00FF' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Brown', hex: '#92400E' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Silver', hex: '#C0C0C0' },
];

/** WCAG relative luminance, used for the contrast read-out. */
function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ===================================================================== */
/* developer tools                                                       */
/* ===================================================================== */

const JSON_LIMIT_NOTE = 'Furtu formats the value exactly as JSON.parse built it: key order is preserved unless you ask for sorting, and numbers are re-serialised from their JavaScript value, so 1.0 becomes 1.';

function jsonFormatter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some JSON to pretty-print');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const read = readJson(source);
  if (read.error) return errorResult(read.error);

  const unit = indentString(controlText(values, 'indent', '2'));
  const prepared = controlBool(values, 'sortKeys', false) ? sortKeysDeep(read.value) : read.value;
  const output = `${JSON.stringify(prepared, null, unit)}\n`;
  return {
    output,
    meta: [
      { label: 'Input size', value: formatBytes(utf8Bytes(source)) },
      { label: 'Output size', value: formatBytes(utf8Bytes(output)) },
      { label: 'Indent', value: unit === '\t' ? 'Tab' : `${unit.length} spaces` },
      { label: 'Keys sorted', value: controlBool(values, 'sortKeys', false) ? 'Yes, at every depth' : 'No' },
    ],
    diagnostics: [{ level: 'ok', message: `Valid JSON. ${JSON_LIMIT_NOTE}` }],
    download: { name: 'formatted.json', blob: textBlob(output, 'application/json') },
  };
}

function jsonValidator(input: string, values: ControlValues): TextResult {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const hasBom = input.charCodeAt(0) === 0xfeff;
  const detectBom = controlBool(values, 'detectBom', true);
  if (input.trim() === '') return nothingToDo('a JSON document to check');

  const read = readJson(source);
  if (read.error) {
    const diagnostics: Diagnostic[] = [read.error];
    if (hasBom && detectBom) {
      diagnostics.push({
        level: 'warn',
        message:
          'The document starts with a byte order mark (U+FEFF). That is invisible but JSON does not allow it, and it is the most common cause of this error. Remove the first character and try again.',
      });
    }
    return { output: '', diagnostics };
  }

  const shape = describeJsonShape(read.value);
  const meta: { label: string; value: string }[] = [
    { label: 'Verdict', value: 'Valid JSON' },
    { label: 'Size', value: `${formatBytes(utf8Bytes(source))} (${formatNumber(utf8Bytes(source))} bytes)` },
    { label: 'Root type', value: shape.rootType },
  ];
  if (controlBool(values, 'showStructure', true)) {
    meta.push(
      { label: 'Objects', value: formatNumber(shape.counts.objects) },
      { label: 'Arrays', value: formatNumber(shape.counts.arrays) },
      { label: 'Keys', value: formatNumber(shape.counts.keys) },
      { label: 'Deepest level', value: formatNumber(shape.depth) },
    );
    if (shape.largestArray > 0) meta.push({ label: 'Longest array', value: plural(shape.largestArray, 'item') });
  }

  const notes: Diagnostic[] = [
    {
      level: 'ok',
      message: 'The document parses as JSON. That is a syntax check only — Furtu cannot tell you whether the values are correct for your schema, and it does not resolve $ref pointers or check remote schemas.',
    },
  ];
  if (hasBom && detectBom) {
    notes.push({ level: 'warn', message: 'The document started with a byte order mark. It parsed once the mark was removed, but the mark will break other parsers.' });
  }
  if (shape.depth > 20) {
    notes.push({ level: 'warn', message: `The document nests ${shape.depth} levels deep. Recursive parsers in other languages may hit a stack limit before they finish.` });
  }

  return { output: shape.rootType === 'null' ? 'null' : `Valid JSON — a ${shape.rootType} at the root.`, meta, diagnostics: notes };
}

function jsonMinifier(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some JSON to strip down');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const read = readJson(source);
  if (read.error) return errorResult(read.error);

  const escapeHtml = controlBool(values, 'escapeHtml', false);
  let minified = JSON.stringify(read.value);
  if (minified === undefined) return errorResult('That JSON value has no JSON representation, so there is nothing to output.');
  if (escapeHtml) {
    // JSON embedded in a <script> block or an HTML attribute is a real vector:
    // "</script>" inside a string closes the tag. Escaping the three HTML
    // metacharacters keeps the JSON valid while making that impossible.
    minified = minified.replace(/[<>&]/g, (char) => (char === '<' ? '\\u003c' : char === '>' ? '\\u003e' : '\\u0026'));
  }

  const before = utf8Bytes(source);
  const after = utf8Bytes(minified);
  const saved = before > 0 ? ((before - after) / before) * 100 : 0;
  return {
    output: minified,
    meta: [
      { label: 'Before', value: `${formatBytes(before)} (${formatNumber(before)} bytes)` },
      { label: 'After', value: `${formatBytes(after)} (${formatNumber(after)} bytes)` },
      { label: 'Saved', value: saved > 0 ? `${saved.toFixed(1)}%` : 'Nothing to save' },
      { label: 'HTML-safe', value: escapeHtml ? 'Yes — <, > and & escaped' : 'No' },
    ],
    diagnostics: [
      {
        level: 'ok',
        message: 'Minified. JSON has no comments, so nothing was removed except whitespace between tokens — whitespace inside string values is preserved exactly.',
      },
    ],
    download: { name: 'minified.json', blob: textBlob(minified, 'application/json') },
  };
}

function jsonToCsv(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a JSON array or object to lay out as columns');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const read = readJson(source);
  if (read.error) return errorResult(read.error);

  const delimiterChoice = controlText(values, 'delimiter', ',');
  const delimiter = delimiterChoice === 'tab' ? '\t' : delimiterChoice;
  const lineEnding = controlText(values, 'lineEnding', 'crlf') === 'lf' ? '\n' : '\r\n';
  const quoteAll = controlBool(values, 'quoteAll', false);
  const neutralise = controlBool(values, 'neutraliseFormulas', true);
  const flatten = controlBool(values, 'flatten', true);

  const diagnostics: Diagnostic[] = [];
  let records: unknown[];
  let notes: string;

  if (Array.isArray(read.value)) {
    records = read.value;
    notes = `Converted an array of ${plural(records.length, 'record')}.`;
  } else if (isPlainObject(read.value)) {
    records = [read.value];
    notes = 'The input was a single object, so it became a one-row table.';
  } else if (typeof read.value === 'string' || typeof read.value === 'number' || typeof read.value === 'boolean') {
    records = [read.value];
    notes = 'The input was a single value, so it became a one-column, one-row table.';
  } else {
    return errorResult('A CSV table needs an array, an object or a single value at the root. This document has none of those at the top level.');
  }

  if (records.length === 0) {
    return {
      output: '',
      meta: [{ label: 'Rows', value: '0' }],
      diagnostics: [{ level: 'warn', message: 'The array is empty, so the CSV is empty too. A CSV with only a header row is usually not what you want here.' }],
      download: { name: 'data.csv', blob: textBlob('', 'text/csv') },
    };
  }

  const objectRecords = records.filter(isPlainObject);
  const scalarRecords = records.filter((record) => !isPlainObject(record));
  if (objectRecords.length > 0 && scalarRecords.length > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${plural(scalarRecords.length, 'item')} in the array ${scalarRecords.length === 1 ? 'is not an object' : 'are not objects'}, so ${scalarRecords.length === 1 ? 'it was' : 'they were'} placed in a column called "value". Mixing shapes in one array loses data in any tabular format.`,
    });
  }

  // The top level always becomes columns, otherwise a record would have no
  // column at all. The `flatten` toggle only controls how far *nested* objects
  // are expanded, so `depth === 0` ignores it.
  const flattenOne = (value: unknown, prefix: string, depth: number): { key: string; value: CsvCell }[] => {
    if (isPlainObject(value) && (depth === 0 || (flatten && depth < 2))) {
      return Object.entries(value).flatMap(([key, child]) => flattenOne(child, prefix ? `${prefix}.${key}` : key, depth + 1));
    }
    return [{ key: prefix, value: cellValue(value) }];
  };

  const headers: string[] = [];
  const headerSet = new Set<string>();
  const body: Map<string, CsvCell>[] = [];
  let duplicateRenames = 0;

  // A name is only a duplicate if two keys *within one record* flatten to the
  // same column. The same key appearing in several records is the whole point
  // of a union header, so it is registered once and reused.
  const addHeader = (key: string, taken: Set<string>): string => {
    if (headerSet.has(key) && !taken.has(key)) return key;
    let name = key;
    let suffix = 2;
    while (headerSet.has(name) || taken.has(name)) {
      name = `${key}_${suffix}`;
      suffix += 1;
    }
    if (name !== key) duplicateRenames += 1;
    return name;
  };

  for (const record of records) {
    const cells = new Map<string, CsvCell>();
    const taken = new Set<string>();
    const pairs = isPlainObject(record) ? flattenOne(record, '', 0) : [{ key: 'value', value: cellValue(record) }];
    for (const pair of pairs) {
      const name = addHeader(pair.key, taken);
      taken.add(name);
      cells.set(name, pair.value);
      if (!headerSet.has(name)) {
        headerSet.add(name);
        headers.push(name);
      }
    }
    body.push(cells);
  }

  if (duplicateRenames > 0) {
    diagnostics.push({ level: 'warn', message: 'Two keys in the same record flattened to the same column name, so the later one was suffixed. Every column name in a CSV header has to be unique to become an object key.' });
  }

  const rows: CsvCell[][] = [headers, ...body.map((cells) => headers.map((header) => cells.get(header) ?? ''))];
  const output = `${rowsToCsv(rows, delimiter, lineEnding, quoteAll, neutralise)}\n`;
  if (neutralise) {
    diagnostics.push({
      level: 'ok',
      message: 'Cells starting with =, +, - or @ were prefixed with an apostrophe so spreadsheet software shows them as text instead of executing them as formulas. Turn that off if you need the raw value.',
    });
  }

  return {
    output,
    meta: [
      { label: 'Rows', value: formatNumber(body.length) },
      { label: 'Columns', value: formatNumber(headers.length) },
      { label: 'Delimiter', value: delimiter === '\t' ? 'Tab' : delimiter },
      { label: 'Line endings', value: lineEnding === '\n' ? 'LF' : 'CRLF (RFC 4180)' },
      { label: 'Size', value: formatBytes(utf8Bytes(output)) },
    ],
    diagnostics: [{ level: 'ok', message: notes }, ...diagnostics],
    download: { name: 'data.csv', blob: textBlob(output, 'text/csv') },
  };
}

function csvToJson(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some CSV to turn into JSON');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const delimiterChoice = controlText(values, 'delimiter', 'auto');
  const delimiter = delimiterChoice === 'auto' ? detectCsvDelimiter(source) : delimiterChoice === 'tab' ? '\t' : delimiterChoice;
  const parsed = parseCsv(source, delimiter);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];

  if (parsed.rows.length === 0) {
    return { output: '', diagnostics: [{ level: 'warn', message: 'No rows were found. The input parsed as empty CSV.' }] };
  }

  const hasHeader = controlBool(values, 'firstRowIsHeader', true);
  const trimValues = controlBool(values, 'trimValues', false);
  const normalised = parsed.rows.map((row) =>
    row.map((cell) => {
      const value = trimValues ? cell.trim() : cell;
      return value;
    }),
  );

  let headers: string[] = [];
  const dataRows = hasHeader ? normalised.slice(1) : normalised;
  if (hasHeader) {
    const first = normalised[0];
    const used = new Set<string>();
    let suffixed = 0;
    headers = first.map((cell, index) => {
      const base = cell === '' ? `column_${index + 1}` : cell;
      let key = base;
      let suffix = 2;
      while (used.has(key)) {
        key = `${base}_${suffix}`;
        suffix += 1;
      }
      if (key !== base) suffixed += 1;
      used.add(key);
      return key;
    });
    if (first.some((cell) => cell === '')) {
      diagnostics.push({ level: 'warn', message: 'One or more header cells were empty, so those columns were named column_1, column_2 and so on.' });
    }
    if (suffixed > 0) {
      diagnostics.push({ level: 'warn', message: 'The header row contained the same name more than once, so repeats were suffixed (_2, _3) to keep every object key unique.' });
    }
  } else {
    headers = (normalised[0] ?? []).map((_, index) => `column_${index + 1}`);
  }

  const width = headers.length;
  const records: Record<string, string>[] = [];
  let extraCells = 0;
  let shortRows = 0;

  for (const row of dataRows) {
    const record: Record<string, string> = {};
    for (let index = 0; index < width; index += 1) record[headers[index]] = row[index] ?? '';
    if (row.length > width) {
      extraCells += row.length - width;
      for (let index = width; index < row.length; index += 1) record[`column_${index + 1}`] = row[index];
    } else if (row.length < width) {
      shortRows += 1;
    }
    records.push(record);
  }

  if (extraCells > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${plural(extraCells, 'cell')} arrived after the last named column. They were kept as column_5, column_6 and so on rather than discarded, but the row is longer than the header.`,
    });
  }
  if (shortRows > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${plural(shortRows, 'row')} had fewer cells than the header. Missing cells were filled with an empty string, which is what RFC 4180 leaves unspecified.`,
    });
  }

  const output = `${JSON.stringify(records, null, 2)}\n`;
  return {
    output,
    meta: [
      { label: 'Records', value: formatNumber(records.length) },
      { label: 'Columns', value: formatNumber(width) },
      { label: 'Delimiter', value: delimiter === '\t' ? 'Tab (detected)' : delimiterChoice === 'auto' ? `${delimiter} (detected)` : delimiter },
      { label: 'Value types', value: 'All strings — nothing coerced' },
    ],
    diagnostics: [
      { level: 'ok', message: 'Parsed as RFC 4180 CSV, including quoted fields, doubled quotes, embedded newlines and CRLF endings. Values are left as strings on purpose: 007 is not the number 7, and Furtu will not guess.' },
      ...diagnostics,
    ],
    download: { name: 'data.json', blob: textBlob(output, 'application/json') },
  };
}

type XmlTokenKind = 'open' | 'close' | 'empty' | 'text' | 'cdata' | 'comment' | 'pi' | 'declaration';

interface XmlToken {
  kind: XmlTokenKind;
  raw: string;
  name: string;
  line: number;
}

interface XmlTokenize {
  tokens: XmlToken[];
  error?: Diagnostic;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') count += 1;
  return count;
}

/**
 * Re-indents XML by walking a token stream.
 *
 * This is a tokeniser, not a validating parser. Attribute values are scanned
 * with quote tracking so that `<a title="a > b">` is not cut in half, and CDATA
 * and comments are carried through untouched. Entities are left exactly as
 * written, because decoding them would be a guess.
 */
function tokenizeXml(source: string): XmlTokenize {
  const tokens: XmlToken[] = [];
  let i = 0;
  let line = 1;
  let textStart = 0;
  let textLine = 1;

  while (i < source.length) {
    const char = source[i];
    if (char === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (char !== '<') {
      i += 1;
      continue;
    }

    if (i > textStart) tokens.push({ kind: 'text', raw: source.slice(textStart, i), name: '', line: textLine });

    const start = i;
    const startLine = line;
    const advance = (end: number, kind: XmlTokenKind, name: string): void => {
      const raw = source.slice(start, end);
      line += countNewlines(raw);
      i = end;
      textStart = end;
      textLine = line;
      tokens.push({ kind, raw, name, line: startLine });
    };

    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2);
      if (end === -1) return { tokens, error: { level: 'error', message: `Line ${startLine}: a processing instruction starts with “<?” but is never closed with “?>”.` } };
      advance(end + 2, 'pi', /^<\?\s*xml/i.test(source.slice(i, i + 6)) ? 'xml' : '');
      continue;
    }

    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end === -1) return { tokens, error: { level: 'error', message: `Line ${startLine}: a comment starts with “<!--” but is never closed with “-->”.` } };
      advance(end + 3, 'comment', '');
      continue;
    }

    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9);
      if (end === -1) return { tokens, error: { level: 'error', message: `Line ${startLine}: a CDATA section starts with “<![CDATA[” but is never closed with “]]>”.` } };
      advance(end + 3, 'cdata', '');
      continue;
    }

    if (source.startsWith('<!', i)) {
      // DOCTYPE and friends, including an internal subset in square brackets.
      let j = i + 2;
      let brackets = 0;
      while (j < source.length) {
        const inner = source[j];
        if (inner === '[') brackets += 1;
        else if (inner === ']') brackets -= 1;
        else if (inner === '>' && brackets <= 0) break;
        j += 1;
      }
      if (j >= source.length) return { tokens, error: { level: 'error', message: `Line ${startLine}: a declaration starts with “<!” but is never closed with “>”.` } };
      advance(j + 1, 'declaration', '');
      continue;
    }

    if (source.startsWith('</', i)) {
      const end = source.indexOf('>', i);
      if (end === -1) return { tokens, error: { level: 'error', message: `Line ${startLine}: a closing tag starts with “</” but is never closed with “>”.` } };
      advance(end + 1, 'close', source.slice(i + 2, end).trim());
      continue;
    }

    let j = i + 1;
    let quote = '';
    while (j < source.length) {
      const inner = source[j];
      if (quote !== '') {
        if (inner === quote) quote = '';
      } else if (inner === '"' || inner === "'") {
        quote = inner;
      } else if (inner === '>') {
        break;
      }
      j += 1;
    }
    if (j >= source.length) return { tokens, error: { level: 'error', message: `Line ${startLine}: a tag is never closed with “>”. An unclosed quote inside the tag is the usual cause.` } };
    const raw = source.slice(i, j + 1);
    const selfClosing = /\/\s*>$/.test(raw);
    const name = /^<([^\s/>]+)/.exec(raw)?.[1] ?? '';
    advance(j + 1, selfClosing ? 'empty' : 'open', name);
  }

  if (source.length > textStart) tokens.push({ kind: 'text', raw: source.slice(textStart), name: '', line: textLine });
  return { tokens };
}

const XML_PRESERVE = new Set(['pre', 'textarea', 'script', 'style']);

function sortAttributesInTag(raw: string): string {
  const match = /^<([^\s/>]+)([\s\S]*?)(\/?)>$/.exec(raw);
  if (!match) return raw;
  const name = match[1];
  const body = match[2];
  const attributes = body.match(/(?:[^\s"'=]+\s*=\s*"[^"]*"|[^\s"'=]+\s*=\s*'[^']*'|[^\s"'=]+)/g);
  if (!attributes || attributes.length === 0) return raw;
  const sorted = attributes.slice().sort(compareStrings);
  return `<${name} ${sorted.join(' ')}${match[3] === '/' ? ' />' : '>'}`;
}

function xmlFormatter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some XML to re-indent');
  const unit = indentString(controlText(values, 'indent', '2'));
  const sortAttributes = controlBool(values, 'sortAttributes', false);
  const collapseWhitespace = controlBool(values, 'collapseWhitespace', true);

  const tokenized = tokenizeXml(input);
  if (tokenized.error) return errorResult(tokenized.error);
  const tokens = tokenized.tokens;
  if (!tokens.some((token) => token.kind !== 'text')) {
    return {
      output: input,
      diagnostics: [
        {
          level: 'warn',
          message: 'No tags were found, so there was nothing to re-indent. If this is meant to be XML, check that it is not wrapped in quotes or a code block.',
        },
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const stack: string[] = [];
  const preserve: string[] = [];
  let depth = 0;
  const lines: string[] = [];
  let roots = 0;
  let elements = 0;

  for (const token of tokens) {
    const pad = unit.repeat(Math.max(depth, 0));
    switch (token.kind) {
      case 'pi':
      case 'comment':
      case 'declaration':
      case 'cdata':
        lines.push(pad + token.raw);
        break;
      case 'open': {
        roots += 1;
        elements += 1;
        lines.push(pad + (sortAttributes ? sortAttributesInTag(token.raw) : token.raw));
        depth += 1;
        stack.push(token.name);
        if (XML_PRESERVE.has(token.name)) preserve.push(token.name);
        break;
      }
      case 'empty':
        roots += 1;
        elements += 1;
        lines.push(pad + (sortAttributes ? sortAttributesInTag(token.raw) : token.raw));
        break;
      case 'close': {
        const open = stack.pop();
        const wasPreserving = XML_PRESERVE.has(token.name);
        if (wasPreserving) preserve.pop();
        depth = Math.max(depth - 1, 0);
        if (open !== token.name) {
          diagnostics.push({
            level: 'warn',
            message: `Line ${token.line}: </${token.name}> closes <${open ?? 'nothing'}>${open ? `, which opened <${open}>` : ''}. Furtu re-indents what it is given and does not try to repair the nesting, so the output preserves the original order.`,
          });
        }
        lines.push(unit.repeat(Math.max(depth, 0)) + token.raw);
        break;
      }
      case 'text': {
        if (preserve.length > 0) {
          if (token.raw !== '') lines.push(token.raw.replace(/\s+$/, ''));
          break;
        }
        if (token.raw.trim() === '') break;
        const value = collapseWhitespace ? token.raw.trim().replace(/\s+/g, ' ') : token.raw.replace(/^\n+|\n+$/g, '');
        lines.push(pad + value);
        break;
      }
    }
  }

  if (stack.length > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${plural(stack.length, 'tag')} ${stack.length === 1 ? 'is' : 'are'} never closed: ${stack.join(', ')}. The closing tags were not invented, because guessing them can change the meaning of a document.`,
    });
  }
  if (roots > 1) {
    diagnostics.push({ level: 'warn', message: `${plural(roots, 'root element')} were found. A well-formed XML document has exactly one, so this is probably several documents concatenated together.` });
  }

  const output = `${lines.join('\n')}\n`;
  return {
    output,
    meta: [
      { label: 'Elements', value: formatNumber(elements) },
      { label: 'Indent', value: unit === '\t' ? 'Tab' : `${unit.length} spaces` },
      { label: 'Attributes sorted', value: sortAttributes ? 'Yes' : 'No' },
      { label: 'Size', value: formatBytes(utf8Bytes(output)) },
    ],
    diagnostics: [
      { level: 'ok', message: 'Re-indented. Text content, entities, comments and CDATA are left exactly as written, and the content of pre, textarea, script and style elements is never re-wrapped.' },
      ...diagnostics,
    ],
    download: { name: 'formatted.xml', blob: textBlob(output, 'application/xml') },
  };
}

function base64Encoder(input: string, values: ControlValues): TextResult {
  if (input === '') return nothingToDo('some text to encode');
  const urlSafe = controlBool(values, 'urlSafe', false);
  const lineWrap = controlBool(values, 'lineWrap', false);
  const bytes = utf8.encode(input);

  let encoded = bytesToBase64(bytes);
  if (urlSafe) encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (lineWrap) {
    const width = 76;
    const chunks: string[] = [];
    for (let i = 0; i < encoded.length; i += width) chunks.push(encoded.slice(i, i + width));
    encoded = chunks.join('\r\n');
  }

  return {
    output: encoded,
    meta: [
      { label: 'Input', value: `${plural(input.length, 'character')} / ${formatBytes(bytes.length)}` },
      { label: 'Encoded', value: `${plural(encoded.replace(/\r\n/g, '').length, 'character')}` },
      { label: 'Growth', value: `${(4 / 3).toFixed(2)}× plus padding — Base64 always adds a third` },
      { label: 'Alphabet', value: urlSafe ? 'URL-safe (- and _, no padding)' : lineWrap ? 'Standard, wrapped at 76 characters (MIME)' : 'Standard (+ and /, padded with =)' },
    ],
    diagnostics: [
      {
        level: 'ok',
        message: 'Encoded as UTF-8 first, then Base64. That order matters: Base64 has no concept of a character, and encoding the string directly corrupts anything outside Latin-1, including emoji and most non-Latin scripts.',
      },
    ],
    download: { name: 'encoded.txt', blob: textBlob(encoded, 'text/plain') },
  };
}

function base64Decoder(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some Base64 to decode');
  const urlSafe = controlBool(values, 'urlSafe', false);
  const stripWhitespace = controlBool(values, 'stripWhitespace', true);
  const charset = controlText(values, 'charset', 'utf-8');

  const read = base64ToBytes(input, urlSafe, stripWhitespace);
  if (read.error || !read.bytes) return errorResult({ level: 'error', message: read.error ?? 'That value could not be decoded.' });

  const bytes = read.bytes;
  let output: string;
  let lossy = false;
  if (charset === 'latin1') {
    output = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  } else {
    try {
      output = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      lossy = true;
      output = new TextDecoder('utf-8').decode(bytes);
    }
  }

  const diagnostics: Diagnostic[] = [
    { level: 'ok', message: `Decoded ${plural(bytes.length, 'byte')} from ${plural(input.trim().length, 'character')} of Base64.` },
  ];
  if (lossy) {
    diagnostics.push({
      level: 'warn',
      message: 'These bytes are not valid UTF-8, so some characters were replaced. That usually means the original was Latin-1 (ISO-8859-1) or a binary blob rather than text. Switch the character set to Latin-1 to read it byte for byte.',
    });
  }

  return {
    output,
    meta: [
      { label: 'Bytes', value: `${formatNumber(bytes.length)} (${formatBytes(bytes.length)})` },
      { label: 'Characters', value: formatNumber(output.length) },
      { label: 'Character set', value: lossy ? 'UTF-8, lossy' : charset === 'latin1' ? 'Latin-1, one byte per character' : 'UTF-8, decoded strictly' },
    ],
    diagnostics,
    download: { name: 'decoded.txt', blob: textBlob(output, 'text/plain') },
  };
}

function urlEncoder(input: string, values: ControlValues): TextResult {
  if (input === '') return nothingToDo('a URL or a piece of text to encode');
  const target = controlText(values, 'target', 'component');
  const upperCase = controlBool(values, 'upperCaseHex', false);

  let output: string;
  let functionUsed: string;
  if (target === 'url') {
    output = encodeURI(input);
    functionUsed = 'encodeURI()';
  } else {
    output = encodeURIComponent(input);
    functionUsed = 'encodeURIComponent()';
  }
  if (upperCase) output = output.replace(/%[0-9A-Fa-f]{2}/g, (match) => match.toUpperCase());

  const diagnostics: Diagnostic[] = [];
  if (/%[0-9A-Fa-f]{2}/.test(input) && target === 'component') {
    diagnostics.push({
      level: 'warn',
      message: 'The input already contains percent-escapes. Encoding it again will double-encode it: %20 becomes %2520, which the receiving server will read as the literal text “%20”. Decode before encoding if that is what you meant.',
    });
  }
  if (target === 'url' && /[?#&=]/.test(input)) {
    diagnostics.push({ level: 'ok', message: 'Full-URL mode keeps the structural characters — ?, #, &, =, /, :, +, $ and , — intact so the URL still parses. Use Component mode for a single value such as a query parameter.' });
  }

  return {
    output,
    meta: [
      { label: 'Function', value: functionUsed },
      { label: 'Input length', value: plural(input.length, 'character') },
      { label: 'Output length', value: plural(output.length, 'character') },
      { label: 'Changed', value: output === input ? 'Nothing needed encoding' : plural(countDifferent(input, output), 'character') + ' escaped' },
    ],
    diagnostics: [
      { level: 'ok', message: 'encodeURIComponent() escapes everything a URL cannot carry, including /, ? and &, so the result is safe as one query parameter. encodeURI() leaves those separators alone, so it is safe for a whole URL. Furtu never sends the value anywhere.' },
      ...diagnostics,
    ],
  };
}

function countDifferent(before: string, after: string): number {
  let count = 0;
  const length = Math.min(before.length, after.length);
  for (let i = 0; i < length; i += 1) if (before[i] !== after[i]) count += 1;
  return count + Math.abs(before.length - after.length);
}

function urlDecoder(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('an encoded URL to decode');
  const plusAsSpace = controlBool(values, 'plusAsSpace', true);
  const repeated = controlBool(values, 'decodeRepeatedly', false);

  const first = percentDecode(input.trim(), plusAsSpace);
  if (first.error && first.text === undefined) return errorResult({ level: 'error', message: first.error });
  let output = first.text ?? '';
  let passes = 1;
  const diagnostics: Diagnostic[] = [];

  if (repeated) {
    let previous = output;
    for (let pass = 2; pass <= 4 && /%[0-9A-Fa-f]{2}/.test(output); pass += 1) {
      const next = percentDecode(output, plusAsSpace);
      if (next.text === undefined || next.text === previous) break;
      previous = next.text;
      output = next.text;
      passes += 1;
    }
    if (passes === 1) diagnostics.push({ level: 'warn', message: 'Nothing was double-encoded, so repeated decoding changed nothing.' });
    else diagnostics.push({ level: 'ok', message: `Decoded ${passes} times. Anything above the last pass is left encoded, because Furtu will not keep peeling layers off a string that may not have any.` });
  }

  if (first.error) diagnostics.push({ level: 'warn', message: first.error });
  if (plusAsSpace && input.includes('+')) {
    diagnostics.push({ level: 'ok', message: 'Every “+” was read as a space, which is correct for an application/x-www-form-urlencoded query string. Turn that off if the plus sign is a literal plus.' });
  }
  const residual = output.match(/%[0-9A-Fa-f]{2}/g);
  if (!repeated && residual) {
    diagnostics.push({ level: 'warn', message: `${plural(residual.length, 'escape')} ${residual.length === 1 ? 'remains' : 'remain'} in the result, so the input was probably encoded more than once.` });
  }

  return {
    output,
    meta: [
      { label: 'Passes', value: String(passes) },
      { label: 'Decoded bytes', value: first.bytes !== undefined ? formatNumber(first.bytes) : '—' },
      { label: 'Changed', value: output === input.trim() ? 'Nothing needed decoding' : 'Yes' },
    ],
    diagnostics: [{ level: 'ok', message: 'Percent-escapes were collected as bytes and decoded as UTF-8 in one step, so multi-byte characters survive instead of turning into mojibake.' }, ...diagnostics],
  };
}

const SENSITIVE_KEY = /(pass|secret|token|api[-_]?key|auth|credential|session|private)/i;

function maskSensitiveValues(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (Array.isArray(value)) return value.map((item) => maskSensitiveValues(item, depth + 1));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) && (typeof child === 'string' || typeof child === 'number')) {
        out[key] = `redacted (${String(child).length} characters)`;
      } else {
        out[key] = maskSensitiveValues(child, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function jwtDecoder(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a JSON Web Token to inspect');
  const token = input.trim().replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) {
    return errorResult({
      level: 'error',
      message: `A JSON Web Token has three dot-separated parts: header, payload and signature. This one has ${parts.length === 1 ? 'no dots' : plural(parts.length, 'part')}. If it is a JWS in JWE form it will have five parts, which Furtu does not decrypt.`,
    });
  }
  if (/[A-Za-z0-9\-_]/.test(parts[0]) && /[A-Za-z0-9\-_]/.test(parts[1]) === false) {
    return errorResult({ level: 'error', message: 'The header and payload should be Base64URL text. If the token has been truncated, or copied with the middle missing, it cannot be read.' });
  }

  const mask = controlBool(values, 'maskSensitive', true);
  const sections: string[] = [];
  const meta: { label: string; value: string }[] = [];
  const diagnostics: Diagnostic[] = [];
  let algorithm = 'unknown';
  let payload: unknown;

  const readSegment = (segment: string, label: string): { value?: unknown; error?: Diagnostic } => {
    const read = base64ToBytes(segment, true, true);
    if (read.error || !read.bytes) return { error: { level: 'error', message: `The ${label} could not be decoded: ${read.error ?? 'invalid Base64URL.'}` } };
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes);
      return { value: JSON.parse(text) as unknown };
    } catch (error) {
      const problem = locateJsonError('', error);
      return { error: { level: 'error', message: `The ${label} decoded to text but is not JSON, so this may not be a JWT. ${problem.prose}.` } };
    }
  };

  const header = readSegment(parts[0], 'header');
  if (header.error) return errorResult(header.error);
  const body = readSegment(parts[1], 'payload');
  if (body.error) return errorResult(body.error);
  payload = body.value;

  if (isPlainObject(header.value)) {
    algorithm = String(header.value.alg ?? 'not stated');
    sections.push(`Header\n${JSON.stringify(mask ? maskSensitiveValues(header.value) : header.value, null, 2)}`);
  } else {
    sections.push(`Header\n${JSON.stringify(header.value, null, 2)}`);
  }
  sections.push(`Payload\n${JSON.stringify(mask ? maskSensitiveValues(payload) : payload, null, 2)}`);
  sections.push(`Signature\n${parts[2] === '' ? '(empty — the token is signed with the "alg: none" algorithm, which no server should accept)' : `${parts[2].slice(0, 24)}${parts[2].length > 24 ? '…' : ''} (${plural(parts[2].length, 'character')})`}`);

  if (isPlainObject(payload)) {
    const exp = typeof payload.exp === 'number' ? payload.exp : Number.NaN;
    if (Number.isFinite(exp)) {
      const expiry = new Date(exp * 1000);
      const now = Date.now();
      const diff = exp * 1000 - now;
      meta.push({ label: 'Expires', value: expiry.toISOString().replace('.000', '') });
      if (Number.isNaN(expiry.getTime())) {
        diagnostics.push({ level: 'warn', message: 'The exp claim is not a date JavaScript can represent, so the expiry is shown as the raw number.' });
      } else if (diff <= 0) {
        diagnostics.push({ level: 'warn', message: `Expired ${relativeTime(-diff)}. An expired token is still worth reading, but no server should accept it.` });
      } else {
        diagnostics.push({ level: 'ok', message: `Valid for another ${relativeTime(diff)} if the server honours exp.` });
      }
    }
    for (const claim of ['iss', 'sub', 'aud', 'iat', 'nbf', 'jti']) {
      if (payload[claim] === undefined) continue;
      const value = payload[claim];
      const shown = mask && SENSITIVE_KEY.test(claim) ? 'redacted' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      meta.push({ label: claim, value: claim === 'iat' || claim === 'nbf' ? `${shown} (${new Date(Number(value) * 1000).toISOString().replace('.000', '')})` : shown });
    }
  }

  meta.unshift({ label: 'Algorithm', value: algorithm }, { label: 'Parts', value: '3 of 3' });

  const output = `${sections.join('\n\n')}\n\n${meta.map((chip) => `${chip.label}: ${chip.value}`).join('\n')}`;

  diagnostics.unshift(
    {
      level: 'warn',
      message: 'The signature was NOT verified. Anyone can write any header and payload they like and join them with three dots. Nothing on this page is proof of who the token belongs to, and the contents must never be used to make an authentication decision.',
    },
    { level: 'ok', message: 'Everything above was computed in this tab from the text you pasted. The token was not transmitted, stored or logged.' },
  );

  return { output, meta, diagnostics };
}

function relativeTime(milliseconds: number): string {
  const seconds = Math.round(Math.abs(milliseconds) / 1000);
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let value = seconds;
  let label = 'second';
  for (const [factor, name] of units) {
    label = name;
    if (value < factor) break;
    value = Math.floor(value / factor);
  }
  const rounded = value < 10 ? roundTo(value, 1) : Math.round(value);
  return `${rounded} ${label}${rounded === 1 ? '' : 's'}`;
}

function uuidGenerator(_input: string, values: ControlValues, ctx: ToolContext): TextResult {
  const count = clamp(Math.round(controlNumber(values, 'count', 5)), 1, 1000);
  const upperCase = controlBool(values, 'uppercase', false);
  const braces = controlBool(values, 'braces', false);

  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i % 100 === 0) ctx.onProgress(i / count, `Generating ${i} of ${count}`);
    ids.push(formatUuidV4(upperCase, braces));
  }
  ctx.onProgress(1);

  const output = ids.join('\n');
  return {
    output,
    meta: [
      { label: 'Generated', value: plural(count, 'identifier') },
      { label: 'Version', value: 'UUID v4 (random)' },
      { label: 'Entropy', value: '122 bits each, from crypto.getRandomValues' },
      { label: 'Format', value: braces ? 'Braced' : 'Plain, hyphenated' },
    ],
    diagnostics: [
      { level: 'ok', message: 'Version and variant bits are set correctly, so these are well-formed v4 UUIDs. Furtu uses the browser cryptographic random source, not a general-purpose pseudo-random generator.' },
      { level: 'warn', message: 'A v4 UUID is random rather than sequential, which is the point: it cannot be guessed from its neighbours and does not leak how many records exist. Do not use it as a secret key.' },
    ],
    download: { name: 'uuids.txt', blob: textBlob(output, 'text/plain') },
  };
}

function formatUuidV4(upperCase: boolean, braces: boolean): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1 (RFC 4122)
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  const dashed = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const value = upperCase ? dashed.toUpperCase() : dashed;
  return braces ? `{${value}}` : value;
}

const MAX_REGEX_MATCHES = 5000;

interface RegexHit {
  index: number;
  text: string;
  groups: (string | undefined)[];
  named: [string, string | undefined][];
}

function regexTester(input: string, values: ControlValues, ctx: ToolContext): TextResult {
  const pattern = controlText(values, 'pattern', '').trim();
  if (pattern === '') return nothingToDo('a regular expression, plus the text you want to test it against');
  if (input === '') return { output: '', diagnostics: [{ level: 'warn', message: 'The pattern is ready, but there is no subject text to run it against yet. Paste some text into the box and the matches appear immediately.' }] };

  const chosenFlags = controlText(values, 'flags', 'g');
  const showGroups = controlBool(values, 'showGroups', true);
  const cap = clamp(Math.round(controlNumber(values, 'maxMatches', 1000)), 1, MAX_REGEX_MATCHES);
  const diagnostics: Diagnostic[] = [];

  // A match list is meaningless without /g, so it is added rather than
  // returning a single hit and pretending that is what the user asked for.
  const flags = chosenFlags.includes('g') ? chosenFlags : `${chosenFlags}g`;

  let expression: RegExp;
  try {
    expression = new RegExp(pattern, flags);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const reason = raw.replace(/^Invalid regular expression:\s*/, '').replace(/^.*?:\s*/, (match) => (match.length > 12 ? '' : match));
    return errorResult({
      level: 'error',
      message: `That pattern did not compile. ${reason.trim() || 'The engine rejected it.'} Common causes: an unclosed bracket, a trailing backslash, or a quantifier with nothing to repeat such as * at the start.`,
    });
  }

  const nested = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/.test(pattern);
  if (nested) {
    diagnostics.push({
      level: 'warn',
      message: 'This pattern nests a quantifier inside a quantifier — the shape behind catastrophic backtracking. A pattern like (a*)* applied to a long run of characters that ultimately fails can lock this tab for minutes. Furtu can bound how many matches it collects, but it cannot interrupt a regular expression that is already running, because JavaScript offers no way to stop one.',
    });
  }

  const hits: RegexHit[] = [];
  let truncated = false;
  expression.lastIndex = 0;
  let match = expression.exec(input);

  while (match !== null) {
    hits.push({
      index: match.index,
      text: match[0],
      groups: match.slice(1),
      named: Object.entries(match.groups ?? {}),
    });

    /*
     * Two ways a global-match loop can stop being a loop, both of which are a
     * denial-of-service risk in the browser:
     *
     *  1. A pattern that can match the empty string leaves `lastIndex` exactly
     *     where it was, so the next exec() returns the same position and the
     *     loop never terminates. Furtu advances past the match itself.
     *  2. A subject of a few hundred kilobytes with a pattern that matches
     *     often produces tens of thousands of hits and a result the browser
     *     cannot lay out. The cap stops the collection, and the cap is visible
     *     in the controls rather than hidden.
     */
    if (match[0].length === 0) {
      expression.lastIndex += 1;
      if (expression.lastIndex > input.length) break;
    }

    if (hits.length >= cap) {
      truncated = true;
      break;
    }
    if (hits.length % 500 === 0) {
      if (ctx.signal.aborted) break;
      ctx.onProgress(Math.min(0.9, hits.length / cap), `${hits.length} matches`);
    }
    match = expression.exec(input);
  }
  ctx.onProgress(1);

  if (truncated) {
    diagnostics.push({ level: 'warn', message: `Stopped after ${plural(cap, 'match', 'matches')}. The subject text may contain more; raise the limit above, or narrow the pattern.` });
  }

  const columns = showGroups && hits.some((hit) => hit.groups.length > 0);
  const nameColumn = hits.some((hit) => hit.named.length > 0);
  const rows = hits.map((hit, position) => {
    const parts = [String(position + 1).padStart(3, ' '), `${hit.index}`.padStart(7, ' '), quoteCell(hit.text)];
    if (columns) parts.push(hit.groups.length === 0 ? '—' : hit.groups.map((group) => quoteCell(group ?? '')).join(' | '));
    if (nameColumn) parts.push(hit.named.length === 0 ? '—' : hit.named.map(([name, value]) => `${name}=${quoteCell(value ?? '')}`).join(' '));
    return parts.join('  ');
  });

  const header = ['  #', '  index', 'match', ...(columns ? ['capturing groups'] : []), ...(nameColumn ? ['named groups'] : [])].join('  ');
  const namedList = expression.source.match(/\(\?<([A-Za-z][A-Za-z0-9]*)>/g)?.map((name) => name.slice(3, -1)) ?? [];
  // `exec` against an empty string returns the group structure even when
  // nothing matched, which is the only cheap way to count capturing groups.
  const emptyMatch = new RegExp(pattern).exec('');
  const groupCount = emptyMatch ? emptyMatch.length - 1 : 0;

  const output = [
    `/${pattern}/${flags}`,
    '',
    `${plural(hits.length, 'match', 'matches')} in ${plural(input.length, 'character')}.${groupCount > 0 ? ` The pattern has ${plural(groupCount, 'capturing group')}.` : ''}${namedList.length > 0 ? ` Named: ${namedList.join(', ')}.` : ''}`,
    '',
    header,
    ...rows,
  ].join('\n');

  return {
    output: hits.length === 0 ? `/${pattern}/${flags}\n\nNo matches.` : output,
    meta: [
      { label: 'Matches', value: truncated ? `${hits.length} (capped)` : formatNumber(hits.length) },
      { label: 'First match at', value: hits.length > 0 ? `index ${hits[0].index}` : '—' },
      { label: 'Flags', value: `/${flags}` },
      { label: 'Named groups', value: namedList.length > 0 ? namedList.join(', ') : 'None' },
    ],
    diagnostics: [
      { level: hits.length > 0 ? 'ok' : 'warn', message: hits.length > 0 ? 'Matched in this tab only. Furtu never contacts a regex service.' : 'The pattern is valid but matched nothing in the subject text. Check the flags — a capital-sensitive pattern and one with the i flag are not the same thing.' },
      ...diagnostics,
    ],
  };
}

function quoteCell(value: string): string {
  const shortened = value.length > 80 ? `${value.slice(0, 77)}…` : value;
  return JSON.stringify(shortened);
}

function timestampConverter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a Unix timestamp or an ISO 8601 date');
  const raw = input.trim();
  const assume = controlText(values, 'assumeUnit', 'auto');
  const showRelative = controlBool(values, 'showRelative', true);
  const diagnostics: Diagnostic[] = [];

  let milliseconds: number;
  let interpretation = 'ISO 8601 string';

  const numeric = /^[+-]?\d+(?:\.\d+)?$/.test(raw);
  if (numeric) {
    const value = Number(raw);
    let unit = assume;
    if (assume === 'auto') {
      const magnitude = Math.abs(value);
      // 1e9 seconds is 2001, 1e12 milliseconds is 2001. Ten digits is the
      // current era in seconds; thirteen is the current era in milliseconds.
      if (magnitude === 0) unit = 'seconds';
      else if (magnitude < 1e11) unit = 'seconds';
      else if (magnitude < 1e14) unit = 'milliseconds';
      else unit = 'milliseconds';
      if (magnitude >= 1e11 && magnitude < 1e14) {
        diagnostics.push({
          level: 'ok',
          message: `Read as milliseconds: ${formatNumber(Math.round(magnitude))} has thirteen digits, which is the current era in milliseconds. A value of this size read as seconds would be the year ${new Date(value * 1000).getUTCFullYear()}.`,
        });
      } else if (magnitude > 0 && magnitude < 1e11) {
        diagnostics.push({
          level: 'ok',
          message: `Read as seconds: ${formatNumber(Math.round(magnitude))} has at most eleven digits, which is the current era in seconds. Read as milliseconds it would be ${new Date(value).toISOString().slice(0, 10)}.`,
        });
      }
    }
    milliseconds = unit === 'seconds' ? value * 1000 : value;
    interpretation = `Unix ${unit}`;
  } else {
    milliseconds = Date.parse(raw);
    if (!Number.isNaN(milliseconds) && !/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      diagnostics.push({ level: 'warn', message: 'That is not ISO 8601, so it was matched against the browser’s looser date parser. Those rules differ between browsers and are not part of any standard.' });
    }
  }

  if (Number.isNaN(milliseconds)) {
    return errorResult({
      level: 'error',
      message: `“${raw}” is not a date Furtu can read. Use a Unix timestamp in seconds or milliseconds (for example 1767225600 or 1767225600000), or an ISO 8601 date such as 2026-01-01T00:00:00Z.`,
    });
  }
  if (Math.abs(milliseconds) > 8.64e15) {
    return errorResult({ level: 'error', message: 'That timestamp is outside the range JavaScript dates can represent, which runs from 271821 BC to 275760 AD. Check for a missing factor of 1,000.' });
  }

  const date = new Date(milliseconds);
  const seconds = Math.floor(milliseconds / 1000);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localOffsetMinutes = -date.getTimezoneOffset();
  const offsetText = `UTC${localOffsetMinutes >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(localOffsetMinutes) / 60)).padStart(2, '0')}:${String(Math.abs(localOffsetMinutes) % 60).padStart(2, '0')}`;

  const lines = [
    `ISO 8601 (UTC)   ${date.toISOString()}`,
    `ISO 8601 (ms)    ${milliseconds}`,
    `Unix seconds     ${seconds}`,
    `Unix ms          ${Math.round(milliseconds)}`,
    `Local            ${date.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'medium' })}`,
    `UTC              ${date.toUTCString()}`,
    `Time zone        ${localZone} (${offsetText})`,
    `Day of week      ${date.toLocaleDateString('en-GB', { weekday: 'long' })}`,
  ];
  if (showRelative) lines.push(`Relative         ${relativeTime(Date.now() - milliseconds)} ${milliseconds <= Date.now() ? 'ago' : 'from now'}`);

  return {
    output: `${lines.join('\n')}\n\nRead the input as ${interpretation}.`,
    meta: [
      { label: 'Unix seconds', value: formatNumber(seconds) },
      { label: 'Unix milliseconds', value: formatNumber(Math.round(milliseconds)) },
      { label: 'ISO 8601', value: date.toISOString() },
      { label: 'Your time zone', value: `${localZone} (${offsetText})` },
    ],
    diagnostics: [
      { level: 'ok', message: 'Seconds and milliseconds are the usual source of confusion: the same instant is 1767225600 and 1767225600000. Furtu shows both, and says which one it assumed.' },
      ...diagnostics,
    ],
  };
}

const HASH_ALGORITHMS = [
  { id: 'SHA-256', label: 'SHA-256 (recommended)', bits: 256 },
  { id: 'SHA-512', label: 'SHA-512', bits: 512 },
  { id: 'SHA-384', label: 'SHA-384', bits: 384 },
  { id: 'SHA-1', label: 'SHA-1 (legacy, not for security)', bits: 160 },
];

async function hashGenerator(input: string, values: ControlValues): Promise<TextResult> {
  if (input === '') return nothingToDo('the text you want to hash');
  if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined' || typeof crypto.subtle.digest !== 'function') {
    return errorResult({
      level: 'error',
      message: 'The Web Crypto API is unavailable, so no hash can be computed here. It needs a secure context: https, or http on localhost. An older browser without SubtleCrypto will not work either.',
    });
  }

  const chosen = controlText(values, 'algorithm', 'SHA-256');
  const upperCase = controlText(values, 'case', 'lower') === 'upper';
  const targets = chosen === 'all' ? HASH_ALGORITHMS : HASH_ALGORITHMS.filter((algorithm) => algorithm.id === chosen);
  if (targets.length === 0) return errorResult({ level: 'error', message: `“${chosen}” is not an algorithm Furtu can compute.` });

  const bytes = utf8.encode(input);
  const started = performance.now();
  const results: { label: string; digest: string; bits: number }[] = [];
  for (const algorithm of targets) {
    const buffer = await crypto.subtle.digest(algorithm.id, bytes);
    const digest = Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
    results.push({ label: algorithm.label, digest: upperCase ? digest.toUpperCase() : digest, bits: algorithm.bits });
  }
  const elapsed = performance.now() - started;

  const output = results.map((result) => `${result.label}\n${result.digest}`).join('\n\n');
  const primary = results[0];

  return {
    output,
    meta: [
      { label: 'Algorithms', value: results.map((result) => result.label.split(' ')[0]).join(', ') },
      { label: 'Digest length', value: `${primary.bits} bits (${primary.bits / 8} bytes)` },
      { label: 'Input', value: `${plural(input.length, 'character')} / ${formatBytes(bytes.length)}` },
      { label: 'Time', value: `${elapsed < 1 ? '<1' : Math.round(elapsed)} ms` },
    ],
    diagnostics: [
      { level: 'ok', message: 'The text was encoded as UTF-8 and hashed with the browser’s Web Crypto implementation. There is no server round trip, and nothing about the input was logged.' },
      ...(targets.some((algorithm) => algorithm.id === 'SHA-1')
        ? [
            {
              level: 'warn' as const,
              message: 'SHA-1 is included because it still appears in older systems. It is broken for security purposes: collisions can be produced deliberately and cheaply, so it must not be used for signatures, certificates or password storage. Use SHA-256 or better.',
            },
          ]
        : []),
      { level: 'warn', message: 'A plain hash is not a password hash. The same input always gives the same digest, so anyone who has the digest list can confirm a guess. Passwords need a slow, salted function such as Argon2, scrypt or bcrypt.' },
    ],
  };
}

function colorConverter(input: string, values: ControlValues): TextResult {
  const swatch = controlText(values, 'swatch', '');
  if (input.trim() === '' && swatch.trim() === '') {
    return nothingToDo('a colour such as #2563eb, rgb(37, 99, 235) or hsl(221, 83%, 53%) — or pick one with the colour control below');
  }
  const source = input.trim() === '' ? swatch : input;

  const declared = controlText(values, 'inputFormat', 'auto');
  const decimals = clamp(Math.round(controlNumber(values, 'decimals', 2)), 0, 6);
  const includeNamed = controlBool(values, 'includeNamed', true);

  const parsed = parseColor(source, declared);
  if (parsed.error) return errorResult({ level: 'error', message: parsed.error });
  const color = parsed.color as Rgba;

  const hsl = rgbToHsl(color);
  const hsv = rgbToHsv(color);
  const percent = (value: number): string => `${roundTo(value * 100, decimals)}%`;
  const alphaText = color.a >= 1 ? '' : `, ${roundTo(color.a, 3)}`;

  const lines = [
    `HEX      ${toHex(color, false)}`,
    ...(color.a < 1 ? [`HEX + A  ${toHex(color, true)}`] : []),
    `RGB      rgb(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)})`,
    `RGBA     rgba(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)}${alphaText})`,
    `HSL      hsl(${Math.round(hsl.h)}, ${percent(hsl.s)}, ${percent(hsl.l)})`,
    `HSLA     hsla(${Math.round(hsl.h)}, ${percent(hsl.s)}, ${percent(hsl.l)}${alphaText})`,
    `HSV      hsv(${Math.round(hsv.h)}, ${percent(hsv.s)}, ${percent(hsv.v)})`,
    `Channel values`,
    `         R ${clampChannel(color.r)}   G ${clampChannel(color.g)}   B ${clampChannel(color.b)}${color.a < 1 ? `   A ${roundTo(color.a, 3)}` : ''}`,
  ];

  let nearest = '';
  if (includeNamed) {
    let best: { name: string; distance: number } | null = null;
    for (const entry of NAMED_COLORS) {
      const digits = entry.hex.slice(1);
      const target = {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: 1,
      };
      const distance = Math.sqrt((color.r - target.r) ** 2 + (color.g - target.g) ** 2 + (color.b - target.b) ** 2);
      if (!best || distance < best.distance) best = { name: entry.name, distance };
    }
    if (best) {
      const exact = best.distance < 1.5;
      lines.push(`Nearest name ${exact ? 'is exactly' : 'is'} ${best.name} (${NAMED_COLORS.find((entry) => entry.name === best?.name)?.hex})`);
    }
  }

  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const onWhite = contrastRatio(color, white);
  const onBlack = contrastRatio(color, black);

  return {
    output: `${lines.join('\n')}`,
    meta: [
      { label: 'Swatch', value: toHex(color, true) },
      { label: 'Read as', value: parsed.detected ?? 'unknown' },
      { label: 'Contrast on white', value: `${onWhite.toFixed(2)}:1 ${onWhite >= 4.5 ? '(AA text)' : onWhite >= 3 ? '(AA large text only)' : '(fails AA)'}` },
      { label: 'Contrast on black', value: `${onBlack.toFixed(2)}:1 ${onBlack >= 4.5 ? '(AA text)' : onBlack >= 3 ? '(AA large text only)' : '(fails AA)'}` },
    ],
    diagnostics: [
      { level: 'ok', message: `Converted from ${parsed.detected ?? 'the input format'}. The contrast figures follow the WCAG 2.1 formula for relative luminance, which is what a screen reader and a colour-blind user end up relying on.` },
      ...(color.a < 1
        ? [{ level: 'warn' as const, message: 'This colour is not fully opaque. The contrast figures ignore the alpha, because the real result depends on whatever is behind it.' }]
        : []),
    ],
    download: { name: 'colour.txt', blob: textBlob(`${lines.join('\n')}\n`, 'text/plain') },
  };
}

/* --- case conversion -------------------------------------------------- */

const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'per', 'the', 'to', 'up', 'via', 'vs', 'with']);

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/**
 * Splits a phrase into words for the identifier styles.
 *
 * An apostrophe or a right single quote inside a word is kept, so don't and
 * O'Brien each stay whole. Everything else that is not a letter or a digit is a
 * boundary: spaces, hyphens, underscores, slashes, dots and commas.
 */
function splitWords(text: string): string[] {
  const spaced = text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2');
  return [...spaced.matchAll(WORD)].map((match) => match[0]);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function sentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^\s*\p{L})|([.!?…]\s+\p{L})/gu, (match) => match.toUpperCase());
}

function titleCase(words: string[]): string {
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index !== 0 && index !== words.length - 1 && MINOR_WORDS.has(lower)) return lower;
      return capitalise(lower);
    })
    .join(' ');
}

function alternatingCase(text: string): string {
  let toggle = false;
  let out = '';
  for (const char of text) {
    out += toggle ? char.toUpperCase() : char.toLowerCase();
    toggle = !toggle;
  }
  return out;
}

function inverseCase(text: string): string {
  let out = '';
  for (const char of text) {
    out += char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
  }
  return out;
}

function textCaseConverter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some text to re-case');
  const selected = controlText(values, 'variant', 'title');
  const showAll = controlBool(values, 'showAll', true);

  const words = splitWords(input);
  const variants: { id: string; label: string; value: string }[] = [
    { id: 'sentence', label: 'Sentence case', value: sentenceCase(input) },
    { id: 'lower', label: 'lowercase', value: input.toLowerCase() },
    { id: 'upper', label: 'UPPERCASE', value: input.toUpperCase() },
    { id: 'title', label: 'Title Case', value: titleCase(words) },
    { id: 'camel', label: 'camelCase', value: words.map((word, index) => (index === 0 ? word.toLowerCase() : capitalise(word.toLowerCase()))).join('') },
    { id: 'pascal', label: 'PascalCase', value: words.map((word) => capitalise(word.toLowerCase())).join('') },
    { id: 'snake', label: 'snake_case', value: words.map((word) => word.toLowerCase()).join('_') },
    { id: 'kebab', label: 'kebab-case', value: words.map((word) => word.toLowerCase()).join('-') },
    { id: 'constant', label: 'CONSTANT_CASE', value: words.map((word) => word.toUpperCase()).join('_') },
    { id: 'alternating', label: 'aLtErNaTiNg', value: alternatingCase(input) },
    { id: 'inverse', label: 'iNVERSE cASE', value: inverseCase(input) },
  ];

  const lines: string[] = showAll
    ? variants.map((variant) => `${variant.label.padEnd(16, ' ')}${variant.value}`)
    : [(variants.find((variant) => variant.id === selected) ?? variants[3]).value];

  const output = showAll ? lines.join('\n') : lines[0];
  return {
    output,
    meta: [
      { label: 'Variants', value: showAll ? `All ${variants.length}` : variants.find((variant) => variant.id === selected)?.label ?? 'Title Case' },
      { label: 'Words found', value: plural(words.length, 'word') },
      { label: 'Input length', value: plural(input.length, 'character') },
    ],
    diagnostics: [
      { level: 'ok', message: 'Words are split on whitespace, punctuation, hyphens, underscores, slashes and existing camelCase humps, so “parseHTTPResponse_v2” becomes four words rather than one.' },
      { level: 'warn', message: 'Title case is a style, not a standard. Furtu lower-cases articles, prepositions and conjunctions unless they are the first or last word, which is one of several conventions in use.' },
    ],
    download: { name: 'recased.txt', blob: textBlob(`${output}\n`, 'text/plain') },
  };
}

/* --- markdown --------------------------------------------------------- */

type MdInline =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'break' }
  | { kind: 'strong' | 'em' | 'del'; children: MdInline[] }
  | { kind: 'link'; children: MdInline[]; href: string; external: boolean };

type MdBlock =
  | { kind: 'heading'; level: number; children: MdInline[] }
  | { kind: 'paragraph'; children: MdInline[] }
  | { kind: 'code'; language: string; value: string }
  | { kind: 'list'; ordered: boolean; items: MdInline[][] }
  | { kind: 'quote'; children: MdBlock[] }
  | { kind: 'rule' };

/**
 * URL scheme allow-list.
 *
 * `javascript:alert(1)` in an href is the classic stored-XSS payload, and
 * `data:text/html,…` is the same attack with a different prefix. Obfuscations
 * such as `java\tscript:` or `JaVaScRiPt:` are handled by lower-casing and by
 * rejecting any control character outright. Anything with a scheme that is not
 * on this list is dropped, and a relative path or a #fragment is allowed
 * because neither can execute.
 */
function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/[\u0000-\u0020\u007f]/.test(value)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme) {
    if (value.startsWith('//')) return null;
    return value;
  }
  return /^(https?|mailto|tel)$/i.test(scheme[1]) ? value : null;
}

function matchLink(source: string, start: number): { label: string; href: string; end: number } | null {
  if (source[start] !== '[') return null;
  let depth = 1;
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    i += 1;
  }
  if (depth !== 0 || source[i] !== ']') return null;
  const label = source.slice(start + 1, i);
  if (source[i + 1] !== '(') return null;
  let p = i + 2;
  let parens = 1;
  while (p < source.length) {
    const char = source[p];
    if (char === '\\') {
      p += 2;
      continue;
    }
    if (char === '(') parens += 1;
    else if (char === ')') {
      parens -= 1;
      if (parens === 0) break;
    }
    p += 1;
  }
  if (parens !== 0) return null;
  const target = source.slice(i + 2, p).trim();
  const withTitle = /^(\S*)\s+["'(].*["')]$/.exec(target);
  const href = withTitle ? withTitle[1] : target;
  return { label, href: href ?? '', end: p + 1 };
}

/**
 * Finds the closing run of a delimiter, or -1.
 *
 * Two rules, both of which exist because the obvious alternatives are wrong in
 * ways people notice:
 *
 *  - A closer may be followed by a space (`**bold** and`), which is the single
 *    most common shape in real prose, but not by a letter or a digit, because
 *    `foo**bar**` is not emphasis.
 *  - An underscore between two word characters never closes anything, so
 *    `snake_case_name` survives intact.
 */
function findClosingDelimiter(source: string, from: number, delimiter: string): number {
  let i = from;
  while (i < source.length) {
    const index = source.indexOf(delimiter, i);
    if (index === -1) return -1;
    const before = index > 0 ? source[index - 1] : '';
    const after = source[index + delimiter.length] ?? '';
    const intrawordUnderscore = delimiter[0] === '_' && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after);
    if (!/[\p{L}\p{N}]/u.test(after) && !intrawordUnderscore) return index;
    i = index + delimiter.length;
  }
  return -1;
}

/**
 * A delimiter run can only open where a word could start, and never directly
 * after another run of the same character — otherwise `foo**bar**` is parsed as
 * a literal `*` followed by emphasis on `bar`, which is not what anyone means.
 */
function canOpenEmphasis(source: string, index: number, character: string): boolean {
  if (index === 0) return true;
  const before = source[index - 1];
  return !/[\p{L}\p{N}]/u.test(before) && before !== character;
}

const MARKDOWN_PUNCTUATION = /[\\`*_{}[\]()#+\-.!>~|]/;

function parseInline(source: string, autolink: boolean): MdInline[] {
  const nodes: MdInline[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer !== '') {
      nodes.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i];

    if (char === '\\' && i + 1 < source.length && MARKDOWN_PUNCTUATION.test(source[i + 1])) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }

    if (char === '`') {
      const run = /^`+/.exec(source.slice(i));
      const ticks = run ? run[0] : '`';
      const close = source.indexOf(ticks, i + ticks.length);
      if (close !== -1) {
        let value = source.slice(i + ticks.length, close);
        if (value.length > 1 && value.startsWith(' ') && value.endsWith(' ')) value = value.slice(1, -1);
        flush();
        nodes.push({ kind: 'code', value: value.replace(/\n/g, ' ') });
        i = close + ticks.length;
        continue;
      }
    }

    if (char === '!' && source[i + 1] === '[') {
      const link = matchLink(source, i + 1);
      if (link) {
        // Images are never rendered. A remote src would be a request to
        // somebody else's server, from a page that promises to make none, and
        // it would confirm the reader's IP address and the fact they pasted
        // that text. The alt text is shown instead.
        flush();
        nodes.push({ kind: 'text', value: `[image: ${link.label || 'no description'}]` });
        i = link.end;
        continue;
      }
    }

    if (char === '[') {
      const link = matchLink(source, i);
      if (link) {
        const href = safeHref(link.href);
        const children = parseInline(link.label, autolink);
        flush();
        if (href) {
          nodes.push({ kind: 'link', children, href, external: /^(https?:)?\/\//i.test(href) });
        } else {
          nodes.push({ kind: 'text', value: link.label });
          nodes.push({ kind: 'text', value: ` (link dropped: ${link.href.slice(0, 40)} uses a scheme that cannot be opened safely)` });
        }
        i = link.end;
        continue;
      }
    }

    if (char === '<') {
      const autolinkMatch = /^<((?:https?|mailto|tel):[^>\s]+)>/i.exec(source.slice(i));
      if (autolinkMatch) {
        const href = safeHref(autolinkMatch[1]);
        if (href) {
          flush();
          nodes.push({ kind: 'link', children: [{ kind: 'text', value: autolinkMatch[1] }], href, external: true });
        } else {
          buffer += autolinkMatch[0];
        }
        i += autolinkMatch[0].length;
        continue;
      }
    }

    if (char === '*' || char === '_') {
      const run = /^(?:\*\*\*|\*\*|\*|___|__|_)/.exec(source.slice(i));
      const delimiter = run ? run[0] : '';
      const afterRun = source[i + delimiter.length] ?? '';
      if (delimiter && canOpenEmphasis(source, i, delimiter[0]) && !/\s/.test(afterRun)) {
        const close = findClosingDelimiter(source, i + delimiter.length, delimiter);
        if (close !== -1) {
          const inner = source.slice(i + delimiter.length, close);
          const children = parseInline(inner, autolink);
          flush();
          if (delimiter.length === 3) nodes.push({ kind: 'strong', children: [{ kind: 'em', children }] });
          else if (delimiter.length === 2) nodes.push({ kind: 'strong', children });
          else nodes.push({ kind: 'em', children });
          i = close + delimiter.length;
          continue;
        }
      }
    }

    if (char === '~' && source[i + 1] === '~') {
      const close = source.indexOf('~~', i + 2);
      if (close !== -1) {
        flush();
        nodes.push({ kind: 'del', children: parseInline(source.slice(i + 2, close), autolink) });
        i = close + 2;
        continue;
      }
    }

    if (autolink && /^(https?:\/\/|www\.)/i.test(source.slice(i)) && (i === 0 || /[\s(<]/.test(source[i - 1]))) {
      const match = /^(?:https?:\/\/|www\.)[^\s<>()[\]]+/.exec(source.slice(i));
      const raw = match ? match[0] : '';
      const trimmed = raw.replace(/[.,;:!?]+$/, '');
      const href = safeHref(trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed);
      if (href && trimmed !== '') {
        flush();
        nodes.push({ kind: 'link', children: [{ kind: 'text', value: trimmed }], href, external: true });
        i += trimmed.length;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }
  flush();
  return nodes;
}

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;

function startsBlock(line: string): boolean {
  return line.trim() === '' || HEADING.test(line) || RULE.test(line) || LIST_ITEM.test(line) || /^\s{0,3}>/.test(line) || /^\s{0,3}(`{3,}|~{3,})/.test(line);
}

function parseMarkdownBlocks(lines: string[], options: { lineBreaks: boolean; autolink: boolean }, depth = 0): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = /^\s{0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)[ \t]*$/.exec(line);
    if (fence) {
      const marker = fence[1][0].repeat(3);
      const language = fence[2];
      const body: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        const candidate = lines[i] ?? '';
        if (new RegExp(`^\\s{0,3}${marker[0] === '`' ? '`' : '~'}{3,}[ \\t]*$`).test(candidate)) {
          closed = true;
          i += 1;
          break;
        }
        body.push(candidate);
        i += 1;
      }
      blocks.push({ kind: 'code', language, value: body.join('\n') });
      if (!closed) blocks.push({ kind: 'paragraph', children: [{ kind: 'text', value: '(this code fence is never closed)' }] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, children: parseInline(heading[2], options.autolink) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i] ?? '') || ((lines[i] ?? '').trim() !== '' && quoted.length > 0 && !startsBlock(lines[i] ?? '')))) {
        quoted.push((lines[i] ?? '').replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      // Beyond a few levels of > the nesting is a mistake, not a structure.
      blocks.push({ kind: 'quote', children: depth >= 5 ? [{ kind: 'paragraph', children: [{ kind: 'text', value: quoted.join(' ') }] }] : parseMarkdownBlocks(quoted, options, depth + 1) });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const candidate = lines[i] ?? '';
        const item = LIST_ITEM.exec(candidate);
        if (item && /^\s*\d/.test(candidate) === ordered) {
          let text = item[3];
          i += 1;
          // A wrapped item continues on the following indented lines.
          while (i < lines.length && (lines[i] ?? '').trim() !== '' && !LIST_ITEM.test(lines[i] ?? '') && !startsBlock(lines[i] ?? '')) {
            text += `\n${(lines[i] ?? '').trim()}`;
            i += 1;
          }
          items.push(parseInline(text.replace(/\n/g, options.lineBreaks ? '\n' : ' '), options.autolink));
          continue;
        }
        if (candidate.trim() === '') {
          const next = lines[i + 1] ?? '';
          if (LIST_ITEM.test(next) && /^\s*\d/.test(next) === ordered) {
            i += 1;
            continue;
          }
        }
        break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && (paragraph.length === 0 || !startsBlock(lines[i] ?? ''))) {
      paragraph.push(lines[i] ?? '');
      i += 1;
    }
    const joined = options.lineBreaks ? paragraph.join('\n') : paragraph.join(' ');
    const children = parseInline(joined, options.autolink);
    if (options.lineBreaks) {
      // Trailing two spaces or a backslash still forces a break when single
      // newlines are otherwise being joined.
      const withBreaks: MdInline[] = [];
      paragraph.forEach((entry, position) => {
        const hard = /[ ]{2,}$|\\$/.test(entry);
        const content = entry.replace(/[ ]{2,}$|\\$/, '');
        withBreaks.push(...parseInline(content, options.autolink));
        if (position < paragraph.length - 1 && (hard || options.lineBreaks)) withBreaks.push({ kind: 'break' });
      });
      blocks.push({ kind: 'paragraph', children: withBreaks });
    } else {
      blocks.push({ kind: 'paragraph', children });
    }
  }

  return blocks;
}

function renderInline(nodes: MdInline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        // A plain string, not an element. React escapes it when it renders, and
        // it never becomes markup — which is the entire XSS story on this
        // page, so no wrapper element is added to disguise it.
        return node.value;
      case 'code':
        return createElement('code', { key: `c${index}`, className: 'furtu-md-inline-code' }, node.value);
      case 'break':
        return createElement('br', { key: `b${index}` });
      case 'strong':
        return createElement('strong', { key: `s${index}` }, ...renderInline(node.children));
      case 'em':
        return createElement('em', { key: `m${index}` }, ...renderInline(node.children));
      case 'del':
        return createElement('del', { key: `d${index}` }, ...renderInline(node.children));
      case 'link':
        return createElement(
          'a',
          {
            key: `l${index}`,
            href: node.href,
            className: 'furtu-md-link',
            ...(node.external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {}),
          },
          ...renderInline(node.children),
        );
    }
  });
}

function renderBlocks(blocks: MdBlock[]): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'heading':
        return createElement(`h${block.level}`, { key: `h${index}` }, ...renderInline(block.children));
      case 'paragraph':
        return createElement('p', { key: `p${index}` }, ...renderInline(block.children));
      case 'code':
        return createElement(
          'pre',
          { key: `f${index}`, className: 'furtu-md-pre' },
          block.language ? createElement('span', { key: 'lang', className: 'furtu-md-language' }, block.language) : null,
          createElement('code', null, block.value),
        );
      case 'list':
        return createElement(
          block.ordered ? 'ol' : 'ul',
          { key: `l${index}`, className: 'furtu-md-list' },
          ...block.items.map((item, itemIndex) => createElement('li', { key: `li${itemIndex}` }, ...renderInline(item))),
        );
      case 'quote':
        return createElement('blockquote', { key: `q${index}`, className: 'furtu-md-quote' }, ...renderBlocks(block.children));
      case 'rule':
        return createElement('hr', { key: `r${index}` });
    }
  });
}

function countMarkdownFeatures(blocks: MdBlock[]): { headings: number; links: number; items: number; words: number; blocks: number } {
  const totals = { headings: 0, links: 0, items: 0, words: 0, blocks: blocks.length };
  const walkInline = (list: MdInline[]): void => {
    for (const node of list) {
      if (node.kind === 'text') totals.words += node.value.split(/\s+/).filter(Boolean).length;
      if (node.kind === 'link') {
        totals.links += 1;
        walkInline(node.children);
      }
      if (node.kind === 'strong' || node.kind === 'em' || node.kind === 'del') walkInline(node.children);
    }
  };
  const walkBlocks = (list: MdBlock[]): void => {
    for (const block of list) {
      if (block.kind === 'heading') {
        totals.headings += 1;
        walkInline(block.children);
      }
      if (block.kind === 'paragraph') walkInline(block.children);
      if (block.kind === 'list') {
        totals.items += block.items.length;
        for (const item of block.items) walkInline(item);
      }
      if (block.kind === 'quote') walkBlocks(block.children);
    }
  };
  walkBlocks(blocks);
  return totals;
}

async function markdownPreview(input: string, values: ControlValues): Promise<TextResult> {
  if (input.trim() === '') return nothingToDo('some Markdown to preview');
  const lineBreaks = controlBool(values, 'lineBreaks', false);
  const autolink = controlBool(values, 'autoLinks', false);
  const stripHtml = controlBool(values, 'stripHtml', false);

  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks = parseMarkdownBlocks(lines, { lineBreaks, autolink });
  const features = countMarkdownFeatures(blocks);

  const children = renderBlocks(blocks);
  const tree = stripHtml
    ? children.map((child, index) =>
        // "Strip the markup" is done by removing the rendered elements, never by
        // deleting angle brackets out of a string that is about to be shown as
        // HTML — that is how markup gets accidentally reintroduced.
        createElement('div', { key: `raw${index}` }, child),
      )
    : children;

  // React renders this to static markup, escaping every text node and every
  // attribute value on the way. No raw HTML from the input is ever interpreted,
  // which is why this renderer never hands the workspace a string of unescaped
  // markup to inject: the element list above is the whole vocabulary.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(createElement('div', { className: 'furtu-md' }, ...tree));

  const rawTags = input.match(/<\/?[a-zA-Z][^>]*>/g) ?? [];
  const unsafeLinks = (input.match(/\]\(\s*(?:javascript|data|vbscript):[^)]*\)/gi) ?? []).length;

  const diagnostics: Diagnostic[] = [
    { level: 'ok', message: 'Rendered in this tab. Every tag came from the small allow-list below and every piece of text was escaped by React, so pasted text cannot inject markup, styles or scripts.' },
  ];
  if (rawTags.length > 0) {
    diagnostics.push({
      level: 'warn',
      message: `Found ${plural(rawTags.length, 'HTML tag')} in the source. They are shown as literal text because Markdown is not allowed to carry raw HTML here.`,
    });
  }
  if (unsafeLinks > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${plural(unsafeLinks, 'link')} used a javascript:, data: or vbscript: URL. The link text is kept and the URL is dropped, because those schemes run code the moment a reader clicks them.`,
    });
  }

  return {
    output: html,
    meta: [
      { label: 'Blocks', value: plural(features.blocks, 'block') },
      { label: 'Headings', value: String(features.headings) },
      { label: 'Links', value: String(features.links) },
      { label: 'Words', value: formatNumber(features.words) },
      { label: 'HTML size', value: formatBytes(utf8Bytes(html)) },
    ],
    diagnostics,
  };
}

/* ===================================================================== */
/* utility tools                                                         */
/* ===================================================================== */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your',
]);

const graphemeSegmenter: { segment(input: string): Iterable<{ segment: string }> } | null = (() => {
  // `Intl.Segmenter` is a 2022 addition and the project targets ES2020, so it is
  // resolved through a narrow structural cast instead of a lib bump. Without
  // it the grapheme count falls back to code points, which is still correct
  // for every character outside emoji and combining sequences.
  const candidate = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (typeof candidate !== 'function') return null;
  try {
    return new candidate('en', { granularity: 'grapheme' });
  } catch {
    return null;
  }
})();

function countGraphemes(text: string): number {
  if (graphemeSegmenter) {
    let count = 0;
    for (const _ of graphemeSegmenter.segment(text)) count += 1;
    return count;
  }
  return [...text].length;
}

function textStats(text: string): { words: number; characters: number; charactersNoSpaces: number; sentences: number; paragraphs: number; lines: number } {
  const trimmed = text.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).filter(Boolean).length;
  const sentencePieces = trimmed.split(/[.!?…]+(?:\s+|$)/).filter((piece) => piece.trim() !== '');
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    sentences: trimmed === '' ? 0 : Math.max(1, sentencePieces.length),
    paragraphs: trimmed === '' ? 0 : trimmed.split(/\n\s*\n/).filter((piece) => piece.trim() !== '').length,
    lines: text === '' ? 0 : text.split('\n').length,
  };
}

function wordCounter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('the text you want measured');
  const wordsPerMinute = clamp(controlNumber(values, 'readingSpeed', 200), 60, 1000);
  const topCount = clamp(Math.round(controlNumber(values, 'topWords', 5)), 1, 20);
  const stats = textStats(input);

  const counts = new Map<string, number>();
  for (const raw of input.toLowerCase().split(/[^\p{L}\p{N}'’-]+/u)) {
    const word = raw.replace(/^[’']+|[’']+$/g, '');
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0])).slice(0, topCount);
  const unique = counts.size;
  const longest = input.split(/\s+/).reduce((best, word) => (word.length > best.length ? word : best), '');

  const speakingMinutes = stats.words / 130;
  const lines = [
    `Words                 ${formatNumber(stats.words)}`,
    `Unique words          ${formatNumber(unique)} (excluding common short words)`,
    `Characters            ${formatNumber(stats.characters)}`,
    `Characters no spaces  ${formatNumber(stats.charactersNoSpaces)}`,
    `Sentences             ${formatNumber(stats.sentences)}`,
    `Paragraphs            ${formatNumber(stats.paragraphs)}`,
    `Lines                 ${formatNumber(stats.lines)}`,
    `Longest word          ${longest} (${plural(longest.length, 'character')})`,
    `Reading time          ${formatDuration(stats.words / wordsPerMinute)} at ${wordsPerMinute} words per minute`,
    `Speaking time         ${formatDuration(speakingMinutes)} at 130 words per minute`,
  ];
  if (top.length > 0) {
    lines.push('', 'Most frequent words');
    for (const [word, count] of top) lines.push(`  ${String(count).padStart(4, ' ')}  ${word}`);
  }

  return {
    output: lines.join('\n'),
    meta: [
      { label: 'Words', value: formatNumber(stats.words) },
      { label: 'Sentences', value: formatNumber(stats.sentences) },
      { label: 'Paragraphs', value: formatNumber(stats.paragraphs) },
      { label: 'Reading time', value: formatDuration(stats.words / wordsPerMinute) },
    ],
    diagnostics: [
      { level: 'ok', message: `Counted at ${wordsPerMinute} words per minute, the usual figure for adult reading of non-technical prose. Silence, rereading and skimming make a real estimate longer.` },
      { level: 'warn', message: 'Sentence counting is a heuristic. Abbreviations, decimals such as 3.14 and bullet fragments all move the number, and no rule set gets every document right.' },
    ],
    download: { name: 'word-count.txt', blob: textBlob(`${lines.join('\n')}\n`, 'text/plain') },
  };
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'under a minute';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} seconds`;
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} minute${rounded === 1 ? '' : 's'}`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'} ${rest} min`;
}

function characterCounter(input: string, values: ControlValues): TextResult {
  const limit = Math.max(0, Math.round(controlNumber(values, 'limit', 280)));
  const countAs = controlText(values, 'countAs', 'graphemes');
  if (input === '') {
    return {
      output: `Nothing typed yet. The limit is ${formatNumber(limit)}.`,
      meta: [
        { label: 'Characters', value: `0 of ${formatNumber(limit)}` },
        { label: 'Remaining', value: formatNumber(limit) },
      ],
      diagnostics: [{ level: 'warn', message: `Add some text and the counters update as you type. This tool counts against a fixed limit, which is what a form field or a social post enforces.` }],
    };
  }

  const codePoints = [...input].length;
  const graphemes = countGraphemes(input);
  const bytes = utf8Bytes(input);
  const chosen = countAs === 'units' ? input.length : countAs === 'bytes' ? bytes : graphemes;
  const chosenLabel = countAs === 'units' ? 'UTF-16 code units' : countAs === 'bytes' ? 'UTF-8 bytes' : graphemes === codePoints ? 'graphemes' : 'graphemes';
  const remaining = limit - chosen;

  const longestLine = input.split('\n').reduce((best, line) => (line.length > best.length ? line : best), '');
  const stats = textStats(input);

  const lines = [
    `Counting as          ${chosenLabel}`,
    `Characters           ${formatNumber(chosen)} of ${formatNumber(limit)}`,
    `Remaining            ${remaining >= 0 ? formatNumber(remaining) : `${formatNumber(-remaining)} over the limit`}`,
    '',
    `Code units (UTF-16)  ${formatNumber(input.length)}`,
    `Code points          ${formatNumber(codePoints)}`,
    `Graphemes            ${formatNumber(graphemes)}${graphemes === codePoints ? ' (this browser has no grapheme segmenter, so code points were used)' : ''}`,
    `UTF-8 bytes          ${formatNumber(bytes)} (${formatBytes(bytes)})`,
    `Without spaces       ${formatNumber(stats.charactersNoSpaces)}`,
    `Words                ${formatNumber(stats.words)}`,
    `Lines                ${formatNumber(stats.lines)}`,
    `Longest line         ${plural(longestLine.length, 'character')}`,
  ];

  return {
    output: lines.join('\n'),
    meta: [
      { label: 'Characters', value: `${formatNumber(chosen)} / ${formatNumber(limit)}` },
      { label: 'Remaining', value: remaining >= 0 ? formatNumber(remaining) : `${formatNumber(-remaining)} over` },
      { label: 'UTF-8 bytes', value: `${formatNumber(bytes)} (${formatBytes(bytes)})` },
      { label: 'Graphemes', value: formatNumber(graphemes) },
    ],
    diagnostics: [
      {
        level: 'ok',
        message: 'Four different numbers describe the same string, and they disagree whenever the text contains anything outside plain ASCII. A “character” to a person is a grapheme: é is one, 👨‍👩‍👧‍👦 is one, and each is two code units and four bytes.',
      },
      ...(remaining < 0
        ? [{ level: 'warn' as const, message: `The text is ${formatNumber(-remaining)} over the limit when counted as ${chosenLabel}. Different platforms count differently, so check against the one that will actually reject it.` }]
        : []),
    ],
  };
}

const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

function textCleaner(input: string, values: ControlValues): TextResult {
  if (input === '') return nothingToDo('some pasted text to tidy up');
  const steps: { label: string; on: boolean }[] = [
    { label: 'Line endings normalised to LF', on: controlBool(values, 'normaliseLineEndings', true) },
    { label: 'Invisible characters removed', on: controlBool(values, 'removeInvisible', true) },
    { label: 'HTML stripped', on: controlBool(values, 'stripHtml', false) },
    { label: 'Trailing whitespace trimmed', on: controlBool(values, 'trimTrailing', true) },
    { label: 'Runs of blank lines collapsed', on: controlBool(values, 'collapseBlankLines', true) },
    { label: 'Runs of spaces collapsed', on: controlBool(values, 'collapseSpaces', false) },
  ];

  let output = input;
  const before = utf8Bytes(input);
  const changes: string[] = [];

  if (controlBool(values, 'normaliseLineEndings', true)) {
    const next = output.replace(/\r\n?/g, '\n');
    if (next !== output) changes.push('Line endings were mixed (CRLF, CR and LF) and are now all LF.');
    output = next;
  }
  if (controlBool(values, 'removeInvisible', true)) {
    const invisible = output.match(INVISIBLE) ?? [];
    const next = output.replace(INVISIBLE, '');
    if (invisible.length > 0) {
      const names = new Set(invisible.map((char) => {
        const code = (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
        if (char === '\u00ad') return 'U+00AD soft hyphen';
        if (char === '\u200b' || char === '\u200c' || char === '\u200d') return 'U+200B–D zero-width';
        if (char === '\u200e' || char === '\u200f') return 'U+200E–F directional mark';
        if (char === '\u202a' || char === '\u202b' || char === '\u202c') return 'U+202A–C bidi override';
        if (char === '\u2066' || char === '\u2069') return 'U+2066–9 bidi isolate';
        if (char === '\ufeff') return 'U+FEFF byte order mark';
        if (char === '\u00a0') return 'U+00A0 non-breaking space';
        return `U+${code}`;
      }));
      changes.push(`Removed ${plural(invisible.length, 'invisible character')}: ${[...names].slice(0, 6).join(', ')}${names.size > 6 ? ` and ${names.size - 6} more kinds` : ''}.`);
    }
    output = next.replace(/\u00a0/g, ' ');
  }
  if (controlBool(values, 'stripHtml', false)) {
    const withScripts = output.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const stripped = withScripts.replace(/<[^>]*>/g, '');
    if (stripped !== output) {
      const tags = (output.match(/<[^>]*>/g) ?? []).length;
      const entities = (stripped.match(/&[a-z]+;|&#\d+;/gi) ?? []).length;
      changes.push(`Removed ${plural(tags, 'HTML tag')}${entities > 0 ? `; ${plural(entities, 'HTML entity')} left as written, because decoding them would be a guess` : ''}.`);
    }
    output = stripped;
  }
  if (controlBool(values, 'trimTrailing', true)) {
    const next = output.replace(/[ \t]+$/gm, '');
    if (next !== output) changes.push('Trailing spaces and tabs were removed from the end of each line.');
    output = next;
  }
  if (controlBool(values, 'collapseBlankLines', true)) {
    const next = output.replace(/\n{3,}/g, '\n\n');
    if (next !== output) changes.push('Runs of blank lines were reduced to a single blank line.');
    output = next;
  }
  if (controlBool(values, 'collapseSpaces', false)) {
    const next = output.replace(/[^\S\n]{2,}/g, ' ');
    if (next !== output) changes.push('Runs of spaces and tabs within a line were reduced to one space.');
    output = next;
  }
  if (output.endsWith('\n')) {
    output = output.replace(/\n+$/, '');
    changes.push('The trailing newline was removed.');
  }

  const after = utf8Bytes(output);
  const enabled = steps.filter((step) => step.on).length;
  return {
    output,
    meta: [
      { label: 'Steps applied', value: `${enabled} of ${steps.length}` },
      { label: 'Before', value: formatBytes(before) },
      { label: 'After', value: formatBytes(after) },
      { label: 'Lines', value: formatNumber(output === '' ? 0 : output.split('\n').length) },
    ],
    diagnostics: [
      {
        level: changes.length > 0 ? 'ok' : 'warn',
        message:
          changes.length > 0
            ? changes.join(' ')
            : 'Nothing needed changing. Turn on more steps if the text still is not how you want it.',
      },
      { level: 'ok', message: 'Every step is reversible from the toggles, and the original text is never modified — this runs on the text in the box, in this tab.' },
    ],
    download: { name: 'cleaned.txt', blob: textBlob(output, 'text/plain') },
  };
}

function removeDuplicateLines(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a list of lines with repeats in it');
  const keep = controlText(values, 'keep', 'first');
  const caseSensitive = controlBool(values, 'caseSensitive', false);
  const ignoreWhitespace = controlBool(values, 'ignoreWhitespace', true);

  const endsWithNewline = input.endsWith('\n');
  const lines = input.split('\n');
  if (endsWithNewline) lines.pop();

  const keyOf = (line: string): string => {
    const trimmed = ignoreWhitespace ? line.trim() : line;
    return caseSensitive ? trimmed : trimmed.toLowerCase();
  };

  const seen = new Map<string, number>();
  const keepIndexes = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    const key = keyOf(lines[index]);
    if (!seen.has(key)) seen.set(key, index);
  }
  if (keep === 'last') {
    const lastIndex = new Map<string, number>();
    for (let index = 0; index < lines.length; index += 1) lastIndex.set(keyOf(lines[index]), index);
    for (const index of lastIndex.values()) keepIndexes.add(index);
  } else {
    for (const index of seen.values()) keepIndexes.add(index);
  }

  const kept = lines.filter((_, index) => keepIndexes.has(index));
  const output = kept.join('\n') + (endsWithNewline && kept.length > 0 ? '\n' : '');
  const removed = lines.length - kept.length;

  return {
    output,
    meta: [
      { label: 'Lines in', value: formatNumber(lines.length) },
      { label: 'Lines out', value: formatNumber(kept.length) },
      { label: 'Removed', value: formatNumber(removed) },
      { label: 'Matching', value: `${caseSensitive ? 'Case-sensitive' : 'Case-insensitive'}, ${ignoreWhitespace ? 'whitespace ignored' : 'whitespace significant'}` },
    ],
    diagnostics: [
      { level: 'ok', message: `Kept the ${keep === 'last' ? 'last' : 'first'} occurrence of each ${caseSensitive ? 'distinct' : 'case-insensitive'} line. Nothing is reordered.` },
      ...(removed === 0 ? [{ level: 'warn' as const, message: 'No duplicates were found with these settings. Try turning case sensitivity off, or ignore-whitespace on.' }] : []),
    ],
    download: { name: 'deduplicated.txt', blob: textBlob(output, 'text/plain') },
  };
}

function sortLines(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a list of lines to put in order');
  const order = controlText(values, 'order', 'asc');
  const caseSensitive = controlBool(values, 'caseSensitive', false);
  const natural = controlBool(values, 'natural', true);
  const dedupe = controlBool(values, 'dedupe', false);
  const removeEmpty = controlBool(values, 'removeEmpty', false);

  const endsWithNewline = input.endsWith('\n');
  let lines = input.split('\n');
  if (endsWithNewline) lines.pop();
  const originalCount = lines.length;
  if (removeEmpty) lines = lines.filter((line) => line.trim() !== '');
  let duplicates = 0;
  if (dedupe) {
    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const line of lines) {
      const key = caseSensitive ? line : line.toLowerCase();
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      filtered.push(line);
    }
    lines = filtered;
  }

  const collator = new Intl.Collator('en', { numeric: natural, sensitivity: caseSensitive ? 'variant' : 'base' });
  lines.sort((a, b) => (order === 'desc' ? collator.compare(b, a) : collator.compare(a, b)));

  const output = lines.join('\n') + (endsWithNewline && lines.length > 0 ? '\n' : '');
  return {
    output,
    meta: [
      { label: 'Lines', value: formatNumber(lines.length) },
      { label: 'Order', value: order === 'desc' ? 'Z to A, highest first' : 'A to Z' },
      { label: 'Method', value: natural ? 'Natural — 2 sorts before 10' : 'Plain character comparison' },
      { label: 'Removed', value: formatNumber(originalCount - lines.length) },
    ],
    diagnostics: [
      {
        level: 'ok',
        message: natural
          ? 'Natural order, so item 2 comes before item 10 instead of after it. Sorting is case-insensitive by default, which puts Apple and banana together rather than separating all capitals.'
          : 'Plain comparison, so every capital letter sorts before every lower-case one. Turn natural order on for everyday lists.',
      },
      ...(duplicates > 0 ? [{ level: 'ok' as const, message: `${plural(duplicates, 'duplicate line')} removed while sorting.` }] : []),
    ],
    download: { name: 'sorted.txt', blob: textBlob(output, 'text/plain') },
  };
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~';
const AMBIGUOUS = /[lI1O0o]/;

const PASSWORD_CLASSES: { id: string; label: string; characters: string }[] = [
  { id: 'lowercase', label: 'Lower-case letters', characters: LOWER },
  { id: 'uppercase', label: 'Upper-case letters', characters: UPPER },
  { id: 'digits', label: 'Digits', characters: DIGITS },
  { id: 'symbols', label: 'Symbols', characters: ALL_SYMBOLS },
];

/**
 * Uniform random integer in [0, maxExclusive) from the cryptographic source.
 *
 * `value % maxExclusive` is biased: 2^32 is not divisible by most alphabet
 * sizes, so the first `2^32 mod n` values come up slightly more often than the
 * rest. For a 94-character alphabet the skew is small, but it is a real
 * reduction in entropy and it is free to avoid — values in the ragged tail of
 * the range are rejected and redrawn.
 */
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
}

/** Unbiased Fisher–Yates, drawn from the platform's cryptographic source. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

function passwordGenerator(input: string, values: ControlValues): TextResult {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return errorResult({ level: 'error', message: 'The browser’s secure random source is unavailable, so no password was generated. Furtu will not fall back to a weaker source.' });
  }

  const requested = Math.round(controlNumber(values, 'length', 20));
  const count = clamp(Math.round(controlNumber(values, 'count', 1)), 1, 100);
  const excludeAmbiguous = controlBool(values, 'excludeAmbiguous', true);

  const enabled = PASSWORD_CLASSES.filter((entry) => controlBool(values, entry.id, true));
  if (enabled.length === 0) {
    return errorResult({ level: 'error', message: 'Turn on at least one character type. A password made of nothing cannot be a password.' });
  }

  const classes = enabled.map((entry) => ({
    label: entry.label,
    characters: excludeAmbiguous ? entry.characters.split('').filter((char) => !AMBIGUOUS.test(char)).join('') : entry.characters,
  }));
  for (const entry of classes) {
    if (entry.characters === '') {
      return errorResult({ level: 'error', message: `“${entry.label}” is left with no characters once the ambiguous ones are excluded. Turn that option off.` });
    }
  }

  const alphabet = [...new Set(classes.map((entry) => entry.characters).join(''))].join('');
  const length = Math.max(requested, classes.length);
  const diagnostics: Diagnostic[] = [];
  if (length > requested) {
    diagnostics.push({ level: 'warn', message: `Raised to ${length} characters, because a password that includes every selected character type cannot be shorter than the number of types.` });
  }
  if (length > 128) {
    diagnostics.push({ level: 'warn', message: `${length} characters is far beyond any realistic attack, and some systems silently truncate long passwords.` });
  }

  const passwords: string[] = [];
  for (let n = 0; n < count; n += 1) {
    // One character from each selected class first, so the result is never
    // accidentally all digits, then the rest from the combined alphabet.
    const characters: string[] = classes.map((entry) => entry.characters[randomInt(entry.characters.length)]);
    while (characters.length < length) characters.push(alphabet[randomInt(alphabet.length)]);
    passwords.push(shuffle(characters).join(''));
  }

  const entropy = length * Math.log2(alphabet.length);
  const bits = entropy >= 1000 ? `${Math.round(entropy / 1000)}k` : String(Math.round(entropy));

  return {
    output: passwords.join('\n'),
    meta: [
      { label: 'Length', value: plural(length, 'character') },
      { label: 'Alphabet', value: `${alphabet.length} characters` },
      { label: 'Estimated entropy', value: `${bits} bits per password` },
      { label: 'Source', value: 'crypto.getRandomValues, with rejection sampling' },
    ],
    diagnostics: [
      { level: 'ok', message: 'Each password contains at least one character from every type you selected, then the whole thing is shuffled with an unbiased Fisher–Yates. Furtu never uses the platform’s general-purpose pseudo-random generator, whose output is predictable and entirely unsuitable for anything secret.' },
      ...diagnostics,
      { level: 'warn', message: 'A generated password is only as strong as where you put it. The one rule that matters: store it in a password manager, and never reuse it across two accounts that matter.' },
      { level: 'ok', message: 'These passwords existed in this tab for a moment and were never sent anywhere. The box is not cleared automatically, so clear it when you are done.' },
    ],
    download: { name: 'passwords.txt', blob: textBlob(`${passwords.join('\n')}\n`, 'text/plain') },
  };
}

interface SizeUnit {
  id: string;
  label: string;
  factor: number;
  base: 'bits' | 'bytes';
}

const SIZE_UNITS: SizeUnit[] = [
  { id: 'b', label: 'bit', factor: 1 / 8, base: 'bits' },
  { id: 'kb', label: 'kilobit (kb)', factor: 1000 / 8, base: 'bits' },
  { id: 'mb-bit', label: 'megabit (Mb)', factor: 1e6 / 8, base: 'bits' },
  { id: 'gb-bit', label: 'gigabit (Gb)', factor: 1e9 / 8, base: 'bits' },
  { id: 'B', label: 'byte', factor: 1, base: 'bytes' },
  { id: 'kB', label: 'kilobyte (kB)', factor: 1e3, base: 'bytes' },
  { id: 'MB-dec', label: 'megabyte (MB)', factor: 1e6, base: 'bytes' },
  { id: 'GB-dec', label: 'gigabyte (GB)', factor: 1e9, base: 'bytes' },
  { id: 'TB-dec', label: 'terabyte (TB)', factor: 1e12, base: 'bytes' },
  { id: 'KiB', label: 'kibibyte (KiB)', factor: 1024, base: 'bytes' },
  { id: 'MiB', label: 'mebibyte (MiB)', factor: 1024 ** 2, base: 'bytes' },
  { id: 'GiB', label: 'gibibyte (GiB)', factor: 1024 ** 3, base: 'bytes' },
  { id: 'TiB', label: 'tebibyte (TiB)', factor: 1024 ** 4, base: 'bytes' },
];

const SIZE_ALIASES: Record<string, { factor: number; label: string; ambiguous: boolean }> = {
  b: { factor: 1, label: 'byte', ambiguous: false },
  byte: { factor: 1, label: 'byte', ambiguous: false },
  bytes: { factor: 1, label: 'byte', ambiguous: false },
  k: { factor: 1e3, label: 'kilobyte', ambiguous: true },
  kb: { factor: 1e3, label: 'kilobyte', ambiguous: true },
  kilobyte: { factor: 1e3, label: 'kilobyte', ambiguous: true },
  mb: { factor: 1e6, label: 'megabyte', ambiguous: true },
  megabyte: { factor: 1e6, label: 'megabyte', ambiguous: true },
  gb: { factor: 1e9, label: 'gigabyte', ambiguous: true },
  gigabyte: { factor: 1e9, label: 'gigabyte', ambiguous: true },
  tb: { factor: 1e12, label: 'terabyte', ambiguous: true },
  terabyte: { factor: 1e12, label: 'terabyte', ambiguous: true },
  pb: { factor: 1e15, label: 'petabyte', ambiguous: true },
  kib: { factor: 1024, label: 'kibibyte', ambiguous: false },
  mib: { factor: 1024 ** 2, label: 'mebibyte', ambiguous: false },
  gib: { factor: 1024 ** 3, label: 'gibibyte', ambiguous: false },
  tib: { factor: 1024 ** 4, label: 'tebibyte', ambiguous: false },
  pib: { factor: 1024 ** 5, label: 'pebibyte', ambiguous: false },
  bit: { factor: 1 / 8, label: 'bit', ambiguous: false },
  bits: { factor: 1 / 8, label: 'bit', ambiguous: false },
  k_bit: { factor: 1000 / 8, label: 'kilobit', ambiguous: false },
  kb_bit: { factor: 1000 / 8, label: 'kilobit', ambiguous: false },
  kbit: { factor: 1000 / 8, label: 'kilobit', ambiguous: false },
  kbits: { factor: 1000 / 8, label: 'kilobit', ambiguous: false },
  mb_bit: { factor: 1e6 / 8, label: 'megabit', ambiguous: false },
  mbit: { factor: 1e6 / 8, label: 'megabit', ambiguous: false },
  mbits: { factor: 1e6 / 8, label: 'megabit', ambiguous: false },
  gb_bit: { factor: 1e9 / 8, label: 'gigabit', ambiguous: false },
  gbit: { factor: 1e9 / 8, label: 'gigabit', ambiguous: false },
  gbits: { factor: 1e9 / 8, label: 'gigabit', ambiguous: false },
};

/** IEC spelling of an ambiguous SI unit: `MB` -> `MiB`, `GB` -> `GiB`. */
function binarySpelling(unit: string): string {
  return unit.replace(/^([kmgtp])b$/i, (_, prefix: string) => `${prefix.toUpperCase()}iB`);
}

/** Binary power for a size prefix letter, so `MB` means 1024² rather than 1024. */
const BINARY_POWER: Record<string, number> = { k: 1, m: 2, g: 3, t: 4, p: 5 };

function fileSizeConverter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a file size such as 1.5MB, 500 KiB or 1e6');
  const raw = input.trim();
  const base = controlText(values, 'base', 'auto');
  const decimals = clamp(Math.round(controlNumber(values, 'decimals', 3)), 0, 8);

  const match = /^([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*([a-zA-Z]*)$/.exec(raw);
  if (!match) {
    return errorResult({ level: 'error', message: `“${raw}” is not a size Furtu can read. Write a number and an optional unit, for example 1.5MB, 500 KiB, 2 GB or 1e6.` });
  }

  const value = Number(match[1]);
  const unitToken = match[2];
  const diagnostics: Diagnostic[] = [];
  let bytes: number;
  let interpretation: string;

  if (unitToken === '') {
    bytes = base === 'binary' ? value * 1024 ** 3 : value;
    interpretation = base === 'binary' ? `a bare number read as gibibytes (${value} × 1024³)` : base === 'decimal' ? `a bare number read as gigabytes (${value} × 1000³)` : 'a bare number, read as bytes';
    if (base === 'auto') {
      diagnostics.push({ level: 'warn', message: 'No unit was given, so the number was read as bytes. Type something like 1.5MB or 2GiB to be explicit.' });
    }
  } else {
    const alias = SIZE_ALIASES[unitToken] ?? SIZE_ALIASES[unitToken.toLowerCase()];
    if (!alias) {
      const suggestion = SIZE_ALIASES[unitToken.slice(0, 1).toLowerCase() + unitToken.slice(1)];
      return errorResult({
        level: 'error',
        message: `“${unitToken}” is not a size unit Furtu recognises${suggestion ? `. Did you mean ${suggestion.label}?` : '. Known units: B, kB, MB, GB, TB, KiB, MiB, GiB, TiB, and kb or Mb for bits.'}`,
      });
    }
    bytes = value * alias.factor;
    interpretation = `${value} ${alias.label}`;
    if (alias.ambiguous && base === 'auto') {
      const prefix = unitToken.charAt(0).toLowerCase();
      const power = BINARY_POWER[prefix];
      if (power !== undefined) {
        const binary = value * 1024 ** power;
        diagnostics.push({
          level: 'warn',
          message: `“${unitToken}” is ambiguous. Written this way it means ${alias.label} in the decimal sense — 1 kB is 1,000 bytes — while 1 ${binarySpelling(unitToken)} is 1,024 bytes, so your ${value} ${unitToken} would be ${formatNumber(binary)} bytes on the binary reading. Windows, macOS and most disk tools use the binary one, which is why a 1 TB drive is reported as 931 GB.`,
        });
      }
    }
  }

  const rows = SIZE_UNITS.map((unit) => ({ unit, value: bytes / unit.factor }));
  const lines = rows.map(
    (row) => `${row.unit.label.padEnd(22, ' ')}${decimal(row.value, decimals)} ${row.unit.base === 'bits' ? 'bits' : 'bytes'}`,
  );

  return {
    output: `Read as ${interpretation}\n\n${lines.join('\n')}\n\nFor reference: 1 KiB = 1,024 B, 1 kB = 1,000 B, 1 MiB = 1,048,576 B, 1 MB = 1,000,000 B.`,
    meta: [
      { label: 'Bytes', value: `${decimal(bytes, decimals)} (${formatBytes(bytes)})` },
      { label: 'Bits', value: decimal(bytes * 8, decimals) },
      { label: 'MB (decimal)', value: decimal(bytes / 1e6, decimals) },
      { label: 'MiB (binary)', value: decimal(bytes / 1024 ** 2, decimals) },
      { label: 'Decimals', value: String(decimals) },
    ],
    diagnostics: [
      { level: 'ok', message: 'The SI prefixes kB, MB and GB are decimal — multiples of 1,000. The IEC prefixes KiB, MiB and GiB are binary — multiples of 1,024. They are not the same unit with a different spelling, and the difference is 2.4% by the time you reach the gibibyte.' },
      ...diagnostics,
    ],
  };
}

interface UnitDefinition {
  id: string;
  label: string;
  /** Value in this unit -> value in the category's base unit. */
  toBase: (value: number) => number;
  /** Value in the base unit -> value in this unit. */
  fromBase: (value: number) => number;
}

interface UnitCategory {
  id: string;
  label: string;
  base: string;
  note: string;
  units: UnitDefinition[];
}

const linear = (factor: number, label: string, id: string): UnitDefinition => ({
  id,
  label,
  toBase: (value) => value * factor,
  fromBase: (value) => value / factor,
});

const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'data',
    label: 'Data size',
    base: 'byte',
    note: 'Decimal prefixes (kB, MB, GB) are multiples of 1,000. Binary prefixes (KiB, MiB, GiB) are multiples of 1,024. Bits are shown too, because network speeds are quoted in bits per second while file sizes are not.',
    units: [
      linear(1 / 8, 'bit', 'bit'),
      linear(1000 / 8, 'kilobit (kb)', 'kb'),
      linear(1e6 / 8, 'megabit (Mb)', 'Mb'),
      linear(1e9 / 8, 'gigabit (Gb)', 'Gb'),
      linear(1, 'byte', 'B'),
      linear(1e3, 'kilobyte (kB)', 'kB'),
      linear(1e6, 'megabyte (MB)', 'MB'),
      linear(1e9, 'gigabyte (GB)', 'GB'),
      linear(1e12, 'terabyte (TB)', 'TB'),
      linear(1024, 'kibibyte (KiB)', 'KiB'),
      linear(1024 ** 2, 'mebibyte (MiB)', 'MiB'),
      linear(1024 ** 3, 'gibibyte (GiB)', 'GiB'),
      linear(1024 ** 4, 'tebibyte (TiB)', 'TiB'),
    ],
  },
  {
    id: 'length',
    label: 'Length',
    base: 'metre',
    note: 'An international inch is exactly 25.4 mm, and a US survey foot is very slightly different. Imperial conversions use the international foot.',
    units: [
      linear(1e-9, 'nanometre (nm)', 'nm'),
      linear(1e-6, 'micrometre (µm)', 'µm'),
      linear(1e-3, 'millimetre (mm)', 'mm'),
      linear(1e-2, 'centimetre (cm)', 'cm'),
      linear(1, 'metre (m)', 'm'),
      linear(1e3, 'kilometre (km)', 'km'),
      linear(0.0254, 'inch (in)', 'in'),
      linear(0.3048, 'foot (ft)', 'ft'),
      linear(0.9144, 'yard (yd)', 'yd'),
      linear(1609.344, 'mile (mi)', 'mi'),
      linear(1852, 'nautical mile', 'nmi'),
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    base: 'kilogram',
    note: 'A tonne is 1,000 kg. Stone and pounds are the British and American units; an ounce here is the avoirdupois ounce of 28.35 g, not the troy ounce used for precious metal.',
    units: [
      linear(1e-6, 'milligram (mg)', 'mg'),
      linear(1e-3, 'gram (g)', 'g'),
      linear(1, 'kilogram (kg)', 'kg'),
      linear(1e3, 'tonne (t)', 't'),
      linear(0.028349523125, 'ounce (oz)', 'oz'),
      linear(0.45359237, 'pound (lb)', 'lb'),
      linear(6.35029318, 'stone (st)', 'st'),
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    base: 'degree Celsius',
    note: 'Temperature is the one category that is not a simple ratio: the scales have different zero points, so these are offsets as well as multiplications.',
    units: [
      { id: 'C', label: 'degree Celsius (°C)', toBase: (value) => value, fromBase: (value) => value },
      { id: 'F', label: 'degree Fahrenheit (°F)', toBase: (value) => ((value - 32) * 5) / 9, fromBase: (value) => (value * 9) / 5 + 32 },
      { id: 'K', label: 'kelvin (K)', toBase: (value) => value - 273.15, fromBase: (value) => value + 273.15 },
      { id: 'R', label: 'degree Rankine (°R)', toBase: (value) => (value - 491.67) * (5 / 9), fromBase: (value) => (value * 9) / 5 + 491.67 },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    base: 'second',
    note: 'A month and a year are not fixed lengths, so they are not here: Furtu uses 30 days and 365.25 days and says so rather than pretending the calendar is tidy.',
    units: [
      linear(1e-9, 'nanosecond (ns)', 'ns'),
      linear(1e-6, 'microsecond (µs)', 'µs'),
      linear(1e-3, 'millisecond (ms)', 'ms'),
      linear(1, 'second (s)', 's'),
      linear(60, 'minute (min)', 'min'),
      linear(3600, 'hour (h)', 'h'),
      linear(86400, 'day (d)', 'd'),
      linear(604800, 'week (wk)', 'wk'),
      linear(2629800, 'month, as 30.4375 days', 'month'),
      linear(31557600, 'year, as 365.25 days', 'year'),
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    base: 'metre per second',
    note: 'A knot is one nautical mile per hour, which is 1.852 km/h exactly. It has nothing to do with nautical miles being about 1.15 statute miles.',
    units: [
      linear(1, 'metre per second (m/s)', 'mps'),
      linear(1 / 3.6, 'kilometre per hour (km/h)', 'kmh'),
      linear(0.44704, 'mile per hour (mph)', 'mph'),
      linear(0.3048, 'foot per second (ft/s)', 'fps'),
      linear(0.514444, 'knot (kn)', 'kn'),
      linear(340.29, 'speed of sound at sea level', 'sound'),
    ],
  },
  {
    id: 'area',
    label: 'Area',
    base: 'square metre',
    note: 'An acre is 4,046.86 square metres, set out as one chain by one furlong in 1901 and never revised. Hectares are the unit used for land area almost everywhere outside the United States.',
    units: [
      linear(1e-6, 'square millimetre (mm²)', 'mm2'),
      linear(1e-4, 'square centimetre (cm²)', 'cm2'),
      linear(1, 'square metre (m²)', 'm2'),
      linear(1e4, 'hectare (ha)', 'ha'),
      linear(1e6, 'square kilometre (km²)', 'km2'),
      linear(0.00064516, 'square inch (in²)', 'in2'),
      linear(0.09290304, 'square foot (ft²)', 'ft2'),
      linear(0.83612736, 'square yard (yd²)', 'yd2'),
      linear(4046.8564224, 'acre', 'acre'),
      linear(2589988.110336, 'square mile (mi²)', 'mi2'),
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    base: 'litre',
    note: 'The US liquid pint is 473 mL and the imperial pint is 568 mL, so a “pint” is ambiguous by a fifth. Both are listed. A US tablespoon is 14.79 mL, an imperial one is 17.76 mL.',
    units: [
      linear(1e-6, 'millilitre (mL)', 'mL'),
      linear(1, 'litre (L)', 'L'),
      linear(1e3, 'cubic metre (m³)', 'm3'),
      linear(4.92892, 'US teaspoon (tsp)', 'tsp-us'),
      linear(14.7868, 'US tablespoon (tbsp)', 'tbsp-us'),
      linear(29.5735, 'US fluid ounce (fl oz)', 'floz-us'),
      linear(236.588, 'US cup', 'cup-us'),
      linear(473.176, 'US pint', 'pt-us'),
      linear(946.353, 'US quart', 'qt-us'),
      linear(3.78541, 'US gallon', 'gal-us'),
      linear(17.7582, 'imperial teaspoon', 'tsp-uk'),
      linear(28.4131, 'imperial fluid ounce', 'floz-uk'),
      linear(284.131, 'imperial pint', 'pt-uk'),
      linear(4.54609, 'imperial gallon', 'gal-uk'),
      linear(16.3871, 'cubic inch (in³)', 'in3'),
      linear(28.3168, 'cubic foot (ft³)', 'ft3'),
    ],
  },
];

/**
 * Spellings people actually type, mapped to a unit id in the same category.
 * Keyed on the input with every non-letter and non-digit removed, so `km/h`,
 * `kmph` and `Km per H` all collapse to the same key.
 */
const UNIT_ALIASES: Record<string, Record<string, string>> = {
  data: { b: 'B', byte: 'B', bytes: 'B', k: 'kB', kb: 'kB', kilobyte: 'kB', mb: 'MB', megabyte: 'MB', gb: 'GB', gigabyte: 'GB', tb: 'TB', terabyte: 'TB', kib: 'KiB', mib: 'MiB', gib: 'GiB', tib: 'TiB', bit: 'bit', bits: 'bit', kbbit: 'kb', mbit: 'Mb', gbit: 'Gb' },
  length: { m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm', cm: 'cm', mm: 'mm', km: 'km', um: 'µm', micron: 'µm', nm: 'nm', in: 'in', inch: 'in', inches: 'in', ft: 'ft', foot: 'ft', feet: 'ft', yd: 'yd', yard: 'yd', mi: 'mi', mile: 'mi', miles: 'mi', nmi: 'nmi' },
  mass: { mg: 'mg', g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', t: 't', tonne: 't', ton: 't', oz: 'oz', ounce: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', st: 'st', stone: 'st' },
  temperature: { c: 'C', celsius: 'C', centigrade: 'C', f: 'F', fahrenheit: 'F', k: 'K', kelvin: 'K', r: 'R', rankine: 'R' },
  time: { ns: 'ns', us: 'µs', ms: 'ms', millisecond: 'ms', s: 's', sec: 's', secs: 's', second: 's', seconds: 's', min: 'min', mins: 'min', minute: 'min', minutes: 'min', h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', d: 'd', day: 'd', days: 'd', wk: 'wk', week: 'wk', weeks: 'wk', month: 'month', months: 'month', year: 'year', years: 'year', yr: 'year' },
  speed: { ms: 'mps', mps: 'mps', mpersec: 'mps', metrepersecond: 'mps', meterspersecond: 'mps', kmh: 'kmh', kmph: 'kmh', km: 'kmh', kilometreperhour: 'kmh', kilometerperhour: 'kmh', kph: 'kmh', mph: 'mph', mileperhour: 'mph', fps: 'fps', ftpersec: 'fps', feetpersecond: 'fps', kn: 'kn', knot: 'kn', knots: 'kn' },
  area: { mm2: 'mm2', cm2: 'cm2', m2: 'm2', km2: 'km2', in2: 'in2', ft2: 'ft2', yd2: 'yd2', ha: 'ha', hectare: 'ha', hectares: 'ha', acre: 'acre', acres: 'acre', mi2: 'mi2' },
  volume: { ml: 'mL', l: 'L', litre: 'L', liter: 'L', litres: 'L', m3: 'm3', tsp: 'tsp-us', tbsp: 'tbsp-us', floz: 'floz-us', cup: 'cup-us', pt: 'pt-us', qt: 'qt-us', gal: 'gal-us', gallon: 'gal-us', gallons: 'gal-us', in3: 'in3', ft3: 'ft3' },
};

function unitConverter(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a value and a unit, such as 100 km/h or 1.5 GB');
  const categoryId = controlText(values, 'category', 'length');
  const decimals = clamp(Math.round(controlNumber(values, 'decimals', 6)), 0, 10);
  const category = UNIT_CATEGORIES.find((entry) => entry.id === categoryId) ?? UNIT_CATEGORIES[1];

  const match = /^\s*([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*(.*?)\s*$/.exec(input);
  if (!match) return errorResult({ level: 'error', message: `“${input.trim()}” is not a number Furtu can read. Write the amount first, then the unit: 100 km/h, 20 C, 1.5 GB.` });

  const amount = Number(match[1]);
  const token = match[2];
  const key = token.toLowerCase().replace(/[^a-z0-9]/g, '');

  let from: UnitDefinition | undefined;
  if (token === '') {
    from = category.units.find((unit) => unit.id === category.base);
  } else {
    const alias = UNIT_ALIASES[category.id]?.[key];
    from =
      (alias ? category.units.find((unit) => unit.id === alias) : undefined) ??
      category.units.find((unit) => unit.id.toLowerCase() === key) ??
      category.units.find((unit) => unit.label.toLowerCase() === token.toLowerCase()) ??
      category.units.find((unit) => key !== '' && unit.label.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(key));
  }

  if (!from) {
    return errorResult({
      level: 'error',
      message: `“${token}” is not a ${category.label.toLowerCase()} unit. ${category.units.map((unit) => unit.label).join(', ')}.`,
    });
  }

  const baseValue = from.toBase(amount);
  const rows = category.units.map((unit) => ({ unit, value: unit.fromBase(baseValue) }));
  const lines = rows.map((row) => `${row.unit.label.padEnd(26, ' ')}${decimal(row.value, decimals)}`);

  return {
    output: `${amount} ${from.label} equals\n\n${lines.join('\n')}\n\nEvery value is converted through ${category.base}s. ${category.note}`,
    meta: [
      { label: 'From', value: `${formatNumber(amount)} ${from.label}` },
      { label: 'In base units', value: `${decimal(baseValue, decimals)} ${category.base}` },
      { label: 'Converted', value: String(rows.length) },
      { label: 'Decimals', value: String(decimals) },
    ],
    diagnostics: [
      { level: 'ok', message: 'Every unit in this category is shown at once, so the value can be read off in whatever unit the other system wants. Conversion happens in this tab with the exact factors below.' },
      { level: 'warn', message: category.note },
    ],
  };
}

function percentageCalculator(input: string, values: ControlValues): TextResult {
  const mode = controlText(values, 'mode', 'of');
  const x = controlNumber(values, 'x', 15);
  const y = controlNumber(values, 'y', 200);
  const lines: string[] = [];
  const meta: { label: string; value: string }[] = [];
  // Trailing zeros are noise here; significant digits are not, so the figures
  // are rounded to a fixed number of places and then printed without padding.
  const tidy = (value: number, places = 4): string => String(roundTo(value, places));

  if (mode === 'is') {
    if (y === 0) return errorResult({ level: 'error', message: '“X is what percent of Y” needs a non-zero Y. As a share of zero, the answer is undefined rather than infinite.' });
    const result = (x / y) * 100;
    const remainder = y - x;
    lines.push(
      `${formatNumber(x)} is ${result.toFixed(2)}% of ${formatNumber(y)}.`,
      '',
      `The remaining ${formatNumber(remainder)} is ${(100 - result).toFixed(2)}% of ${formatNumber(y)}.`,
      `As a fraction, ${formatNumber(x)} ÷ ${formatNumber(y)} = ${(x / y).toPrecision(6)}.`,
    );
    meta.push({ label: 'Share', value: `${result.toFixed(2)}%` }, { label: 'Remaining', value: `${(100 - result).toFixed(2)}%` });
  } else if (mode === 'change') {
    if (y === 0) return errorResult({ level: 'error', message: 'Percentage change needs a non-zero starting value. Change from zero is undefined, not infinite.' });
    const difference = x - y;
    const result = (difference / y) * 100;
    const direction = result > 0 ? 'an increase' : result < 0 ? 'a decrease' : 'no change';
    lines.push(
      `Change from ${formatNumber(y)} to ${formatNumber(x)} is ${result.toFixed(2)}% — ${direction}.`,
      '',
      `The difference is ${difference >= 0 ? '+' : ''}${formatNumber(difference)}.`,
      `${formatNumber(y)} multiplied by ${tidy(1 + result / 100, 8)} is ${formatNumber(x)}.`,
      // To undo a rise of r, the fall is 1 - 1/(1+r): a 50% rise needs a 33.33%
      // fall, which is the asymmetry that catches people out.
      result > 0 ? `To reverse it, a fall of ${((1 - 1 / (1 + result / 100)) * 100).toFixed(2)}% would be needed — falls and rises are not symmetrical.` : '',
    );
    meta.push({ label: 'Change', value: `${result >= 0 ? '+' : ''}${result.toFixed(2)}%` }, { label: 'Difference', value: `${difference >= 0 ? '+' : ''}${formatNumber(difference)}` });
  } else {
    const result = (x / 100) * y;
    const rest = y - result;
    lines.push(
      `${x}% of ${formatNumber(y)} is ${decimal(result, 10)}.`,
      '',
      `The other ${tidy(100 - x)}% is ${decimal(rest, 10)}.`,
      `As a fraction, ${x}% = ${tidy(x / 100, 6)}, so ${formatNumber(y)} × ${tidy(x / 100, 6)}.`,
    );
    meta.push({ label: 'Result', value: decimal(result, 10) }, { label: 'Remaining', value: decimal(rest, 10) });
  }

  const output = lines.filter((line) => line !== '').join('\n');
  return {
    output,
    meta,
    diagnostics: [
      { level: 'ok', message: 'Straight arithmetic, done with the full precision of the numbers you entered. Results are shown to more decimals than most people need, because rounding early is how percentage arguments go wrong.' },
      { level: 'warn', message: 'Percentages of percentages are not additive. Ten per cent of a hundred is ten; a twenty per cent rise on that is twelve, not twenty, because the base has changed.' },
    ],
  };
}

const LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum at vero eos accusamus iusto odio dignissimos ducimus blanditiis praesentium voluptatum deleniti atque corrupti quos dolores quas molestias excepturi occaecati provident similique culpa officiis animi mollitia harum quidem rerum facilis expedita distinctio nam libero tempore soluta nobis eligendi optio cumque nihil impedit quo minus maxime placeat facere possimus omnis assumenda repellendus temporibus autem quibusdam aut rerum necessitatibus saepe eveniet voluptates repudiandae recusandae itaque earum hic tenetur sapiente delectus reprehenderit voluptatibus maiores alias perferendis doloribus asperiores repellat'.split(' ');

function loremIpsumGenerator(_input: string, values: ControlValues, ctx: ToolContext): TextResult {
  const amountType = controlText(values, 'amountType', 'paragraphs');
  const requested = clamp(Math.round(controlNumber(values, 'amount', 3)), 1, 200);
  const startWithLorem = controlBool(values, 'startWithLorem', true);

  const pickWord = (): string => LOREM_WORDS[randomInt(LOREM_WORDS.length)];
  const sentence = (words: number): string => {
    const parts: string[] = [];
    for (let i = 0; i < words; i += 1) parts.push(pickWord());
    const text = parts.join(' ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  };
  const paragraph = (): string => {
    const count = 3 + randomInt(5);
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) parts.push(sentence(8 + randomInt(14)));
    return parts.join(' ');
  };

  const blocks: string[] = [];
  if (amountType === 'words') {
    const words: string[] = [];
    for (let i = 0; i < requested; i += 1) words.push(pickWord());
    blocks.push(`${words.join(' ')}.`);
  } else if (amountType === 'sentences') {
    for (let i = 0; i < requested; i += 1) blocks.push(sentence(8 + randomInt(14)));
    // Sentences are one block, not one paragraph each.
    blocks.splice(0, blocks.length, blocks.join(' '));
  } else {
    for (let i = 0; i < requested; i += 1) {
      if (i % 20 === 0) ctx.onProgress(i / requested, `Writing paragraph ${i + 1}`);
      blocks.push(paragraph());
    }
  }
  ctx.onProgress(1);

  if (startWithLorem && !blocks[0].toLowerCase().startsWith('lorem ipsum')) {
    blocks[0] = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${blocks[0]}`;
  }

  const output = amountType === 'paragraphs' ? `${blocks.join('\n\n')}\n` : `${blocks[0]}\n`;
  const stats = textStats(output);

  return {
    output,
    meta: [
      { label: 'Requested', value: amountType === 'paragraphs' ? plural(requested, 'paragraph') : amountType === 'sentences' ? plural(requested, 'sentence') : plural(requested, 'word') },
      { label: 'Words produced', value: formatNumber(stats.words) },
      { label: 'Sentences', value: formatNumber(stats.sentences) },
      { label: 'Characters', value: formatNumber(stats.characters) },
    ],
    diagnostics: [
      { level: 'ok', message: 'Classic lorem ipsum, drawn from the browser’s cryptographic random source so the layout gets a different shape on every visit.' },
      { level: 'warn', message: 'Lorem ipsum is Latin-shaped gibberish. It is good for judging line length and layout, and it is unreadable as prose, so it must never reach a published page.' },
    ],
    download: { name: 'lorem-ipsum.txt', blob: textBlob(output, 'text/plain') },
  };
}

interface MimeEntry {
  mime: string;
  category: string;
  use: string;
  related: string;
  furtu: string;
}

const MIME_TABLE: Record<string, MimeEntry> = {
  '.pdf': { mime: 'application/pdf', category: 'Document', use: 'Portable document format: text, images and layout in one file, designed to look the same everywhere.', related: '.pdf, .ps', furtu: 'Furtu merges, splits, compresses, reorders and cleans up PDFs entirely in the browser.' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'Document', use: 'Microsoft Word document. A ZIP container of XML parts, not a binary format.', related: '.docm, .dotx', furtu: 'Furtu reads text and metadata out of Word files without uploading them.' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'Document', use: 'Microsoft Excel spreadsheet. Also a ZIP container of XML parts.', related: '.xlsm, .xltx', furtu: 'Furtu extracts sheet contents for conversion to CSV or JSON.' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'Document', use: 'Microsoft PowerPoint presentation. A ZIP container of XML parts.', related: '.pptm, .potx', furtu: 'Furtu reads text and speaker notes from presentations.' },
  '.odt': { mime: 'application/vnd.oasis.opendocument.text', category: 'Document', use: 'OpenDocument text, the open alternative to Word used by LibreOffice.', related: '.ods, .odp', furtu: 'Furtu handles OpenDocument files alongside the Microsoft formats.' },
  '.doc': { mime: 'application/msword', category: 'Document', use: 'The old binary Word format from before 2007. Not a ZIP container, and much harder to parse.', related: '.dot, .rtf', furtu: 'Furtu can read the text, though the old binary format carries less structure.' },
  '.rtf': { mime: 'application/rtf', category: 'Document', use: 'Rich Text Format: plain text with formatting codes, designed to survive every word processor.', related: '.rtfd', furtu: 'Furtu extracts the text and drops the formatting codes.' },
  '.txt': { mime: 'text/plain', category: 'Text', use: 'Unformatted text. The safest interchange format there is.', related: '.text, .log, .me', furtu: 'Furtu counts, cleans, sorts and re-cases plain text.' },
  '.md': { mime: 'text/markdown', category: 'Text', use: 'Markdown: plain text with a lightweight syntax for structure.', related: '.markdown, .mdown', furtu: 'Furtu previews Markdown with a safe renderer that cannot execute anything you paste.' },
  '.csv': { mime: 'text/csv', category: 'Data', use: 'Comma-separated values, defined by RFC 4180. Commas, quotes and newlines inside fields are all legal.', related: '.tsv, .txt', furtu: 'Furtu converts CSV to JSON and back with a parser that handles quoted fields properly.' },
  '.tsv': { mime: 'text/tab-separated-values', category: 'Data', use: 'Tab-separated values. Safer than CSV for text that contains commas.', related: '.tab', furtu: 'Furtu detects the delimiter for you.' },
  '.json': { mime: 'application/json', category: 'Data', use: 'JavaScript Object Notation. Note the strict MIME type is application/json; text/json is not registered.', related: '.jsonl, .geojson', furtu: 'Furtu formats, validates, minifies and converts JSON without sending it anywhere.' },
  '.yaml': { mime: 'application/yaml', category: 'Data', use: 'YAML: indentation-based configuration. The type is not standardised, so some servers send text/yaml instead.', related: '.yml', furtu: 'Furtu converts YAML to JSON and back, locally.' },
  '.yml': { mime: 'application/yaml', category: 'Data', use: 'YAML with the conventional short extension.', related: '.yaml', furtu: 'Furtu converts YAML to JSON and back, locally.' },
  '.xml': { mime: 'application/xml', category: 'Data', use: 'Extensible Markup Language. text/xml is the older, equally valid alternative.', related: '.xsd, .xsl, .rss, .atom', furtu: 'Furtu re-indents XML while leaving text and entities untouched.' },
  '.html': { mime: 'text/html', category: 'Web', use: 'A web page. text/html is the registered type; application/xhtml+xml is its XML counterpart.', related: '.htm, .xhtml', furtu: 'Furtu strips HTML tags in the text cleaner.' },
  '.css': { mime: 'text/css', category: 'Web', use: 'A stylesheet. Most servers send text/css, though text/plain also works.', related: '.scss, .less', furtu: 'Furtu can clean, sort and re-case the text inside it.' },
  '.js': { mime: 'text/javascript', category: 'Web', use: 'JavaScript. The standard type is text/javascript, not application/javascript, which browsers accept anyway.', related: '.mjs, .cjs', furtu: 'Furtu formats, minifies and converts JSON payloads inside code.' },
  '.mjs': { mime: 'text/javascript', category: 'Web', use: 'An ECMAScript module. Always served with the same MIME type as a .js file.', related: '.js, .cjs', furtu: 'Furtu formats and minifies JSON payloads.' },
  '.svg': { mime: 'image/svg+xml', category: 'Image', use: 'Scalable Vector Graphics: XML that draws a picture, so it scales to any size without blurring.', related: '.svgz', furtu: 'Furtu re-indents SVG as XML and converts it to PNG.' },
  '.png': { mime: 'image/png', category: 'Image', use: 'Lossless raster image with alpha transparency. Every browser supports it.', related: '.apng', furtu: 'Furtu compresses PNG, resizes it and converts it to WebP or AVIF.' },
  '.jpg': { mime: 'image/jpeg', category: 'Image', use: 'Lossy raster image. No transparency, and artefacts appear at low quality settings.', related: '.jpeg, .jpe, .jfif', furtu: 'Furtu compresses JPG and hits an exact file size.' },
  '.jpeg': { mime: 'image/jpeg', category: 'Image', use: 'The same format as .jpg under its other conventional name.', related: '.jpg', furtu: 'Furtu compresses JPEG and removes its metadata.' },
  '.webp': { mime: 'image/webp', category: 'Image', use: 'A lossy and lossless raster format from Google, smaller than JPEG or PNG at the same quality.', related: '', furtu: 'Furtu converts to and from WebP and compresses it.' },
  '.avif': { mime: 'image/avif', category: 'Image', use: 'AV1-based image format. Excellent compression, but encoding in the browser is slow.', related: '.avifs', furtu: 'Furtu converts to AVIF and compresses it.' },
  '.gif': { mime: 'image/gif', category: 'Image', use: 'An old 256-colour format with animation. Still the default for short looping clips.', related: '.gifv', furtu: 'Furtu converts GIF to a modern format.' },
  '.bmp': { mime: 'image/bmp', category: 'Image', use: 'Uncompressed Windows bitmap. Very large files, kept only for compatibility.', related: '.dib', furtu: 'Furtu converts BMP to WebP, PNG or AVIF, which is a dramatic saving.' },
  '.ico': { mime: 'image/vnd.microsoft.icon', category: 'Image', use: 'A Windows icon, which is a small BMP with extra variants inside.', related: '.cur', furtu: 'Furtu converts icons to PNG and back.' },
  '.heic': { mime: 'image/heic', category: 'Image', use: 'High Efficiency Image Container, as used by iPhone cameras. HEIF is the container; HEIC is one codec inside it.', related: '.heif, .heics', furtu: 'Furtu converts HEIC to a format every browser can show.' },
  '.tiff': { mime: 'image/tiff', category: 'Image', use: 'Uncompressed or losslessly compressed raster image, standard in printing and scanning.', related: '.tif', furtu: 'Furtu converts TIFF to web-ready formats.' },
  '.mp4': { mime: 'video/mp4', category: 'Media', use: 'A video container, most often holding H.264 or AV1 video with AAC audio.', related: '.m4v, .mov', furtu: 'Furtu does not process video; it can still tell you the type and size.' },
  '.webm': { mime: 'video/webm', category: 'Media', use: 'An open video container, usually VP8 or VP9 video with Opus audio.', related: '.ogv', furtu: 'Furtu does not process video; it can still tell you the type and size.' },
  '.mp3': { mime: 'audio/mpeg', category: 'Media', use: 'MP3 audio. Despite the patents that expired long ago, the type name stuck.', related: '.m4a, .aac', furtu: 'Furtu does not process audio.' },
  '.wav': { mime: 'audio/wav', category: 'Media', use: 'Uncompressed PCM audio, the same format CD audio uses.', related: '.wave', furtu: 'Furtu does not process audio.' },
  '.zip': { mime: 'application/zip', category: 'Archive', use: 'A ZIP archive. Office documents from 2007 onwards are ZIP files with a different extension.', related: '.zipx', furtu: 'Furtu detects ZIP containers when it validates office files.' },
  '.gz': { mime: 'application/gzip', category: 'Archive', use: 'A single file compressed with gzip, the basis of HTTP content encoding.', related: '.tgz', furtu: 'Furtu does not decompress archives.' },
  '.7z': { mime: 'application/x-7z-compressed', category: 'Archive', use: 'The 7-Zip archive format, with strong compression and no standard browser support.', related: '.7zip', furtu: 'Furtu does not decompress archives.' },
  '.rar': { mime: 'application/vnd.rar', category: 'Archive', use: 'A RAR archive. The format is proprietary and the specification was never published.', related: '.rar5', furtu: 'Furtu does not decompress archives.' },
  '.ttf': { mime: 'font/ttf', category: 'Font', use: 'TrueType font. The modern, correct type name; older systems send application/x-font-ttf.', related: '.otf, .ttc', furtu: 'Furtu can read the metadata inside a font file.' },
  '.otf': { mime: 'font/otf', category: 'Font', use: 'OpenType font, which is TrueType or CFF outlines plus richer tables.', related: '.ttf, .woff, .woff2', furtu: 'Furtu can read the metadata inside a font file.' },
  '.woff2': { mime: 'font/woff2', category: 'Font', use: 'The web font format, compressed with Brotli. Always served with CORS headers.', related: '.woff', furtu: 'Furtu can read the metadata inside a font file.' },
  '.ico2': { mime: 'image/x-icon', category: 'Image', use: 'The older type name for an icon. Prefer image/vnd.microsoft.icon.', related: '.ico, .cur', furtu: 'Furtu converts icons to PNG.' },
  '.epub': { mime: 'application/epub+zip', category: 'Document', use: 'An e-book: a ZIP of XHTML, CSS and images, plus an XML manifest.', related: '.epub3', furtu: 'Furtu reads the text inside an e-book.' },
  '.ics': { mime: 'text/calendar', category: 'Data', use: 'An iCalendar file for events and appointments.', related: '.ical, .ifb', furtu: 'Furtu can clean and reformat the text.' },
  '.rss': { mime: 'application/rss+xml', category: 'Data', use: 'An RSS feed. The correct type is application/rss+xml, not text/xml.', related: '.atom', furtu: 'Furtu re-indents the XML and can convert it to JSON.' },
  '.atom': { mime: 'application/atom+xml', category: 'Data', use: 'An Atom feed, the successor to RSS. The correct type is application/atom+xml.', related: '.rss', furtu: 'Furtu re-indents the XML and can convert it to JSON.' },
  '.sql': { mime: 'application/sql', category: 'Data', use: 'SQL script. There is no registered standard type, so application/sql is a convention.', related: '.ddl', furtu: 'Furtu can reformat, sort and clean the text.' },
  '.sh': { mime: 'application/x-sh', category: 'Code', use: 'A shell script. The type is a convention; text/x-shellscript is also used.', related: '.bash, .zsh', furtu: 'Furtu can re-case identifiers and clean the text.' },
  '.py': { mime: 'text/x-python', category: 'Code', use: 'A Python source file. text/x-python is the convention, not a registered type.', related: '.pyi', furtu: 'Furtu can re-case identifiers between snake_case and camelCase.' },
  '.ts': { mime: 'text/typescript', category: 'Code', use: 'A TypeScript source file.', related: '.tsx, .mts', furtu: 'Furtu can re-case identifiers between camelCase and PascalCase.' },
  '.env': { mime: 'text/plain', category: 'Data', use: 'A dotenv file of configuration values. It is plain text, and it usually holds secrets.', related: '.env.local, .env.production', furtu: 'Furtu never sends it anywhere. Clean it locally if you need to tidy it before sharing.' },
};

const MIME_LOOKUP_BY_TYPE = new Map<string, string>();
for (const [extension, entry] of Object.entries(MIME_TABLE)) {
  if (!MIME_LOOKUP_BY_TYPE.has(entry.mime)) MIME_LOOKUP_BY_TYPE.set(entry.mime, extension);
}

function mimeTypeLookup(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('a file name or extension, such as report.pdf, .heic or image/svg+xml');
  const match = controlText(values, 'match', 'auto');
  const raw = input.trim().split(/[\r\n\t,;]+/).map((part) => part.trim()).filter((part) => part !== '');
  const diagnostics: Diagnostic[] = [];
  const sections: string[] = [];

  for (const token of raw.slice(0, 20)) {
    let extension = '';
    let viaMime = false;

    if (match === 'mime' || (match === 'auto' && token.includes('/') && !token.includes('.'))) {
      const found = MIME_LOOKUP_BY_TYPE.get(token.toLowerCase().split(';')[0].trim());
      if (!found) {
        sections.push(`${token}\n  No entry for that type. Furtu knows ${MIME_LOOKUP_BY_TYPE.size} of the types that matter in practice; this is a lookup table, not a registry.`);
        continue;
      }
      extension = found;
      viaMime = true;
    } else {
      const cleaned = token.split('?')[0].split('#')[0];
      const dot = cleaned.lastIndexOf('.');
      const candidate = dot > 0 ? cleaned.slice(dot).toLowerCase() : cleaned.toLowerCase();
      extension = /^\.[a-z0-9]{1,12}$/.test(candidate) ? candidate : `.${candidate.replace(/^\./, '')}`;
    }

    const entry = MIME_TABLE[extension];
    if (!entry) {
      sections.push(`${token}\n  Not in Furtu’s table. There is no central registry of MIME types — the IANA list covers a few hundred, and every platform has its own extensions on top — so a miss here is normal rather than a bug.`);
      continue;
    }

    sections.push(
      [
        viaMime ? `${token}  (looked up by type)` : `${token}  (looked up by extension)`,
        `  MIME type     ${entry.mime}`,
        `  Extension     ${extension}`,
        `  Category      ${entry.category}`,
        `  What it is    ${entry.use}`,
        `  Neighbours    ${entry.related === '' ? 'None commonly confused with it' : entry.related}`,
        `  In Furtu      ${entry.furtu}`,
      ].join('\n'),
    );
  }

  if (raw.length > 20) {
    diagnostics.push({ level: 'warn', message: `Only the first 20 entries were looked up, out of ${raw.length} lines.` });
  }
  if (raw.length === 1 && !MIME_TABLE[`.${raw[0].toLowerCase().replace(/^\./, '')}`] && match === 'auto' && !raw[0].includes('.')) {
    diagnostics.push({ level: 'warn', message: 'That looks like a bare extension with no leading dot, such as “pdf” rather than “.pdf”. Furtu assumed a dot, which is usually right.' });
  }
  if (raw.some((token) => /^(env|env\.|.*secret|.*credential)/i.test(token.split('.').pop() ?? ''))) {
    diagnostics.push({ level: 'warn', message: 'That looks like a configuration file, which usually holds credentials. Furtu only read the name — nothing was opened, and nothing is sent anywhere.' });
  }

  return {
    output: sections.join('\n\n'),
    meta: [
      { label: 'Looked up', value: plural(sections.length, 'entry', 'entries') },
      { label: 'Types known', value: plural(MIME_LOOKUP_BY_TYPE.size, 'MIME type') },
      { label: 'Source', value: 'Bundled table in the page — no request was made' },
    ],
    diagnostics: [
      { level: 'ok', message: 'The table ships inside the page, so this works offline and leaks nothing. A browser decides the type of a file from its extension or from what the server sends, which is why the two can disagree — a .png served as text/plain is still a PNG.' },
      ...diagnostics,
    ],
  };
}

/* ===================================================================== */
/* operation map                                                         */
/* ===================================================================== */

import type { EngineChunk, TextOpMap } from '../types';

const text: TextOpMap = {
  'json-formatter': jsonFormatter,
  'json-validator': jsonValidator,
  'json-minifier': jsonMinifier,
  'json-to-csv': jsonToCsv,
  'csv-to-json': csvToJson,
  'xml-formatter': xmlFormatter,
  'base64-encoder': base64Encoder,
  'base64-decoder': base64Decoder,
  'url-encoder': urlEncoder,
  'url-decoder': urlDecoder,
  'jwt-decoder': jwtDecoder,
  'uuid-generator': uuidGenerator,
  'regex-tester': regexTester,
  'timestamp-converter': timestampConverter,
  'hash-generator': hashGenerator,
  'color-converter': colorConverter,
  'text-case-converter': textCaseConverter,
  'markdown-preview': markdownPreview,

  'word-counter': wordCounter,
  'character-counter': characterCounter,
  'text-cleaner': textCleaner,
  'remove-duplicate-lines': removeDuplicateLines,
  'sort-lines': sortLines,
  'password-generator': passwordGenerator,
  'file-size-converter': fileSizeConverter,
  'unit-converter': unitConverter,
  'percentage-calculator': percentageCalculator,
  'lorem-ipsum-generator': loremIpsumGenerator,
  'mime-type-lookup': mimeTypeLookup,
};

export default { text } satisfies EngineChunk;
