/**
 * Lazy engine loading.
 *
 * Every engine, including the text one, is behind a dynamic import.
 *
 * The text engine was originally imported eagerly on the reasoning that a pure
 * string-transform module must be small. Measuring it showed otherwise: it is
 * the largest single module in the codebase and was adding roughly 100 KB
 * gzipped to the first load of every page, including the ones that never touch
 * a text tool. Eagerness bought one avoided round trip and cost every visitor
 * that weight, so it is now split like the rest.
 */

import type { EngineChunk, FileOperation, FileTextOperation, TextOperation } from './types';
import type { EngineId } from '../tools/types';

const LAZY_CHUNKS: Record<EngineId, () => Promise<EngineChunk>> = {
  pdf: () => import('./ops/pdf').then((module) => module.default),
  image: () => import('./ops/image').then((module) => module.default),
  document: () => import('./ops/document').then((module) => module.default),
  text: () => import('./ops/text').then((module) => module.default),
  yaml: () => import('./ops/yaml').then((module) => module.default),
  qr: () => import('./ops/qr').then((module) => module.default),
};

const cache = new Map<EngineId, Promise<EngineChunk>>();

function loadEngine(engine: EngineId): Promise<EngineChunk> {
  const cached = cache.get(engine);
  if (cached) return cached;

  const promise = LAZY_CHUNKS[engine]().catch((error: unknown) => {
    // Drop the failed promise so a retry can try again rather than replaying
    // the same rejection forever. The original error is attached for a console
    // log rather than shown, because it is a module-loading artefact rather
    // than something a visitor can act on.
    cache.delete(engine);
    const failure = new Error(
      'This tool could not load its processing engine. Check your connection and try again.',
    );
    (failure as Error & { cause?: unknown }).cause = error;
    throw failure;
  });

  cache.set(engine, promise);
  return promise;
}

export async function resolveFileOperation(
  engine: EngineId,
  operation: string,
): Promise<FileOperation | null> {
  const chunk = await loadEngine(engine);
  return chunk.file?.[operation] ?? null;
}

/**
 * For file-input tools whose result is text rather than a file — extracting the
 * text layer from a PDF, for example. Returns null when the engine does not
 * provide one, so the workspace can fall back to the file path.
 */
export async function resolveFileTextOperation(
  engine: EngineId,
  operation: string,
): Promise<FileTextOperation | null> {
  const chunk = await loadEngine(engine);
  return chunk.fileText?.[operation] ?? null;
}

export async function resolveTextOperation(
  engine: EngineId,
  operation: string,
): Promise<TextOperation | null> {
  const chunk = await loadEngine(engine);
  return chunk.text?.[operation] ?? null;
}

/**
 * The optional read-only step a tool declares via `ToolDefinition.inspect`. It
 * shares the `fileText` map because it has the same shape — a file in, a report
 * out — but it is resolved separately so a tool's main operation is never
 * confused with its inspection.
 */
export async function resolveInspectOperation(
  engine: EngineId,
  operation: string,
): Promise<FileTextOperation | null> {
  const chunk = await loadEngine(engine);
  return chunk.fileText?.[operation] ?? null;
}

export { LAZY_CHUNKS };
