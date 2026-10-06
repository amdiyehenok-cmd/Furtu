import { useEffect, useState } from 'react';

import { useAdsConsent } from '@/lib/ads-consent';

/**
 * The consent banner itself.
 *
 * Two rules govern it. It is only rendered after mount, because anything whose
 * first render depends on browser state must not be rendered on the server: the
 * server has no localStorage, so it would always draw the banner while a client
 * that had already answered would not, and that difference is a hydration
 * mismatch on every page. Waiting a tick also means the stored answer is read
 * before the first paint, so a returning visitor who already declined never
 * sees the banner flash.
 *
 * And it is offered as a single question, not a settings panel. See
 * src/lib/ads-consent.ts for why.
 */
export function ConsentBanner() {
  const { decided, decide } = useAdsConsent();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || decided) return null;

  return (
    <div className="consent" role="region" aria-label="Cookie consent">
      <div className="consent-text">
        <p className="consent-title">One question about cookies</p>
        <p>
          Furtu&rsquo;s tools run entirely in your browser and your files are never uploaded. This site is
          funded by ads, and Google&rsquo;s ad network sets cookies to serve them. Nothing is set
          unless you agree &mdash; see the <a href="/privacy">privacy page</a>.
        </p>
      </div>
      <div className="consent-actions">
        <button type="button" className="button" onClick={() => decide('denied')}>
          No thanks
        </button>
        <button type="button" className="button primary" onClick={() => decide('granted')}>
          Allow ads
        </button>
      </div>
    </div>
  );
}
