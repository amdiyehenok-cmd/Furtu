/**
 * AdSense configuration.
 *
 * Kept in one place, like every other fact about the site, so that turning
 * advertising off is a single edit rather than a search. `CLIENT` empty
 * disables the whole feature: the script tag is omitted, the slots render
 * nothing, and the page layout is byte-identical to the ad-free build.
 *
 * The trade-off this file exists to record
 * -----------------------------------------
 * Furtu's product claim is that nothing leaves the visitor's device. Running an
 * ad network is the one thing that most directly contradicts that claim: it is
 * a cross-site tracker delivered by a third party. The choice to do it is a
 * business decision, and it is made here rather than being discovered later as
 * a bug.
 *
 * What is preserved anyway:
 *
 *  - **No file ever touches an ad network.** Ads are markup that exists while
 *    a page renders. The tool workspace, the engines and the file pipeline do
 *    not read or write to it, so "your document never leaves this tab" remains
 *    literally true even though the page is monetised.
 *  - **No ad is ever placed inside a tool.** A visitor who has a PDF open and a
 *    file half-processed is not shown an advert. That is the line where
 *    monetisation would cost the product more than it earns.
 *  - **Every placement is below the fold** and collapses to nothing before it
 *    fills, so an unfilled slot costs no layout.
 *
 * Consent is collected by Google's certified CMP rather than by code in this
 * repository. Google requires a certified, TCF-integrated CMP for personalised
 * ads in the EEA, UK and Switzerland, and only a certified CMP keeps traffic
 * eligible for personalised ads rather than the non-personalised fallback. See
 * AD_ORIGINS for what that costs the CSP, and docs/DEPLOYMENT.md for the two
 * dashboard steps that turn it on.
 *
 * The full disclosure lives in src/pages/PrivacyPage.tsx, and the audit in
 * scripts/audit-seo.mjs is taught to allow these origins specifically rather
 * than to stop checking for them.
 */

declare global {
  interface Window {
    /** Created by the AdSense loader, once consent has been given. */
    adsbygoogle?: unknown[];
  }
}

/** Publisher ID. Empty string disables advertising entirely. */
export const CLIENT = 'ca-pub-5358754327162242';

/**
 * Third-party origins AdSense and Google's certified consent message require.
 *
 * Listed explicitly for two reasons. The CSP in vercel.json has to name them,
 * and a script tag is not a sufficient record of what the page is allowed to
 * talk to. The SEO audit also allowlists exactly these, so a new third party
 * cannot appear without the build noticing.
 *
 * The `fundingchoicesmessages.google.com` entries are the important ones and are
 * easy to miss. They serve the Google-certified CMP that the EEA, UK and
 * Switzerland require. Leave them out of the CSP and the consent message fails
 * to render — silently, with no console error and no failed request visible in
 * the page, because the request is simply never made. The symptom is that
 * traffic quietly loses eligibility for personalised ads.
 */
export const AD_ORIGINS = {
  script: [
    'https://pagead2.googlesyndication.com',
    'https://fundingchoicesmessages.google.com',
    'https://ssl.google.com',
  ],
  frame: [
    'https://googleads.g.doubleclick.net',
    'https://tpc.googlesyndication.com',
    'https://www.google.com',
    'https://fundingchoicesmessages.google.com',
    'https://*.fundingchoicesmessages.google.com',
  ],
  image: [
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://*.googleadservices.com',
  ],
  connect: [
    'https://*.googlesyndication.com',
    'https://*.doubleclick.net',
    'https://fundingchoicesmessages.google.com',
    'https://*.fundingchoicesmessages.google.com',
  ],
} as const;

/**
 * Slot sizes by placement.
 *
 * `responsive` is the default everywhere: it is the only format that works
 * across a 360px phone and a 1440px desktop without either overflowing or
 * leaving a hole. Fixed units are here for a future desktop-only placement.
 */
export type AdFormat = 'responsive' | 'rectangle' | 'leaderboard';

export interface AdPlacement {
  /** Machine name, used in the audit and when debugging a slot by hand. */
  readonly id: string;
  readonly format: AdFormat;
}

export const ADS = {
  home: { id: 'home-footer', format: 'responsive' } satisfies AdPlacement,
  tool: { id: 'tool-footer', format: 'responsive' } satisfies AdPlacement,
  category: { id: 'category-footer', format: 'responsive' } satisfies AdPlacement,
} as const;

export function adsEnabled(): boolean {
  return CLIENT.length > 0;
}