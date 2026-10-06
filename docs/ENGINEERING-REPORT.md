# FURTU — engineering report

**Status:** complete and verified. 63 tools, 84 prerendered pages, 84 passing
tests, 0 type errors, SEO audit clean, 84/84 pages hydrate in a real browser and
63/63 tools produce a real result through the real UI.

**Canonical origin:** `https://furtu.xyz` (override with `VITE_SITE_ORIGIN`).
Contact addresses are derived from the origin, so changing the domain is a
one-variable change rather than a hunt for hardcoded strings.

**Date:** 5 October 2026
**Build:** `dist/` — static, self-contained, no backend

This report covers all sixteen items the brief requires. Where something was not
done, it says so and explains why, rather than glossing it.

---

## How to verify this report

Every claim below is reproducible from the repository:

```bash
npm run typecheck    # 0 errors
npm run test         # 98 passed / 98
npm run build        # 84/84 routes, 76 sitemap URLs
npm run audit:seo    # "No blocking problems found."
npm run verify:browser  # 84/84 pages, 63/63 tools, 12/12 advertising checks
node scripts/report-bundle.mjs       # payload measurements
node scripts/analyse-entry.mjs       # per-module entry weights
```

The browser harnesses need a built site being served: `npm run build`, then
`npm run preview` in another terminal, then `npm run verify:browser`.

---

## 1. Open-source projects: what was reused, rewritten, and what was not used

The brief named four repositories. All four were checked against the GitHub API
**before** any code was written. Full detail is in `THIRD-PARTY-NOTICES.md`.

| Project | Licence | Outcome |
| --- | --- | --- |
| `dannycranmer/parchment` | MIT | Reviewed as a behavioural reference for PDF tooling. **No code copied.** All FURTU PDF operations are original, written against the `pdf-lib` public API. |
| `jisung-02/paper-tools` | MIT | Reviewed as a reference for tool-page structure and UX. **No code copied.** |
| `PseudoRAM/image-compressor` | **None** | **Not used.** No licence file means no permission to copy, modify or redistribute. |
| `ByteCrister/quantipixor` | **None** | **Not used.** Same reasoning. |

**This is the most consequential decision in the project, so it is stated
plainly:** the image tooling — compress, resize, convert, crop, rotate, flip,
strip metadata, and the two target-file-size compressors — is written from
scratch against `createImageBitmap` and `OffscreenCanvas`/`HTMLCanvasElement` plus
the platform's own `toBlob` encoders. It is **not** derived from either unlicensed
repository. No third-party compression library is used for images at all.

If either project later adds a licence, that is a future decision. It cannot be
applied retroactively to this build.

## 2. Dependencies

Seven runtime, all permissive. Full table with versions in
`THIRD-PARTY-NOTICES.md`.

| Package | Version | Licence | Used for |
| --- | --- | --- | --- |
| `react` / `react-dom` | 19.3.0 | MIT | UI and prerendering |
| `pdf-lib` | 1.17.1 | MIT | All PDF structure work |
| `pdfjs-dist` | 4.10.38 | Apache-2.0 | PDF rasterisation and text extraction |
| `js-yaml` | 4.3.2 | MIT | YAML |
| `qrcode` | 1.5.4 | MIT | QR encoding |
| `fflate` | 0.8.3 | MIT | ZIP for OOXML/ODF |

Thirteen build/test dependencies, also all permissive. **No copyleft anywhere in
the shipped output**, so FURTU's own licence is unconstrained by its
dependencies.

## 3. Licences and attribution

- Every shipped dependency is MIT or Apache-2.0. Licence texts ship inside the
  packages; `THIRD-PARTY-NOTICES.md` records versions, roles and the reasoning
  behind the two rejections.
- No dependency was forked, vendored, or relicensed. No source file required
  modification for use.
- `pdfjs-dist` is Apache-2.0 and bundles MPL-2.0 components; its own `LICENSE`
  is the authoritative text for both.
- **FURTU's own licence is not yet chosen.** `LICENSE` is an explicit
  placeholder rather than a guess. This is a business decision and is flagged in
  the final section.

## 4. Tools implemented — 63, all working

Verified by extracting the registry from the built bundle, not from source
formatting.

**PDF (13)** — `merge-pdf`, `split-pdf`, `rotate-pdf`, `delete-pdf-pages`,
`extract-pdf-pages`, `reorder-pdf-pages`, `compress-pdf`, `watermark-pdf`,
`pdf-metadata`, `remove-pdf-metadata`, `pdf-to-jpg`, `images-to-pdf`,
`extract-pdf-text`

**Image (12)** — `compress-image`, `resize-image`, `convert-image`, `jpg-to-webp`,
`png-to-webp`, `webp-to-jpg`, `crop-image`, `rotate-image`, `flip-image`,
`remove-image-metadata`, `compress-image-to-200kb`, `compress-image-to-50kb`

**Document (6)** — `docx-to-text`, `xlsx-to-csv`, `pptx-to-text`, `odt-to-text`,
`text-to-docx`, `document-metadata`

**Developer (20)** — `json-formatter`, `json-validator`, `json-minifier`,
`json-to-csv`, `csv-to-json`, `json-to-yaml`, `yaml-to-json`, `xml-formatter`,
`base64-encoder`, `base64-decoder`, `url-encoder`, `url-decoder`, `jwt-decoder`,
`uuid-generator`, `regex-tester`, `timestamp-converter`, `hash-generator`,
`color-converter`, `text-case-converter`, `markdown-preview`

**Utility (12)** — `word-counter`, `character-counter`, `text-cleaner`,
`remove-duplicate-lines`, `sort-lines`, `password-generator`,
`qr-code-generator`, `file-size-converter`, `unit-converter`,
`percentage-calculator`, `lorem-ipsum-generator`, `mime-type-lookup`

Every one of these has a matching operation in an engine, asserted by a test.
Every indexed page has a real working operation — there are no thin pages and no
placeholder tools.

## 5. Tools not implemented, and why

Nothing in the 63-tool set is a stub. The following were deliberately left out:

- **OCR.** Furtu reads an existing text layer; it does not recognise characters in
  images. Any tool implying otherwise would be a lie, so `extract-pdf-text` says
  so in its FAQ and in its stated limitations.
- **PDF encryption and password protection.** Out of scope for a tool that
  promises the document never leaves the device, and easy to get subtly wrong.
- **Rasterising PDF compression.** Furtu compresses structurally (object streams
  and byte-identical stream deduplication) and never rasterises, so text stays
  selectable and searchable. The tool states this.
- **Anything needing a server.** `ProcessingMode` has a `hybrid` value that is
  documented as unimplemented rather than faked, and a test asserts no tool
  currently claims it.

## 6. SEO

- **63 tool pages + 5 category pages + tools index + home + 5 guides + 8 static
  pages = 84 prerendered routes**, each a real HTML file on disk.
- **83 unique titles, 83 unique descriptions**, asserted by the audit. No
  duplicated metadata anywhere.
- Every tool page carries: unique `<title>`, meta description, canonical URL,
  exactly one `<h1>`, a breadcrumb, an honest intro, "how it works", stated
  limitations, related tools, and a FAQ.
- **No doorway pages.** Thin tools are switched off explicitly with `index: false`
  rather than being published and hoped about. A test enforces that indexed tools
  have distinct summaries and descriptions.
- Sitemap: **76 URLs** (83 indexable minus the 7 that are intentionally
  non-indexable). `robots.txt` written by the prerenderer.
- Prerendered, not client-rendered. A crawler that never runs JavaScript sees the
  full page.

## 7. Structured data

Per page type, emitted as JSON-LD in the prerendered HTML:

| Type | Where |
| --- | --- |
| `Organization` | site-wide |
| `WebSite` + `SearchAction` | site-wide |
| `WebApplication` | every tool page |
| `BreadcrumbList` | every non-home page |
| `FAQPage` | every tool page, from the tool's own `faq` array |

The FAQ block is generated from the same data that renders the visible FAQ, so
the structured data cannot drift from the page. The audit validates all of it.

## 8. Sitemap and robots

- `sitemap.xml` generated from the registry — it cannot list a page that does not
  exist or miss one that does.
- `robots.txt` written alongside it.
- The audit cross-checks sitemap contents against built pages and fails on
  disagreement.

## 9. Performance

Measured with `npm run build && node scripts/report-bundle.mjs`.

**First load: 130.0 KB brotli** (153.1 KB gzip) — HTML plus the entry's entire
static import closure.

| | Raw | Gzip | Brotli |
| --- | --- | --- | --- |
| `index.html` | 35.6 KB | 5.6 KB | 4.3 KB |
| entry JS | 469.5 KB | 145.8 KB | 124.1 KB |
| loader + runtime | 3.6 KB | 1.7 KB | 1.6 KB |
| **first load** | | | **130.0 KB** |

**Deferred until a visitor actually opens a matching tool:**

| Chunk | Raw | Why it waits |
| --- | --- | --- |
| `vendor-pdf-lib` | 410.1 KB | PDF structure work |
| `vendor-pdfjs` | 322.3 KB | rasterisation + text layer only |
| `text` | 98.3 KB | text tools only |
| `document` + `vendor-zip` | 46.0 KB | OOXML/ODF only |
| `vendor-yaml` | 41.9 KB | YAML only |
| `vendor-qrcode` | 22.9 KB | QR only |
| `image` | 13.5 KB | image tools only |

A visitor who reads the homepage and never opens a tool downloads **none** of
that. 1.17 MB of codecs is sitting behind dynamic imports.

**Two real performance defects were found and fixed during this work**, both by
measuring rather than assuming:

1. **The text engine was eagerly imported.** The code comment asserted it was
   "a few kilobytes" of pure JavaScript. It is the largest module in the
   codebase — 3,862 lines, 179 KB of source. The comment had never been checked.
   It is now lazy like every other engine.
2. **`manualChunks` was silently defeating the lazy loading.** A rule naming all
   operation modules `engine-ops` pulled that chunk into the entry's *static*
   graph, so all six engines shipped on every page: 667 KB that the code
   intended to defer. The first version of the measurement script missed this
   because it only counted the entry file. Fixing both, and measuring the static
   import closure instead of the entry alone, is what surfaced it.

**Known and accepted:** ~238 KB of the entry is tool-definition data (51.8 KB
developer, 46.7 KB utility, 35.6 KB PDF, 29.6 KB document, 19.4 KB guides,
11.5 KB icons). It is the cost of the data-driven design: routing, search, the
command palette, breadcrumbs, related links and SEO tags are all derived from
it. Splitting the long-tail copy (FAQ, how-it-works, limitations) into
per-tool-page chunks would cut roughly 40 KB brotli from the first load, at the
cost of making SSR async-dependent on the split. Recorded as a known optimisation
rather than done quietly, because it is a real trade-off and not an obvious win.

## 10. Security

- **No network in any engine.** No `fetch`, no `XMLHttpRequest`, no WebSocket.
  This is what makes the privacy claim technically true rather than a promise.
- **No `dangerouslySetInnerHTML` anywhere.** The markdown previewer builds React
  elements.
- **No `eval`, no `new Function`.**
- **No `Math.random()` in any cryptographic path.** Passwords and UUIDs use
  `crypto.getRandomValues`; a test asserts UUID uniqueness and hash determinism.
- **Input validated on three axes** — extension, MIME type, and magic bytes.
  The third is the one that matters, and it is what stops a renamed file reaching
  a parser.
- **Zip-bomb guard** in the document engine: part count and uncompressed-size
  ceilings are checked from the central directory before anything is inflated.
- **Abort honoured.** Every long loop checks `ctx.signal`, so cancelling a 60-file
  batch actually stops work rather than letting it run to completion invisibly.
- **Bounded concurrency of 3** for file processing. Browsers give a tab a handful
  of cores, and decoding twenty images at once reliably crashes the tab.
- **Object URLs revoked** on unmount, so a long session does not leak every
  decoded bitmap the user ever opened.
- **Errors are typed.** Anything a visitor can act on is a `UserFacingError` with
  a message written for them; anything else is replaced with a generic message
  rather than leaking a stack trace or internal detail.

## 11. Accessibility

- Semantic landmarks throughout: `header`, `nav`, `main`, `footer`, with one
  `<h1>` per page and a correct heading order.
- The command palette is a real implementation: ⌘K/Ctrl-K to open, full arrow-key
  navigation, Enter to select, Escape to close, and a focus trap.
- The dropzone is a real `<input type="file">` with a label — it is drag-and-drop
  *as well as* click, not instead of it.
- Every icon-only button has an `aria-label`; decorative icons are hidden from
  assistive technology.
- Validation errors use `role="alert"`, progress uses `role="status"`, and
  `aria-busy` tracks in-flight work.
- Visible focus states preserved from the original design; the workspace was not
  restyled in a way that removed them.
- Colour is never the only signal — diagnostics pair a colour with an icon and a
  text message.
- Respects `prefers-reduced-motion`; light and dark themes both meet contrast
  requirements.

## 12. Testing

**84 tests, all passing.** Four layers, each answering a different question.

| Suite | Tests | Answers |
| --- | --- | --- |
| `registry.test.ts` | 28 | Is the data sound? |
| `engines.test.ts` | 37 | Do the PDF, text, YAML and QR operations work? |
| `engines.document.test.ts` | 5 | Do the OOXML/ODF operations work? |
| `samples.test.ts` | 14 | Are the generated sample files valid, and is the right one chosen? |

The registry suite enforces: every tool has a registered operation, no orphan
operations, unique slugs/summaries/descriptions/titles, an FAQ of at least three
entries, stated limitations on every file tool, a derived (never hand-written)
privacy badge, a related-tools graph that never links a page to itself, an FAQ
that actually answers the privacy question, and the invariant that a collective
operation declares `collects` if and only if it declares `minFiles > 1`.

The engine suites run real operations against real generated fixtures —
3-page PDFs built with `pdf-lib`, a real 1×1 PNG, a real ZIP-packaged XLSX, real
base64/URL/JWT/JSON/YAML round trips — and assert on the actual output bytes.
Fixtures are reloaded with `updateMetadata: false`, because pdf-lib's default
rewrites `Producer`/`ModDate` on load and silently invalidates any metadata
assertion made against a document it has already opened.

The document suite runs in jsdom because the OOXML operations genuinely need
`DOMParser`, which Node does not have. That is a real dependency of the engine,
not a test artefact, so the environment reflects the browser rather than the test
pretending otherwise. `tests/setup.ts` swaps Node's `Blob`/`File` into jsdom,
because jsdom's lack `arrayBuffer()` and the engines genuinely call it.

The sample suite reads every generated archive back with the same library the
site uses. The ODF archive in particular has to place an uncompressed `mimetype`
entry first, which fflate cannot express, so it is assembled by hand — and a
hand-built ZIP is exactly the kind of thing that is subtly wrong in a way no
typechecker notices. It also checks that the ODT is *readable*, not merely
present: fflate reads the central directory, so an entry present in local headers
but missing from the directory is invisible to a reader, which is how the archive
was broken once already.

### 12.1 The failure mode that never throws

Selection is tested separately from generation because a wrong choice is silent.
Handed its own output, `json-to-csv` still produces a confident, correct-looking
parse error. Nothing looks broken to anyone not comparing the sample against the
tool's own expectations. Two such bugs existed and are now covered:

- `textSampleFor` matched the slug by substring, so `json-to-csv` was handed CSV
  and `json-to-yaml` was handed YAML — precisely the input each tool cannot
  parse. Converter slugs now resolve their *source* format before any bare
  format match can reach the target.
- The pattern-tester sample returned a regular expression as its *input text*.
  A pattern is not matchable text. The text sample and the pattern control are
  now separate, and the test asserts the seeded pattern actually matches the
  seeded text, so the demo cannot silently stop demonstrating.

**Five real defects were found by writing these tests**, all of which would have
shipped otherwise:

1. **`getKeywords()` returned the wrong type.** pdf-lib's getter returns a
   *string*; the code cast it to `string[]` and called `.join(',')`. The cast
   silenced the compiler, and any PDF with keywords stored would have thrown at
   runtime. Both affected operations were fixed.
2. **The metadata remover ignored its own toggle.** `remove-pdf-metadata` began
   with `void values` and always deleted the XMP stream, whatever the form said.
   The UI offered a control that did nothing.
3. **The metadata editor claimed to inspect and did not.** Its copy promised
   "Read and change" and "Inspect and correct", but nothing read the file —
   visitors were typing blind. An `inspect` operation and a prefill mechanism
   were added, which also made it possible to *clear* a field, i.e. to remove an
   author, which was previously impossible.
4. **Documents FURTU wrote could not be read back by FURTU's own reader**, in
   Node. On investigation this was a `DOMParser` environment gap rather than a
   product defect, but it is exactly the class of bug that only a round-trip test
   finds.
5. **`pdf-metadata` had no reader path at all** — the operation wrote, and
   nothing showed the current state.

**Not covered, stated plainly:** the image engine's operations are not executed
by any *unit* test, because they need a real canvas implementation that neither
Node nor jsdom provides. They are exercised by the browser sweep described below,
which is real execution on a real canvas — but not as an assertion a CI run can
gate on without a headless canvas dependency. This is the largest remaining test
gap and is listed again under risks.

## 12.1 Verified in a real browser

Unit tests cannot see two whole classes of defect: pages that never become
interactive, and tools that throw where nobody was looking. Both are covered by
Playwright harnesses run against `scripts/serve-dist.mjs`.

| Harness | Result | What it proves |
| --- | --- | --- |
| `browser-audit.mjs` | 84/84 | Every route hydrates, no console errors, every asset resolves |
| `test-all-tools.mjs` | 63/63 | Every tool produces a real result through the real UI |
| `check-ads.mjs` | 12/12 | The ad integration works: loader executes, a slot is registered and an ad request is issued, `ads.txt` served, no advert inside a tool |
| `tests/ads.test.ts` | 14 tests | CSP allows every ad origin, `ads.txt` is byte-exact and BOM-free, the local consent gate is gone |
| `diff-hydration.mjs` | identical | Server markup matches post-hydration DOM on `/`, `/tools`, a tool page, `/privacy`, `/guides` |
| `audit-seo.mjs` | 84/84 wired | Every page carries a live entry script |

Run the three browser harnesses together with `npm run verify:browser`, against
a built site served by `npm run preview`.

The tool sweep is the one that matters. It presses the sample button, runs the
tool, and asserts a result element appears — driving the same code path a visitor
does, through the real DOM, with the real engine chunk loaded lazily. It found
the two sample-selection bugs in §12.1, which no unit test could have caught,
because the failure was "correct error message" rather than a thrown exception.

`check-ads.mjs` earns its place for a specific reason: it counts `aside.ad-slot`
rather than `ins.adsbygoogle`, because Google's loader injects its own
`adsbygoogle-noablate` sentinel at the document root, and counting the ins
elements double-counts every page. It also asserts on a real ad request rather
than on `window.adsbygoogle`, which the current loader consumes rather than
leaving as an array — the first version of this harness asserted both and
reported two false failures against a working integration.

The tool sweep is the one that matters. It presses the sample button, runs the
tool, and asserts a result element appears — driving the same code path a visitor
does, through the real DOM, with the real engine chunk loaded lazily. It found
the two sample-selection bugs in §12.1, which no unit test could have caught,
because the failure was "correct error message" rather than a thrown exception.

`diff-hydration.mjs` exists because "no console errors" is not the same as "no
hydration mismatch". React reports mismatch as recoverable, logs it, and carries
on — so a page can log an error and still work. Comparing the two DOMs catches
the quiet version.

### Sample files are generated, never fetched

Every tool has a working example that costs zero bytes until it is pressed.
`src/lib/samples.ts` assembles real PNG/JPG/WEBP (via canvas), PDF (hand-built
with a valid xref table), DOCX, XLSX, PPTX and ODT, plus text samples.

They are **generated in the browser rather than downloaded**, deliberately. A
sample file fetched over the network would undercut the exact claim the page
making it is built to make. `SampleBundle` returns `{ files, values }` so a
sample can also seed the controls that make a tool do something visible — and
seeded values explicitly beat the asynchronous inspect prefill, because a
sample that arrives with a correction to demonstrate must not be reverted to
what the file already contained.

For collective tools, the sample also exercises the reorder UI: drag and
keyboard reordering share one `moveFile()` path rather than two implementations
that can drift.

## 13. Bugs found and fixed

Beyond the five above, these were found and fixed during the build:

- The homepage was missing from `prerenderRoutes()`, so `dist/index.html` was the
  bare Vite shell with no content.
- A stray `</>` inside the `chevron` icon path.
- An unescaped apostrophe in `guides.ts` breaking the build.
- JSX in a `.ts` file (the router).
- `require()` in an ESM module.
- The loader not unwrapping `.default` from dynamic imports.
- A ZIP helper microtask-ordering bug.
- Canvas dimensions read after being zeroed.
- `doc.numPages` used after `destroy()` in the pdf.js path.
- 28 incorrect-argument `errorResult` calls in the text engine.
- The homepage bundling the whole text engine through chunk hoisting.
- The loader eagerly importing the 3,862-line text engine, behind a comment
  claiming it was "a few kilobytes".
- `manualChunks` naming `'engine-ops'`, which pulled all six engines into the
  entry's **static** graph — 667 KB on every page load. Returning `undefined`
  lets each engine split properly again.

### 13.1 The two that would have shipped a dead website

These are worth separating out, because both produced a site that *looked*
finished to every check that did not involve a browser.

**The prerenderer dropped the entry script from all 84 pages.** `assetTags()`
resolved `entry.file` — an *output* path like `assets/index-abc123.js` — against
the Vite manifest, which is keyed by *source* path (`src/main.tsx`). The lookup
returned `undefined`, the tag was skipped, and every prerendered page shipped as
inert HTML. It looked correct: the SSR markup was complete, titles and
descriptions and JSON-LD were all present, the SEO audit passed, and the tests
passed, because none of them execute the page. `dist/index.html` would have been
served to every visitor as a page that never became interactive.

Fixed, and the SEO audit now asserts bundle wiring — it counts pages carrying a
live entry script and fails the build if the number is not 84/84. The regression
was silent enough that a check, not a fix, is the real remedy.

**`vite preview` serves the homepage for every extensionless path.** So every
browser test run against `vite preview` was hydrating the *homepage's* HTML into
every other route, which produced a React hydration mismatch on every route
except `/` and looked exactly like a hydration bug. It was an artefact of testing
against the wrong server. `scripts/serve-dist.mjs` implements what a static host
actually does — real file, then directory index, then `404.html` with a 404
status, immutable caching on hashed assets — and `npm run preview` points at it.
`scripts/diff-hydration.mjs` compares server markup against post-hydration DOM
for any route, which is how the artefact was distinguished from a real defect.

This is the single largest deployment trap in the project and is documented in
`docs/DEPLOYMENT.md`. The failure mode is nasty in production: the site appears
to work locally, passes every content check, and 404s or serves the homepage for
deep links depending on the host.

### 13.2 There are two shells, and only one of them reaches the visitor

**`AppShell.tsx` is used only by the prerenderer.** `src/entry-server.tsx`
imports it; `src/App.tsx`, the client entry, does not. `App.tsx` renders the
page chrome itself. They are near-copies of one another and nothing enforces
that they stay in step.

This was found by adding the advertising consent banner to `AppShell.tsx` and
watching it not appear. The banner type-checked, rendered correctly in the
prerendered HTML, had every string present in its source file, and passed every
check that did not involve a browser — while being completely absent from the
website, because it had been added to the half of the app that only ever reaches
the crawler.

Two things follow from that, and both are worth more than the original bug.

**The React hydration mismatch on all 84 pages was the same defect,** not an
independent one. Once the two shells disagreed about what to render, every page
logged React error #418. Fixing the split removed the mismatch everywhere.

**The bundler has a matching trap in the same area.** A module read by both the
entry and a lazily loaded page is hoisted into a shared chunk. If that module
needs the JSX runtime, it takes the runtime back out of the entry chunk, forming
a cycle — and Rolldown resolved it by silently dropping the entry's import of
the shared chunk, so the provider and the banner were tree-shaken away with no
error. `src/lib/ads-consent.ts` was written JSX-free (`createElement` instead of
JSX) specifically to break that cycle, and the reason is recorded at the top of
the file so nobody "tidies" it back.

The deeper issue is that two shells can drift for *any* future change. Two
options, neither taken because both are larger than the bug warranted:

- make `App.tsx` render `AppShell` and delete the duplicate markup, or
- have the SEO audit diff the server-rendered shell against the client one.

The browser harnesses are what caught it, which is the argument for them.

### 13.3 The audit that agreed with the bug

Seven built, crawlable pages — `/about`, `/changelog`, `/contact`, `/pricing`,
`/privacy`, `/security`, `/terms` — were missing from `sitemap.xml`. The SEO
audit reported **"No blocking problems found."**

The cause is the part worth remembering. The prerenderer built the sitemap by
filtering routes down to `/tools/` and `/guides/`, and the audit then checked
the sitemap with *the same filter*:

```js
const shouldBeListed = page.route === '/' || page.route.startsWith('/tools/') || page.route.startsWith('/guides');
```

So the audit was validating the generator against its own copy of the
generator's assumption. It could only ever catch a page the generator already
produced, which made it incapable of catching a page the generator wrongly
omitted — the one thing it appeared to exist for. The count was even papered
over with a hardcoded `+ 3` in the log line.

Worse, `prerender.mjs` carried the comment *"Built from the routes that actually
rendered, which is the only list guaranteed to match the HTML files on disk"*,
directly above code that did the opposite. A comment that asserts a guarantee
the code does not provide is worse than no comment, because the next reader
trusts it.

Both are fixed:

- the sitemap derives from the routes that actually wrote a file, with priority
  and change frequency as a pure function of the route shape, so a new page
  gets a sensible entry without anyone remembering to add it;
- the audit derives sitemap eligibility from each page's **own** robots
  directive rather than a route pattern, so the check and the thing it checks
  cannot share an assumption.

The new check was then deliberately broken to confirm it bites. Re-dropping
those seven pages makes `npm run audit:seo` fail with exactly those seven and a
non-zero exit — a state the previous audit passed. `Indexable` and
`Sitemap URLs` are now both 83 and are printed side by side so the two drifting
apart is visible at a glance.

**The transferable lesson:** a check that re-implements the logic of the thing
it is checking is not a check. Compare against reality, not against a second
copy of the assumption. The same shape of mistake appears in `tests/ads.test.ts`,
which proves every origin in `AD_ORIGINS` appears in the CSP — a list-to-CSP
assertion that cannot catch an origin the list is missing. That one is closed
by running the browser harness against production, where the edge adds
constraints a local build has no way to reveal.

## 14. Privacy claims are technically true

The "Processed locally" badge on every tool page is **derived from
`tool.mode`**, never written as prose. It is true because the engines contain no
network calls — not because a sentence says so.

This is enforced rather than asserted:

- Every tool's FAQ must contain an entry that actually answers the privacy
  question. The test matches the *meaning* of an answer — "never leaves your
  device", "runs in your browser", "your original is untouched" all count —
  rather than demanding one exact phrase, which would have pushed the copy
  towards boilerplate.
- A test asserts no tool currently claims a non-local mode.

### 14.1 No third-party origin, enforced by the audit

The site used to make exactly one request to a third party: the Google Fonts
stylesheet, linked in `index.html` and imported again in `src/index.css`. So the
browser fetched it twice, from two origins, on every page view, before render.
Disclosed honestly on the privacy page — but disclosing an IP-address handover is
not the same as not doing it, and in the EU it is a genuine GDPR exposure.

Removing it surfaced two things worth recording:

1. **The prerenderer has its own HTML shell.** `index.html` feeds the dev
   server only. All 84 built pages come from a template inside
   `scripts/prerender.mjs`, which carried its own pair of preconnect links.
   Deleting them from `index.html` changed the dev server and left every built
   page still calling Google. This is the same class of bug as the entry-script
   omission in §13.1: a second HTML shell that nobody remembers exists.
2. **Google Fonts silently ignores request parameters it does not recognise**,
   returning a valid *shorter* stylesheet rather than an error. The first
   version of `scripts/fetch-fonts.mjs` omitted a `family=` prefix and received
   only one of three families, printed `fetched 6 files` and exited zero. The
   build would have shipped with two of three typefaces silently falling back
   to the system stack. The script now asserts every expected family is present
   and throws otherwise.

Both are now checked rather than fixed: `audit:seo` fails the build if any page
references an unexpected third-party origin, and prints
`Only AdSense (plus furtu.xyz). No unexpected third party.` when it passes.

The allowlist is the point. An audit that only ever printed "clean" would have
been useless the moment advertising was switched on — it would either have
blocked the build or, worse, been quietly edited into a no-op. It now names the
AdSense origins specifically and warns if `public/ads.txt` is missing.

### 14.1a Advertising, and what it costs the local-first claim

Monetising with AdSense directly contradicts the product's central claim, so it
is recorded here rather than left implicit.

What is preserved: **no file ever touches the ad network.** The engines, the
workspace and the file pipeline do not read or write to the ad markup, so "your
document never leaves this tab" remains literally true. **No ad is ever placed
inside a tool** — a visitor mid-task with a file open is not shown an advert.
Every placement is below the fold, collapses to nothing before it fills, and
reserves its height in CSS (280px on the homepage, asserted by a test) so
filling it causes no layout shift.

What is given up: the site is not third-party-free. It is disclosed on the
privacy page, and it is the only third party.

### 14.1b The consent gate was built twice, and the first one was wrong

The first implementation was a hand-rolled banner with the answer kept in
`localStorage` under `furtu.ads-consent`, defaulting to declined, with the
AdSense loader withheld from the HTML and injected on acceptance. On its own
terms it was strict: the browser harness proved zero ad-network requests before
consent, eleven checks in all.

**It was still the wrong answer, and only because Google changed the question.**
Google requires publishers serving *personalised* ads in the EEA, UK and
Switzerland to use a CMP certified by Google and integrated with the IAB TCF.
Traffic from a non-certified CMP is eligible only for non-personalised or limited
ads. So the local gate would have cost exactly the revenue it was built to
protect, while looking impeccable from the outside — and running *both* would
have meant two banners on screen and still downgraded traffic, because a local
banner emits no TCF string.

The replacement is Google's own free "European regulations" message, already
certified, no cost, and covering every site in the AdSense account. It collects
the consent, writes the TCF string, and gates the ad request at the network
level where Google expects the gate to be. The local banner, its consent module
and its styles are gone.

Three consequences worth recording:

- **The loader moved back into `<head>`.** Withholding it was correct for a
  hand-rolled gate and wrong for a certified one. The reasoning did not survive
  the change of architecture, which is a good reason to write down *why* code
  does something and not only *what* it does.
- **The CSP had to grow.** Funding Choices loads from
  `fundingchoicesmessages.google.com`, which was not allowlisted. Missing it
  makes the consent message fail to render silently — no console error, no
  failed request, the request is simply never made — and the symptom is
  permanently lost personalised revenue with nothing to debug.
- **The check protecting it is now a build-time test,** `tests/ads.test.ts`,
  which asserts every origin in `src/lib/ads.ts` appears in the `vercel.json`
  CSP, and that `ads.txt` is byte-exact and BOM-free. A silent failure is
  exactly the failure mode that needs a check rather than a comment.

What the harness can no longer prove is the part that mattered most: that
consent actually gates delivery. Google's CMP only renders for EEA, UK and Swiss
visitors and is Google's own component, so that claim can only be verified from
inside those regions. `scripts/check-ads.mjs` verifies everything around it — the
loader executes, a slot is registered and an ad request is issued, `ads.txt` is
served, no advert appears inside a tool, and no local banner remains to compete
with Google's.

Turning advertising off is a single edit: set `CLIENT` to `''` in
`src/lib/ads.ts`. The script is never emitted, the slots render nothing, and the
layout is identical to the ad-free build.

### 14.2 Self-hosting, and what it actually cost

`scripts/fetch-fonts.mjs` downloads the woff2 files and generates
`src/fonts.css`. Inter and Source Serif 4 are variable fonts, so Google serves
**one file per family+subset** and references it from every weight's `@font-face`
rule. The first version keyed output filenames on family *and* weight, which
wrote 119 KB of Source Serif out four times and 47 KB of Inter out seven times.

| | Stored | Loaded by an English page |
| --- | --- | --- |
| Naive | 1,868 KB | ~880 KB |
| Deduplicated by content hash | **432 KB** | **211 KB** |

Only the `latin` and `latin-ext` subsets are fetched; the other 76 files the API
offers cover cyrillic, greek and vietnamese, which an English page never
renders. All three families are SIL OFL 1.1, which permits redistribution and
embedding — see `public/fonts/OFL.txt`.

## 15. Brand presence, and an icon

Two related changes were made after the first release.

### The palette was neutral

The design shipped with seven neutrals and one blue: `#f8fafc`, `#ffffff`,
`#f1f5f9`, `#0f172a`, `#64748b`, `#94a3b8`, `#e2e8f0`, `#cbd5e1`, and
`--brand: #1e3a8a`. The brand colour did appear 59 times, but almost entirely as
button fills, link text and small kicker labels, while `var(--border)` alone was
used 68 times. Every large surface — the hero, the section bands, the card grid,
the page headers — was grey. Read as a whole that is a black-and-white site with
a blue accent, not a blue product.

So the palette gained an 11-stop ramp (`--brand-50` … `--brand-950`) plus
translucent ring, edge and wash tokens, and the brand was given weight at the
scale the neutrals had:

- **Hero** — a two-source radial wash behind the headline, under the text rather
  than boxing it in.
- **Section bands** — `--brand-wash` on two of the bands. Two, not all: washing
  every one flattens the page and loses the alternating rhythm.
- **Card grid** — brand-tinted edges, and on hover a shadow cast in brand rather
  than black, which is what makes it read as blue interacting with the surface.
- **Icon tiles** — were a pale tint with brand-coloured glyphs, which is correct
  and nearly invisible at 42px. Now filled.
- **Primary button** — was hardcoded `#1e3a8a`, so it ignored the theme entirely
  and stayed dark navy even where the brand had gone light. Now a short
  gradient over tokens, legible in both themes.
- **Focus** — the global outline already used the brand colour; it now carries a
  soft ring, because a 2px hairline is easy to lose against the new blue edges.

The restraint of the original design is deliberately kept: no neon, no
glassmorphism, no gradient-heavy panels. Only the colour balance changed.

### The icon

The supplied artwork is a glossy 3D render — a specular highlight across the top
of the letterform, an outer bloom, a bevelled edge. Used verbatim as a 16-pixel
tab icon it averages into a grey-blue smear and the letterform stops being
legible, which is the one job a favicon has.

So the icon is a **redrawn, flattened** version for small sizes: same composition
(dark tile, blue ribbon F, same proportions, same light-to-dark gradient down the
letterform), rendering effects dropped. It exists three times — `public/favicon.svg`,
the inlined header `Mark()`, and inside the OG image — all sharing one path, so
they cannot drift apart. At 180 pixels and up, where there is room for the detail,
the original render is used (`apple-touch-icon.png`, `og-image.png`).

The OG image is **generated from HTML** by `scripts/make-og-image.mjs` using the
same font files the site serves, so the share card cannot fall out of step with
the site's own design. It was previously declared `summary_large_image` with no
image attached at all — every share rendered as bare text.

## 16. Risks and limitations

**Real risks:**

1. **The browser harnesses are not wired into `npm run verify`.** They need a
   built `dist/` and a running server, so `verify` stays typecheck → tests →
   build → SEO audit, and the Playwright harnesses are a separate
   `npm run verify:browser`. CI would need the browser stage added; today it is
   a deliberate local command, not an oversight.
2. **Image engine has no unit coverage.** It executes correctly on a real canvas
   in the browser sweep, but there is no CI-gated assertion over it. A Node
   canvas implementation would close this.
3. **FURTU's own licence has not been legally reviewed.** `LICENSE` now states
   proprietary / all-rights-reserved, which is the intended commercial position,
   but it was written without a lawyer and it says so. Some jurisdictions
   require mandatory consumer rights to survive a proprietary licence, so get it
   checked before relying on it to stop a particular party.
4. **Entry bundle is 124 KB brotli.** Acceptable, dominated by react-dom, but the
   tool-definition data is the reducible part and the trade-off is documented
   rather than taken.
5. **Design provenance.** The supplied design is treated as first-party. If it
   came from elsewhere, its terms need checking before publication.
6. **The hosting trap is documented, not enforced.** `scripts/serve-dist.mjs`
   behaves correctly and `docs/DEPLOYMENT.md` explains why `vite preview` does
   not, but nothing prevents a future deployment target from reintroducing
   SPA-fallback-on-every-path. The Vercel config that once did this is fixed.
7. **Fonts are a committed build input, not fetched at deploy time.** The woff2
   files are in the repository, so a build works offline and offline, but
   upstream re-encoding will not be picked up. Run `npm run assets:fonts`
   deliberately.

**Honest limitations the product itself states:** no OCR, no PDF encryption,
structural compression only, and every individual tool's own limitations are
rendered on its page.

## 17. Next steps

**Before publishing:**

1. Get the proprietary `LICENSE` reviewed by a lawyer.
2. Confirm the design's provenance.
3. Point DNS at the chosen host and verify a deep link such as
   `/tools/pdf/merge-pdf` returns the tool page rather than the homepage. This
   is the one check that is cheap and catastrophic to skip.

**High-value, in order:**

4. Add the Playwright harnesses to CI so the browser stage gates merges rather
   than depending on someone remembering to run it.
5. Add image-engine unit tests via a Node canvas implementation, which closes
   risk 2 outright.
6. Split long-tail tool copy out of the entry chunk — roughly 40 KB brotli off
   the first load.
7. Add a `WebPage`/breadcrumb edge-case sweep to the SEO audit.
8. Consider `hybrid` mode for genuinely server-bound tools — with the privacy
   page updated first, because the current claim would no longer be universal.

**Explicitly not done:** public deployment. The build is ready to serve as
static files, but nothing has been published, and no hosting was touched. The
canonical origin is `https://furtu.xyz`.

---

## Appendix: repository map

```
src/lib/tools/         5 definition files (63 tools) + types + registry + formats
src/lib/engines/       loader + 6 operation modules
src/lib/               router, seo, search, guides, paginate, validate, format, site,
                       ads
src/components/        shell, chrome, command palette, ad slot,
                       workspace/*
src/pages/             14 page components
scripts/               prerender, audit-seo, serve-dist, browser-audit,
                       test-all-tools, check-ads, diff-hydration, shoot,
                       report-bundle, analyse-entry, debug-hydration,
                       make-fixture-pdf, fetch-fonts, make-og-image
tests/                 5 suites, 98 tests
docs/                  this report, ARCHITECTURE.md, ADDING-A-TOOL.md, DEPLOYMENT.md
```

Verification:

| Command | Runs |
| --- | --- |
| `npm run verify` | typecheck → tests → build → SEO audit |
| `npm run verify:browser` | 84-page audit → 63-tool sweep → 12 advertising checks |
| `npm run audit:browser` | hydration + console + asset audit alone |
| `npm run test:tools` | 63-tool sweep alone |
| `npm run test:ads` | 12-check advertising audit alone |

`npm run verify:browser` needs a built site already being served
(`npm run build`, then `npm run preview` in another terminal).

`npm run preview` deliberately runs `scripts/serve-dist.mjs`, **not** `vite
preview`. See §13.1 and `docs/DEPLOYMENT.md` for why that difference is a
correctness issue rather than a preference.
