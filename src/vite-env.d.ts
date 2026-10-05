/// <reference types="vite/client" />

/**
 * Vite's `?url` import suffix. pdf.js is loaded with a worker whose path is
 * hashed at build time and served as a static asset from the site's own origin,
 * rather than fetched from a CDN — which keeps the app self-hosted and lets a
 * strict content security policy apply.
 */
declare module '*?url' {
  const url: string;
  export default url;
}
