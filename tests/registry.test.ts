import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { TOOLS, toolPath, getToolByPath, indexableTools, relatedTools } from '@/lib/tools/registry';
import { CATEGORIES } from '@/lib/tools/categories';
import { GUIDES } from '@/lib/guides';
import { toolMeta, homeMeta, categoryMeta, notFoundMeta } from '@/lib/seo';
import { searchTools } from '@/lib/search';

/**
 * These are the invariants the whole "add a tool in one file" promise rests on.
 * If any of them break, a page can ship with a dead tool, a duplicated
 * description, or a URL that resolves to nothing.
 */

const ENGINE_DIR = path.resolve(__dirname, '../src/lib/engines/ops');
const TOOL_DIR = path.resolve(__dirname, '../src/lib/tools');

/** Slugs declared in a category definition file. */
function slugsIn(file: string): string[] {
  const source = readFileSync(path.join(TOOL_DIR, file), 'utf8');
  return [...source.matchAll(/^\s{4}slug: '([a-z0-9-]+)',/gm)].map((match) => match[1]);
}

/**
 * Operation keys actually registered in an engine chunk.
 *
 * Only the three operation maps are read. Matching every two-space-indented
 * quoted key in the file would also pick up option tables such as the
 * rotate/flip lookup, and report those as orphan operations.
 *
 * Both quote styles are accepted, because the engine files are not all
 * formatted identically and a formatting pass should not be able to make this
 * test lie.
 */
function operationsIn(file: string): string[] {
  const source = readFileSync(path.join(ENGINE_DIR, file), 'utf8');
  const keys: string[] = [];

  for (const mapName of ['file', 'text', 'fileText']) {
    const declaration = new RegExp(`const ${mapName}: (?:FileOpMap|TextOpMap|FileTextOpMap) = \\{`, 'g');
    let match: RegExpExecArray | null;
    while ((match = declaration.exec(source)) !== null) {
      const start = match.index + match[0].length;
      let depth = 1;
      let i = start;
      for (; i < source.length && depth > 0; i += 1) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') depth -= 1;
      }
      const body = source.slice(start, i);
      for (const entry of body.matchAll(/^ {2}['"]([a-z0-9-]+)['"]:/gm)) keys.push(entry[1]);
    }
  }

  return keys;
}

describe('tool registry integrity', () => {
  it('has a meaningful number of tools across all five categories', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(50);
    expect(CATEGORIES).toHaveLength(5);
    for (const category of CATEGORIES) {
      expect(TOOLS.filter((tool) => tool.category === category.id).length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate slugs', () => {
    const seen = new Set<string>();
    for (const tool of TOOLS) {
      expect(seen.has(tool.slug), `duplicate slug: ${tool.slug}`).toBe(false);
      seen.add(tool.slug);
    }
  });

  it('uses URL-safe slugs that match the brief\'s convention', () => {
    for (const tool of TOOLS) {
      expect(tool.slug, `bad slug: ${tool.slug}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('resolves every tool URL back to its tool', () => {
    for (const tool of TOOLS) {
      expect(getToolByPath(toolPath(tool))?.slug, `URL does not resolve: ${toolPath(tool)}`).toBe(tool.slug);
    }
  });

  it('rejects a tool URL with the wrong category segment', () => {
    const tool = TOOLS[0];
    const wrong = toolPath(tool).replace(`/tools/${tool.category}`, '/tools/pdf');
    if (wrong !== toolPath(tool)) {
      expect(getToolByPath(wrong)).toBeNull();
    }
  });

  it('gives every tool a working engine operation', () => {
    const operations = new Set(
      readdirSync(ENGINE_DIR)
        .filter((file) => file.endsWith('.ts'))
        .flatMap((file) => operationsIn(file)),
    );

    const missing = TOOLS.filter((tool) => !operations.has(tool.operation ?? tool.slug));
    expect(missing.map((tool) => tool.slug), 'tools with no registered operation').toEqual([]);
  });

  it('registers no operation that no tool uses', () => {
    // An `inspect` operation is reached through its own field, so it counts as
    // used even though no tool's main operation points at it.
    const used = new Set<string>();
    for (const tool of TOOLS) {
      used.add(tool.operation ?? tool.slug);
      if (tool.inspect) used.add(tool.inspect);
    }
    const operations = readdirSync(ENGINE_DIR)
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => operationsIn(file));

    expect(operations.filter((key) => !used.has(key)), 'orphan operations').toEqual([]);
  });

  it('declares a file requirement for every operation that needs one', () => {
    // The workspace runs most file tools one file at a time. An operation that
    // needs the whole set has to say so, or it is handed a single file and
    // refuses — which reads as a broken tool rather than a broken input.
    for (const tool of TOOLS) {
      if (tool.collects) {
        expect(tool.minFiles ?? 1, `${tool.slug} collects files but sets no minimum`).toBeGreaterThan(1);
        expect(tool.input?.multiple, `${tool.slug} collects files but only accepts one`).toBe(true);
      }
      if ((tool.minFiles ?? 1) > 1) {
        expect(tool.collects, `${tool.slug} sets minFiles without collects`).toBe(true);
      }
    }
  });

  it('has no duplicated summary or description text', () => {
    for (const field of ['summary', 'description'] as const) {
      const seen = new Map<string, string>();
      for (const tool of TOOLS) {
        const value = tool[field].trim();
        expect(value.length, `${tool.slug} has an empty ${field}`).toBeGreaterThan(20);
        expect(seen.has(value), `duplicate ${field} on ${tool.slug} and ${seen.get(value)}`).toBe(false);
        seen.set(value, tool.slug);
      }
    }
  });

  it('writes unique page titles and descriptions for every tool', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const tool of indexableTools()) {
      const meta = toolMeta(tool);
      expect(titles.has(meta.title), `duplicate title: ${meta.title}`).toBe(false);
      expect(descriptions.has(meta.description), `duplicate description on ${tool.slug}`).toBe(false);
      expect(meta.title.length).toBeLessThanOrEqual(80);
      expect(meta.description.length).toBeLessThanOrEqual(160);
      titles.add(meta.title);
      descriptions.add(meta.description);
    }
  });

  it('keeps the privacy claim derived rather than hand-written', () => {
    // Every tool is local in v1, and the badge on the page is generated from this.
    for (const tool of TOOLS) {
      expect(tool.mode ?? 'local', `${tool.slug} claims non-local processing`).toBe('local');
    }
  });

  it('states honest limitations on every file tool', () => {
    for (const tool of TOOLS) {
      if (tool.workspace === 'files') {
        expect(tool.limitations?.length ?? 0, `${tool.slug} has no stated limitations`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every tool FAQ entries that actually address the privacy question', () => {
    // The requirement is that the page answers the question, not that it uses
    // one particular word. "Nothing is uploaded", "runs in your browser" and
    // "your original is untouched on your device" are all real answers, and
    // demanding a single phrase would push the copy towards boilerplate.
    const answersPrivacy = /upload|never leaves|stays on your device|in your browser|on your device|untouched|not transmitted|never transmitted|no server/i;

    // Collected first and asserted once, so a single run reports every
    // offender rather than only the first.
    const tooFew = TOOLS.filter((tool) => tool.faq.length < 3).map((tool) => `${tool.slug} (${tool.faq.length})`);
    const noPrivacyAnswer = TOOLS.filter(
      (tool) => !tool.faq.some((entry) => answersPrivacy.test(entry.q) || answersPrivacy.test(entry.a)),
    ).map((tool) => tool.slug);

    expect({ tooFew, noPrivacyAnswer }).toEqual({ tooFew: [], noPrivacyAnswer: [] });
  });

  it('builds a related-tools graph that never links a page to itself', () => {
    for (const tool of TOOLS) {
      for (const related of relatedTools(tool, 6)) {
        expect(related.slug, `${tool.slug} links to itself`).not.toBe(tool.slug);
      }
    }
  });

  it('accepts only control kinds the workspace can render', () => {
    const allowed = new Set(['select', 'number', 'toggle', 'text', 'color', 'pages']);
    for (const tool of TOOLS) {
      for (const control of tool.controls) {
        expect(allowed.has(control.kind), `${tool.slug} uses unknown control kind ${control.kind}`).toBe(true);
        if (control.kind === 'select') {
          expect(control.options.length, `${tool.slug}.${control.id} has no options`).toBeGreaterThan(0);
          const values = new Set(control.options.map((option) => option.value));
          expect(values.size, `${tool.slug}.${control.id} has duplicate option values`).toBe(control.options.length);
          expect(values.has(String(control.default)), `${tool.slug}.${control.id} default is not an option`).toBe(true);
        }
        if (control.kind === 'number') {
          expect(control.min).toBeLessThan(control.max);
          expect(control.default).toBeGreaterThanOrEqual(control.min);
          expect(control.default).toBeLessThanOrEqual(control.max);
        }
      }
    }
  });
});

describe('controls match the engine that reads them', () => {
  const engineSources = readdirSync(ENGINE_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ file, source: readFileSync(path.join(ENGINE_DIR, file), 'utf8') }));

  /**
   * This is the check that catches the most damaging class of bug: a tool
   * declaring a control the engine never reads, which shows up as an option in
   * the UI that silently does nothing.
   */
  it('declares a default for every control the engines read', () => {
    const read = new Set<string>();
    for (const { source } of engineSources) {
      for (const match of source.matchAll(/(?:controlText|controlNumber|controlBool|text|flag|num)\(\s*values\s*,\s*'([a-zA-Z]+)'/g)) {
        read.add(match[1]);
      }
    }

    const declared = new Set(TOOLS.flatMap((tool) => tool.controls.map((control) => control.id)));
    // Controls the engine reads through a table rather than a literal, such as
    // the password character classes.
    for (const id of ['lowercase', 'uppercase', 'digits', 'symbols']) declared.add(id);

    const undeclared = [...read].filter((id) => !declared.has(id));
    expect(undeclared, 'engines read controls no tool declares').toEqual([]);
  });
});

describe('guide content', () => {
  it('has unique slugs and usable metadata', () => {
    const seen = new Set<string>();
    for (const guide of GUIDES) {
      expect(seen.has(guide.slug), `duplicate guide slug ${guide.slug}`).toBe(false);
      seen.add(guide.slug);
      expect(guide.title.length).toBeGreaterThan(10);
      expect(guide.description.length).toBeGreaterThan(60);
      expect(guide.blocks.length).toBeGreaterThan(4);
      expect(guide.readingMinutes).toBeGreaterThan(0);
    }
  });

  it('gives every guide working tool links', () => {
    const slugs = new Set(TOOLS.map((tool) => tool.slug));
    for (const guide of GUIDES) {
      expect(guide.relatedTools.length, `${guide.slug} links to no tools`).toBeGreaterThan(0);
      for (const slug of guide.relatedTools) {
        expect(slugs.has(slug), `${guide.slug} links to unknown tool ${slug}`).toBe(true);
      }
    }
  });

  it('uses unique h2 ids inside each guide so the table of contents works', () => {
    for (const guide of GUIDES) {
      const ids = guide.blocks
        .filter((block): block is Extract<typeof block, { kind: 'h2' }> => block.kind === 'h2')
        .map((block) => block.id);
      expect(new Set(ids).size, `${guide.slug} has duplicate h2 ids`).toBe(ids.length);
    }
  });
});

describe('search', () => {
  it('finds tools by intent rather than only by name', () => {
    const cases: [string, string][] = [
      ['make the pdf smaller', 'compress-pdf'],
      ['reduce jpg', 'compress-image'],
      ['json pretty', 'json-formatter'],
      ['join two pdfs together', 'merge-pdf'],
      ['make this image 200 kb', 'compress-image-to-200kb'],
      ['strip gps data from a photo', 'remove-image-metadata'],
      ['check if my json is broken', 'json-validator'],
      ['turn pictures into one pdf', 'images-to-pdf'],
    ];

    for (const [query, expected] of cases) {
      const hits = searchTools(query, 5).map((hit) => hit.tool.slug);
      expect(hits, `"${query}" should surface ${expected}`).toContain(expected);
    }
  });

  it('returns nothing for an empty query and never throws on junk', () => {
    expect(searchTools('')).toEqual([]);
    expect(() => searchTools('   ')).not.toThrow();
    expect(() => searchTools('!!!@@@###')).not.toThrow();
  });

  it('ranks a name match above a description-only match', () => {
    const hits = searchTools('json formatter', 5);
    expect(hits[0].tool.slug).toBe('json-formatter');
  });
});

describe('page metadata', () => {
  it('gives the homepage a unique title, description and structured data', () => {
    const meta = homeMeta();
    expect(meta.title).toContain('Furtu');
    expect(meta.description.length).toBeGreaterThan(60);
    expect(meta.jsonLd.length).toBeGreaterThanOrEqual(2);
    expect(meta.canonical).toMatch(/^https:\/\//);
  });

  it('marks the not-found page noindex', () => {
    expect(notFoundMeta().robots).toContain('noindex');
  });

  it('emits a canonical that matches the tool path exactly', () => {
    for (const tool of indexableTools()) {
      const meta = toolMeta(tool);
      expect(meta.canonical.endsWith(toolPath(tool)), `${tool.slug} canonical mismatch`).toBe(true);
    }
  });

  it('emits FAQ structured data only when the page has FAQ entries', () => {
    for (const tool of indexableTools()) {
      const hasFaqNode = toolMeta(tool).jsonLd.some((node) => (node as { '@type'?: string })['@type'] === 'FAQPage');
      expect(hasFaqNode, `${tool.slug} FAQ mismatch`).toBe(tool.faq.length > 0);
    }
  });

  it('never leaks a raw script terminator into structured data', () => {
    for (const tool of indexableTools()) {
      for (const node of toolMeta(tool).jsonLd) {
        expect(JSON.stringify(node)).not.toContain('</script');
      }
    }
  });

  it('produces a distinct category page per category', () => {
    const seen = new Set<string>();
    for (const category of CATEGORIES) {
      const meta = categoryMeta(category.segment, 5);
      expect(seen.has(meta.title), `duplicate category title ${meta.title}`).toBe(false);
      seen.add(meta.title);
    }
  });
});
