import { useEffect, useRef } from 'react';

import { ADS, CLIENT, adsEnabled, type AdPlacement } from '@/lib/ads';

/**
 * An AdSense slot.
 *
 * Three properties this is built around:
 *
 * 1. **Space is reserved before the ad arrives.** The container has a
 *    min-height set in CSS, so when the creative inserts itself it lands in
 *    space that already existed. Without this, every page with an ad takes a
 *    measurable layout shift as content jumps down, which is a Core Web Vitals
 *    regression and the single most likely way that adding ads would hurt this
 *    site's SEO.
 *
 * 2. **It collapses to nothing when there is no ad.** AdSense returns nothing
 *    for a slot with no campaign, low traffic, or a blocked network. The
 *    container removes itself from the flow so the layout is identical to the
 *    ad-free build rather than a reserved hole with nothing in it.
 *
 * 3. **`push()` is called once, guarded, and only after consent.** The global
 *    `adsbygoogle` object is created by the async head script and may not exist
 *    yet when this mounts, so a blind call throws. The guard also makes a
 *    double-render safe.
 */

interface AdSlotProps {
  placement: AdPlacement;
  /** Set false before consent has been given, to withhold the ad. */
  allowed: boolean;
}

export function AdSlot({ placement, allowed }: AdSlotProps) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adsEnabled() || !allowed) return;

    let cancelled = false;

    // The head script is `async`, so it can land after this component mounts.
    // Wait for the object rather than assuming it is already there.
    const push = () => {
      if (cancelled || !window.adsbygoogle) return false;
      try {
        window.adsbygoogle.push({});
        return true;
      } catch {
        // A push failure is not worth breaking the page over. The slot simply
        // stays empty, which is the same state as an unfilled campaign.
        return false;
      }
    };

    if (push()) return;

    const timer = window.setInterval(() => {
      if (push()) window.clearInterval(timer);
    }, 200);
    const giveUp = window.setTimeout(() => window.clearInterval(timer), 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
    };
  }, [allowed, placement.id]);

  if (!adsEnabled()) return null;

  return (
    <aside className="ad-slot" aria-label="Advertisement" ref={holder}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT}
        data-ad-format={placement.format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}

export { ADS };