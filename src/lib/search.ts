/**
 * Tool search.
 *
 * Runs on every keystroke over the whole catalogue, so it has to be both fast
 * and forgiving. People do not search for tool names — they search for the
 * problem they have: "make the pdf smaller", "reduce jpg", "json pretty".
 * The synonym table below maps those intentions onto real tools.
 *
 * Scoring is intentionally simple and inspectable: a phrase match always beats
 * a token match, and a name match always beats a description match. A fuzzy
 * algorithm would be hard to reason about and would rank worse.
 */

import { TOOLS, isIndexable } from './tools/registry';
import type { ToolDefinition } from './tools/types';

export interface SearchHit {
  tool: ToolDefinition;
  score: number;
  /** Why this matched, shown as a hint under the result. */
  reason?: string;
}

/** Informal phrasings mapped to the catalogue terms they should find. */
const INTENT_SYNONYMS: Record<string, string[]> = {
  'make smaller': ['compress'],
  'make it smaller': ['compress'],
  'reduce size': ['compress'],
  'shrink': ['compress'],
  'too big': ['compress'],
  'file size limit': ['compress'],
  'attachment limit': ['compress'],
  'combine': ['merge'],
  'join': ['merge'],
  'put together': ['merge'],
  'glue': ['merge'],
  'one file': ['merge'],
  'cut': ['split'],
  'divide': ['split'],
  'separate': ['split'],
  'break up': ['split'],
  'each page': ['split'],
  'flip': ['rotate'],
  'turn': ['rotate'],
  'sideways': ['rotate'],
  'upside down': ['rotate'],
  'portrait': ['rotate'],
  'landscape': ['rotate'],
  'throw away': ['delete'],
  'get rid of': ['delete'],
  'remove page': ['delete'],
  'keep only': ['extract'],
  'pull out': ['extract'],
  'save pages': ['extract'],
  'beautify': ['format'],
  'pretty': ['format'],
  'tidy': ['format'],
  'indent': ['format'],
  'is it valid': ['validate'],
  'check': ['validate'],
  'broken': ['validate'],
  'error in': ['validate'],
  'squash': ['minify'],
  'strip whitespace': ['minify'],
  'shrink the code': ['minify'],
  'encode': ['encoder'],
  'decode': ['decoder'],
  'token': ['jwt'],
  'auth': ['jwt'],
  'random string': ['uuid', 'password'],
  'unique id': ['uuid'],
  'guid': ['uuid'],
  'hash': ['hash'],
  'checksum': ['hash'],
  'digest': ['hash'],
  'timestamp': ['timestamp'],
  'epoch': ['timestamp'],
  'date to unix': ['timestamp'],
  'colour': ['color'],
  'hex': ['color'],
  'rgb': ['color'],
  'hsl': ['color'],
  'words': ['word'],
  'characters': ['character'],
  'how many words': ['word'],
  'reading time': ['word'],
  'password': ['password'],
  'strong password': ['password'],
  'scan code': ['qr'],
  'qr code': ['qr'],
  'geo': ['location'],
  'exif': ['metadata'],
  'private data': ['metadata'],
  'strip data': ['metadata'],
  'excel': ['xlsx', 'csv'],
  'spreadsheet': ['csv', 'xlsx'],
  'word document': ['docx'],
  'powerpoint': ['pptx'],
  'slides': ['pptx'],
  'text out of': ['to-text', 'extract'],
  'to text': ['to-text'],
  'regex': ['regex'],
  'pattern match': ['regex'],
  'url safe': ['url-encoder'],
  'percent encode': ['url-encoder'],
};

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function scoreTool(tool: ToolDefinition, query: string, tokens: string[]): SearchHit | null {
  const name = normalise(tool.name);
  const summary = normalise(tool.summary);
  const keywords = tool.keywords.map(normalise);
  const synonyms = tool.synonyms.map(normalise);
  const haystack = normalise(
    [tool.name, tool.summary, tool.keywords.join(' '), tool.synonyms.join(' '), tool.category].join(' '),
  );

  let score = 0;
  let reason: string | undefined;

  if (name === query) {
    return { tool, score: 1000, reason: 'Exact match' };
  }
  if (name.startsWith(query)) {
    score = Math.max(score, 600);
    reason = 'Tool name';
  } else if (name.includes(query)) {
    score = Math.max(score, 480);
    reason = 'Tool name';
  }

  for (const keyword of keywords) {
    if (keyword === query) {
      score = Math.max(score, 520);
      reason = 'Keyword';
    } else if (keyword.includes(query)) {
      score = Math.max(score, 380);
      reason = 'Keyword';
    }
  }

  // The reason most people miss: the query contains a word the catalogue uses
  // in a different phrasing. "smaller" has to reach Compress.
  for (const [phrase, terms] of Object.entries(INTENT_SYNONYMS)) {
    if (!query.includes(phrase)) continue;
    if (!haystack.includes(phrase)) {
      for (const term of terms) {
        if (haystack.includes(term)) {
          score = Math.max(score, 300);
          reason = reason ?? `Matches “${phrase}”`;
        }
      }
    }
  }

  for (const synonym of synonyms) {
    if (synonym.includes(query) && query.length >= 3) {
      score = Math.max(score, 260);
      reason = reason ?? 'Related term';
    }
  }

  if (summary.includes(query)) {
    score = Math.max(score, 200);
    reason = reason ?? 'Description';
  }

  // Token-level fallback so "png webp" still ranks the PNG→WebP converter.
  let tokenHits = 0;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (name.includes(token) || haystack.includes(token)) tokenHits += 1;
  }
  if (tokenHits > 0) {
    score = Math.max(score, 80 + tokenHits * 45);
    reason = reason ?? 'Partial match';
  }

  if (score === 0) return null;
  return { tool, score, reason };
}

export function searchTools(rawQuery: string, limit = 8): SearchHit[] {
  const query = normalise(rawQuery);
  if (!query) return [];
  const tokens = query.split(' ').filter((token) => token.length >= 2);

  const hits: SearchHit[] = [];
  for (const tool of TOOLS) {
    if (!isIndexable(tool)) continue;
    const hit = scoreTool(tool, query, tokens);
    if (hit) hits.push(hit);
  }

  return hits
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit);
}

/** Suggestions shown before the user types, in the palette and the hero. */
export function suggestedQueries(): string[] {
  return [
    'compress a PDF',
    'make this image 200 KB',
    'merge PDFs',
    'split PDF pages',
    'format JSON',
    'convert JPG to WebP',
  ];
}
