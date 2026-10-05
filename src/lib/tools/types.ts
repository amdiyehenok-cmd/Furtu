/**
 * FURTU tool contract.
 *
 * A tool is *data*. Metadata lives in `src/lib/tools/*.ts` and is safe to import
 * during server-side rendering. Processing code lives in `src/lib/engines/ops/*`
 * and is loaded with dynamic import only when a visitor opens that tool, so the
 * homepage never ships a PDF or image codec.
 */

export type ToolCategoryId = 'pdf' | 'image' | 'document' | 'developer' | 'utility';

export type IconName =
  | 'arrow'
  | 'braces'
  | 'check'
  | 'chevron'
  | 'code'
  | 'command'
  | 'compress'
  | 'crop'
  | 'download'
  | 'file'
  | 'flip'
  | 'hash'
  | 'image'
  | 'key'
  | 'layers'
  | 'lock'
  | 'menu'
  | 'moon'
  | 'palette'
  | 'plus'
  | 'qr'
  | 'rotate'
  | 'search'
  | 'shield'
  | 'spark'
  | 'split'
  | 'sun'
  | 'text'
  | 'type'
  | 'upload'
  | 'watermark'
  | 'workflow'
  | 'x'
  | 'zip';

/** Which workspace surface a tool renders. */
export type WorkspaceKind = 'files' | 'text' | 'none';

/** Which lazily-loaded engine chunk backs a tool. */
export type EngineId = 'pdf' | 'image' | 'document' | 'text' | 'yaml' | 'qr';

/**
 * Where the bytes are processed. FURTU makes a privacy claim per tool, and that
 * claim is rendered on the page, so it is derived from one explicit field
 * instead of being written by hand in prose.
 *
 * - `local`  — the file never leaves the device (the default, and the only value
 *              a tool may ship with in v1).
 * - `hybrid` — a small, explicit part of the operation requires a server. Not
 *              implemented yet; tracked as a remaining item in the engineering
 *              report rather than faked here.
 */
export type ProcessingMode = 'local' | 'hybrid';

export interface FileSignature {
  /** Byte offset the signature starts at. */
  offset: number;
  /** Bytes that must match. */
  bytes: number[];
  /**
   * Per-byte mask. A byte is compared as `actual & mask[i] === bytes[i] & mask[i]`.
   * Used for signatures where only the high bits are meaningful.
   */
  mask?: number[];
}

export interface InputSpec {
  /** `accept` attribute for the file input. */
  accept: string;
  /** Lower-case extensions including the dot, e.g. `['.pdf']`. */
  extensions: string[];
  /** Per-file ceiling in bytes. */
  maxBytes: number;
  /** Whether more than one file may be selected. */
  multiple: boolean;
  /**
   * Magic-byte checks. An empty array means "extension/MIME only", which is
   * weaker; prefer a signature for every binary format.
   */
  signatures: FileSignature[];
  /** MIME types the browser commonly reports for this format. */
  mimeTypes: string[];
}

export interface Limits {
  maxFiles: number;
  maxTotalBytes: number;
}

export interface ControlOption {
  value: string;
  label: string;
}

/**
 * Declarative options UI. Tools describe their controls instead of shipping
 * bespoke JSX, which is what keeps "add a tool" to a single file.
 */
export type ControlSpec =
  | {
      kind: 'select';
      id: string;
      label: string;
      options: ControlOption[];
      default: string;
      help?: string;
    }
  | {
      kind: 'number';
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      suffix?: string;
      help?: string;
    }
  | {
      kind: 'toggle';
      id: string;
      label: string;
      default: boolean;
      help?: string;
    }
  | {
      kind: 'text';
      id: string;
      label: string;
      placeholder?: string;
      default?: string;
      help?: string;
      maxLength?: number;
    }
  | {
      kind: 'color';
      id: string;
      label: string;
      default: string;
      help?: string;
    }
  | {
      kind: 'pages';
      id: string;
      label: string;
      help?: string;
    };

export interface FaqEntry {
  q: string;
  a: string;
}

export interface StepNote {
  title: string;
  body: string;
}

export interface ToolDefinition {
  /** Stable, URL-safe. Never change once published. */
  slug: string;
  category: ToolCategoryId;
  /** Card + nav label. */
  name: string;
  /** One line, used on cards and in the command palette. */
  summary: string;
  /** H1-sized intro paragraph for the tool page. */
  description: string;
  icon: IconName;
  workspace: WorkspaceKind;
  engine: EngineId;
  /** Key into the engine chunk's operation map. Defaults to `slug`. */
  operation?: string;
  /**
   * Set when the operation needs the whole selected set at once rather than one
   * file at a time.
   *
   * Most file tools are independent per file, so the workspace runs them with a
   * bounded pool and collects the results — which is what lets twenty images be
   * compressed safely. A few tools are inherently collective: merging needs two
   * or more documents to exist at the same time. Those declare this, and the
   * workspace hands them the full array in one call instead of splitting the work
   * up and failing.
   */
  collects?: boolean;
  /**
   * Minimum number of files the operation can use, checked before it runs so the
   * visitor gets a clear message rather than an error from inside the engine.
   */
  minFiles?: number;
  /**
   * Optional read-only operation, resolved from the engine's `fileText` map and
   * run as soon as a file is added. It must not modify anything; its job is to
   * report what is already in the file and, via `TextResult.prefill`, to seed
   * the controls with the current values. A tool that claims to inspect
   * something has to do so here rather than describing it in prose only.
   */
  inspect?: string;
  input: InputSpec | null;
  limits: Limits;
  controls: ControlSpec[];
  keywords: string[];
  /** Alternate phrasings and informal words the command palette should match. */
  synonyms: string[];
  popular?: boolean;
  recent?: boolean;
  /**
   * Index control. Defaults to true. A tool must be switched off explicitly when
   * it is a thin duplicate of another tool — that is the guard the brief asks for
   * against doorway pages.
   */
  index?: boolean;
  /** Overrides for `<title>` / meta description when the defaults read poorly. */
  seoTitle?: string;
  seoDescription?: string;
  faq: FaqEntry[];
  /** Extra slugs beyond the automatic category + sibling suggestions. */
  related?: string[];
  /** Rendered as an ordered "how it works" list on the tool page. */
  howItWorks?: StepNote[];
  /** Honest limitations. Shown on the page so users are not surprised. */
  limitations?: string[];
  /** Set when the tool genuinely needs the network; drives the privacy banner. */
  mode?: ProcessingMode;
  /** Extra prose blocks rendered under the workspace. */
  notes?: { title: string; body: string }[];
}

export interface ToolCategory {
  id: ToolCategoryId;
  name: string;
  /** URL segment, e.g. `pdf` in `/tools/pdf/merge-pdf`. */
  segment: string;
  tagline: string;
  description: string;
  icon: IconName;
  /** Formats listed on the category page. */
  formats: string[];
}
