# FURTU architecture

How the codebase is put together and, more importantly, why. The "why" is the
part that matters when you come back to this in six months.

---

## The one idea

**A tool is data, not a component.**

A tool is a plain object describing what it is called, what it does, what
options it has, and what it honestly cannot do. The workspace, the page, the
breadcrumb, the sitemap row, the search index entry, the FAQ structured data and
the command-palette result are all rendered from that object. Adding a tool means
appending an object to an array and writing one function.

Everything else in the architecture follows from taking that seriously.

```
src/lib/tools/*.ts        what a tool IS   — safe to import during SSR
src/lib/engines/ops/*.ts   what a tool DOES — loaded only when opened
```

The split is not tidiness, it is the reason the homepage ships 124 KB instead of
730 KB. Tool *definitions* are small enough to always have on the page.
Tool *code* is not, and never is unless you ask for it.

## Layers

```
                    ┌──────────────────────────┐
                    │      pages/*.tsx         │  14 page components
                    │   ToolPage, HomePage…    │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  components/             │
                    │   SiteChrome, PageShell, │
                    │   CommandPalette,        │
                    │   workspace/*            │
                    └────────────┬─────────────┘
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                 │
┌───────▼────────┐                              ┌─────────▼─────────┐
│  lib/tools/    │  data: definitions + registry │  lib/engines/    │
│  lib/router    │  pure, no browser APIs        │  loader + ops/   │
│  lib/seo       │                              │  lazy, browser    │
│  lib/search    │                              └───────────────────┘
│  lib/guides    │
└────────────────┘
```

Nothing in `lib/tools/`, `lib/router.ts`, `lib/seo.ts` or `lib/guides.ts` touches
a browser API. That is the rule that makes server-side rendering and prerendering
possible at all, and it is why the same module produces the static HTML *and*
the hydrated client tree.

## Routing

`src/lib/router.ts` is a table of about 100 lines, not a routing library.

Seven shapes cover the whole site:

| Kind | Path |
| --- | --- |
| `home` | `/` |
| `tools-index` | `/tools` |
| `category` | `/tools/<segment>` |
| `tool` | `/tools/<segment>/<slug>` |
| `guide` | `/guides/<slug>` |
| `static` | `/about`, `/privacy`, … |
| `not-found` | anything else |

`matchRoute(path)` is pure. `loadRouteComponent(route)` dynamically imports the
page component — which is why every page is its own chunk and the entry does not
contain fourteen page components.

`loadRouteComponent` uses `createElement` rather than JSX because the file is a
`.ts`, not a `.tsx`. That was a deliberate trade: keeping the router free of JSX
means the server can import it without a transform, which matters for the
prerenderer.

## The three maps an engine can fill

`EngineChunk` has three optional maps, and which one you use follows from what
the tool produces:

```ts
{ file?: FileOpMap, text?: TextOpMap, fileText?: FileTextOpMap }
```

`fileText` was added later for one specific reason: extracting a PDF's text
layer produces something you read and copy, not something you download. Without
it, that tool rendered a download link for a `.txt` file, which is technically
correct and practically useless. The workspace renders `fileText` results as a
selectable text panel with meta chips, diagnostics and an optional download.

## Lazy loading, and the two mistakes that hid in it

Every engine is behind a dynamic import:

```ts
const LAZY_CHUNKS: Record<EngineId, () => Promise<EngineChunk>> = {
  pdf:      () => import('./ops/pdf').then((m) => m.default),
  image:    () => import('./ops/image').then((m) => m.default),
  document: () => import('./ops/document').then((m) => m.default),
  text:     () => import('./ops/text').then((m) => m.default),
  yaml:     () => import('./ops/yaml').then((m) => m.default),
  qr:       () => import('./ops/qr').then((m) => m.default),
};
```

Two things went wrong here before it was right, and both are worth knowing about.

**The text engine was imported eagerly**, on the reasoning that a pure
string-transform module must be small. It is the largest module in the codebase
at 3,862 lines. The comment asserted "a few kilobytes" without anyone measuring.
It now loads lazily like everything else.

**`manualChunks` was naming all operation modules `engine-ops`.** Assigning a
manually-named chunk pulls it into the entry's *static* graph, so one rule meant
all six engines shipped on every page load — 667 KB of it. The rule now returns
`undefined` for operation modules, which is the same as saying "let the bundler
decide", and each engine became its own dynamic chunk. `report-bundle.mjs` exists
because the first version of it only counted the entry chunk and understated the
real cost by 233 KB.

The general lesson: **lazy loading is a property of the import graph, and
`manualChunks` can silently undo it.** Measure the static import closure, not the
entry file.

## Rendering: one shell, two environments

```
src/main.tsx         hydrateRoot()   — client
src/entry-server.tsx renderToString() — prerenderer
        │
        └──── both render <AppShell> ────┘
```

`AppShell` holds the header, footer, theme and command palette. Rendering it in
both places is what keeps hydration clean — the markup React hydrates is the
markup the browser already has. `searchOpen` is deliberately absent on the
server and on the first client render.

`main.tsx` calls `hydrateRoot` and falls back to a full client render if there is
no prerendered markup, so the app still works when served without the static
files.

## Build and prerender

Three steps, in order, because each depends on the one before it:

```bash
npm run build:client   # dist/, with .vite/manifest.json
npm run build:ssr      # dist-ssr/entry-server.js
node scripts/prerender.mjs
```

The prerenderer imports the SSR entry, calls `render(url)` for every route the
registry produces, and writes a real static HTML file per route — plus
`sitemap.xml` and `robots.txt`. It reads the client manifest to discover the
hashed CSS and JS filenames, which is why it cannot be a Vite plugin.

The payoff: a tool page arrives with its title, description, canonical URL,
breadcrumb, FAQ and JSON-LD already in the HTML. A crawler that never executes
JavaScript still sees the content.

`FURTU_SSR=1` flips `vite.config.ts` between SPA and custom app types. That
environment variable is read, not set, by the `build:ssr` script.

## Declarative controls

Tools describe their options; they do not render them.

```ts
{ kind: 'number', id: 'quality', label: 'Quality', min: 1, max: 100, step: 1, default: 82, suffix: '%' }
```

`Controls.tsx` renders all six kinds. This is the single reason 63 tools did not
turn into 63 bespoke components, and it is why adding a tool never requires
touching the UI layer.

## The privacy claim is derived, not written

Every tool page shows a "Processed locally" badge. That badge is rendered from
one field:

```ts
mode?: ProcessingMode   // 'local' | 'hybrid'
```

Nobody hand-writes "your file never leaves your device" into a page. The claim
is true because the engines contain no `fetch` and no `XMLHttpRequest` — and
because the badge is a consequence of the code rather than a promise about it.

`hybrid` exists in the type and is unused. It is documented as not implemented
rather than quietly faked, and a test asserts no tool currently claims it.

## Validation is three axes

`src/lib/validate.ts` checks extension, MIME type **and** magic bytes. The
third is the one that matters: a renamed executable passes the first two. The
shared signatures in `formats.ts` are what stop a mislabelled file reaching a
parser that will try to parse it.

## Testing strategy

Three layers, each answering a different question:

| File | Question |
| --- | --- |
| `tests/registry.test.ts` | Is the *data* sound? Every tool has a real operation, a real icon, a real FAQ, unique titles and descriptions, stated limitations, and no page that answers the privacy question by accident. |
| `tests/engines.test.ts` | Do the PDF, text, YAML and QR operations actually work? Real generated fixtures, real assertions on real output bytes. |
| `tests/engines.document.test.ts` | Do the OOXML/ODF operations work? Same, in jsdom, because those operations genuinely need a DOM. |

The distinction matters. The registry test proves an operation *exists*; it
cannot prove it runs. Writing the engine tests is what found five real defects,
including a `getKeywords()` call that would have thrown on every PDF with
keywords stored.

`scripts/audit-seo.mjs` then checks the *built* output: 84 pages, unique titles
and descriptions, valid canonicals, valid JSON-LD, no orphans, sitemap agreement.

## Design fidelity

The supplied design is the source of truth. `src/index.css` was extended by
appending layers; no original rule was replaced or removed. Where a control did
not exist — the file-inspection panel — it was built from the existing chip and
diagnostic vocabulary rather than a new one.

No gradients, no glassmorphism, no neon, no generic SaaS-dashboard styling. That
was a constraint on the work, not a preference.

## Deliberate non-choices

- **No routing library.** Ten route shapes, ~100 lines, identical behaviour
  client and server.
- **No state management library.** The workspace's state is a handful of
  `useState` calls and one `useRef` for the abort controller.
- **No UI component library.** The design is the component library.
- **No CSS framework at runtime.** Tailwind is a build-time tool for the
  original stylesheet; the product layers are hand-written CSS in the file the
  design came in.
- **No backend.** There is nothing to be a backend for. If a tool ever needs
  the network, that is a new decision with a new privacy posture, and `mode`
  is where it gets recorded.
