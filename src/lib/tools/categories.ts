import type { ToolCategory } from './types';

export const CATEGORIES: ToolCategory[] = [
  {
    id: 'pdf',
    name: 'PDF',
    segment: 'pdf',
    tagline: 'Merge, split, compress and reorganise documents in your browser.',
    description:
      'Every PDF tool on Furtu runs entirely on your device. Pages are parsed and rewritten locally, so contracts, payslips and drafts never travel to a server. Combine files, cut them apart, shrink them for an email limit, rotate pages, drop pages, reorder them, stamp them, and strip metadata — without an account and without an upload.',
    icon: 'file',
    formats: ['PDF'],
  },
  {
    id: 'image',
    name: 'Images',
    segment: 'image',
    tagline: 'Compress, resize and convert photos to an exact file size.',
    description:
      'Image tools that respect the file you were given. Compress photos for the web, resize to exact pixel dimensions for a marketplace listing, convert between JPG, PNG, WebP and AVIF, strip location and camera data, or hit a hard target such as “make this exactly 200 KB” while keeping the best quality that still fits. Decoding and re-encoding happen locally with browser codecs.',
    icon: 'image',
    formats: ['JPG', 'JPEG', 'PNG', 'WebP', 'AVIF', 'GIF', 'BMP', 'SVG', 'ICO'],
  },
  {
    id: 'document',
    name: 'Documents',
    segment: 'document',
    tagline: 'Extract, convert and inspect document files.',
    description:
      'Work with the text and structure inside office documents without installing anything. Extract text from DOCX, XLSX, PPTX and ODF, inspect document metadata, and convert between plain text, Markdown, HTML and structured data — all locally, with nothing uploaded.',
    icon: 'layers',
    formats: ['TXT', 'MD', 'CSV', 'JSON', 'DOCX', 'XLSX', 'PPTX', 'ODT'],
  },
  {
    id: 'developer',
    name: 'Developer',
    segment: 'developer',
    tagline: 'Format, validate, encode and inspect data.',
    description:
      'A focused developer toolbox. Pretty-print and validate JSON, convert JSON to CSV, YAML or XML, decode JWTs without verifying them, encode and decode Base64 and percent-encoding, test regular expressions against sample text, generate UUIDs and hashes, and convert between timestamps, colour spaces and number bases. Text never leaves the page.',
    icon: 'braces',
    formats: ['JSON', 'YAML', 'XML', 'CSV', 'TXT', 'MD', 'SVG', 'HTTP'],
  },
  {
    id: 'utility',
    name: 'Utilities',
    segment: 'utilities',
    tagline: 'Everyday text, number and file helpers.',
    description:
      'The small things that come up constantly. Count words and characters, clean up pasted text, sort and de-duplicate lines, generate a strong password, build a QR code, convert file sizes and units, and read technical file metadata. Fast, private and free of sign-up walls.',
    icon: 'spark',
    formats: ['TXT', 'CSV', 'MD', 'PNG', 'ANY'],
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));
export const CATEGORY_BY_SEGMENT = new Map(CATEGORIES.map((category) => [category.segment, category]));
