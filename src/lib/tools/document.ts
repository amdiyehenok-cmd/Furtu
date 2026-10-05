import { OFFICE_INPUT, SINGLE, TEXT_INPUT } from './formats';
import type { ToolDefinition } from './types';

/**
 * Document tools.
 *
 * Every operation in this category opens a file that is really a ZIP container
 * (DOCX, XLSX, PPTX and ODT are all ZIP archives) or a plain text file, and does
 * the work in the page. Nothing is uploaded, which is the whole point: contracts,
 * payslips and drafts are exactly the files people should not hand to an unknown
 * upload endpoint.
 *
 * `mode` is deliberately omitted on every definition. `local` is the default in
 * `ToolDefinition`, and it is the only mode that may ship — the privacy banner
 * reads the field, so a missing value means "nothing leaves the device".
 */

export const DOCUMENT_TOOLS: ToolDefinition[] = [
  {
    slug: 'docx-to-text',
    category: 'document',
    name: 'DOCX to Text',
    summary: 'Pull the words out of a Word document, tables and all.',
    description:
      'Turn a .docx into plain text you can search, paste and diff. Paragraphs, line breaks, tabs and table rows are preserved, and headers, footers, footnotes and comments can be pulled in as well. The document is opened and read inside your browser, so it is never uploaded.',
    icon: 'text',
    workspace: 'files',
    engine: 'document',
    input: OFFICE_INPUT(['.docx']),
    limits: SINGLE,
    controls: [
      { kind: 'toggle', id: 'includeTables', label: 'Keep table rows', default: true, help: 'Each table row becomes one line, with cells separated by a tab.' },
      { kind: 'toggle', id: 'includeHeaders', label: 'Include page headers', default: false, help: 'Adds a [Header] section for every header part in the document.' },
      { kind: 'toggle', id: 'includeFooters', label: 'Include page footers', default: false, help: 'Adds a [Footer] section for every footer part in the document.' },
      { kind: 'toggle', id: 'includeNotes', label: 'Include footnotes and endnotes', default: false },
      { kind: 'toggle', id: 'includeComments', label: 'Include comments', default: false, help: 'Comments are listed at the end, each labelled with its author.' },
      {
        kind: 'select',
        id: 'spacing',
        label: 'Paragraph spacing',
        default: 'blank',
        options: [
          { value: 'blank', label: 'Blank line between paragraphs' },
          { value: 'single', label: 'One line per paragraph' },
        ],
      },
    ],
    keywords: ['docx to text', 'extract text from docx', 'word document to txt', 'docx text extractor', 'word to plain text'],
    synonyms: ['docx2txt', 'get text out of word', 'read a word document', 'word file to text', 'copy text from docx'],
    popular: true,
    faq: [
      {
        q: 'Are my Word documents uploaded anywhere?',
        a: 'No. A .docx is a ZIP archive, and Furtu opens that archive and reads the document XML inside it using code that is compiled into this page. Nothing leaves your device, and nothing is kept after you close or reload the tab.',
      },
      {
        q: 'What happens to formatting?',
        a: 'It does not survive, because plain text has no formatting. What does survive is structure: paragraph breaks become newlines, tabs stay tabs, and each table row becomes a single line with its cells separated by tabs, which pastes cleanly into a spreadsheet.',
      },
      {
        q: 'Why is the text missing from my document?',
        a: 'Almost always because the text is an image. A document made from scans or screenshots has no text layer, and no amount of parsing will produce words from pixels. Furtu says so rather than returning an empty file. Text boxes and shapes are also not included, because Word stores them outside the main document flow.',
      },
      {
        q: 'Can I get the headers and footers as well?',
        a: 'Yes — turn on “Include page headers” and “Include page footers”. They are stored in separate parts of the file, so they are opt-in; without the toggles you get the document body only.',
      },
      {
        q: 'Will it open an old .doc file?',
        a: 'No. A .doc from before 2007 is a completely different binary format, not a ZIP archive. Save it as .docx first — Word, LibreOffice and Google Docs will all do that in one step.',
      },
    ],
    howItWorks: [
      { title: 'Add your document', body: 'Drop in a .docx, or browse your device. The file is checked to make sure it really is a ZIP-based Office document before anything is parsed.' },
      { title: 'Choose what to include', body: 'Keep table rows, and switch on headers, footers, footnotes or comments if they matter to what you are extracting.' },
      { title: 'Copy or download the text', body: 'The result appears in an editable box you can select from, with a plain-text download underneath.' },
    ],
    limitations: [
      'Text inside text boxes, shapes, charts and SmartArt is not extracted; only the main document flow, tables, and the parts you switch on.',
      'Images are ignored entirely. A document that is mostly scans produces very little text.',
      'Tracked deletions are left out and tracked insertions are included, which matches what you would see with changes shown as final.',
      'Formatting, styles, numbering and hyperlinks are discarded — this is a text extraction, not a converter.',
    ],
    notes: [
      {
        title: 'Why this is worth doing locally',
        body: 'The files people most want converted are the ones they least want uploaded: employment contracts, medical letters, bank statements, a dissertation chapter. Reading a ZIP container is also cheap enough to do properly in a browser tab, so there is no reason to accept an upload form for it.',
      },
    ],
    related: ['text-to-docx', 'document-metadata', 'xlsx-to-csv'],
  },
  {
    slug: 'xlsx-to-csv',
    category: 'document',
    name: 'XLSX to CSV',
    summary: 'Export a spreadsheet to CSV so anything can read it.',
    description:
      'Convert an Excel workbook into comma-separated values — one file per sheet. Shared strings, numbers, booleans, dates and inline text are all resolved correctly, and the result opens cleanly in Sheets, Numbers, a database import or a script. Parsed in your browser, never uploaded.',
    icon: 'layers',
    workspace: 'files',
    engine: 'document',
    input: OFFICE_INPUT(['.xlsx']),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'sheets',
        label: 'Sheets to export',
        default: 'all',
        options: [
          { value: 'all', label: 'Every sheet, as its own CSV file' },
          { value: 'first', label: 'The first sheet only' },
        ],
      },
      {
        kind: 'select',
        id: 'dateFormat',
        label: 'Date cells',
        default: 'iso',
        options: [
          { value: 'iso', label: 'Convert to YYYY-MM-DD' },
          { value: 'serial', label: 'Leave as the raw number' },
        ],
        help: 'Excel stores dates as a day count from 1899. Furtu recognises the built-in date formats and writes ISO dates; custom formats it does not recognise stay as numbers.',
      },
      { kind: 'toggle', id: 'includeEmptyRows', label: 'Keep empty rows', default: true, help: 'Turning this off drops rows where every cell is blank.' },
      { kind: 'toggle', id: 'trimCells', label: 'Trim spaces around values', default: false },
      { kind: 'toggle', id: 'quoteAll', label: 'Quote every value', default: false, help: 'Off means only values containing a comma, quote or newline are quoted, which is what most importers expect.' },
      {
        kind: 'select',
        id: 'lineEndings',
        label: 'Line endings',
        default: 'crlf',
        options: [
          { value: 'crlf', label: 'Windows (CRLF)' },
          { value: 'lf', label: 'Unix (LF)' },
        ],
        help: 'CRLF is what Excel writes and what most Windows tools expect.',
      },
    ],
    keywords: ['xlsx to csv', 'excel to csv', 'convert spreadsheet to csv', 'xlsx converter', 'excel csv export'],
    synonyms: ['xlsx2csv', 'excel to comma separated', 'sheet to csv', 'spreadsheet to text', 'export excel data'],
    popular: true,
    faq: [
      {
        q: 'Do I get every sheet?',
        a: 'By default you get one CSV per sheet, named after the sheet, so nothing is silently dropped. Switch the control to “The first sheet only” if you just want the active-looking one.',
      },
      {
        q: 'Why are my dates numbers?',
        a: 'That is how Excel stores them — a day count from 1899, with the formatting stored separately from the value. Furtu reads the number format on each cell and, when it recognises it as a date, writes a real ISO date instead. A custom number format Furtu does not recognise is left as a number rather than guessed at, which is the honest failure.',
      },
      {
        q: 'What happens to formulas?',
        a: 'You get the last value Excel calculated and cached, not the formula. That is usually what you want in a CSV — a number you can sum. If the file was produced by a script that wrote formulas without saving results, those cells come out empty.',
      },
      {
        q: 'Can I open the CSV in Excel without it mangling my data?',
        a: 'Values containing a comma, a quote or a newline are quoted, and quotes inside values are doubled, so the result round-trips. Two things are still worth knowing: Excel guesses at columns on import, and it re-derives dates from its own locale. If a column matters, import it as text and set the type yourself.',
      },
      {
        q: 'Is the workbook uploaded?',
        a: 'No. The spreadsheet is unzipped and read in this tab. That matters for a budget, a client list or a staff spreadsheet more than it does for a public report.',
      },
    ],
    howItWorks: [
      { title: 'Add your workbook', body: 'Drop in a .xlsx. Furtu reads the workbook part to find the sheet names, then resolves each relationship to the matching sheet XML.' },
      { title: 'Set the output options', body: 'Choose which sheets to export, whether dates become ISO dates, and how values are quoted and terminated.' },
      { title: 'Download the CSVs', body: 'One file per sheet, listed with its row and column count so you can sanity-check the export before you rely on it.' },
    ],
    limitations: [
      'Formulas are exported as their last cached value, not recalculated, and the formula text itself is not included.',
      'Only the built-in Excel date formats plus custom formats that clearly contain date or time tokens are converted. A custom format Furtu cannot recognise leaves a serial number in the output.',
      'Cell styling, merged cells, column widths, conditional formatting, charts, pivot tables, defined names and macros are not carried across — CSV is a flat format and there is nowhere to put them.',
      'Hidden sheets are exported along with visible ones, because the workbook does not reliably record which sheet was on screen.',
    ],
    related: ['docx-to-text', 'document-metadata', 'pptx-to-text'],
  },
  {
    slug: 'pptx-to-text',
    category: 'document',
    name: 'PPTX to Text',
    summary: 'Read the words out of a PowerPoint deck, slide by slide.',
    description:
      'Extract the text from a .pptx in slide order, including speaker notes and table cells. Useful for checking a deck reads properly, turning slides into a script, or finding text that is buried in a shape someone forgot to export. Runs in your browser — the deck is never uploaded.',
    icon: 'layers',
    workspace: 'files',
    engine: 'document',
    input: OFFICE_INPUT(['.pptx']),
    limits: SINGLE,
    controls: [
      { kind: 'toggle', id: 'slideMarkers', label: 'Label each slide', default: true, help: 'Inserts a “Slide 3” line before the text of each slide, in true slide order.' },
      { kind: 'toggle', id: 'includeNotes', label: 'Include speaker notes', default: false, help: 'Notes are listed under the slide they belong to. The slide-number placeholder is skipped.' },
      { kind: 'toggle', id: 'includeTables', label: 'Keep table rows', default: true, help: 'A table becomes one line per row, with cells separated by tabs so it pastes into a spreadsheet cleanly.' },
      { kind: 'toggle', id: 'skipEmptySlides', label: 'Skip slides with no text', default: false, help: 'Useful on decks exported from Keynote, which often contain a slide per image.' },
    ],
    keywords: ['pptx to text', 'powerpoint to text', 'extract text from pptx', 'slide deck to text', 'pptx text extractor'],
    synonyms: ['pptx2txt', 'slides to text', 'read a powerpoint', 'get words out of slides', 'deck to plain text'],
    faq: [
      {
        q: 'Are the slides in the right order?',
        a: 'Yes. Slide files are named slide1.xml, slide2.xml and so on, and a naive alphabetical sort would put slide10 before slide2. Furtu sorts on the number, so the order you see is the order PowerPoint shows.',
      },
      {
        q: 'Where is the text in a slide stored?',
        a: 'Each slide is its own XML part, with the visible words in drawing-text elements. Titles, body placeholders, free text boxes, grouped shapes and table cells are all read, which is why a deck that “has no text” in a naive export usually does have some.',
      },
      {
        q: 'Can I get the speaker notes too?',
        a: 'Yes — turn on “Include speaker notes”. They live in a separate notes part per slide, and each one is matched back to its slide by number. Placeholder text such as the slide number is skipped so you get the notes, not the furniture.',
      },
      {
        q: 'What if a slide has no text at all?',
        a: 'Then it is a picture slide, and there is nothing to extract. Leave “Skip slides with no text” off to see where they are, or switch it on if you only want the slides that carry words.',
      },
      {
        q: "Are my presentation slides uploaded?",
        a: "No. The slides are unzipped and read in your browser, which matters for decks, because a slide deck is often the most sensitive document in a company — unreleased strategy, salaries, unannounced plans.",
      },
    ],
    howItWorks: [
      { title: 'Add your deck', body: 'Drop in a .pptx. Furtu confirms it is a ZIP-based Office file, then lists the slide parts it contains.' },
      { title: 'Choose the detail you want', body: 'Slide labels, speaker notes, table rows and whether empty slides are worth keeping.' },
      { title: 'Download the text', body: 'One plain-text file with every slide in order, plus a slide count so you know nothing was missed.' },
    ],
    limitations: [
      'Images, video, audio and animations are ignored; a slide made only of pictures contributes no text.',
      'Reading order follows the XML, which is usually top-to-bottom but is not guaranteed for free-floating shapes that overlap. Overlapping callouts can come out interleaved.',
      'Slide masters and layouts are not extracted, so placeholder prompt text that was never replaced is not reported.',
      'Notes are matched to slides by number, which holds for files produced by PowerPoint and by normal exports. A deck that has had slides reordered by a script that rewrote the parts could pair a note with the wrong slide.',
    ],
    related: ['docx-to-text', 'xlsx-to-csv', 'document-metadata'],
  },
  {
    slug: 'odt-to-text',
    category: 'document',
    name: 'ODT to Text',
    summary: 'Read text out of an OpenDocument file from LibreOffice.',
    description:
      'Extract the text from an .odt — the open format LibreOffice writes by default — including headings, lists and table cells, with optional footnotes. A useful companion for anyone who works across Word and LibreOffice. Parsed in your browser, never uploaded.',
    icon: 'file',
    workspace: 'files',
    engine: 'document',
    input: OFFICE_INPUT(['.odt']),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'headings',
        label: 'Headings',
        default: 'plain',
        options: [
          { value: 'plain', label: 'Plain paragraphs' },
          { value: 'markdown', label: 'Markdown hashes (#)' },
        ],
        help: 'Markdown output keeps the outline structure, so a level-one heading becomes “# Heading”.',
      },
      { kind: 'toggle', id: 'listMarkers', label: 'Mark list items', default: true, help: 'Prefixes each list item with a bullet so the structure survives in plain text.' },
      { kind: 'toggle', id: 'includeTables', label: 'Keep table rows', default: true, help: 'Each row of a table becomes one line, with its cells separated by tabs.' },
      { kind: 'toggle', id: 'includeNotes', label: 'Include footnotes', default: true, help: 'Footnotes are collected and listed at the end, numbered in document order.' },
    ],
    keywords: ['odt to text', 'opendocument to text', 'libreoffice document to txt', 'odt text extractor', 'open document text'],
    synonyms: ['odt2txt', 'read an odt', 'openoffice file to text', 'libreoffice writer to text', 'odf text'],
    faq: [
      {
        q: 'What is an .odt?',
        a: 'The OpenDocument format — a ZIP container with a content.xml part inside, written by LibreOffice, OpenOffice and most other non-Microsoft word processors. Because it is open and documented, extracting it needs no guessing about private binary structures.',
      },
      {
        q: 'Does it keep my heading levels?',
        a: 'You can choose. “Plain paragraphs” gives you clean text with no markup; “Markdown hashes” prefixes each heading with the right number of # characters, which is genuinely useful if you are about to feed the result into something that understands Markdown.',
      },
      {
        q: 'What about the rest of the formatting?',
        a: 'Bold, italic, colours, fonts, margins, page breaks and styles are not carried across. Only the words and the block structure survive, because that is all plain text can hold. Headings, lists, tables and footnotes are treated as structure rather than formatting, which is why they do survive.',
      },
      {
        q: 'Can it open .docx as well?',
        a: 'No — this tool is for .odt only. If you have a Word file, use DOCX to Text, or save the document as .odt from LibreOffice first, which takes one click and keeps the file open rather than proprietary.',
      },
      {
        q: "Are ODT files uploaded?",
        a: "No. The document is unpacked and parsed locally. There is no upload step to opt out of, which is the strongest form of privacy guarantee available: there is nothing to opt out of because nothing leaves.",
      },
    ],
    howItWorks: [
      { title: 'Add your document', body: 'Drop in an .odt. Furtu checks it is a ZIP container and locates the content.xml part inside.' },
      { title: 'Choose the output style', body: 'Plain or Markdown headings, bullet markers on list items, table rows, and footnotes.' },
      { title: 'Download the text', body: 'The extracted document appears in an editable box with a plain-text download.' },
    ],
    limitations: [
      'Only text documents are handled. A spreadsheet or presentation saved with an .odt extension is a different content type and will be reported as such.',
      'Frames, images, embedded objects, comments, tracked changes and fields such as page numbers are not extracted.',
      'List levels are flattened to a single bullet level, because OpenDocument keeps the real outline in numbering styles that are not part of the text.',
      'Rows and columns marked as repeated filler are read once rather than repeated to fill the page, which is how OpenDocument stores a run of empty rows.',
      'Character formatting — bold, italic, colour, font — is discarded, since plain text cannot carry it.',
    ],
    related: ['docx-to-text', 'document-metadata', 'xlsx-to-csv'],
  },
  {
    slug: 'text-to-docx',
    category: 'document',
    name: 'Text to DOCX',
    summary: 'Turn a .txt or Markdown file into a real Word document.',
    description:
      'Build a genuine .docx from a plain text or Markdown file — the same structure Word writes, opening in Word, LibreOffice, Pages and Google Docs. Set the page size, orientation, typeface and size, and let Markdown headings and lists become real formatting. The document is assembled in your browser and never uploaded.',
    icon: 'type',
    workspace: 'files',
    engine: 'document',
    input: TEXT_INPUT(['.txt', '.md', '.markdown', '.text']),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'pageSize',
        label: 'Page size',
        default: 'a4',
        options: [
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: 'US Letter' },
        ],
      },
      {
        kind: 'select',
        id: 'orientation',
        label: 'Orientation',
        default: 'portrait',
        options: [
          { value: 'portrait', label: 'Portrait' },
          { value: 'landscape', label: 'Landscape' },
        ],
      },
      {
        kind: 'select',
        id: 'fontFamily',
        label: 'Typeface',
        default: 'Calibri',
        options: [
          { value: 'Calibri', label: 'Calibri' },
          { value: 'Arial', label: 'Arial' },
          { value: 'Georgia', label: 'Georgia' },
          { value: 'Times New Roman', label: 'Times New Roman' },
          { value: 'Verdana', label: 'Verdana' },
          { value: 'Courier New', label: 'Courier New' },
        ],
        help: 'Set as the document default. Readers without the font installed substitute their own.',
      },
      { kind: 'number', id: 'fontSize', label: 'Font size', min: 8, max: 24, step: 1, default: 11, suffix: 'pt' },
      { kind: 'number', id: 'lineSpacing', label: 'Line spacing', min: 1, max: 2, step: 0.05, default: 1.15, help: '1 is single spacing, 1.5 is one-and-a-half.' },
      {
        kind: 'toggle',
        id: 'markdown',
        label: 'Interpret Markdown',
        default: true,
        help: 'Turn this off to keep every character exactly as written, including the # and ** markers.',
      },
    ],
    keywords: ['text to docx', 'txt to docx', 'markdown to word', 'make a word document', 'create docx from text'],
    synonyms: ['txt2docx', 'md to word', 'plain text to word', 'turn text into a document', 'build a docx'],
    faq: [
      {
        q: 'Is the .docx a real Word file?',
        a: 'Yes. It is a proper Office Open XML package — content types, relationships, document part and all — built the same way Word builds one, not a renamed text file. It opens in Word, LibreOffice, Pages, Google Docs and WPS, and the document properties carry the original file name as the title.',
      },
      {
        q: 'How are paragraphs decided?',
        a: 'Blank-line-separated blocks become separate paragraphs, and lines inside a block are separated by a line break within that paragraph. That is the same rule Markdown uses, so a Markdown file you have been editing behaves the way you expect when it comes out the other side.',
      },
      {
        q: 'How much Markdown is understood?',
        a: 'Headings (# to ######), bulleted and numbered list markers, and bold and italic runs. That is deliberately the part of Markdown that changes what a word processor does. Anything else — tables, links, images, code fences, block quotes — is carried across as the literal text you typed, so nothing is ever silently thrown away.',
      },
      {
        q: 'Will it look like my source file?',
        a: 'Only if your source file is plain text. There is no way to infer a layout that was never in the file: a .txt has no fonts, no margins and no styles. What you set here — page size, orientation, typeface, size, spacing — is the complete set of choices, and there are no hidden defaults beyond standard 2.5 cm margins.',
      },
      {
        q: 'Is my text uploaded?',
        a: 'No. Reading the text and writing the Word package both happen in this tab, using a small archive library bundled with the page.',
      },
    ],
    howItWorks: [
      { title: 'Add your text file', body: 'Drop in a .txt or .md. Furtu reads it as text, strips out the control characters that are not legal in XML, and splits it into blocks on blank lines.' },
      { title: 'Set the page and type', body: 'A4 or Letter, portrait or landscape, then the typeface, size and line spacing you want as the document default.' },
      { title: 'Download the .docx', body: 'A complete Office package is assembled in your browser and handed back as a file you can open and keep editing.' },
    ],
    limitations: [
      'This creates a new document. It does not open and edit an existing .docx, so existing styles, headers and numbering are not available to reuse.',
      'Markdown support covers headings, list markers and bold and italic runs. Tables, links, images, footnotes and code blocks are written as the literal text you typed.',
      'Paragraph alignment, indents, colours and page breaks are not exposed, so the result is deliberately plain — a clean starting point rather than a designed layout.',
      'A source file with no text at all produces an empty document; Furtu stops and says so instead of handing you a blank file.',
    ],
    related: ['docx-to-text', 'document-metadata', 'odt-to-text'],
  },
  {
    slug: 'document-metadata',
    category: 'document',
    name: 'Document Metadata',
    summary: 'See what a file says about itself, including what it hides.',
    description:
      'Inspect a document before you send it on. For plain text: byte size, characters, lines, detected encoding, line endings and byte-order mark. For Office and OpenDocument files: the author, last editor, title, timestamps, word and page counts and the application that wrote it. Read in your browser — the file is not uploaded.',
    icon: 'search',
    workspace: 'files',
    engine: 'document',
    input: TEXT_INPUT(['.txt', '.md', '.csv', '.json', '.log', '.xml', '.yaml', '.yml', '.docx', '.xlsx', '.pptx', '.odt']),
    limits: SINGLE,
    controls: [
      {
        kind: 'select',
        id: 'encoding',
        label: 'Text encoding',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Detect automatically' },
          { value: 'utf-8', label: 'UTF-8' },
          { value: 'utf-16le', label: 'UTF-16 little-endian' },
          { value: 'utf-16be', label: 'UTF-16 big-endian' },
          { value: 'windows-1252', label: 'Windows-1252 (Western European)' },
        ],
        help: 'Automatic detection uses the byte-order mark when there is one, then checks whether the bytes are valid UTF-8. Override it if a legacy file decodes as nonsense.',
      },
      { kind: 'toggle', id: 'officeProperties', label: 'Read Office document properties', default: true, help: 'Pulls author, timestamps and counts from an Office or OpenDocument file.' },
      { kind: 'toggle', id: 'includePreview', label: 'Preview the beginning of a text file', default: true, help: 'Shows the first few lines so you can confirm the encoding was right.' },
      { kind: 'number', id: 'previewLines', label: 'Preview lines', min: 5, max: 200, step: 5, default: 25, suffix: 'lines' },
    ],
    keywords: ['document metadata', 'file metadata', 'docx properties', 'check text encoding', 'line endings', 'author of a document'],
    synonyms: ['doc properties', 'file info', 'encoding check', 'bom check', 'who made this file', 'document properties'],
    faq: [
      {
        q: 'What is this actually telling me?',
        a: 'For a text file, the facts that decide whether it will open correctly somewhere else: how many bytes, characters and lines it has, what encoding it is really in, whether its line endings are LF, CRLF or a mix of both, and whether it starts with a byte-order mark. For an Office or OpenDocument file, the properties the authoring program stored — author, last editor, created, modified, word and page counts, and which program wrote it.',
      },
      {
        q: 'Why does the detected encoding sometimes say UTF-8 when I expected Windows-1252?',
        a: 'Because Windows-1252 text that happens to contain no invalid bytes is also valid UTF-8, and there is no way to tell the two apart from the bytes alone — the difference only shows up in the accented characters, which is exactly what a 1252 file is full of. If the preview looks wrong, override the encoding and compare.',
      },
      {
        q: 'Is this a metadata stripper?',
        a: 'No, it is a reader. Furtu shows you what is stored so you know whether a file still carries a name, a machine name or a company name before you share it. Clearing it is a separate, deliberate act.',
      },
      {
        q: 'Why is my author field empty?',
        a: 'Either the authoring program never wrote one, or it was cleared. Plenty of exporters — including several PDF and Office generators — leave these fields empty on purpose, and an empty field is itself useful information: it means nothing is being leaked.',
      },
      {
        q: "Is the file I am inspecting uploaded anywhere?",
        a: "No. Its properties are read from your device, including the document properties inside an office file, and the report is generated in your browser. Useful precisely because you can inspect a file you have been sent without disclosing that you received it.",
      },
    ],
    howItWorks: [
      { title: 'Add a file', body: 'Drop in a text file or an Office or OpenDocument file. Furtu identifies the container from its own bytes, not from the extension.' },
      { title: 'Set the encoding if you need to', body: 'Automatic detection is right almost always. Override it for a file exported from a legacy system, then read the preview to confirm.' },
      { title: 'Read the report', body: 'Every measurement appears as a labelled chip, with a full plain-text report you can copy or download.' },
    ],
    limitations: [
      'Only the properties defined by the Office and OpenDocument formats are reported. Custom XML metadata parts and embedded revision history are listed as parts but not interpreted.',
      'Word and page counts come from the values cached when the file was last saved by Word. They are not recomputed, so they can be out of date or absent.',
      'Encoding detection is a heuristic based on the byte-order mark and UTF-8 validity. Legacy single-byte encodings other than Windows-1252 — Shift-JIS, GBK, ISO-8859-15 — are reported as not-UTF-8 rather than identified exactly.',
      'For a text file, this reports only the file. It cannot tell you whether a column is text or a date, only how the bytes are arranged.',
    ],
    notes: [
      {
        title: 'Why a metadata reader belongs next to the converters',
        body: 'Before you send a contract to the wrong person, it is worth knowing what the file still says about the machine it was authored on. A read-only inspector is the honest first step: it shows the trail without pretending to remove it.',
      },
    ],
    related: ['docx-to-text', 'xlsx-to-csv', 'pptx-to-text'],
  },
];

export default DOCUMENT_TOOLS;
