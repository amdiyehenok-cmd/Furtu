/** Contract between a tool definition and its lazily-loaded engine. */

export type ControlValues = Record<string, string | number | boolean>;

export interface ToolContext {
  signal: AbortSignal;
  /** Report progress for long operations. `fraction` is clamped to 0..1. */
  onProgress: (fraction: number, note?: string) => void;
}

export interface FileOutput {
  name: string;
  blob: Blob;
  /** Object URL for a visual preview, when the output is renderable. */
  previewUrl?: string;
  /** Human-readable per-file note, e.g. "2.8 MB → 742 KB". */
  note?: string;
}

export interface Diagnostic {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

export interface TextResult {
  output: string;
  meta?: { label: string; value: string }[];
  diagnostics?: Diagnostic[];
  /** Secondary output the workspace can offer as a download. */
  download?: { name: string; blob: Blob };
  /**
   * Values to seed into the tool's controls, used by an inspect step. Reading a
   * document's current properties and showing them in editable fields is what
   * makes an "edit this metadata" tool actually inspect before it writes.
   */
  prefill?: ControlValues;
}

export type FileOperation = (
  files: File[],
  values: ControlValues,
  ctx: ToolContext,
) => Promise<FileOutput[]>;

export type TextOperation = (
  input: string,
  values: ControlValues,
  ctx: ToolContext,
) => Promise<TextResult> | TextResult;

/**
 * A file-input tool whose result is text rather than a downloadable file — for
 * example pulling the text layer out of a PDF. It is separate from
 * `FileOperation` so the workspace can render the rich text result (meta chips,
 * diagnostics, a text download) instead of a file list.
 */
export type FileTextOperation = (
  files: File[],
  values: ControlValues,
  ctx: ToolContext,
) => Promise<TextResult> | TextResult;

export type FileOpMap = Record<string, FileOperation>;
export type TextOpMap = Record<string, TextOperation>;
export type FileTextOpMap = Record<string, FileTextOperation>;

/**
 * Shape of an engine chunk's default export. A chunk declares whether it
 * contributes file operations, text operations, or both, so the loader never
 * has to guess at runtime.
 */
export interface EngineChunk {
  file?: FileOpMap;
  text?: TextOpMap;
  fileText?: FileTextOpMap;
}
