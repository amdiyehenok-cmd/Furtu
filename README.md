# FURTU

**Fast, private, simple, powerful.** A local-first digital utility platform: 63
tools for PDFs, images, documents, developer work and everyday tasks that run
entirely in the browser.

Nothing you open is uploaded. There is no account, no backend, and no telemetry.

```bash
npm install
npm run dev        # development
npm run verify     # typecheck + tests + build + SEO audit
```

---

## What it is

- **63 working tools** across five categories, every one backed by a real
  operation — no placeholders, no thin pages.
- **Local-first, and provably so.** No `fetch`, no `XMLHttpRequest` in any
  engine. The "processed locally" badge on every page is derived from a field in
  code, not written as a sentence.
- **84 prerendered pages.** Title, description, canonical, breadcrumb, FAQ and
  structured data are in the HTML a crawler receives.
- **130 KB brotli first load**, with 1.17 MB of PDF, image, ZIP, YAML and QR
  codecs behind dynamic imports that only load if you open a matching tool.
- **No third-party origin until you say so.** Fonts are self-hosted, there is no
  analytics, no tag manager and no CDN. Advertising is the single exception, and
  nothing is requested from it until a visitor accepts the consent banner — the
  default is declined. The SEO audit fails the build if a page references an
  origin that is not on the allowlist, so the claim cannot quietly rot.

## Licence

Proprietary — all rights reserved. See [`LICENSE`](LICENSE). The repository is
public so the behaviour can be audited, not so it can be forked; no permission
to use, copy, modify or redistribute it is granted.

Third-party components keep their own licences; see
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Client build, SSR build, then prerender every route |
| `npm run verify` | Typecheck, tests, build, SEO audit — run this before shipping |
| `npm run test` | 69 unit and engine tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run audit:seo` | Titles, descriptions, canonicals, JSON-LD, sitemap, orphans |
| `node scripts/report-bundle.mjs` | What a first visit actually costs |
| `node scripts/analyse-entry.mjs` | Per-module weight of the entry chunk |

## Documentation

- **`docs/ENGINEERING-REPORT.md`** — the full report: licence decisions,
  dependencies, every tool, SEO, structured data, performance measurements,
  security, accessibility, testing, defects found, risks, next steps.
- **`docs/ARCHITECTURE.md`** — how it is built and why, including the
  deliberate non-choices.
- **`docs/ADDING-A-TOOL.md`** — how to add one. A tool is data plus one
  function; this is the whole procedure.
- **`THIRD-PARTY-NOTICES.md`** — every dependency, its licence, and the two
  open-source projects that were examined and deliberately **not** used.
- **`LICENSE`** — currently an explicit placeholder. The licence has not been
  chosen yet and this file says so rather than guessing.

## Requirements

Node 20.19 or newer. Tested on Node 24.14.

## Deployment

`dist/` is a static, self-contained site. Serve it from any static host or CDN.
There is no server component and nothing to configure.

**No deployment has been performed.** Nothing has been published to a public URL
and no domain or hosting was touched.

## A note on honesty

Every file-processing tool states its real limitations on its own page. Furtu
does not do OCR, does not encrypt PDFs, and compresses PDFs structurally rather
than by rasterising them so that text stays selectable. Where a tool cannot do
something useful, the page says so.

That is a deliberate constraint on the product, not a disclaimer. A tool that
cannot fail you should not have been built.
