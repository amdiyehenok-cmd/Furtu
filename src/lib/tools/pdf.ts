import { PDF_INPUT, SINGLE, BATCH_50, BATCH_20, MB } from './formats';
import type { ToolDefinition } from './types';

const LOCAL = 'local' as const;

export const PDF_TOOLS: ToolDefinition[] = [
  {
    slug: 'merge-pdf',
    category: 'pdf',
    name: 'Merge PDF',
    summary: 'Combine several PDFs into one, in the order you choose.',
    description:
      'Join as many PDF files as you need into a single document and control the final page order by dragging the rows. Furtu rewrites the file structure in your browser, so the combined document is never uploaded anywhere.',
    icon: 'layers',
    workspace: 'files',
    engine: 'pdf',
    // Merging is the one operation that cannot be split across files: it needs
    // the whole set in one call to build a single document from it.
    collects: true,
    minFiles: 2,
    input: PDF_INPUT(true),
    limits: BATCH_50,
    controls: [],
    keywords: ['merge pdf', 'combine pdf', 'join pdf', 'pdf merger', 'concatenate pdf'],
    synonyms: ['combine', 'join', 'append', 'put together', 'one pdf', 'merge documents'],
    popular: true,
    faq: [
      {
        q: 'Are the merged files uploaded to a server?',
        a: 'No. Furtu reads and rewrites the pages in your browser using the PDF library compiled into the page. The bytes never leave your device, and nothing is retained after you close or reload the tab.',
      },
      {
        q: 'Does merging reduce image quality?',
        a: 'No. Pages are copied at the object level, so embedded images, vector art and fonts are preserved exactly. The only change is the file structure around them.',
      },
      {
        q: 'How many files can I merge at once?',
        a: 'Up to 50 files per run, with a combined ceiling of 750 MB. For very large collections, merge in a few passes rather than one enormous run.',
      },
      {
        q: 'What if my PDF is password protected?',
        a: 'A PDF that requires a password to open cannot be merged locally without that password. Unlock it first, then merge the result.',
      },
    ],
    howItWorks: [
      { title: 'Add your PDFs', body: 'Drop them in, or browse your device. Each file is checked for a real PDF header before it is accepted.' },
      { title: 'Set the order', body: 'Drag rows to reorder. The order in the list is the order of pages in the finished document.' },
      { title: 'Merge locally', body: 'The pages are copied into a new document in your browser and handed back as a single download.' },
    ],
    limitations: [
      'Password-protected PDFs cannot be opened or merged without the password.',
      'Digital signatures on the original files are invalidated, because the document structure changes.',
      'Bookmarks and outline entries are not carried across; the merged file is organised by page order.',
    ],
    notes: [
      {
        title: 'Why merge locally',
        body: 'Contracts, payslips and medical paperwork are exactly the files people should not hand to an unknown upload endpoint. Furtu does the work with a library that ships inside the page, so there is no upload step to trust.',
      },
    ],
  },
  {
    slug: 'split-pdf',
    category: 'pdf',
    name: 'Split PDF',
    summary: 'Cut one PDF into separate files by range, by count, or every page.',
    description:
      'Split a single PDF into several documents. Extract a page range into its own file, cut the document into fixed-size chunks, or burst every page into an individual PDF — then download the pieces individually or as one ZIP.',
    icon: 'split',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'mode',
        label: 'Split method',
        default: 'range',
        options: [
          { value: 'range', label: 'Extract a page range' },
          { value: 'chunks', label: 'Cut into fixed-size chunks' },
          { value: 'each', label: 'Every page as its own PDF' },
        ],
        help: 'Range is for pulling pages out. Chunks and Every page produce several files.',
      },
      {
        kind: 'pages',
        id: 'range',
        label: 'Page range',
        help: 'Comma-separated ranges and open-ended spans are supported, for example 1-3, 5, 9- or 1-3,7,12-14.',
      },
      {
        kind: 'number',
        id: 'chunkSize',
        label: 'Pages per file',
        min: 1,
        max: 500,
        step: 1,
        default: 10,
        help: 'Used by “Cut into fixed-size chunks”.',
      },
    ],
    keywords: ['split pdf', 'separate pdf pages', 'cut pdf', 'extract pages from pdf', 'pdf splitter'],
    synonyms: ['divide', 'break up', 'burst', 'cut into', 'separate pages'],
    popular: true,
    faq: [
      {
        q: 'How do I write a page range?',
        a: 'Use commas to separate parts and hyphens for spans. “1-3, 7, 12-14” selects pages 1, 2, 3, 7, 12, 13 and 14. Leaving the end open, as in “9-”, means “page 9 to the end”.',
      },
      {
        q: 'Can I get one file per page?',
        a: 'Yes. Choose “Every page as its own PDF”. For a long document this creates a lot of files, so Furtu offers them as a single ZIP download.',
      },
      {
        q: 'Does splitting keep the original page quality?',
        a: 'Yes. Pages are copied without re-rendering, so images and text stay exactly as they were.',
      },
      {
        q: 'Are my files uploaded anywhere?',
        a: 'No. The document is parsed and rewritten in your browser. Nothing is sent to a server, which matters most here, because the documents people split are often the ones they would least like uploaded.',
      },
    ],
    howItWorks: [
      { title: 'Choose how to cut', body: 'Pick a range, a fixed chunk size, or one file per page.' },
      { title: 'Set the range', body: 'Type page numbers using commas and hyphens. Open-ended spans such as “9-” run to the last page.' },
      { title: 'Download the pieces', body: 'Each piece appears as a separate download, and multi-file results can be taken as one ZIP.' },
    ],
    limitations: [
      'Cross-references and internal links between pages can point at the original page numbers, which may not match the extracted document.',
      'Password-protected PDFs must be unlocked first.',
    ],
  },
  {
    slug: 'rotate-pdf',
    category: 'pdf',
    name: 'Rotate PDF',
    summary: 'Turn pages 90°, 180° or 270° and save the result.',
    description:
      'Fix sideways scans and upside-down pages. Rotate every page in a document by the same amount, or target a specific page range, then download the corrected file with the rotation baked in.',
    icon: 'rotate',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'degrees',
        label: 'Rotation',
        default: '90',
        options: [
          { value: '90', label: '90° clockwise' },
          { value: '180', label: '180° upside down' },
          { value: '270', label: '90° anticlockwise' },
        ],
      },
      {
        kind: 'pages',
        id: 'range',
        label: 'Pages to rotate',
        help: 'Leave empty to rotate every page.',
      },
    ],
    keywords: ['rotate pdf', 'turn pdf pages', 'fix sideways pdf', 'rotate pdf page'],
    synonyms: ['turn', 'flip', 'orientation', 'landscape', 'portrait', 'upside down'],
    faq: [
      {
        q: 'Is this the same as printing in landscape?',
        a: 'No. This changes the page rotation stored in the document, so the page appears upright on screen and in other PDF readers. Page content is not re-rendered, so there is no quality loss.',
      },
      {
        q: 'Are my files uploaded?',
        a: 'No. Rotation is written in your browser, with no upload step at all. That is worth knowing here, because a sideways scan is often a photo of a passport or a signed form.',
      },
      {
        q: 'Can I rotate only some pages?',
        a: 'Yes. Enter the pages you want in the range field, for example “1, 3, 5-7”. Leave it empty to rotate the whole document.',
      },
      {
        q: "Does the file get re-rendered, and does that cost quality?",
        a: "No. Rotation is written into the page definition rather than baked into the pixels, so it is instant and lossless, and the text stays selectable.",
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'The file header is checked before the document is parsed.' },
      { title: 'Choose the angle and pages', body: 'Pick 90°, 180° or 270°, and optionally limit it to certain pages.' },
      { title: 'Download the fixed file', body: 'The rotation is written into the page definitions, so every PDF reader honours it.' },
    ],
    limitations: [
      'Rotating a page rotates its content box; very unusual custom page sizes can look offset after rotation.',
      'Text that was baked in as part of a scanned image rotates with the page and cannot be re-oriented independently.',
    ],
  },
  {
    slug: 'delete-pdf-pages',
    category: 'pdf',
    name: 'Delete PDF Pages',
    summary: 'Remove the pages you do not need and keep the rest.',
    description:
      'Drop pages from a PDF without hunting for them in a desktop editor. Name the pages to remove, preview the resulting page count, and download the trimmed document.',
    icon: 'layers',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      {
        kind: 'pages',
        id: 'range',
        label: 'Pages to delete',
        help: 'For example 1, 4-6 removes the first page and pages four to six.',
      },
    ],
    keywords: ['delete pdf pages', 'remove pages from pdf', 'trim pdf', 'drop pdf pages'],
    synonyms: ['remove', 'cut out', 'delete pages', 'take out pages'],
    faq: [
      {
        q: 'Can I delete every page?',
        a: 'No. A PDF with no pages is not a valid document, so Furtu stops you from producing one and tells you how many pages would remain.',
      },
      {
        q: 'What happens to text that referred to the deleted pages?',
        a: 'Page content is removed, but internal links and form fields elsewhere in the document may still point at the old page numbers. Flattened or finalised files are unaffected.',
      },
      {
        q: "Can I undo this if I delete the wrong page?",
        a: "You cannot undo it in the tool, because the file is rewritten in your browser and the original is never stored. Keep the original — the tool deliberately does not keep a copy for you, since keeping your documents is not its job.",
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'Furtu reads the page tree and reports how many pages the document has.' },
      { title: 'List the pages to delete', body: 'Enter page numbers with commas and hyphens. The remaining count updates as you type.' },
      { title: 'Download the trimmed PDF', body: 'The surviving pages are written to a new document you can download.' },
    ],
    limitations: [
      'At least one page must remain.',
      'Attachments and annotations anchored to deleted pages are removed with those pages.',
    ],
  },
  {
    slug: 'extract-pdf-pages',
    category: 'pdf',
    name: 'Extract PDF Pages',
    summary: 'Pull selected pages into a brand-new PDF.',
    description:
      'Keep only the pages you need. Extract a selection of pages from a longer document into a separate PDF — useful for sending one chapter, one invoice page or one signed sheet from a big file.',
    icon: 'layers',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      {
        kind: 'pages',
        id: 'range',
        label: 'Pages to extract',
        help: 'For example 2-5, 9 pulls pages two through five and page nine.',
      },
    ],
    keywords: ['extract pdf pages', 'extract pages from pdf', 'save selected pdf pages', 'pdf page extractor'],
    synonyms: ['pull out', 'keep only', 'select pages', 'pick pages', 'save pages'],
    faq: [
      {
        q: 'How is this different from splitting a PDF?',
        a: 'Splitting produces several files. Extraction produces one new file containing only the pages you selected, leaving the rest in the original.',
      },
      {
        q: 'Can I extract non-contiguous pages?',
        a: 'Yes. Use commas and hyphens — “2-5, 9, 14-16” is valid — and the pages come out in the order you list them.',
      },
      {
        q: 'Are the pages uploaded?',
        a: 'No. The pages are copied into a new document in your browser, with no upload step. Extracting one invoice page from a full statement is exactly the operation where you would not want the whole statement leaving your device.',
      },
      {
        q: "Will the extracted file keep the original’s fonts and links?",
        a: "Fonts and embedded images come across intact. Internal bookmarks, outline entries and form fields are not rebuilt, because they reference structure that a single extracted page no longer has.",
      },
    ],
    howItWorks: [
      { title: 'Upload the source PDF', body: 'Furtu reads the page structure locally to find out how many pages there are.' },
      { title: 'Choose the pages', body: 'Enter a range such as 1-3 or a list such as 1, 4, 9-12.' },
      { title: 'Download the new document', body: 'You get one PDF containing exactly the pages you asked for.' },
    ],
    limitations: [
      'Bookmarks, outlines and form fields are not reconstructed in the extracted file.',
      'Password-protected documents must be unlocked before extraction.',
    ],
  },
  {
    slug: 'reorder-pdf-pages',
    category: 'pdf',
    name: 'Reorder PDF Pages',
    summary: 'Arrange pages into the right sequence before you print or send.',
    description:
      'Put a document back in order. Describe the sequence you want — for example “3,1,2” or “1-5,6,1-5” for a page that was inserted late — and Furtu writes a new PDF in exactly that order.',
    icon: 'split',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      {
        kind: 'text',
        id: 'order',
        label: 'Page order',
        placeholder: '3,1,2',
        help: 'Numbers and ranges. A page may be repeated, which is how you insert a cover sheet.',
        maxLength: 4000,
      },
    ],
    keywords: ['reorder pdf pages', 'reorder pages', 'rearrange pdf', 'move pdf pages', 'sort pdf pages'],
    synonyms: ['reorder', 'rearrange', 'shuffle', 'change page order', 'put in order'],
    faq: [
      {
        q: 'Can I repeat a page?',
        a: 'Yes. Listing the same page twice duplicates it, which is the usual way to put a cover sheet or a signed page at the front of a document.',
      },
      {
        q: 'What if my order leaves pages out?',
        a: 'That is allowed — the result simply will not contain those pages. Use “Extract PDF Pages” instead if you want the omission to be obvious.',
      },
      {
        q: "Can I reverse a reorder?",
        a: "Not from inside the tool — the output is a new file and your original is untouched on your device. Just run the tool again with the order you want.",
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'Furtu reads the document and notes the page count.' },
      { title: 'Type the order you want', body: 'Use commas for single pages and hyphens for spans, for example 1-3, 8, 2.' },
      { title: 'Download the reordered file', body: 'The new PDF follows your sequence exactly, including any duplicated pages.' },
    ],
    limitations: [
      'Page labels and internal bookmarks do not follow the new order.',
      'Very large documents are slower to reorder because every page has to be copied into a new file.',
    ],
  },
  {
    slug: 'compress-pdf',
    category: 'pdf',
    name: 'Compress PDF',
    summary: 'Shrink a PDF by rebuilding it more efficiently.',
    description:
      'Reduce the size of a PDF so it clears an email attachment limit. Furtu parses the document and writes it back out with compressed object streams and without redundant structure, which shrinks text-heavy files without touching the visible content.',
    icon: 'compress',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(true),
    limits: BATCH_20,
    controls: [
      {
        kind: 'toggle',
        id: 'stripMetadata',
        label: 'Remove document metadata',
        default: true,
        help: 'Drops author, title, producer and timestamps. Often saves a surprising amount on files exported from office software.',
      },
      {
        kind: 'toggle',
        id: 'dedupe',
        label: 'Merge duplicate objects',
        default: true,
        help: 'Some generators write the same image or font several times. Furtu writes one copy and references it.',
      },
    ],
    keywords: ['compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf compressor', 'make pdf smaller'],
    synonyms: ['smaller', 'reduce', 'shrink', 'optimize', 'make it fit email', 'pdf size'],
    popular: true,
    faq: [
      {
        q: 'How much smaller will my file get?',
        a: 'It depends entirely on the source. Text documents exported from a word processor often shrink by 10–40% because they contain a lot of duplicated structure. A scan that is already a single highly compressed image stream may barely change. Furtu shows the real before and after size so there are no surprises.',
      },
      {
        q: 'Does the text still look the same?',
        a: 'Yes, and it stays selectable and searchable. Furtu does not re-render pages to images, which is what most “compressors” do to reach headline numbers — that trick wrecks text selection and search.',
      },
      {
        q: 'Why can’t I shrink a scanned document much?',
        a: 'Scans are usually one large image per page. Compressing the file structure around a JPEG does nothing to the JPEG itself. Getting a scanned file substantially smaller requires resampling the image, which trades away resolution — Furtu does not do that silently.',
      },
      {
        q: 'Are my files uploaded?',
        a: 'No. Compression happens in your browser. This is the single most common question we get, which is why the processing is local by default rather than by policy.',
      },
    ],
    howItWorks: [
      { title: 'Add your PDFs', body: 'Drop in one or several files. Each is checked for a real PDF header first.' },
      { title: 'Choose what to strip', body: 'Metadata removal and duplicate-object merging are both on by default because neither changes what you see.' },
      { title: 'Compare and download', body: 'Furtu shows the original size, the new size and the percentage saved for every file, then hands them back for download.' },
    ],
    limitations: [
      'Furtu compresses the document structure, not the pixels inside scanned images. Image-heavy scans often see only small savings.',
      'Digital signatures are invalidated by any rewrite of the file.',
      'There is no fixed quality slider, because there is no re-encoding step to control. If you need a specific byte ceiling for a scan, that is a different tool.',
    ],
    notes: [
      {
        title: 'What “compression” really means here',
        body: 'Most online PDF compressors rasterise every page to a JPEG and rebuild the file. The result is small but the text is no longer text: you lose search, selection, accessibility and crisp printing. Furtu keeps the document a real document, so the savings are smaller and the file stays usable.',
      },
    ],
  },
  {
    slug: 'watermark-pdf',
    category: 'pdf',
    name: 'Watermark PDF',
    summary: 'Stamp text across every page, or only the pages you choose.',
    description:
      'Mark a document as a draft, a copy, or “confidential” without printing it. Choose the wording, position, size and opacity, apply it to the whole document or a page range, and download the stamped PDF.',
    icon: 'watermark',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      { kind: 'text', id: 'text', label: 'Watermark text', placeholder: 'DRAFT', default: 'DRAFT', maxLength: 120 },
      {
        kind: 'select',
        id: 'position',
        label: 'Position',
        default: 'diagonal',
        options: [
          { value: 'diagonal', label: 'Diagonal across the page' },
          { value: 'centre', label: 'Centred' },
          { value: 'top', label: 'Top of the page' },
          { value: 'bottom', label: 'Bottom of the page' },
        ],
      },
      { kind: 'number', id: 'size', label: 'Font size', min: 8, max: 160, step: 1, default: 48, suffix: 'pt' },
      { kind: 'number', id: 'opacity', label: 'Opacity', min: 5, max: 100, step: 5, default: 20, suffix: '%' },
      { kind: 'color', id: 'color', label: 'Colour', default: '#dc2626' },
      {
        kind: 'pages',
        id: 'range',
        label: 'Pages to stamp',
        help: 'Leave empty to stamp every page.',
      },
    ],
    keywords: ['watermark pdf', 'stamp pdf', 'add watermark to pdf', 'draft watermark'],
    synonyms: ['stamp', 'mark', 'overlay text', 'confidential stamp', 'draft'],
    faq: [
      {
        q: 'Does the document go to a server to be stamped?',
        a: 'No. The PDF is opened and restamped in your browser, so the file never leaves your device. The copy you download is written straight to your own machine, the original file on your disk is left untouched, and there is no server-side step where a document could be stored in transit.',
      },
      {
        q: 'Can I watermark only some pages?',
        a: 'Yes. Enter the pages to stamp, for example 1-2, 5. Leave the field empty to stamp the entire document.',
      },
      {
        q: "Is the watermark removable?",
        a: "A text watermark is a drawing in the page content, so it discourages casual reuse but does not prevent editing. Anyone who can view the PDF can remove it. It is a label, not a lock.",
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'Furtu checks the file and reads the page sizes.' },
      { title: 'Style the watermark', body: 'Set the wording, angle, size, colour and how strong it should look.' },
      { title: 'Download the stamped PDF', body: 'The text is drawn into each page’s content stream at the position you chose.' },
    ],
    limitations: [
      'A text watermark is not encryption and does not prevent editing or removal.',
      'Standard fonts are used, so a custom brand typeface is not embedded.',
    ],
  },
  {
    slug: 'pdf-metadata',
    category: 'pdf',
    name: 'PDF Metadata Editor',
    summary: 'Read and change the title, author, subject and keywords inside a PDF.',
    description:
      'Inspect and correct the hidden information stored in a PDF: title, author, subject, keywords, creator, producer and creation date. Useful before publishing, when a document shows up in search under a filename instead of a real title.',
    icon: 'file',
    workspace: 'files',
    engine: 'pdf',
    operation: 'pdf-metadata',
    inspect: 'pdf-metadata-inspect',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      { kind: 'text', id: 'title', label: 'Title', maxLength: 300 },
      { kind: 'text', id: 'author', label: 'Author', maxLength: 300 },
      { kind: 'text', id: 'subject', label: 'Subject', maxLength: 500 },
      { kind: 'text', id: 'keywords', label: 'Keywords', help: 'Separate with commas.', maxLength: 500 },
      { kind: 'text', id: 'creator', label: 'Creator', maxLength: 300 },
      { kind: 'text', id: 'producer', label: 'Producer', maxLength: 300 },
    ],
    keywords: ['pdf metadata', 'edit pdf metadata', 'pdf title', 'pdf author', 'pdf properties'],
    synonyms: ['properties', 'document info', 'metadata editor', 'change pdf title', 'xmp'],
    faq: [
      {
        q: 'Why does my PDF show a filename as its title?',
        a: 'Most programs only write a title if you set one. When the field is empty, readers fall back to the filename. Setting a real title is the single most useful thing you can do for how a document appears in search and in reader sidebars.',
      },
      {
        q: 'Does editing metadata re-encode the pages?',
        a: 'No. Only the document information dictionary is rewritten. Page content is copied untouched, so there is no quality change.',
      },
      {
        q: "Do I have to fill in every field?",
        a: "No. Only the fields you type in are changed, so a partially completed form never blanks out properties it did not mention. If nothing you typed differs from what the document already has, Furtu tells you rather than writing a file that looks like it changed.",
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'Furtu reads the document information dictionary and shows what is currently stored.' },
      { title: 'Edit the fields', body: 'Change any of the standard properties. Empty fields are cleared rather than left blank.' },
      { title: 'Download the corrected file', body: 'The pages are identical; only the stored properties differ.' },
    ],
    limitations: [
      'Custom XMP metadata streams are preserved but not edited.',
      'Some scanners write per-page metadata that Furtu leaves untouched.',
    ],
  },
  {
    slug: 'remove-pdf-metadata',
    category: 'pdf',
    name: 'Remove PDF Metadata',
    summary: 'Strip author, device and timestamp data from a PDF before sharing.',
    description:
      'Clear the hidden trail a PDF carries: authoring application, workstation name, creation and modification timestamps, and embedded XMP. Useful when you are sharing a file outside your organisation and do not want that information travelling with it.',
    icon: 'shield',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(true),
    limits: BATCH_20,
    controls: [
      {
        kind: 'toggle',
        id: 'removeXmp',
        label: 'Remove the XMP metadata stream',
        default: true,
        help: 'XMP is a separate XML block that often holds more detail than the visible properties.',
      },
    ],
    keywords: ['remove pdf metadata', 'strip pdf metadata', 'pdf metadata cleaner', 'remove pdf author'],
    synonyms: ['strip', 'clean metadata', 'scrub', 'remove personal data', 'anonymise', 'sanitize'],
    faq: [
      {
        q: 'Does this remove the text in the document?',
        a: 'No. Only the stored properties are cleared. If the document body itself contains personal data — a name in a letterhead, an author in a footer — you need to edit that separately.',
      },
      {
        q: 'Is the result still a valid PDF?',
        a: 'Yes. The metadata block is optional in the PDF specification, so removing it leaves a fully valid, readable document.',
      },
      {
        q: "Are the files uploaded before the metadata is stripped?",
        a: "No. That is the whole point of doing it locally: the document is opened, rewritten and handed back in your browser, so the personal data in it never crosses a network connection in the first place.",
      },
    ],
    howItWorks: [
      { title: 'Add your PDFs', body: 'Files are checked for a real PDF header before anything is parsed.' },
      { title: 'Clear the properties', body: 'Author, title, subject, keywords, creator, producer and dates are emptied, and the XMP block is dropped if you ask for it.' },
      { title: 'Download the cleaned files', body: 'Page content is untouched, so the documents look and read exactly the same.' },
    ],
    limitations: [
      'This clears stored properties only. Personal data printed into page content is not removed.',
      'Digital signatures are invalidated by rewriting the file.',
    ],
  },
  {
    slug: 'pdf-to-jpg',
    category: 'pdf',
    name: 'PDF to JPG',
    summary: 'Save each page of a PDF as a separate image.',
    description:
      'Turn PDF pages into JPG or PNG images you can use anywhere — a slide for a presentation, a page for a portfolio, a receipt for an expense claim. Choose a resolution, then download the pages individually or as one ZIP.',
    icon: 'image',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'format',
        label: 'Image format',
        default: 'image/jpeg',
        options: [
          { value: 'image/jpeg', label: 'JPG' },
          { value: 'image/png', label: 'PNG' },
        ],
      },
      {
        kind: 'select',
        id: 'scale',
        label: 'Resolution',
        default: '2',
        options: [
          { value: '1', label: '72 dpi — screen, smallest' },
          { value: '2', label: '144 dpi — good for most uses' },
          { value: '3', label: '216 dpi — high quality' },
          { value: '4', label: '288 dpi — print' },
        ],
        help: 'Higher resolutions produce larger files and take longer.',
      },
      {
        kind: 'pages',
        id: 'range',
        label: 'Pages to convert',
        help: 'Leave empty for every page.',
      },
      { kind: 'number', id: 'quality', label: 'JPG quality', min: 40, max: 100, step: 5, default: 92, suffix: '%', help: 'Ignored for PNG.' },
    ],
    keywords: ['pdf to jpg', 'pdf to image', 'convert pdf to jpeg', 'pdf to png', 'extract pdf pages as images'],
    synonyms: ['pdf2jpg', 'pdf to pictures', 'render pdf', 'pdf to photos', 'convert pdf to png'],
    faq: [
      {
        q: 'What resolution should I pick?',
        a: '144 dpi is a good default for screen use and for slides. Choose 288 dpi when the image will be printed, and 72 dpi when you only need a small preview or thumbnail.',
      },
      {
        q: 'Will the text stay sharp?',
        a: 'Only up to a point. A PDF page is vector content, but a JPG is a fixed grid of pixels, so very small text needs a high resolution to stay legible. If a page is mostly text, 216 or 288 dpi is worth the extra file size.',
      },
      {
        q: 'How long does a large PDF take?',
        a: 'Conversion happens on your device, so a 200-page document at 288 dpi can take a while and uses a lot of memory. Furtu processes pages one at a time and releases each as it goes.',
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'Furtu checks the file, then loads the PDF rendering engine into this tab.' },
      { title: 'Choose format and resolution', body: 'JPG for small files, PNG when you need lossless edges or transparency. Pick a dpi that matches where the image will be used.' },
      { title: 'Download the pages', body: 'Each page becomes its own image. Download them one by one, or take the whole set as a ZIP.' },
    ],
    limitations: [
      'Password-protected PDFs cannot be rendered without the password.',
      'Rendering happens on your device, so very long or very high-resolution jobs are slow and memory-hungry. Low pages in the list are converted first.',
      'Transparency in vector graphics is flattened against a white background for JPG output.',
    ],
  },
  {
    slug: 'images-to-pdf',
    category: 'pdf',
    name: 'Images to PDF',
    summary: 'Combine JPG and PNG images into a single PDF document.',
    description:
      'Turn a folder of photos or screenshots into one PDF. Add a page margin, choose portrait or landscape per image, and download the finished document — without an upload step.',
    icon: 'image',
    workspace: 'files',
    engine: 'pdf',
    input: {
      accept: 'image/jpeg,image/png,.jpg,.jpeg,.png',
      extensions: ['.jpg', '.jpeg', '.png'],
      maxBytes: 100 * MB,
      multiple: true,
      signatures: [
        { offset: 0, bytes: [0xff, 0xd8, 0xff] },
        { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
      ],
      mimeTypes: ['image/jpeg', 'image/png'],
    },
    limits: BATCH_50,
    controls: [
      {
        kind: 'select',
        id: 'orientation',
        label: 'Page orientation',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Match each image' },
          { value: 'portrait', label: 'Portrait for all pages' },
          { value: 'landscape', label: 'Landscape for all pages' },
        ],
      },
      {
        kind: 'select',
        id: 'pageSize',
        label: 'Page size',
        default: 'a4',
        options: [
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: 'US Letter' },
          { value: 'fit', label: 'Fit each page to the image' },
        ],
        help: '“Fit” makes every page exactly the shape of its image, with no margin.',
      },
      { kind: 'number', id: 'margin', label: 'Margin', min: 0, max: 100, step: 2, default: 0, suffix: 'pt', help: 'Applies to A4 and Letter pages.' },
    ],
    keywords: ['images to pdf', 'jpg to pdf', 'png to pdf', 'photo to pdf', 'convert images to pdf'],
    synonyms: ['jpg2pdf', 'png2pdf', 'make a pdf from images', 'combine images', 'scan to pdf'],
    popular: true,
    faq: [
      {
        q: 'Do the images get uploaded?',
        a: 'No. They are read and placed into the PDF inside your browser. That is the main reason to use Furtu instead of a conversion site when the images are receipts, IDs or drafts.',
      },
      {
        q: 'Will the PDF be huge?',
        a: 'It depends. Images are embedded as they are, so 20 phone photos produce a large PDF. JPEG photos compress well; screenshots with large flat areas are better saved as PNG before conversion.',
      },
      {
        q: 'Can I reorder the pages?',
        a: 'Reorder the files in the list before you convert — the list order is the page order.',
      },
    ],
    howItWorks: [
      { title: 'Add your images', body: 'Drop in JPG and PNG files. Each is checked against its real file signature.' },
      { title: 'Choose page setup', body: 'A4 or Letter with a margin, or pages sized to fit each image exactly.' },
      { title: 'Download the PDF', body: 'The images are placed in the order shown and saved as one document.' },
    ],
    limitations: [
      'JPG and PNG are embedded directly. Other formats such as HEIC, WebP, AVIF and GIF must be converted first.',
      'Very large images are embedded as-is; there is no downscaling, so file size can grow quickly.',
    ],
  },
  {
    slug: 'extract-pdf-text',
    category: 'pdf',
    name: 'Extract PDF Text',
    summary: 'Copy the readable text out of a PDF you cannot select from.',
    description:
      'Pull the text layer out of a PDF and paste it into anything — a spreadsheet, an email, a search box. Works on documents produced by scanners that also stored a recognised text layer, and shows you when a page has none.',
    icon: 'text',
    workspace: 'files',
    engine: 'pdf',
    input: PDF_INPUT(false),
    limits: SINGLE,
    controls: [
      { kind: 'toggle', id: 'pageMarkers', label: 'Insert a page marker between pages', default: true },
      { kind: 'toggle', id: 'preserveBreaks', label: 'Preserve line breaks', default: true, help: 'Turn this off to collapse the text into a single flow.' },
    ],
    keywords: ['extract pdf text', 'pdf to text', 'copy text from pdf', 'pdf text extractor', 'pdf to txt'],
    synonyms: ['pdf2txt', 'get text from pdf', 'pdf to plain text', 'ocr copy', 'text layer'],
    faq: [
      {
        q: 'Will this work on a scanned PDF?',
        a: 'Only if the scan includes a text layer, which is what OCR software adds. Furtu reads that text layer, which is why it is fast and lossless. A scan with no text layer has nothing to extract — for those you need optical character recognition, which Furtu does not do.',
      },
      {
        q: 'How do I know if my PDF has a text layer?',
        a: 'Open it and try to select text with your mouse. If you can highlight words, there is a text layer. If the selection grabs a whole block or nothing, the pages are images.',
      },
      {
        q: 'Why is some of the output jumbled?',
        a: 'PDFs store text as positioned glyphs, not as paragraphs. Multi-column layouts and tables can come out interleaved. Turn off line-break preservation to get a cleaner single flow, or copy page by page.',
      },
      {
        q: 'Is the text I pull out sent anywhere?',
        a: 'No, and that matters here more than it does for other tools, because extracted text is often the sensitive part of a contract or a medical record. Parsing happens in your browser, the contents stay on your device, and the result goes into a box on this page and a file on your disk. Furtu keeps nothing, so closing the tab discards it. Pasting it into another service is a separate decision, made there and on their terms.',
      },
    ],
    howItWorks: [
      { title: 'Upload the PDF', body: 'Furtu loads the PDF engine and inspects the text layer on every page.' },
      { title: 'Choose how to format it', body: 'Keep page markers to see where each page ended, and keep line breaks if you are reflowing the text.' },
      { title: 'Copy or download the text', body: 'The result appears in an editable box you can select from, plus a plain-text download.' },
    ],
    limitations: [
      'Furtu reads an existing text layer. It does not run OCR, so image-only scans return no text.',
      'Complex multi-column and table layouts may interleave. Simple reading-order text extracts cleanly.',
    ],
  },
];

export default PDF_TOOLS;
