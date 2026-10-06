import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CLIENT, adsEnabled } from '@/lib/ads';

/**
 * Advertising consent state.
 *
 * Deliberately JSX-free. The provider below returns `children` through
 * `createElement` rather than JSX so this module compiles to no JSX-runtime
 * import at all, which matters for more than tidiness:
 *
 * This file is read by both `AppShell` (which lives in the entry chunk) and by
 * `AdSlot` (which lives in the lazily loaded home and tool pages). Any module
 * read from both is hoisted by the bundler into a shared chunk — and a shared
 * chunk whose compiled code needs the JSX runtime takes that runtime from the
 * entry chunk. That produces a cycle, entry -> shared -> entry. The bundler
 * resolved it by dropping the entry's import of the shared chunk entirely, so
 * the provider and the banner were silently tree-shaken out of the client
 * build: the banner never appeared and no error was raised. A module with no
 * JSX in it has no reason to reach back into the entry chunk, so the cycle
 * cannot form.
 *
 * The rest of this file is the substance of the gate.
 *
 * Required before AdSense sets anything, and required by law in the EU and UK
 * for a visitor who has not already expressed a preference. The default is
 * **declined**: consent is only recorded once someone actively accepts, because
 * inferring consent from "the banner was dismissed" or from having no banner at
 * all is the exact pattern that produces an enforcement action.
 *
 * Deliberately one choice, not a wall of toggles. Google requires a consent
 * signal for personalised ads, and a single accept/reject that is honoured is
 * both easier to reason about and easier to honour than a granular panel whose
 * toggles quietly do nothing.
 *
 * The answer is stored in localStorage rather than a cookie, so it costs no
 * network request and no third party ever learns the answer.
 */

export const STORAGE_KEY = 'furtu.ads-consent';

export type Consent = 'granted' | 'denied' | null;

export interface ConsentValue {
  /** True once the visitor has answered, either way. */
  decided: boolean;
  /** True only when the visitor actively accepted. */
  granted: boolean;
  decide: (choice: 'granted' | 'denied') => void;
}

export const ConsentContext = createContext<ConsentValue>({
  decided: false,
  granted: false,
  decide: () => {},
});

/**
 * Load the AdSense library, once, after consent.
 *
 * Deliberately not a `<script>` in the document head. Fetching that script *is*
 * the request to the ad network, so putting it in the prerendered HTML means
 * every visitor is contacted before being asked — including anyone who arrives
 * on a deep link, never sees the banner, and has expressed no preference at
 * all. A consent gate that loads the tracker before it asks is not a gate.
 */
export function loadAdSense(): Promise<void> {
  return new Promise((resolve) => {
    if (!adsEnabled() || window.adsbygoogle) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
    script.addEventListener('load', () => resolve());
    // A blocked or offline network must not leave the promise pending forever —
    // the slots simply stay empty, which is the same as an unfilled campaign.
    script.addEventListener('error', () => resolve());
    document.head.appendChild(script);
  });
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'granted' || stored === 'denied') setConsent(stored);
    } catch {
      // Private browsing can make localStorage throw on access. Treated as
      // undecided, which withholds the ad — the safe direction.
    }
  }, []);

  // Only reached when consent has actually been given.
  useEffect(() => {
    if (consent !== 'granted') return;
    void loadAdSense();
  }, [consent]);

  const decide = useCallback((choice: 'granted' | 'denied') => {
    setConsent(choice);
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // The answer is still held in memory for this page view.
    }
  }, []);

  const value = useMemo<ConsentValue>(
    () => ({ decided: consent !== null, granted: consent === 'granted', decide }),
    [consent, decide],
  );

  return createElement(ConsentContext.Provider, { value }, children);
}

export function useAdsConsent(): ConsentValue {
  return useContext(ConsentContext);
}
