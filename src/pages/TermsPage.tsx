import { PageShell } from '@/components/PageShell';
import { SITE } from '@/lib/site';

export default function TermsPage() {
  return (
    <PageShell
      kicker="TERMS"
      title="Terms of use"
      intro="Short terms for a service that mostly runs on your own machine. They are written to be readable rather than defensive."
      updated="October 2026"
    >
      <section>
        <h2>What Furtu is</h2>
        <p>
          Furtu is a set of free online utilities. Files are processed by code running in your own browser.
          Furtu does not store, copy, receive or inspect your files.
        </p>
      </section>

      <section>
        <h2>Your responsibilities</h2>
        <p>You are responsible for the files you process and for having the right to use them.</p>
        <ul>
          <li>Only process files you own or are authorised to use.</li>
          <li>
            Furtu is provided as-is, with no warranty. Do not use it as the only copy of anything that matters —
            keep your own original.
          </li>
          <li>
            You are responsible for checking the result of a conversion or transformation. Verify a
            compressed file, read a converted file, do not assume.
          </li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Do not use Furtu to process content you have no right to process, or to produce material that is unlawful or that infringes someone else’s rights.</p>
      </section>

      <section>
        <h2>No account, no data</h2>
        <p>
          There is no registration. Because there is no account, there is no personal data attached to you,
          nothing to delete on request, and no way for us to recover work you have lost. Save anything you
          need before closing the tab.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          Furtu is offered without any guarantee of uptime. Pages are static files, so a tool may work
          perfectly for months and then fail to load because of a hosting or network problem. There is no
          service level to claim, and none is implied.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Furtu is provided without warranties of any kind. Furtu is
          not liable for lost files, lost data, corrupted output, or any indirect loss arising from your use
          of a tool. Since files never reach our servers, loss of a file can only arise from your own device
          or browser.
        </p>
      </section>

      <section>
        <h2>Intellectual property</h2>
        <p>
          Furtu and its design are the property of Furtu. Furtu is built on open-source libraries that remain
          the property of their authors under their own licences, which are listed in the project repository.
          Those notices are preserved and must not be removed.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          These terms may be updated. Material changes will be reflected in the{' '}
          <a href="/changelog">changelog</a> and the date at the top of this page.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms go to <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>
      </section>
    </PageShell>
  );
}
