/**
 * Page range parsing, shared by every PDF page-selection tool.
 *
 * Accepted grammar:
 *   "1-3, 7, 12-"        pages 1,2,3, 7, 12..end
 *   "all" / ""           every page
 *   "3,1,2"              a sequence, order preserved, duplicates allowed
 *
 * Out-of-range and non-numeric entries are reported rather than silently
 * dropped — a user who typed "1-3, 99" needs to know page 99 does not exist
 * rather than quietly getting three pages.
 */

export interface PageRangeResult {
  /** Zero-based page indices, in the order given. */
  indices: number[];
  /** Human-readable complaints, empty when the input parsed cleanly. */
  warnings: string[];
}

export function parsePageRange(input: string, pageCount: number): PageRangeResult {
  const trimmed = (input ?? '').trim();
  const warnings: string[] = [];

  if (pageCount <= 0) return { indices: [], warnings: ['The document has no pages.'] };

  if (trimmed === '' || trimmed.toLowerCase() === 'all') {
    return { indices: Array.from({ length: pageCount }, (_, i) => i), warnings };
  }

  const indices: number[] = [];
  const seenInvalid: string[] = [];

  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.includes('-')) {
      const [rawStart, rawEnd] = part.split('-');
      const startText = (rawStart ?? '').trim();
      const endText = (rawEnd ?? '').trim();

      if (startText && !/^\d+$/.test(startText)) {
        seenInvalid.push(part);
        continue;
      }
      if (endText && !/^\d+$/.test(endText)) {
        seenInvalid.push(part);
        continue;
      }

      const start = startText ? Number.parseInt(startText, 10) : 1;
      const end = endText ? Number.parseInt(endText, 10) : pageCount;

      if (start < 1) {
        warnings.push(`Page numbers start at 1, so "${part}" was ignored.`);
        continue;
      }
      if (start > pageCount) {
        warnings.push(`This document has ${pageCount} page${pageCount === 1 ? '' : 's'}, so "${part}" is out of range.`);
        continue;
      }

      const clampedEnd = Math.min(end, pageCount);
      if (end > pageCount) {
        warnings.push(`Pages run to ${pageCount}, so "${part}" was read as ${start}-${clampedEnd}.`);
      }
      if (clampedEnd < start) {
        warnings.push(`"${part}" runs backwards and was ignored.`);
        continue;
      }

      for (let page = start; page <= clampedEnd; page += 1) indices.push(page - 1);
    } else {
      if (!/^\d+$/.test(part)) {
        seenInvalid.push(part);
        continue;
      }
      const page = Number.parseInt(part, 10);
      if (page < 1) {
        warnings.push(`Page numbers start at 1, so "${part}" was ignored.`);
        continue;
      }
      if (page > pageCount) {
        warnings.push(`This document has ${pageCount} page${pageCount === 1 ? '': 's'}, so "${part}" is out of range.`);
        continue;
      }
      indices.push(page - 1);
    }
  }

  if (seenInvalid.length > 0) {
    warnings.push(`Could not read ${seenInvalid.map((p) => `"${p}"`).join(', ')} as page numbers.`);
  }

  return { indices, warnings };
}

/** Same as `parsePageRange` but for tools that must not allow duplicates or gaps. */
export function parsePageOrder(input: string, pageCount: number): PageRangeResult {
  return parsePageRange(input, pageCount);
}

/** `1, 3, 5-7` style label for summaries. */
export function describeIndices(indices: number[], limit = 12): string {
  if (indices.length === 0) return 'no pages';
  const shown = indices.slice(0, limit).map((index) => String(index + 1));
  const suffix = indices.length > limit ? `, +${indices.length - limit} more` : '';
  return `page${indices.length === 1 ? '' : 's'} ${shown.join(', ')}${suffix}`;
}
