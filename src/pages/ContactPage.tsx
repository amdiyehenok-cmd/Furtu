import { PageShell } from '@/components/PageShell';
import { SITE } from '@/lib/site';

export default function ContactPage() {
  return (
    <PageShell
      kicker="CONTACT"
      title="Contact"
      intro="Bug reports, tool requests and disagreements about a privacy claim all go to the same inbox, and all get read."
    >
      <section>
        <h2>Email</h2>
        <ul>
          <li>
            <strong>General, tool requests, bugs</strong> —{' '}
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          </li>
          <li>
            <strong>Privacy questions and corrections</strong> —{' '}
            <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>
          </li>
          <li>
            <strong>Security reports</strong> —{' '}
            <a href={`mailto:${SITE.securityEmail}`}>{SITE.securityEmail}</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>What helps us fix a bug faster</h2>
        <ol>
          <li>Which tool you were using, and the link to it.</li>
          <li>Your browser and operating system — the About row in your browser menu is enough.</li>
          <li>What you expected, and what happened instead.</li>
          <li>The error text, if there was one. A screenshot of the whole workspace is ideal.</li>
          <li>
            A file that triggers it, if you can share one safely. Please do not attach anything sensitive
            when a description will do.
          </li>
        </ol>
      </section>

      <section>
        <h2>Requesting a tool</h2>
        <p>
          Requests are more useful with an example. “A tool that does X to Y files” is far more actionable
          than a tool name, and telling us where you currently do the job is even better — it usually reveals
          whether the real need is a conversion, a limit, or something the format does not support.
        </p>
        <p>
          If a request cannot be done properly in a browser, we will say so rather than shipping a version
          that quietly loses quality. The <a href="/changelog">changelog</a> keeps a running list of what is
          planned and what is not going to happen.
        </p>
      </section>

      <section>
        <h2>Response time</h2>
        <p>
          Furtu is a small project, so expect replies rather than a ticket queue. Security reports are
          prioritised. There is no support plan with an SLA, because there is no paid tier to attach one to.
        </p>
      </section>
    </PageShell>
  );
}
