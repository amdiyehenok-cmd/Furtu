/**
 * Shared input specifications.
 *
 * Keeping these in one place means every tool that accepts a PDF validates it
 * the same way, and adding a format is a single edit rather than a sweep.
 */

import type { FileSignature, InputSpec, Limits } from './types';

/* --- magic bytes ------------------------------------------------------- */

/** `%PDF-` — ISO 32000 puts the header in the first 1024 bytes by spec. */
export const PDF_SIGNATURE: FileSignature = { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] };

export const PNG_SIGNATURE: FileSignature = { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] };

export const JPEG_SIGNATURE: FileSignature = { offset: 0, bytes: [0xff, 0xd8, 0xff] };

export const GIF87_SIGNATURE: FileSignature = { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] };
export const GIF89_SIGNATURE: FileSignature = { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] };

export const RIFF_SIGNATURE: FileSignature = { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] };
/** RIFF container with a `WEBP` fourcc at offset 8. */
export const WEBP_SIGNATURE: FileSignature = { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] };

export const BMP_SIGNATURE: FileSignature = { offset: 0, bytes: [0x42, 0x4d] };

export const ICO_SIGNATURE: FileSignature = { offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] };

export const ZIP_SIGNATURE: FileSignature = { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] };

/** ISO-BMFF family: HEIC, AVIF, CR3 and friends all start `ftyp` at offset 4. */
export const ISOBMFF_SIGNATURE: FileSignature = { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] };

/** SVG is text; matching the root element loosely avoids rejecting valid files. */
export const SVG_SIGNATURE: FileSignature = { offset: 0, bytes: [0x3c] }; // '<'

/* --- composite input specs --------------------------------------------- */

const MB = 1024 * 1024;

export const PDF_INPUT = (multiple: boolean): InputSpec => ({
  accept: 'application/pdf,.pdf',
  extensions: ['.pdf'],
  maxBytes: 500 * MB,
  multiple,
  signatures: [PDF_SIGNATURE],
  mimeTypes: ['application/pdf'],
});

export const IMAGE_SIGNATURES: FileSignature[] = [
  PNG_SIGNATURE,
  JPEG_SIGNATURE,
  GIF87_SIGNATURE,
  GIF89_SIGNATURE,
  WEBP_SIGNATURE,
  BMP_SIGNATURE,
  ICO_SIGNATURE,
  ISOBMFF_SIGNATURE,
  SVG_SIGNATURE,
];

export const IMAGE_INPUT = (multiple: boolean, extensions = IMAGE_EXTENSIONS): InputSpec => ({
  accept: [...extensions, ...IMAGE_MIME].join(','),
  extensions,
  maxBytes: 100 * MB,
  multiple,
  signatures: IMAGE_SIGNATURES,
  mimeTypes: IMAGE_MIME,
});

export const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
  '.bmp',
  '.svg',
  '.ico',
  '.heic',
  '.heif',
];

export const IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/x-icon',
  'image/heic',
  'image/heif',
];

/** Raster formats the browser can decode into a canvas for re-encoding. */
export const RASTER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.ico'];

export const TEXT_INPUT = (extensions: string[] = ['.txt', '.md', '.csv', '.json', '.log', '.xml', '.yaml', '.yml']): InputSpec => ({
  accept: extensions.join(','),
  extensions,
  maxBytes: 25 * MB,
  multiple: false,
  signatures: [],
  mimeTypes: ['text/plain'],
});

/** DOCX/XLSX/PPTX/ODT are ZIP containers — validated as ZIP, then parsed. */
export const OFFICE_INPUT = (extensions: string[]): InputSpec => ({
  accept: extensions.join(','),
  extensions,
  maxBytes: 100 * MB,
  multiple: false,
  signatures: [ZIP_SIGNATURE],
  mimeTypes: ['application/vnd.openxmlformats-officedocument', 'application/zip', 'application/vnd.oasis.opendocument.text'],
});

/* --- limit presets ------------------------------------------------------ */

export const SINGLE: Limits = { maxFiles: 1, maxTotalBytes: 500 * MB };
export const BATCH_20: Limits = { maxFiles: 20, maxTotalBytes: 500 * MB };
export const BATCH_50: Limits = { maxFiles: 50, maxTotalBytes: 750 * MB };

export { MB };
