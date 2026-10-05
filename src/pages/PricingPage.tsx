import { PageShell, Callout } from '@/components/PageShell';

const FREE = [
  'Every tool in the catalogue, with no usage cap',
  'No account, no sign-up, no email address',
  'Batch processing up to each tool’s stated limit',
  'No watermark, no queued behind anyone else',
  'New tools at no additional cost',
];

const PLANNED = [
  ['Free', 'Everything above, and it stays free for personal and commercial use.'],
  ['Pro', 'Higher batch limits and larger single files, for people who hit the free ceiling.'],
  ['Business', 'Saved workflows, shared presets and team-wide tool access.'],
  ['Enterprise', 'Custom limits, audit logs, API access and self-hosting support.'],
];

export default function PricingPage() {
  return (
    <PageShell
      kicker="PRICING"
      title="Pricing"
      intro="Everything on Furtu is free today, and there is no way to pay because there is no account system. This page explains what is true now and what is only planned."
    >
      <section>
        <h2>Today: free</h2>
        <ul>
          {FREE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          There is deliberately no free tier with a deliberately annoying limit. Processing happens on your
          own machine, so the only real ceiling is what your device can do — which is why the actual limits
          are stated per tool, and why they are generous.
        </p>
      </section>

      <Callout title="Why there is no upload-based pricing">
        A tool that uploads your file to our servers costs money per file processed, which is why most
        conversion sites cap free use and push hard towards an account. Furtu does not have that cost, so it
        does not need to charge for it, and does not need an account to meter usage.
      </Callout>

      <section>
        <h2>Planned, not shipped</h2>
        <p>
          The architecture supports paid tiers without a rewrite, because limits and entitlements are already
          read from tool metadata rather than hardcoded. That groundwork is in place; the billing is not.
        </p>
        <p>These are intentions, not products. Nothing below is available today.</p>
        <ul>
          {PLANNED.map(([name, detail]) => (
            <li key={name}>
              <strong>{name}</strong> — {detail}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>What will never be paywalled</h2>
        <p>
          Local processing stays free. If a tool works entirely in your browser there is no marginal cost to
          charge for, so there will be no premium version of it holding back the useful parts.
        </p>
        <p>
          A paid tier, if one exists, will buy capacity — larger files, more batch items, saved workflows —
          rather than the ability to do the basic job at all.
        </p>
      </section>

      <section>
        <h2>For organisations</h2>
        <p>
          Because the tools are static files with no backend, many of the usual procurement questions do not
          apply: there is no file store to assess, no document retention policy to review, and no subprocessors
          to agree to. What does apply is hosting and network configuration, which is covered in the{' '}
          <a href="/security">security page</a>.
        </p>
      </section>
    </PageShell>
  );
}
