import { PageShell } from '@/components/PageShell';
import { SITE } from '@/lib/site';

const TOC = [
  { id: 'what-stays-on-your-device', label: 'What stays on your device' },
  { id: 'what-furtu-does-receive', label: 'What Furtu does receive' },
  { id: 'no-file-storage', label: 'No file storage' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'third-parties', label: 'Third parties' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'contact', label: 'Contact' },
];

export default function PrivacyPage() {
  return (
    <PageShell
      kicker="PRIVACY"
      title="Privacy"
      intro="Furtu is built so that the most private way to use it is also the default. This page explains exactly what happens to your files and your data, in plain terms."
      toc={TOC}
      updated="October 2026"
    >
      <section aria-labelledby="what-stays-on-your-device">
        <h2 id="what-stays-on-your-device">What stays on your device</h2>
        <p>
          Every file tool on Furtu — every PDF tool, every image tool, every document tool — runs entirely
          in your browser. When you drop a file onto a Furtu tool, the file is read by JavaScript running on
          your own machine, transformed in memory, and handed straight back to you as a download.
        </p>
        <p>
          The file is not sent to us. It is not written to our storage. It is not queued, scanned, indexed or
          processed on a server. When you close the tab, it is gone from memory.
        </p>
        <p>
          The processing engines that do this work — the PDF library, the image codecs, the encoders — are
          downloaded to your browser as part of the page and run there. That is also why the tools work while
          you are offline, and why there is no queue to wait in.
        </p>
      </section>

      <section aria-labelledby="what-furtu-does-receive">
        <h2 id="what-furtu-does-receive">What Furtu does receive</h2>
        <p>
          A request for a page, exactly as any website works. That means Furtu's servers see the page you
          asked for, and whatever information your browser sends along with an ordinary HTTP request — such as
          your IP address, your browser's user agent, and any cookies described below.
        </p>
        <p>
          We do not receive your file contents. We do not receive the text you paste into the developer and
          utility tools, because those run locally too.
        </p>
      </section>

      <section aria-labelledby="no-file-storage">
        <h2 id="no-file-storage">No file storage</h2>
        <p>
          There is no document database behind Furtu. We could not hand your file to a third party if we
          wanted to, because we never have it.
        </p>
        <p>
          The tools that transform data — for example the JSON formatter or the base64 encoder — keep your
          input in your browser's memory only. Reloading the page clears it. Nothing is written to local
          storage unless you deliberately save a preference, such as your light or dark theme choice.
        </p>
      </section>

      <section aria-labelledby="analytics">
        <h2 id="analytics">Analytics</h2>
        <p>
          Furtu's privacy model means analytics, if and when they are enabled, are designed around one rule:
          never include file contents, filenames or pasted text in an analytics event.
        </p>
        <p>Only coarse product events are ever eligible, and they are things like:</p>
        <ul>
          <li>which tool page was viewed</li>
          <li>whether a processing run started, finished or failed</li>
          <li>how long a run took, in a coarse band</li>
          <li>whether a download happened</li>
        </ul>
        <p>
          Filenames, file sizes, page counts and pasted content are not part of any event. If analytics are
          not currently enabled, this section describes the ceiling rather than an active practice.
        </p>
      </section>

      <section aria-labelledby="cookies">
        <h2 id="cookies">Cookies</h2>
        <p>
          Furtu sets no tracking cookies. Your theme preference is stored in your browser's local storage,
          which never leaves your device and can be cleared from your browser settings at any time.
        </p>
        <p>
          If anonymous, aggregate traffic measurement is enabled in future, it will be a cookieless,
          IP-truncating measurement and this page will be updated to say so before it ships.
        </p>
      </section>

      <section aria-labelledby="third-parties">
        <h2 id="third-parties">Third parties</h2>
        <p>
          Furtu serves web fonts from Google Fonts, which means your browser makes a request to Google's
          servers when the page loads. That request is separate from your files — no file information is
          involved — but it is worth being explicit about.
        </p>
        <p>
          No file or pasted text is shared with any third party, because none of it ever leaves your browser.
          The complete list of open-source components Furtu builds on, with their licences, is in the
          third-party notices in the project repository.
        </p>
      </section>

      <section aria-labelledby="your-rights">
        <h2 id="your-rights">Your rights</h2>
        <p>
          Furtu holds no personal data about you, so there is normally nothing to export, correct or erase.
          There is no account system, which means there is no profile, no history and no stored file to
          request the deletion of.
        </p>
        <p>
          Server access logs may be retained for a short period for security and availability purposes. If
          you want information about those, contact us using the details below.
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact">Contact</h2>
        <p>
          Privacy questions go to <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>. If you
          think we have made a privacy claim that is not technically true, say so — we would rather correct
          the page than defend the claim.
        </p>
      </section>
    </PageShell>
  );
}
