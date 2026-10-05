import { PageShell } from '@/components/PageShell';
import { SITE } from '@/lib/site';

const TOC = [
  { id: 'threat-model', label: 'What we defend against' },
  { id: 'file-validation', label: 'File validation' },
  { id: 'processing-isolation', label: 'Processing isolation' },
  { id: 'output-encoding', label: 'Output encoding' },
  { id: 'denial-of-service', label: 'Denial of service' },
  { id: 'supply-chain', label: 'Supply chain' },
  { id: 'headers', label: 'Security headers' },
  { id: 'reporting', label: 'Reporting a vulnerability' },
];

export default function SecurityPage() {
  return (
    <PageShell
      kicker="SECURITY"
      title="Security"
      intro="Furtu processes untrusted files that strangers chose, in software that runs on other people's machines. That is an unusual position, and it shapes almost every technical decision in the project."
      toc={TOC}
      updated="October 2026"
    >
      <section aria-labelledby="threat-model">
        <h2 id="threat-model">What we defend against</h2>
        <p>
          The realistic threats are not server breaches, because there is no file server to breach. They are:
        </p>
        <ul>
          <li>
            <strong>A malicious file</strong> — something crafted to crash the browser, exhaust memory, or
            exploit a parser.
          </li>
          <li>
            <strong>A disguised file</strong> — a script or archive renamed to <code>.pdf</code> or{' '}
            <code>.png</code> so it slips past a naive check.
          </li>
          <li>
            <strong>Cross-site scripting</strong> — pasted text, filenames and file contents all reach the
            DOM, and none of them are trusted.
          </li>
          <li>
            <strong>Resource exhaustion</strong> — a decompression bomb, an enormous image, or a regex that
            backtracks catastrophically and freezes the tab.
          </li>
          <li>
            <strong>Supply chain</strong> — a compromised dependency shipping malicious code to every
            visitor.
          </li>
        </ul>
      </section>

      <section aria-labelledby="file-validation">
        <h2 id="file-validation">File validation</h2>
        <p>
          No file extension is trusted, because an extension is a claim rather than evidence. Every file is
          checked on three independent axes before any parser or codec sees it:
        </p>
        <ol>
          <li>
            <strong>Extension</strong> — cheapest, and the easiest to forge. Used to give a sensible error
            message.
          </li>
          <li>
            <strong>MIME type</strong> — reported by the operating system, and also forgeable.
          </li>
          <li>
            <strong>Magic bytes</strong> — the actual file signature. This is the check that matters, and
            it is the one that gates processing.
          </li>
        </ol>
        <p>
          A file whose contents do not match its extension is rejected before processing, with an
          explanation, rather than being handed to a parser that might not survive it. Multi-format inputs
          such as DOCX are validated as ZIP containers first and then inspected internally.
        </p>
      </section>

      <section aria-labelledby="processing-isolation">
        <h2 id="processing-isolation">Processing isolation</h2>
        <p>
          Processing happens in a Web Worker wherever the work is heavy enough to justify it, which keeps a
          runaway parse from freezing the interface and lets a job be cancelled. Image work uses{' '}
          <code>createImageBitmap</code> and canvas, which decode in the browser's sandboxed image pipeline
          rather than in a hand-written parser.
        </p>
        <p>
          Object URLs, image bitmaps and canvases are released explicitly on both the success and the error
          path. A long session that leaked one decoded bitmap per file would eventually take the tab down.
        </p>
        <p>
          PDF and OOXML parsing runs with <code>isEvalSupported</code> disabled, so content-stream
          expressions inside a document are not evaluated.
        </p>
      </section>

      <section aria-labelledby="output-encoding">
        <h2 id="output-encoding">Output encoding</h2>
        <p>
          Nothing that came from a user or a file is inserted as raw HTML anywhere in Furtu. The Markdown
          preview tool is the sharpest edge here, so it builds React elements for a documented subset of
          Markdown and escapes everything else, rather than setting{' '}
          <code>innerHTML</code>. Link targets are filtered to <code>http</code>, <code>https</code> and{' '}
          <code>mailto</code>, so a pasted <code>javascript:</code> URL is dropped rather than rendered as a
          clickable link.
        </p>
        <p>
          Structured data is serialised with <code>&lt;</code> escaped, so a value inside a JSON-LD block
          cannot terminate the surrounding script tag.
        </p>
      </section>

      <section aria-labelledby="denial-of-service">
        <h2 id="denial-of-service">Denial of service</h2>
        <p>
          A tool that runs on a visitor's machine can be turned into a way to freeze that machine, so several
          guards exist specifically for that:
        </p>
        <ul>
          <li>
            <strong>Decompression bombs</strong> — ZIP-based documents are checked against their declared
            uncompressed size before extraction, and rejected above a ceiling.
          </li>
          <li>
            <strong>Catastrophic regex backtracking</strong> — the regular expression tester detects
            zero-length matches, advances past them, and caps the number of matches returned, so a pattern
            like <code>(a*)*</code> cannot hang the tab.
          </li>
          <li>
            <strong>File and total size ceilings</strong> — enforced before parsing, and again during
            batch processing.
          </li>
          <li>
            <strong>Bounded concurrency</strong> — batch operations process a few files at a time rather
            than decoding twenty images simultaneously, which reliably crashes a tab.
          </li>
          <li>
            <strong>Target-size search limits</strong> — the image target-size tool bounds its quality and
            dimension search so it always terminates with a result or an honest failure.
          </li>
        </ul>
      </section>

      <section aria-labelledby="supply-chain">
        <h2 id="supply-chain">Supply chain</h2>
        <p>
          Furtu is deliberately built on a small number of well-known, permissively licensed dependencies.
          Heavy libraries are loaded lazily, so a dependency in the PDF path cannot affect a visitor who only
          ever uses a text tool.
        </p>
        <p>
          The complete list of dependencies, their versions and their licences is in the third-party notices
          in the project repository. Every open-source component retains its own copyright notice, and none of
          it is presented as Furtu-original work.
        </p>
        <p>
          Where a project had no licence at all, its code was not used. That is not a technical constraint we
          worked around; unlicensed code is not reusable by anyone, including us.
        </p>
      </section>

      <section aria-labelledby="headers">
        <h2 id="headers">Security headers</h2>
        <p>
          Static hosting is expected to send a restrictive content security policy, frame restrictions, a
          strict referrer policy and a permissions policy. The application makes no third-party requests
          during tool use, so the policy can stay tight: no inline scripts, no remote script hosts, and no
          connections anywhere except the page's own origin and the font CDN.
        </p>
        <p>
          The recommended header set is documented in the deployment guide in the repository, so a host
          configuration can reproduce it rather than approximate it.
        </p>
      </section>

      <section aria-labelledby="reporting">
        <h2 id="reporting">Reporting a vulnerability</h2>
        <p>
          Report anything that looks like a real problem to{' '}
          <a href={`mailto:${SITE.securityEmail}`}>{SITE.securityEmail}</a>. Please include the tool, the
          steps, and a file if you can share one safely.
        </p>
        <p>
          If your report turns out to be a privacy claim on a tool page that is not technically accurate,
          that is a security report too — a false claim is a defect we want to know about.
        </p>
      </section>
    </PageShell>
  );
}
