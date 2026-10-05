# Adding a tool to FURTU

A tool is **data plus one engine operation**. If you can describe what the tool
does in a form and give it a paragraph of honest explanation, adding it is two
small edits and no new component, no new route, and no new CSS.

Roughly 30–60 minutes, most of it writing copy that does not overclaim.

---

## The two halves

```
src/lib/tools/<category>.ts     what the tool is: name, copy, controls, FAQ
src/lib/engines/ops/<engine>.ts what the tool does: a function
```

Everything else — the URL, the card in the index, the breadcrumb, the sitemap
entry, the related-tools links, the search index, the FAQ structured data, the
command palette entry — is derived from those two files. There is no third place
to update.

## 1. Write the operation

Open the engine file for your category. Add one function and register it.

```ts
const stripFirstLine: TextOpMap[string] = (input, _values, ctx) => {
  ctx.onProgress(0.4, 'Removing the first line');
  const output = input.split('\n').slice(1).join('\n');
  return { output };
};

const text: TextOpMap = {
  // ...
  'strip-first-line': stripFirstLine,
};
```

### Pick the right signature

| Your tool | Map | Signature |
| --- | --- | --- |
| Takes text, returns text | `text` | `(input, values, ctx) => TextResult` |
| Takes files, returns files | `file` | `(files, values, ctx) => Promise<FileOutput[]>` |
| Takes files, returns text | `fileText` | `(files, values, ctx) => TextResult` |

`fileText` exists for tools like PDF text extraction, where the useful result is
something you read and copy rather than something you download. The workspace
renders it as a rich text panel with meta chips and a download button.

### The rules engines must follow

These are not stylistic preferences. Each one is checked or load-bearing.

- **No `fetch`, no `XMLHttpRequest`, no WebSocket.** Processing is local. If you
  need a resource, it has to be bundled.
- **No `Math.random()` in anything cryptographic.** Use `crypto.getRandomValues`.
  The password and UUID generators are covered by tests that would catch it.
- **No `dangerouslySetInnerHTML`.** If you render HTML, build React elements.
- **Respect `ctx.signal`.** Call `checkAborted(ctx)` or test
  `ctx.signal.aborted` in any loop that can run long, so cancelling actually
  stops work.
- **Report progress with `ctx.onProgress(fraction, note?)`.** Fractions are
  clamped to 0–1. The note is shown next to the progress bar, so write it for a
  human.
- **Throw `UserFacingError` for anything the visitor can act on.** The message
  is displayed verbatim. "This file is password protected. Enter the password
  and save an unlocked copy, then try again." — not "InvalidOperationException".
  Any other error becomes a generic message, so a good `UserFacingError` is the
  only way a user learns what went wrong.
- **Never mutate the input file.** Read it, write a new blob.

### Reading control values

Controls are `Record<string, string | number | boolean>`. Use the helpers rather
than casting, because they apply the defaults:

```ts
const target = textValue(values, 'target', '200kb');
const quality = clamp(num(values, 'quality', 82), 1, 100);
const strip = flag(values, 'stripMetadata', true);
```

If a value is a page expression — `1-3,5,8-` — parse it with
`parsePageRange` from `@/lib/paginate` and surface its warnings. Do not
hand-roll range parsing; the tests already cover the edge cases.

## 2. Describe the tool

Add an entry to the matching array in `src/lib/tools/<category>.ts`.

```ts
{
  slug: 'strip-first-line',
  category: 'developer',
  name: 'Strip First Line',
  summary: 'Drop the first line of a text file.',        // one line, for cards
  description: 'Remove the first line from a block of text…', // the intro paragraph
  icon: 'text',
  workspace: 'text',                                      // 'text' | 'files' | 'none'
  engine: 'text',
  input: null,                                            // or TEXT_INPUT / PDF_INPUT(...)
  limits: TEXT_LIMITS,
  controls: [
    { kind: 'toggle', id: 'dropBlanks', label: 'Also drop leading blank lines', default: false },
  ],
  keywords: ['remove first line', 'delete first line', 'strip line'],
  synonyms: ['cut first line', 'drop header line'],
  faq: [
    { q: 'Is the rest of the text left exactly as it was?', a: 'Yes. Only the first line is removed…' },
    // three minimum
  ],
  limitations: ['…'],   // required when workspace is 'files'
}
```

`slug` must match the key in the engine's operation map, or set
`operation: 'something-else'` explicitly. `icon` must be a name in `IconName`.

### Control kinds

`select` · `number` · `toggle` · `text` · `color` · `pages`

Declare them; do not write JSX. The workspace renders all six.

### `input` and `limits`

- `workspace: 'text'` → `input: null`
- `workspace: 'files'` → a real `InputSpec`. Use the `PDF_INPUT`, `IMAGE_INPUT`,
  `OFFICE_INPUT` or `TEXT_INPUT` helpers, or build one from `formats.ts`. Always
  include magic-byte `signatures`; extension and MIME type alone are trivially
  spoofed and the file validator is what stops a mislabelled file reaching your
  parser.

### `limitations` is not optional for file tools

A test asserts that every `workspace: 'files'` tool states at least one real
limitation. State the thing that would otherwise surprise someone. If the tool
does not do OCR, say so. If it is structural and cannot shrink an already
optimised file, say that. A tool that cannot fail a visitor is usually a tool
that is not being straight with them.

## 3. If the tool should also *inspect* the input

Set `inspect` to the name of a read-only operation in the engine's `fileText`
map. It runs as soon as a file is added, before anything is written, and its
`prefill` is merged into the form:

```ts
const inspectPdfMetadata: FileTextOpMap[string] = async (files, _values, ctx) => {
  const doc = await loadDocument(files[0], ctx);
  return {
    output: '…',
    meta: [{ label: 'Title', value: doc.getTitle() ?? '—' }],
    prefill: { title: doc.getTitle() ?? '' },
  };
};
```

An inspect operation must not modify anything. Use it when the tool's copy
promises to show what is already in the file — otherwise the page is making a
claim the product does not keep.

## 4. Check it

```bash
npm run typecheck    # the tool definition and the operation must agree
npm run test         # registry integrity, plus any engine tests you add
npm run build        # prerenders the new page and adds it to the sitemap
npm run audit:seo    # unique title, description, H1, valid JSON-LD
```

Add an engine test. The registry test only proves an operation *exists*; only a
round trip proves it works.

```ts
it('strips the first line', async () => {
  const engine = (await import('@/lib/engines/ops/text')).default;
  const { output } = await runText(engine, 'strip-first-line', 'one\ntwo\nthree');
  expect(output).toBe('two\nthree');
});
```

## 5. What will be generated for you

Once the two files are saved, the new tool appears at
`/tools/<category>/<slug>` with no further edits:

- prerendered HTML with title, meta description and canonical URL
- `BreadcrumbList` and `WebApplication` JSON-LD
- a `FAQPage` block from your `faq` entries
- an entry in `sitemap.xml`
- cards on the category page and the tools index
- search and command-palette hits from `keywords` and `synonyms`
- related-tool links, derived from category and siblings
- the "Processed locally" badge, derived from `mode`

## Common mistakes

- **Unescaped apostrophes.** `'Don't upload'` inside a single-quoted string
  breaks the build. Use double quotes: `"Don't upload"`. This is the single most
  common build failure in this codebase.
- **A duplicate.** 63 tools, and every one has a distinct operation and a
  distinct explanation. If two tools would read the same on their pages, one of
  them is a doorway page — set `index: false` or merge them.
- **FAQ that does not answer the privacy question.** A test checks that every
  tool's FAQ actually addresses where the file goes. It looks for a real answer,
  not a specific phrase, so write what is true.
- **Overclaiming.** "Remove all personal data from a PDF" is false if the name
  is in the letterhead. "Clears the stored properties; the text in the document
  body is untouched" is true and just as useful.
