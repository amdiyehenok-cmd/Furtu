# Deployment

`dist/` is a fully static site. There is no server component, no API, no
database and no build step on the host. Upload the folder and it works.

**Nothing has been deployed.** No URL is live and no hosting account was touched.

---

## The one thing that will break it

Furtu is a prerendered site: every route is a real HTML file at a path like
`dist/tools/pdf/merge-pdf/index.html`. A host configured as a single-page app —
one that serves `index.html` for any path it does not recognise as a file — will
answer `/tools/pdf/merge-pdf` with the **homepage**.

The page still looks alive, because the client-side router renders the correct
tool from the URL. The damage is invisible and serious:

- Every canonical URL serves the wrong HTML, so search engines see one page at
  84 addresses.
- Structured data, titles and FAQ blocks are all wrong.
- It logs a hydration mismatch on every page, which React resolves by throwing
  away the server markup.

This is not hypothetical. `vite preview` does exactly this, which is why the
project has its own server (`scripts/serve-dist.mjs`) for testing.

## Required rules

1. Serve the real file when one exists.
2. Serve `<path>/index.html` for a directory.
3. Return `404.html` with a **404 status** for anything else.

Rule 3 matters as much as the first two. Returning `404.html` with a 200 status
tells search engines the page exists, and every typo in a URL becomes a
duplicate.

## Host configuration

**Netlify / Cloudflare Pages** — no configuration needed. Both apply the three
rules above by default.

**Vercel** — add `vercel.json` at the repository root:

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "rewrites": [{ "source": "/(.*)", "destination": "/404.html" }]
}
```

The rewrite is a catch-all for genuinely missing paths only; real files are
matched before rewrites are applied.

**Nginx** — canonical slashes, real files, then the 404 page:

```nginx
server {
  listen 80;
  server_name furtu.example;

  root /var/www/furtu/dist;
  index index.html;

  error_page 404 /404.html;

  location /assets/ {
    # Filenames are content-hashed, so they can be cached indefinitely.
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location / {
    try_files $uri $uri/index.html =404;
    add_header Cache-Control "no-cache";
  }
}
```

**Apache** — with `mod_rewrite`:

```apache
DirectoryIndex index.html
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule ^ /404.html [L]
</IfModule>
```

## Caching

| Path | Header | Why |
| --- | --- | --- |
| `/assets/*` | `public, max-age=31536000, immutable` | Filenames contain a content hash, so a file at a given name never changes. |
| everything else | `no-cache` | HTML must be revalidated or a deploy will not be seen. |

`Cache-Control: no-cache` does not mean "do not cache" — it means "revalidate
before using", which is exactly what is wanted for HTML.

## Before going live

Run the checks this project already has. They need a server, not just a build:

```bash
npm run verify                     # typecheck, tests, build, SEO audit
node scripts/serve-dist.mjs &      # the correct static server
node scripts/browser-audit.mjs     # every page hydrates, no console errors
node scripts/test-all-tools.mjs    # all 63 tools produce a real result
```

The last two run against `http://localhost:4173` by default. Set `FURTU_BASE` to
point them at a staging deployment instead:

```bash
FURTU_BASE=https://staging.example node scripts/browser-audit.mjs
```

## Checklist

- [ ] Host serves real files, directory indexes, and a true 404 — verified with
      `FURTU_BASE=<url> node scripts/browser-audit.mjs`
- [ ] `https` enforced, `www`/apex redirect decided
- [ ] `sitemap.xml` and `robots.txt` reachable at the domain root
- [ ] `404.html` returns status 404
- [ ] Cache headers set as above
- [ ] `/favicon.svg`, `/apple-touch-icon.png`, `/og-image.png` and
      `/site.webmanifest` all return 200 (the audit now catches a missing icon
      as a broken internal link)
- [ ] `node scripts/browser-audit.mjs <your-url>` reports no console errors and
      every page hydrating

## The web fonts are self-hosted

They used to come from Google Fonts, which meant every page view handed the
visitor's IP address to Google. That is a real GDPR exposure in the EU, and the
privacy page had to disclose it — an asterisk on the one claim the product is
built around.

All three families are SIL Open Font License 1.1, which permits redistribution
and embedding in web software. `scripts/fetch-fonts.mjs` downloads them and
generates `src/fonts.css`; the files land in `public/fonts/`. Run it only when
the weights change:

```bash
npm run assets:fonts
```

**Two traps worth knowing about, both of which happened here:**

1. **The prerenderer has its own HTML shell.** `index.html` at the repo root
   only feeds the dev server. All 84 built pages come from the template in
   `scripts/prerender.mjs`, which carried its own pair of Google Fonts
   preconnects. Removing them from `index.html` changed the dev server and left
   every built page still calling Google. If you add a `<link>` to `index.html`
   expecting it to appear in the build, check the prerenderer too.

2. **Google silently ignores parameters it does not recognise.** A malformed
   stylesheet request returns a *valid, shorter* stylesheet rather than an
   error, so the fetch script printed "fetched 6 files" and reported success
   while quietly dropping two of three families — and the site would have
   shipped with two typefaces silently falling back to the system stack. No test
   failed. The script now asserts every expected family came back and throws.

The SEO audit now also fails the build if any page references an origin that is
not on its allowlist, so neither can regress silently.

## Advertising

The site is monetised with Google AdSense, publisher ID `ca-pub-5358754327162242`.

**`public/ads.txt` must be served at the domain root.** It is
`google.com, pub-5358754327162242, DIRECT, f08c47fec0942fa0` and the audit warns
if it is missing, because AdSense will not serve without it.

Two things about the implementation are deliberate and should not be "corrected":

1. **The AdSense script is not in `<head>`,** despite Google's snippet saying it
   should be. Fetching that script *is* the request to the ad network, so
   putting it in the prerendered HTML contacts every visitor before being asked —
   including anyone who lands on a deep link and never sees the banner. It is
   injected on consent instead. Verification with Google uses the inert
   `<meta name="google-adsense-account">` tag, which contacts nothing.
2. **The CSP in `vercel.json` names the AdSense origins.** If you tighten it, ads
   will silently fail to render rather than error.

To switch advertising off, set `CLIENT = ''` in `src/lib/ads.ts`. Nothing is
injected, the slots render nothing, and the layout matches the ad-free build.

## Vercel

`vercel.json` is included and correct. Import the repo in the Vercel dashboard
and it will build on every push.

**Do not add a catch-all rewrite.** An earlier version had:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/404.html" }]
```

Vercel applies rewrites *after* the filesystem check, so the 84 real pages
resolved fine and every unknown URL was served the 404 page **with a 200
status**. That is a soft 404: search engines index it as a real page, and it
makes the site look far larger and considerably worse than it is. With no
rewrites, Vercel serves the prerendered files and returns a genuine 404.

Build settings: framework preset **Vite**, build command `npm run build`,
output directory `dist`. Node 20.19 or newer.

After the first deploy, check one deep link end to end —
`https://furtu.xyz/tools/pdf/merge-pdf` must return the tool page, not the
homepage and not a 404. That single URL catches the most common misconfiguration
for a prerendered site.