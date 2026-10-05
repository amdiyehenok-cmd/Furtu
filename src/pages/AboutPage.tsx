import { PageShell, Callout } from '@/components/PageShell';
import { SITE } from '@/lib/site';

export default function AboutPage() {
  return (
    <PageShell
      kicker="ABOUT"
      title="About Furtu"
      intro="Furtu is a local-first toolbox for the files people actually need to fix: the PDF that is too big to email, the photo that has to fit a form's limit, the JSON that a human needs to read."
    >
      <section>
        <h2>The idea</h2>
        <p>
          Most online file tools follow the same pattern: upload your file, wait in a queue, download the
          result. That pattern is the product, and it has a consequence people do not think about until they
          upload something they should not have — the file passes through a machine belonging to a stranger,
          and so does everything in it.
        </p>
        <p>
          A browser already has everything needed to do this work. It can decode images, parse documents,
          run compression algorithms and encode results. Furtu's premise is that if the processing happens
          locally, the upload step disappears, and with it the privacy problem, the queue, and the storage
          obligation.
        </p>
      </section>

      <section>
        <h2>What that looks like in practice</h2>
        <ul>
          <li>
            <strong>Privacy claims are derived, not written.</strong> Each tool declares how it processes
            files, and the badge on the page is generated from that. A claim cannot drift away from the
            implementation without the page changing.
          </li>
          <li>
            <strong>Tools load when you open them.</strong> The PDF engine is not in the page until you open
            a PDF tool. A visitor who only ever formats JSON never downloads a PDF library.
          </li>
          <li>
            <strong>No account, ever.</strong> There is nothing to sign up for, so there is no profile to
            leak and no credential to phish.
          </li>
          <li>
            <strong>Limits are stated before you hit them.</strong> Each tool page lists its real
            constraints, including the ones that are inconvenient for us to admit.
          </li>
        </ul>
      </section>

      <Callout title="The trade-off we accept">
        Some things genuinely cannot be done well in a browser. Password-protecting a PDF, OCR on a scanned
        document, and re-encoding the images inside a scanned file to make it much smaller all need more
        compute, a native library, or both. Where that is the case, Furtu says so on the tool page instead
        of shipping something that appears to work.
      </Callout>

      <section>
        <h2>How it is built</h2>
        <p>
          Furtu is a single, coherent application rather than several tools in one website. Processing engines
          are separated from the interface so the same code can serve a web app, a future API or a mobile
          client without being rewritten.
        </p>
        <p>
          Adding a tool is one file of metadata plus one file of processing code. Routing, search, the
          command palette, breadcrumbs, related-tool links, the sitemap and the page's structured data all
          follow from the registry, which is why the catalogue can grow without the architecture having to be
          revisited.
        </p>
        <p>
          The design system is the original FURTU design, extended rather than replaced: an editorial serif
          for statements, a monospace face for technical annotation, one blue, and no gradients, glass or
          neon.
        </p>
      </section>

      <section>
        <h2>Open source</h2>
        <p>
          Furtu is built on permissively licensed libraries — <code>pdf-lib</code>, <code>pdf.js</code>,{' '}
          <code>js-yaml</code>, <code>qrcode</code> and <code>fflate</code> among them. Their copyright
          notices are preserved and their licences are listed in the third-party notices in the project
          repository.
        </p>
        <p>
          Two projects that were evaluated as possible sources were <strong>not</strong> used, because neither
          carried a licence. Absent a licence, default copyright applies and the code is not reusable. That is
          recorded in the engineering report rather than quietly ignored.
        </p>
      </section>

      <section>
        <h2>Getting in touch</h2>
        <p>
          Tool requests, bug reports and disagreements about privacy claims are all welcome at{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. The{' '}
          <a href="/changelog">changelog</a> records what has actually changed, including the parts that are
          still unfinished.
        </p>
      </section>
    </PageShell>
  );
}
