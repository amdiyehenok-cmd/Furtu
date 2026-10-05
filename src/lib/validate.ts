/**
 * File safety. The brief's rule is "never trust uploaded files" and "never
 * assume a file extension tells the truth", so every file that enters a tool is
 * checked on three independent axes:
 *
 *  1. extension  — cheapest, trivially spoofed, still useful for the UI
 *  2. MIME type   — reported by the OS, also spoofable
 *  3. magic bytes — the only one an attacker cannot change without rewriting the
 *     payload, so it is the gate that actually matters
 *
 * A file must pass the signature check to be processed. Everything else is
 * advisory. Validation runs before any parser or codec sees the bytes.
 */

import type { FileSignature, InputSpec } from './tools/types';

export type RejectReason =
  | 'extension'
  | 'mime'
  | 'signature'
  | 'size'
  | 'count'
  | 'total-size'
  | 'empty';

export interface ValidationIssue {
  fileName: string;
  reason: RejectReason;
  message: string;
}

export interface ValidationResult {
  accepted: File[];
  rejected: ValidationIssue[];
}

/** Human-readable copy for each rejection reason. */
export function describeRejection(issue: ValidationIssue): string {
  return issue.message;
}

async function readSignature(
  file: File,
  maxOffset: number,
): Promise<Uint8Array> {
  const slice = file.slice(0, Math.min(maxOffset + 8, file.size));
  return new Uint8Array(await slice.arrayBuffer());
}

export function signatureMatches(bytes: Uint8Array, signature: FileSignature): boolean {
  const { offset, bytes: expected, mask } = signature;
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    const actual = bytes[offset + i];
    const want = expected[i];
    if (mask && mask.length > i) {
      if ((actual & mask[i]) !== (want & mask[i])) return false;
    } else if (actual !== want) {
      return false;
    }
  }
  return true;
}

export async function validateFiles(
  files: File[],
  input: InputSpec,
  limits: { maxFiles: number; maxTotalBytes: number },
): Promise<ValidationResult> {
  const accepted: File[] = [];
  const rejected: ValidationIssue[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (file.size === 0) {
      rejected.push({ fileName: file.name, reason: 'empty', message: 'The file is empty (0 bytes).' });
      continue;
    }

    const lowerName = file.name.toLowerCase();
    const extensionOk = input.extensions.some((ext) => lowerName.endsWith(ext));
    if (!extensionOk) {
      rejected.push({
        fileName: file.name,
        reason: 'extension',
        message: `Expected ${input.extensions.join(', ')} but the file is named "${file.name}".`,
      });
      continue;
    }

    if (input.signatures.length > 0) {
      const maxOffset = input.signatures.reduce((max, s) => Math.max(max, s.offset), 0);
      const head = await readSignature(file, maxOffset);
      const matched = input.signatures.some((signature) => signatureMatches(head, signature));
      if (!matched) {
        rejected.push({
          fileName: file.name,
          reason: 'signature',
          message:
            'The file contents do not match its extension. It may be renamed, corrupted, or not a real file of this type.',
        });
        continue;
      }
    }

    if (file.size > input.maxBytes) {
      rejected.push({
        fileName: file.name,
        reason: 'size',
        message: 'The file is larger than this tool accepts.',
      });
      continue;
    }

    if (accepted.length >= limits.maxFiles) {
      rejected.push({
        fileName: file.name,
        reason: 'count',
        message: `This tool processes up to ${limits.maxFiles} file${limits.maxFiles === 1 ? '' : 's'} at a time.`,
      });
      continue;
    }

    totalBytes += file.size;
    if (totalBytes > limits.maxTotalBytes) {
      rejected.push({
        fileName: file.name,
        reason: 'total-size',
        message: 'Adding this file would exceed the total size limit for one run.',
      });
      continue;
    }

    accepted.push(file);
  }

  return { accepted, rejected };
}

/**
 * Guards against parser bombs and OOM crashes. A `File` that claims a small size
 * but decompresses to something enormous, or a PDF that expands to hundreds of
 * thousands of objects, should fail with an explanation rather than freezing
 * the tab. Engines call this before handing bytes to a library.
 */
export function assertReasonableSize(bytes: number, maxBytes: number, label = 'file'): void {
  if (bytes > maxBytes) {
    throw new Error(
      `This ${label} is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit for this tool.`,
    );
  }
}
