# THIRD-PARTY NOTICES

FURTU is distributed as a self-contained static site. It bundles the runtime
dependencies listed below. Every one of them carries a permissive licence, and
the licence text ships inside the corresponding package in `node_modules/`.

This file exists to make the provenance of the shipped code explicit and to
record two projects that were **examined and deliberately not used**.

---

## 1. Runtime dependencies (bundled into `dist/`)

| Package | Version | Licence | Role in FURTU |
| --- | --- | --- | --- |
| `react` | 19.3.0 | MIT | UI runtime |
| `react-dom` | 19.3.0 | MIT | DOM renderer, also used for prerendering |
| `pdf-lib` | 1.17.1 | MIT | All PDF structure work: merge, split, rotate, delete, extract, reorder, compress, watermark, metadata |
| `pdfjs-dist` | 4.10.38 | Apache-2.0 | PDF rasterisation and text-layer extraction (`pdf-to-jpg`, `extract-pdf-text`) |
| `js-yaml` | 4.3.2 | MIT | YAML parsing and serialisation |
| `qrcode` | 1.5.4 | MIT | QR code encoding |
| `fflate` | 0.8.3 | MIT | ZIP reading and writing for the OOXML/ODF document tools |

### Licence texts

- **MIT** (applies to `react`, `react-dom`, `pdf-lib`, `js-yaml`, `qrcode`, `fflate`) — permission is granted to use, copy, modify, merge, publish, distribute, sublicense and sell copies, with the condition that the copyright notice and permission notice are included in all copies. Each package's full text is in its own `LICENSE` file.
- **Apache-2.0** (applies to `pdfjs-dist`) — grants the same rights, additionally requires that modified files carry prominent notices, that redistribution retains the licence, and that use of the names of contributors is not done without permission. `pdfjs-dist` also bundles components under the Mozilla Public License 2.0; see `node_modules/pdfjs-dist/LICENSE` for the authoritative text of both.

Neither the MIT-licensed nor the Apache-licensed dependency required any source
change to be used here. No dependency was forked, vendored, or relicensed.

## 2. Build and development dependencies (not shipped)

These are used to build and test the site and are not present in the `dist/`
output. All are permissive.

| Package | Version | Licence |
| --- | --- | --- |
| `vite` | 8.3.2 | MIT |
| `vitest` | 2.1.9 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `jsdom` | 25.0.1 | MIT |
| `tailwindcss` | 4.3.3 | MIT |
| `@tailwindcss/vite` | 4.3.3 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| `@types/js-yaml` | 4.0.9 | MIT |
| `@types/qrcode` | 1.5.6 | MIT |
| `@types/node` | 22.20.5 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |

## 3. Design source

The visual design — `src/index.css` in its original form, the artwork in the
original `App.tsx`, and the original icon paths — was supplied to this project as
a finished design file and is used as the visual source of truth. It is treated
as first-party material for the purposes of this build: the CSS was extended by
appending new layers, and no original rule was replaced or removed.

## 4. Projects examined and deliberately **not** used

The brief named four open-source projects as candidate sources of prior art.
All four were checked directly against the GitHub API before any code was
written. Two could not be used, and the reason is recorded here because it is a
licence-compliance decision rather than a technical one.

| Project | Licence | Outcome |
| --- | --- | --- |
| [`dannycranmer/parchment`](https://github.com/dannycranmer/parchment) | MIT | Permitted. Reviewed for behaviour and UX reference. No code copied; FURTU's PDF operations are original and written against the `pdf-lib` public API. |
| [`jisung-02/paper-tools`](https://github.com/jisung-02/paper-tools) | MIT | Permitted. Reviewed as a reference for tool-page structure. No code copied. |
| [`PseudoRAM/image-compressor`](https://github.com/PseudoRAM/image-compressor) | **None declared** | **Not used.** The repository has no licence file. Under the Berne Convention, an unlicensed public repository is proprietary by default: no permission to copy, modify or redistribute is granted. Reading it for ideas is a grey area that was avoided entirely. |
| [`ByteCrister/quantipixor`](https://github.com/ByteCrister/quantipixor) | **None declared** | **Not used.** Same reasoning. |

**Consequence, stated plainly:** the image tooling in FURTU — compress, resize,
convert, crop, rotate, flip, strip metadata, and the two target-file-size
compressors — is **not** derived from `PseudoRAM/image-compressor` or
`ByteCrister/quantipixor`. It was written from scratch against the browser's
`createImageBitmap` and `OffscreenCanvas`/`HTMLCanvasElement` APIs plus the
platform's own `toBlob` encoders. `qrcode` (MIT) is used for QR encoding; the
image compressors use no third-party compression library at all.

If either unlicensed project later gains a licence, that is a future decision,
not a change that can be made retroactively to this build.

## 5. Attribution

FURTU is original work. Where it uses a third-party library, it does so through
that library's public API and says so. Nothing in the codebase is presented as
FURTU-original that is not.
