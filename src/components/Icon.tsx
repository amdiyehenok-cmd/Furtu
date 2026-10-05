import type { IconName } from '@/lib/tools/types';

export type { IconName };

/**
 * The icon set is stroke-based, 24×24, 1.8px, round caps — inherited from the
 * FURTU design. The first block is the original artwork, untouched. The second
 * block adds the marks the tool catalogue needed.
 */
const PATHS: Record<IconName, React.ReactNode> = {
  // --- original ---
  arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
  braces: <><path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2" /><path d="M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  code: <><path d="m8 9-4 3 4 3" /><path d="m16 9 4 3-4 3" /><path d="m14 5-4 14" /></>,
  command: <><path d="M9 6V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z" /></>,
  compress: <><path d="m8 3 1.5 1.5L7 7" /><path d="M9.5 4.5 5 9" /><path d="m16 21-1.5-1.5L17 17" /><path d="m14.5 19.5 4.5-4.5" /><path d="m21 8-1.5 1.5L17 7" /><path d="M19.5 9.5 15 5" /><path d="m3 16 1.5-1.5L7 17" /><path d="M4.5 14.5 9 19" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  layers: <><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  spark: <><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2z" /><path d="m5 15-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
  workflow: <><rect x="3" y="3" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /><path d="M6.5 9v3.5h11V15" /></>,
  x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,

  // --- added for the tool catalogue ---
  crop: <><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" /></>,
  flip: <><path d="M12 3v18" /><path d="M8 7 4 12l4 5" /><path d="m16 7 4 5-4 5" /></>,
  hash: <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 8.3-8.3 2 2-1.5 1.5 1.5 1.5-2 2-1.5-1.5-1.5 1.5" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.6-.5-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Z" /><circle cx="7.5" cy="11.5" r="1.2" /><circle cx="11" cy="7.5" r="1.2" /><circle cx="15.5" cy="8.5" r="1.2" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 17v4M17 20h4" /></>,
  rotate: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 8.4 8 9 4.8-.6 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  split: <><path d="M12 3v18" /><path d="M7 8 3 12l4 4" /><path d="m17 8 4 4-4 4" /></>,
  text: <><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h7" /></>,
  type: <><path d="M5 5h14" /><path d="M12 5v14" /><path d="M9 19h6" /></>,
  watermark: <><path d="M4 5h16v14H4z" /><path d="M7 9.5 17 15" /><path d="M7 15 17 9.5" /></>,
  zip: <><path d="M4 6h5l2 2h9v11H4z" /><path d="M11 3v4M13 3v2M11 12h2M11 15h2" /></>,
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The header wordmark glyph.
 *
 * This was three stacked bars in a rounded outline — a generic abstract mark.
 * It is now the product's own F, inlined rather than loaded from
 * `/favicon.svg` so it costs no request and inherits `currentColor` for the
 * dark theme. Same geometry as the favicon: one path for the whole letterform,
 * so the arms and the stem never show a seam where they meet.
 */
export function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <path d="M17 14h30v10H28v7h16v9H28v10H17V14Z" />
      </svg>
    </span>
  );
}
