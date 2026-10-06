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

### ads.txt — done, verified

`public/ads.txt` is committed and is served from the domain root. It contains
exactly:

```
google.com, pub-5358754327162242, DIRECT, f08c47fec0942fa0
```

58 bytes, no byte order mark. Confirmed live:

```bash
curl -s https://furtu.xyz/ads.txt
```

`tests/ads.test.ts` asserts the exact line and the absence of a BOM, because a
BOM makes the first record unreadable to AdSense and fails without saying why.

### Turn on Google's certified consent message

**This is the step that is not done yet**, and it is worth doing: Google
requires a Google-certified CMP integrated with the IAB TCF before it will serve
*personalised* ads to visitors in the EEA, UK or Switzerland. Without one those
visitors get non-personalised ads instead. It is a revenue loss, not a takedown.

In the AdSense dashboard:

1. **Privacy & messaging**.
2. **European regulations** message type card → **Create** (or **Manage**).
3. Select `furtu.xyz`, add the privacy policy URL (`https://furtu.xyz/privacy`).
4. In *User choices*, pick the **3-option** message — consent, do not consent,
   manage options. Do **not** use the 2-option layout: it buries refusal behind
   "manage options", and GDPR requires rejecting to be as easy as accepting.
5. Set the default language, add the logo if you want one, then **Publish**.

It applies to every site in the AdSense account, so future sites are covered by
creating them against the same account and adding them to the message.

> **You cannot fully test this from outside the EEA/UK/Switzerland.** The
> message only renders for those visitors. Load `https://furtu.xyz` through a VPN
> or EU proxy after publishing to confirm it appears.

### Two things about the implementation that look wrong but are not

1. **The AdSense loader is in `<head>`,** which is Google's own snippet. An
   earlier version deliberately withheld it until a locally-built consent banner
   was accepted, on the reasoning that fetching the script is itself the request
   to the ad network. That reasoning was sound for a hand-rolled gate and it
   stopped being true the moment Google required a certified CMP: the certified
   architecture expects the standard snippet with the CMP gating the request
   behind it, and a local banner emits no TCF string, so keeping one would have
   meant two banners *and* traffic still downgraded anyway.
2. **The CSP names the Funding Choices origins.** `vercel.json` has to allow
   `fundingchoicesmessages.google.com` in `script-src`, `connect-src` and
   `frame-src`. Leave them out and the consent message fails to render —
   silently, with no console error, because the request is simply never made.
   `tests/ads.test.ts` asserts every origin in `src/lib/ads.ts` appears in the
   CSP so this cannot rot.

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