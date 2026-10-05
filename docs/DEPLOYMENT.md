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

- [ ] `LICENSE` replaced with a real choice (see the placeholder)
- [ ] Host serves real files, directory indexes, and a true 404 — verified with
      `FURTU_BASE=<url> node scripts/browser-audit.mjs`
- [ ] `https` enforced, `www`/apex redirect decided
- [ ] Fonts load from Google Fonts, or self-hosted if a privacy commitment is
      being made about third-party requests (see below)
- [ ] `sitemap.xml` and `robots.txt` reachable at the domain root
- [ ] `404.html` returns status 404
- [ ] Cache headers set as above

## A note on the web fonts

The design loads Inter, IBM Plex Mono and Source Serif 4 from Google Fonts.
That is a request to a third party, and it is the **only** one the site makes —
no file, filename or size ever leaves the device, but the font request still
reveals an IP address and referrer to Google.

That is a normal, disclosed trade-off, and the privacy page says files are never
uploaded rather than making a broader claim. If that is not acceptable for the
deployment, self-host the three families and drop the `<link>` to
`fonts.googleapis.com`; no other change is needed.