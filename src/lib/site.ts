/** Single source of truth for site-wide facts used in metadata and copy. */

/**
 * The bare host of the canonical origin, used to build the contact addresses.
 *
 * Declared before `SITE` because the object literal below reads it. A malformed
 * or non-http origin falls back to the shipped host rather than producing an
 * address like `hello@` that would silently break every mailto on the site.
 */
function mailHost(): string {
  const configured = (import.meta.env?.VITE_SITE_ORIGIN as string | undefined)?.replace(/\/$/, '');
  const origin = configured || 'https://furtu.xyz';
  try {
    return new URL(origin).hostname || 'furtu.xyz';
  } catch {
    return 'furtu.xyz';
  }
}

export const SITE = {
  name: 'Furtu',
  legalName: 'Furtu',
  tagline: 'Fast. Private. Simple. Powerful.',
  description:
    'A premium, enterprise-grade platform offering fast, private and powerful digital tools for file conversion, editing, workflow automation and team collaboration.',
  /**
   * Canonical origin. Overridable at build time so staging and production can
   * emit correct canonical URLs and sitemaps without a code change.
   */
  origin: (import.meta.env?.VITE_SITE_ORIGIN as string | undefined)?.replace(/\/$/, '') || 'https://furtu.xyz',
  locale: 'en',
  themeColor: '#1E3A8A',
  /**
   * Contact addresses are derived from the origin rather than written out.
   *
   * They used to be hardcoded, which made a domain change a four-line edit and
   * guaranteed nothing else in the codebase moved with them — the sitemap,
   * canonicals and JSON-LD all follow `origin`, so a hardcoded address left
   * would quietly point at a domain the site no longer serves. Deriving them
   * means `VITE_SITE_ORIGIN` is the only thing that has to change.
   */
  contactEmail: `hello@${mailHost()}`,
  privacyEmail: `privacy@${mailHost()}`,
  securityEmail: `security@${mailHost()}`,
  /** Languages the architecture is prepared for. Only English ships today. */
  plannedLocales: ['en', 'am', 'om', 'ar', 'fr', 'es', 'pt', 'de'],
} as const;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE.origin}${path.startsWith('/') ? path : `/${path}`}`;
}
