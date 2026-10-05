/**
 * YAML engine — `json-to-yaml` and `yaml-to-json`.
 *
 * This chunk exists on its own so that `js-yaml` is only downloaded when someone
 * opens a YAML tool. The two JSON error helpers are deliberately duplicated
 * rather than imported from `./text`: importing them would pull the whole text
 * engine, React and the Markdown renderer into the YAML download.
 */

import * as YAML from 'js-yaml';

import { formatBytes, formatNumber } from '@/lib/format';

import type { ControlValues, Diagnostic, TextResult } from '../types';

function nothingToDo(what: string): TextResult {
  return {
    output: '',
    diagnostics: [{ level: 'warn', message: `Nothing to work on yet. Add ${what} and the conversion happens in this tab — nothing is uploaded.` }],
  };
}

function errorResult(message: string): TextResult {
  return { output: '', diagnostics: [{ level: 'error', message }] };
}

function jsonProblem(source: string, error: unknown): Diagnostic {
  const raw = error instanceof Error ? error.message : String(error);
  const prose = raw
    .replace(/^JSON\.parse:\s*/i, '')
    .replace(/\s+in JSON at (?:position \d+|line \d+ column \d+).*$/i, '')
    .replace(/^Unexpected end of JSON input$/i, 'The document stops in the middle of a value — a brace, bracket or quote is probably missing')
    .replace(/^Unexpected token ['"`]?([\s\S])['"`]?$/i, 'Unexpected character “$1”')
    .trim();

  const offsetMatch = /position (\d+)/.exec(raw);
  let line = 1;
  let column = 1;
  if (offsetMatch) {
    const offset = Math.min(Number(offsetMatch[1]), source.length);
    for (let i = 0; i < offset; i += 1) {
      if (source[i] === '\n') {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
  } else {
    const lineColumn = /line (\d+) column (\d+)/.exec(raw);
    if (lineColumn) {
      line = Number(lineColumn[1]);
      column = Number(lineColumn[2]);
    }
  }
  return { level: 'error', message: `This is not valid JSON: ${prose}. Reported at line ${line}, column ${column}.` };
}

function readJson(source: string): { value?: unknown; error?: Diagnostic } {
  try {
    return { value: JSON.parse(source) as unknown };
  } catch (error) {
    return { error: jsonProblem(source, error) };
  }
}

function indentOf(choice: string): number {
  const width = Number(choice);
  return Number.isFinite(width) && width >= 1 && width <= 8 ? Math.round(width) : 2;
}

function jsonToYaml(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some JSON to turn into YAML');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const read = readJson(source);
  if (read.error) return errorResult(read.error.message);

  const indent = indentOf(controlText(values, 'indent', '2'));
  const sortKeys = controlText(values, 'sortKeys', 'false') === 'true' || values.sortKeys === true;

  let output: string;
  try {
    output = YAML.dump(read.value, {
      indent,
      sortKeys,
      // Anchors and aliases are a YAML feature, but a converter that emits
      // `&a1` / `*a1` for repeated sub-objects produces output most people did
      // not ask for and cannot round-trip through a strict parser.
      noRefs: true,
      lineWidth: 100,
      noArrayIndent: false,
    });
  } catch (error) {
    return errorResult(`js-yaml refused to serialise that value: ${error instanceof Error ? error.message : String(error)}.`);
  }

  return {
    output,
    meta: [
      { label: 'Input size', value: formatBytes(utf8Length(source)) },
      { label: 'Output size', value: formatBytes(utf8Length(output)) },
      { label: 'Indent', value: `${indent} spaces` },
      { label: 'Keys', value: sortKeys ? 'Sorted alphabetically' : 'Kept in JSON order' },
    ],
    diagnostics: [
      {
        level: 'ok',
        message: 'Converted with js-yaml, in this tab. Strings that look like numbers or dates keep their quotes, so nothing changes type on the way back.',
      },
      { level: 'warn', message: 'YAML has no null: a missing value is written as a bare `~` or left empty, and an empty string becomes `""`. Both read back correctly, but the file looks different from the JSON.' },
    ],
    download: { name: 'converted.yaml', blob: new Blob([output], { type: 'application/yaml' }) },
  };
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

function controlText(values: ControlValues, id: string, fallback = ''): string {
  const value = values[id];
  return typeof value === 'string' ? value : fallback;
}

interface NormaliseNotes {
  dates: number;
  nonFinite: number;
  binaries: number;
}

function normalise(value: unknown, notes: NormaliseNotes, depth = 0): unknown {
  if (depth > 64) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    // JSON has no way to write NaN or Infinity, and silently turning them into
    // null would be a lie. They are counted, named and replaced.
    if (!Number.isFinite(value)) {
      notes.nonFinite += 1;
      return null;
    }
    return value;
  }
  if (typeof value === 'bigint') {
    notes.binaries += 1;
    return value.toString();
  }
  if (value instanceof Date) {
    notes.dates += 1;
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) return value.map((item) => normalise(item, notes, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) out[key] = normalise(child, notes, depth + 1);
    return out;
  }
  return String(value);
}

function yamlToJson(input: string, values: ControlValues): TextResult {
  if (input.trim() === '') return nothingToDo('some YAML to turn into JSON');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const indent = indentOf(controlText(values, 'indent', '2'));
  const multiDocument = values.multiDocument === true || controlText(values, 'multiDocument', 'false') === 'true';

  let documents: unknown[];
  try {
    documents = multiDocument
      ? (YAML.loadAll(source) as unknown[])
      : [YAML.load(source) as unknown];
  } catch (error) {
    if (error instanceof YAML.YAMLException) {
      const mark = error.mark;
      const where = mark ? ` Line ${mark.line + 1}, column ${mark.column + 1}.` : '';
      return errorResult(`That YAML does not parse: ${error.reason}.${where}${mark?.snippet ? ` Near: ${mark.snippet.replace(/\n/g, ' ')}` : ''}`);
    }
    return errorResult(`That YAML does not parse: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const notes: NormaliseNotes = { dates: 0, nonFinite: 0, binaries: 0 };
  const converted = multiDocument ? documents.map((document) => normalise(document, notes)) : normalise(documents[0], notes);

  let output: string;
  try {
    output = `${JSON.stringify(converted, null, indent)}\n`;
  } catch (error) {
    return errorResult(`The document parsed, but it cannot be written as JSON: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const diagnostics: Diagnostic[] = [
    { level: 'ok', message: 'Parsed with js-yaml, in this tab. Indentation carries all of the structure in YAML, so a single stray space changes what a key means.' },
  ];
  if (multiDocument) {
    diagnostics.push({ level: 'ok', message: `Read as ${formatNumber(documents.length)} documents separated by ---, and written as a JSON array of ${formatNumber(documents.length)}.` });
  }
  if (notes.dates > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${formatNumber(notes.dates)} ${notes.dates === 1 ? 'value' : 'values'} ${notes.dates === 1 ? 'was' : 'were'} read as a date by YAML's timestamp rules and ${notes.dates === 1 ? 'is' : 'are'} now an ISO 8601 string. Quoting them in the source, as "2026-01-01", keeps them as text.`,
    });
  }
  if (notes.nonFinite > 0) {
    diagnostics.push({
      level: 'warn',
      message: `${formatNumber(notes.nonFinite)} ${notes.nonFinite === 1 ? 'value is' : 'values are'} .inf, -.inf or .nan, which JSON cannot represent. Each was written as null, so check the source if those values matter.`,
    });
  }
  if (notes.binaries > 0) {
    diagnostics.push({ level: 'warn', message: `${formatNumber(notes.binaries)} very large integers were converted to strings, because JavaScript numbers stop being exact above 2^53.` });
  }
  if (!multiDocument && documents[0] === null && source.trim() !== 'null' && source.trim() !== '~') {
    diagnostics.push({ level: 'warn', message: 'The document is empty, or contains only comments. That is a valid YAML file with no data in it.' });
  }

  return {
    output,
    meta: [
      { label: 'Documents', value: String(multiDocument ? documents.length : 1) },
      { label: 'Output size', value: formatBytes(utf8Length(output)) },
      { label: 'Indent', value: `${indent} spaces` },
      { label: 'Converted', value: 'Locally, with js-yaml' },
    ],
    diagnostics,
    download: { name: 'converted.json', blob: new Blob([output], { type: 'application/json' }) },
  };
}

import type { EngineChunk, TextOpMap } from '../types';

const text: TextOpMap = {
  'json-to-yaml': jsonToYaml,
  'yaml-to-json': yamlToJson,
};

export default { text } satisfies EngineChunk;
