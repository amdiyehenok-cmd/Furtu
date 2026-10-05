/**
 * Guides.
 *
 * Supporting content for the tool pages. Each guide is data with a small set of
 * typed blocks so the same file can render to HTML for a crawler and to a
 * client-side view after navigation.
 *
 * The rule from the brief applies here harder than anywhere else: these are
 * written to answer a question better than the competing page, not to fill a
 * keyword slot. A guide that only restates the tool page does not ship.
 */

import { absoluteUrl } from './site';

export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string; id: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'note'; title: string; text: string }
  | { kind: 'tools'; slugs: string[] };

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** ISO date, used for the article metadata and the changelog ordering. */
  updated: string;
  readingMinutes: number;
  /** Tool slugs this guide supports, rendered as contextual links. */
  relatedTools: string[];
  blocks: GuideBlock[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-compress-a-pdf',
    title: 'How to compress a PDF without making it unreadable',
    description:
      'Why most PDF compressors damage your document, what structural compression actually saves, and how to get a file under an attachment limit while keeping text selectable.',
    updated: '2026-10-02',
    readingMinutes: 6,
    relatedTools: ['compress-pdf', 'split-pdf', 'merge-pdf'],
    blocks: [
      {
        kind: 'p',
        text: 'There are two completely different things a tool can mean by "compress a PDF", and almost every online compressor does the same one. Understanding the difference is most of what you need to know.',
      },
      { kind: 'h2', id: 'two-approaches', text: 'The two approaches' },
      {
        kind: 'p',
        text: 'The first approach is to rebuild the document more efficiently. Object streams, deduplicated images, stripped metadata. The text stays text, the images stay images, and the file gets smaller without anything changing about how it renders.',
      },
      {
        kind: 'p',
        text: 'The second approach is to rasterise: render every page to a JPEG at some DPI and rebuild the file from those images. The result is dramatically smaller, which is why it is popular. The text is now a photograph of text. You lose search, you lose selection, you lose accessibility, and small type starts to look like mud when printed.',
      },
      { kind: 'h2', id: 'choose', text: 'Which one you want' },
      {
        kind: 'table',
        head: ['If you need to…', 'Use'],
        rows: [
          ['Email a document under an attachment limit', 'Structural compression first'],
          ['Keep the text searchable and selectable', 'Structural compression only'],
          ['Publish to the web and file size is irrelevant', 'Either — or convert to WebP images instead'],
          ['Shrink a scanned document a great deal', 'Re-scan at a lower DPI, or OCR then compress'],
        ],
      },
      { kind: 'h2', id: 'why-pdf-is-big', text: 'Why PDFs are larger than they need to be' },
      {
        kind: 'p',
        text: 'Office applications are generous. They write a lot of small objects, embed the same logo once per page, and store fonts and colour profiles that nobody will ever use. That overhead is often 20–40% of a text-heavy PDF, and reclaiming it changes nothing visible.',
      },
      {
        kind: 'p',
        text: 'Scans are the opposite case. A scanned page is usually one large already-compressed image, so there is very little structural slack to remove. If a scan is too big, the honest fix is at the scanning stage: a 300 dpi greyscale scan of a text page carries far more data than a 200 dpi one, and nobody can tell the difference at reading size.',
      },
      { kind: 'h2', id: 'metadata', text: 'Metadata is free savings' },
      {
        kind: 'p',
        text: 'Before you send a file outside your organisation, check what it says about itself. Author, application, workstation name and timestamps are frequently more revealing than the filename, and removing them costs nothing. A scan exported from a phone can carry GPS coordinates in its EXIF data; a PDF written by a word processor can carry the last person to edit it.',
      },
      { kind: 'h2', id: 'steps', text: 'A reliable order of operations' },
      {
        kind: 'ol',
        items: [
          'Remove metadata first. It is instant and changes nothing about the document.',
          'Run structural compression and look at the real number, not the promise.',
          'If it still will not fit, split it rather than degrading quality — most attachment limits are per file.',
          'If it is a scan, re-scan at 200 dpi instead of compressing harder. You will get a smaller, better file than any amount of lossy squeezing.',
        ],
      },
      {
        kind: 'note',
        title: 'One thing to check before you trust a converter',
        text: 'Open the compressed file and try to select and search its text. If you can, it is still a document. If the selection grabs a whole block, or if search returns nothing, you have been given images wearing a PDF extension.',
      },
      { kind: 'h2', id: 'batch', text: 'Doing it in bulk' },
      {
        kind: 'p',
        text: 'Most people discover this problem with forty invoices rather than one. Furtu processes batches locally, so a folder of PDFs can be optimised in one pass without any of them being uploaded — and the results page shows the before and after size for every file, so you can see which ones were actually worth it.',
      },
      { kind: 'tools', slugs: ['compress-pdf', 'remove-pdf-metadata', 'split-pdf', 'merge-pdf'] },
    ],
  },
  {
    slug: 'compress-image-to-a-target-size',
    title: 'How to hit an exact image file size',
    description:
      'What happens when you compress an image to a target like 200 KB: which knob to turn first, why WebP wins, and when the honest answer is that the target is impossible.',
    updated: '2026-10-04',
    readingMinutes: 7,
    relatedTools: ['compress-image-to-200kb', 'compress-image-to-50kb', 'convert-image', 'resize-image'],
    blocks: [
      {
        kind: 'p',
        text: 'Uploading limits are everywhere: a visa application wants under 200 KB, a marketplace listing caps at 1600×1600 and 500 KB, a government form says 2 MB. So the question is rarely "make this smaller" — it is "make this exactly this size, and do not make it look bad".',
      },
      { kind: 'h2', id: 'order-of-operations', text: 'Which knob to turn, in order' },
      {
        kind: 'p',
        text: 'Quality and dimensions are not equally powerful. Halving the dimensions removes about three quarters of the pixels and usually lands the file on target while keeping it sharp. Cranking quality from 80 down to 15 gets you the same saving with visible artefacts, and it is almost always the wrong order.',
      },
      {
        kind: 'ol',
        items: [
          'Try to fit the target at the original dimensions by lowering quality only. Best possible result if it works.',
          'If the target is still out of reach, scale the dimensions down and retry.',
          'If you fall well under the target, walk the dimensions or quality back up to use the budget you have.',
        ],
      },
      {
        kind: 'note',
        title: 'Why the search runs more than once',
        text: 'File size does not move linearly with quality, so guessing one value and hoping is unreliable. A proper implementation measures the result and adjusts — that is why a few seconds of processing buys a file that fits the limit precisely instead of one that is far under it.',
      },
      { kind: 'h2', id: 'webp-vs-jpeg', text: 'WebP or JPEG' },
      {
        kind: 'p',
        text: 'For photographic images, WebP is usually 25–35% smaller than JPEG at the same perceived quality. If the destination accepts WebP, converting is almost always the single most effective thing you can do — before touching quality at all.',
      },
      {
        kind: 'table',
        head: ['Image', 'Best format for a small target'],
        rows: [
          ['Photograph', 'WebP, then JPEG if the destination rejects WebP'],
          ['Screenshot, logo, flat colour', 'PNG or WebP lossless — JPEG adds artefacts to hard edges'],
          ['Image with transparency', 'WebP or PNG. Never JPEG; transparency is discarded'],
          ['Line art or text-heavy capture', 'PNG, or WebP lossless'],
        ],
      },
      { kind: 'h2', id: 'impossible', text: 'When the target is impossible' },
      {
        kind: 'p',
        text: 'A 50 KB target for a detailed 12-megapixel photograph is not achievable at a usable size. Rather than return a 200-pixel thumbnail that will be rejected for being the wrong dimensions, a good tool stops, tells you what happened, and suggests resizing to a specific width first.',
      },
      {
        kind: 'p',
        text: "This is worth being honest about, because the alternative — silently returning a tiny image and letting the user discover the problem at submission time — is the most common way these tools waste someone's afternoon.",
      },
      { kind: 'h2', id: 'metadata', text: 'Stripping metadata, and one caveat' },
      {
        kind: 'p',
        text: 'Re-encoding an image through a canvas discards EXIF data, including GPS coordinates, camera serial numbers and timestamps. That is genuinely useful before posting a photo publicly.',
      },
      {
        kind: 'p',
        text: 'The caveat is that the same re-encoding applies the orientation EXIF describes. Almost always this is what you want, because it makes the image display correctly everywhere. Very occasionally, a file from an unusual camera produces an unexpected shift, and a before-and-after preview is the fastest way to catch it.',
      },
      { kind: 'tools', slugs: ['compress-image-to-200kb', 'compress-image-to-50kb', 'convert-image', 'resize-image', 'remove-image-metadata'] },
    ],
  },
  {
    slug: 'jpg-vs-webp-avif',
    title: 'JPG, WebP or AVIF: which image format to use',
    description:
      'A practical comparison of the three web image formats — file size, quality, support, and when the older format is still the right answer.',
    updated: '2026-09-28',
    readingMinutes: 6,
    relatedTools: ['jpg-to-webp', 'png-to-webp', 'webp-to-jpg', 'convert-image'],
    blocks: [
      {
        kind: 'p',
        text: 'Three formats cover almost every image on the web today. They are not interchangeable, and the right choice depends on what the image is, who needs to see it, and what it has to fit into.',
      },
      { kind: 'h2', id: 'comparison', text: 'The short comparison' },
      {
        kind: 'table',
        head: ['', 'JPG', 'WebP', 'AVIF'],
        rows: [
          ['Typical saving vs JPG', 'baseline', '25–35% smaller', '50% smaller or more'],
          ['Transparency', 'No', 'Yes', 'Yes'],
          ['Animation', 'No', 'Yes', 'Yes'],
          ['Lossless mode', 'No', 'Yes', 'Yes'],
          ['Browser support', 'Universal', 'All current browsers', 'All current browsers'],
          ['Encoding speed', 'Very fast', 'Fast', 'Slow'],
          ['Good for', 'Archives, email, anything with a strict format requirement', 'The web default', 'Where bytes matter most and you control the pipeline'],
        ],
      },
      { kind: 'h2', id: 'avif-caveat', text: 'The catch with AVIF' },
      {
        kind: 'p',
        text: 'AVIF produces the smallest files, but encoding is slow — noticeably so for large images or big batches. On a device without hardware AVIF encoding, the encode can take many seconds per image, and a browser may not offer AVIF encoding at all, in which case a converter has to fall back.',
      },
      {
        kind: 'p',
        text: 'That is why AVIF is a strong default for delivery — converting once, server-side, and serving to everyone — but a poor default for a quick one-off conversion on a laptop.',
      },
      { kind: 'h2', id: 'when-jpg', text: 'When JPG is still the right answer' },
      {
        kind: 'ul',
        items: [
          'A form or portal specifies "JPG" explicitly. Fighting the spec wastes your time.',
          'The file is an archival record. JPG is the safest format to still be able to open in twenty years.',
          'You are emailing it. Some corporate mail gateways still mishandle WebP.',
          'It is a photograph with no transparency, for a small audience, where compatibility matters more than bytes.',
        ],
      },
      { kind: 'h2', id: 'png-trap', text: 'The PNG trap' },
      {
        kind: 'p',
        text: 'Screenshots and logos saved as PNG are routinely ten times larger than they need to be, because PNG is lossless and a screenshot has a lot of near-identical pixels. Lossless WebP handles the same content at a fraction of the size.',
      },
      {
        kind: 'p',
        text: 'The trap is using JPG for that content instead. JPEG adds ringing artefacts around hard edges and crisp text — exactly the features a screenshot is made of. Lossless WebP, or a well-chosen palette PNG, is the correct answer.',
      },
      { kind: 'note', title: 'A rule of thumb', text: 'Photograph → WebP or AVIF. Screenshot or logo → lossless WebP or PNG. Anything going to a system that names a format → use the format it names.' },
      { kind: 'tools', slugs: ['jpg-to-webp', 'png-to-webp', 'webp-to-jpg', 'convert-image', 'compress-image'] },
    ],
  },
  {
    slug: 'why-local-processing-is-private',
    title: 'What "processed in your browser" actually means',
    description:
      'A concrete explanation of local file processing: what happens to your bytes, what still leaves your device, and how to tell whether a tool is telling the truth.',
    updated: '2026-10-05',
    readingMinutes: 5,
    relatedTools: ['compress-pdf', 'compress-image', 'json-formatter'],
    blocks: [
      {
        kind: 'p',
        text: 'Local-first tools make a privacy claim, and the claim is easy to make and easy to fake. Here is what actually happens, so you can check rather than trust.',
      },
      { kind: 'h2', id: 'what-happens', text: 'The five steps when you drop a file onto a local tool' },
      {
        kind: 'ol',
        items: [
          'The browser reads the file from your disk into the page’s memory. It has already been on your machine; nothing has moved.',
          'The file’s first bytes are checked to confirm it is genuinely the type it claims to be. This happens before any parser touches it.',
          'A processing engine — a library compiled into the page — reads those bytes and writes the result into memory.',
          'The result is turned into a download and handed to your browser’s download manager.',
          'The page is closed or reloaded, and the memory is released.',
        ],
      },
      {
        kind: 'p',
        text: 'At no point in those steps is there a network request carrying your file. That is the whole mechanism. There is no queue, no job ID, and no server that briefly held your document.',
      },
      { kind: 'h2', id: 'still-leaves', text: 'What does still leave your device' },
      {
        kind: 'p',
        text: 'Be precise, because a claim of "nothing leaves your device" is usually overstated:',
      },
      {
        kind: 'ul',
        items: [
          'The request for the web page itself, including your IP address and user agent. That is how the web works.',
          'Font files, if the site loads them from a third-party CDN. No file information is involved.',
          'Analytics, if a site collects them. A good local-first tool records which tool was used and nothing about the file.',
        ],
      },
      {
        kind: 'p',
        text: 'Your file contents, filenames, sizes and pasted text are not on that list. That is the meaningful part, and it is the part worth insisting on.',
      },
      { kind: 'h2', id: 'how-to-check', text: 'How to check a claim yourself' },
      {
        kind: 'ol',
        items: [
          'Open your browser’s developer tools and switch to the Network tab.',
          'Drop a file into the tool and watch what happens. A local tool shows no request containing your file, and no upload at all.',
          'Turn the network off entirely — the tool should keep working, because the work is already on your machine. If it stops, the processing was remote.',
        ],
      },
      {
        kind: 'note',
        title: 'The offline test is the honest one', text: 'A tool that keeps working with no connection cannot be uploading anything. It is the fastest way to sort a local-first tool from a marketing claim.' },
      { kind: 'h2', id: 'tradeoff', text: 'The trade-off you accept' },
      {
        kind: 'p',
        text: 'Local processing means your device does the work, so speed and file size depend on your machine rather than on someone else’s cluster. A very large PDF or a long batch will be slower than a server-side tool, and a low-powered phone will feel it. In exchange, your document never sits on hardware you do not control, and there is no operator who could be compelled to hand it over.',
      },
      { kind: 'p',
        text: 'For most files, that is a good trade. For files measured in gigabytes, it is a real one, which is why every Furtu tool page states its size limits rather than leaving you to discover them.',
      },
    ],
  },
  {
    slug: 'reading-a-pdf-file-size-properly',
    title: 'How to actually get a PDF under an attachment limit',
    description:
      'A practical order of operations for shrinking a document until it fits, without the sequence of increasingly bad decisions people usually end up making.',
    updated: '2026-09-30',
    readingMinutes: 5,
    relatedTools: ['compress-pdf', 'split-pdf', 'extract-pdf-pages', 'remove-pdf-metadata'],
    blocks: [
      {
        kind: 'p',
        text: 'An email system says 25 MB, a portal says 10 MB, and you have a 31 MB PDF. The instinct is to compress harder. Sometimes that is right, and often it is the wrong first move.',
      },
      { kind: 'h2', id: 'check-first', text: 'First, work out what is actually big' },
      {
        kind: 'p',
        text: 'Open the file and look at the page count and the page types. A 30 MB, four-page document is almost certainly a handful of enormous scanned images. A 30 MB, 300-page document is probably structural overhead and duplicated assets. Those need opposite treatments.',
      },
      { kind: 'h2', id: 'ladder', text: 'The ladder, in order' },
      {
        kind: 'ol',
        items: [
          'Strip the metadata. Instant, invisible, and it sometimes removes a surprising amount.',
          'Run structural compression. See how far that gets you — it is the only step with no downside.',
          'If the limit is per file, split the document. A reader can usually cope with two attachments; nobody can cope with an unreadable file.',
          'If only certain pages are needed, extract just those instead of shipping the whole thing.',
          'Only then consider reducing quality — and if the document is a scan, re-scan instead of squeezing a JPEG that is already compressed.',
        ],
      },
      {
        kind: 'note',
        title: 'Do not skip to step five', text: 'Rasterising a text document to hit a size limit solves the immediate problem and creates three new ones: unsearchable text, larger apparent page count when printed, and a file that is illegible at 100% zoom.' },
      { kind: 'h2', id: 'check-result', text: 'Verify before you send' },
      {
        kind: 'ul',
        items: [
          'Check the actual byte size, not what your file manager rounds it to.',
          'Open the result and confirm the page count matches what you expect.',
          'Select and copy some text to confirm it is still text.',
          'Check the pages that matter most — a compressed page 30 often looks worse than page 3, and that is where people give up.',
        ],
      },
      { kind: 'h2', id: 'why', text: 'Why compression is usually not the answer' },
      {
        kind: 'p',
        text: 'Most large PDFs are large for a structural reason that has nothing to do with content: duplicated images, embedded fonts nobody uses, colour profiles, incremental save histories. None of that is visible on the page, and removing it costs nothing in quality. That is why structural compression is worth trying before anything else — and why a file that resists it is usually telling you something useful about its contents.',
      },
      { kind: 'tools', slugs: ['compress-pdf', 'remove-pdf-metadata', 'split-pdf', 'extract-pdf-pages'] },
    ],
  },
];

export const GUIDE_BY_SLUG = new Map(GUIDES.map((guide) => [guide.slug, guide]));

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

export function sortedGuides(): Guide[] {
  return [...GUIDES].sort((a, b) => b.updated.localeCompare(a.updated));
}

export function guideMeta(guide: Guide) {
  return {
    title: `${guide.title} | Furtu`,
    description: guide.description,
    canonical: absoluteUrl(guidePath(guide.slug)),
    robots: 'index, follow',
    jsonLd: [
      {
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        dateModified: guide.updated,
        inLanguage: 'en',
        mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(guidePath(guide.slug)) },
        publisher: { '@type': 'Organization', name: 'Furtu', url: absoluteUrl('/') },
        image: undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: absoluteUrl('/guides') },
          { '@type': 'ListItem', position: 3, name: guide.title, item: absoluteUrl(guidePath(guide.slug)) },
        ],
      },
    ],
  };
}
