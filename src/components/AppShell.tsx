import { Suspense, type ReactNode } from 'react';

import { CommandPalette } from './CommandPalette';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { ConsentBanner } from './ConsentBanner';
import { ConsentProvider } from '@/lib/ads-consent';
import type { Route } from '@/lib/router';

function RouteFallback() {
  return (
    <div className="notfound" aria-busy="true">
      <div>
        <span className="spinner" style={{ display: 'inline-block' }} />
        <p>Loading…</p>
      </div>
    </div>
  );
}

/**
 * The page chrome, shared by the client app and the prerenderer.
 *
 * Rendering the same shell in both places is what makes hydration safe: the
 * markup the crawler and the browser receive first is byte-for-byte the markup
 * React expects to find, so there is no re-render flash on load.
 */
export function AppShell({
  route,
  children,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
}: {
  route: Route;
  children: ReactNode;
  searchOpen?: boolean;
  onOpenSearch?: () => void;
  onCloseSearch?: () => void;
}) {
  return (
    <ConsentProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader onOpenSearch={onOpenSearch ?? (() => {})} />

        <main id="main" tabIndex={-1}>
          <Suspense fallback={<RouteFallback />}>{children}</Suspense>
        </main>

      <SiteFooter />
        {searchOpen !== undefined && onCloseSearch && (
        <CommandPalette open={searchOpen} onClose={onCloseSearch} />
        )}
        <ConsentBanner />
      </div>
    </ConsentProvider>
  );
}
