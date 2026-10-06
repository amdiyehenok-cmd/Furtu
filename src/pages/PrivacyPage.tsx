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
          Furtu itself sets no cookies and runs no analytics. Your theme preference is stored in
          your browser&rsquo;s local storage, which never leaves your device and can be cleared from
          your browser settings at any time.
        </p>
        <p>
          The one exception is advertising, and only if you consent to it. If you agree, Google&rsquo;s
          ad network sets its own cookies &mdash; it does that itself, not Furtu, and Furtu has no
          access to what they contain or to who is shown what. Declining means none of that happens
          and no ad is requested.
        </p>
        <p>
          Your consent answer is kept in local storage, not a cookie, so recording it sends nothing
          anywhere. Clearing your browser storage removes it and you will be asked once more.
        </p>
      </section>

      <section aria-labelledby="third-parties">
        <h2 id="third-parties">Third parties and advertising</h2>
        <p>
          This site is funded by advertising. It uses Google AdSense, which means Google&rsquo;s ad
          network can set cookies and similar storage on your device, read them back, and use them to
          build a profile of you across this site and other sites that run the same network. That is
          the ordinary business model of web advertising and it is worth being plain about it.
        </p>
        <p>
          <strong>Your files are not part of any of it.</strong> An advert is page markup that loads
          while the page renders. The tools, the engines and the file pipeline never read it and never
          write to it. If you merge a PDF, the document never reaches Google or anywhere else &mdash;
          and no advert is ever shown inside a tool, only after the content on the page.
        </p>
        <p>
          Nothing is set until you agree. You are asked once, your answer is kept in this
          browser&rsquo;s local storage rather than in a cookie, and saying &ldquo;no thanks&rdquo;
          means no advertising cookies and no ad requests at all. Your tool pages keep working
          exactly as before.
        </p>
        <p>
          Google&rsquo;s use of advertising cookies enables it and its partners to serve ads based on
          your visits to this and other sites. You can opt out of personalised advertising at{' '}
          <a href="https://adssettings.google.com" rel="nofollow noreferrer noopener" target="_blank">
            Google Ads Settings
          </a>
          , or opt out of third-party vendor cookies at{' '}
          <a href="https://optout.aboutads.info" rel="nofollow noreferrer noopener" target="_blank">
            aboutads.info
          </a>
          .
        </p>
        <p>
          Beyond advertising, there are no other third parties. There is no analytics script, no tag
          manager and no CDN. Fonts, scripts, styles and images are all served from this origin. This
          site used to load its fonts from Google Fonts, which meant every page view handed your IP
          address to Google before anything else happened; that has since been removed.
        </p>
        <p>
          No file or pasted text is shared with any third party, because none of it ever leaves your
          browser. The complete list of open-source components Furtu builds on, with their licences,
          is in the third-party notices in the project repository.
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
