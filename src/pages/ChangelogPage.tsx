import { PageShell } from '@/components/PageShell';

export default function ChangelogPage() {
  return (
    <PageShell
      kicker="CHANGELOG"
      title="Changelog"
      intro="What has actually shipped, including the things that are still missing. Dated, not aspirational."
      updated="October 2026"
    >
      <section>
        <h2>October 2026 — first public release</h2>

        <h3>Tools</h3>
        <p>
          The catalogue launched with working tools across five categories: PDF, Images, Documents, Developer
          and Utilities. Every published tool has an implemented engine behind it — there are no placeholder
          pages, because a thin page that ranks is worse than no page.
        </p>
        <ul>
          <li>
            <strong>PDF</strong> — merge, split, rotate, delete pages, extract pages, reorder, compress,
            watermark, edit metadata, remove metadata, PDF to JPG, images to PDF, extract text.
          </li>
          <li>
            <strong>Images</strong> — compress, resize, convert, crop, rotate, flip, strip metadata, the
            popular format pairings, and two target-file-size tools.
          </li>
          <li>
            <strong>Documents</strong> — extract text and data from DOCX, XLSX, PPTX and ODT, and build a
            DOCX from text.
          </li>
          <li>
            <strong>Developer</strong> — format, validate, minify and convert JSON, CSV, YAML and XML, plus
            Base64, URL, JWT, UUID, regex, hash, colour, timestamp and case tools.
          </li>
          <li>
            <strong>Utilities</strong> — word and character counters, text cleaning, line sorting and
            de-duplication, password generation, QR codes, and conversion helpers.
          </li>
        </ul>

        <h3>Platform</h3>
        <ul>
          <li>Local-first processing: no tool uploads files, by default and by construction.</li>
          <li>Statically prerendered tool pages with per-page metadata, canonicals and structured data.</li>
          <li>Command palette search on ⌘K and Ctrl+K, matching intent rather than just tool names.</li>
          <li>Light and dark themes, both designed rather than inverted.</li>
          <li>File validation on extension, MIME type and real file signature before any parsing.</li>
        </ul>
      </section>

      <section>
        <h2>Not shipped yet</h2>
        <p>
          Listed here rather than implied, so nothing here is mistaken for a feature. The honest reason is
          given in each case.
        </p>
        <ul>
          <li>
            <strong>Password-protecting a PDF.</strong> The PDF library available in the browser does not
            write encryption. Doing it properly needs a native component, and a weak implementation would be
            worse than none.
          </li>
          <li>
            <strong>OCR for scanned documents.</strong> Furtu reads an existing text layer. Recognising text
            in a page image is a different and much heavier problem, and a poor version is actively harmful
            because it produces confidently wrong text.
          </li>
          <li>
            <strong>Downsampling the images inside a PDF.</strong> The compress tool rebuilds document
            structure but does not resample embedded images, because that trades away resolution silently.
          </li>
          <li>
            <strong>Workflows as a real editor.</strong> The architecture anticipates chained steps, but no
            runnable workflow editor has shipped.
          </li>
          <li>
            <strong>Accounts, tiers and billing.</strong> The pricing page describes intentions, not
            products. There is no account system at all today.
          </li>
          <li>
            <strong>Additional languages.</strong> The string layer is centralised for future translation,
            but only English ships.
          </li>
        </ul>
      </section>

      <section>
        <h2>How this list is kept</h2>
        <p>
          Entries are written when something ships, not planned. If a feature is in progress it belongs in
          the engineering report, and if it is an idea it belongs in an issue. A changelog that describes
          intentions is a changelog nobody can trust.
        </p>
      </section>
    </PageShell>
  );
}
