import { Suspense, type ReactNode } from 'react';

import { CommandPalette } from './CommandPalette';
import { SiteFooter, SiteHeader } from './SiteChrome';
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
 * The page chrome, used by the prerenderer.
 *
 * NOT shared with the client app. `src/App.tsx` renders its own copy of this
 * chrome for the browser, because it needs the router and the search state that
 * only exist client-side. The two are kept structurally identical so that the
 * markup a crawler receives is what React expects to find and hydration is safe.
 *
 * This is a genuine trap and it has already bitten once: a consent banner added
 * here type-checked, prerendered correctly and reached no visitor at all, because
 * the client half of the app never saw it. If you change the chrome, change
 * `App.tsx` too, or delete this file and have `App.tsx` use it.
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
    </div>
  );
}
