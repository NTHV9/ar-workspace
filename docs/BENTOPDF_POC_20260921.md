# BentoPDF 2.8.8 local proof — 21 September 2026

## Decision after the local browser trial

**Do not replace the production PDF Workspace with this release.** The free native editor successfully changed text, exported readable PDF bytes, reopened them and supported Undo/Redo. However, it does not supply the complete five-column row insertion that motivated this trial, and the subset-font case lost bold styling and moved adjacent text. These are functional acceptance failures, not a request to buy the commercial edition.

Implemented only a disposable local evaluation harness. Tested the official unmodified distribution with synthetic PDFs. **No production integration, deployment or enablement**, no customer PDF, no email/OPERA operation, no paid service, and no app license/source-publication change. Existing production remains unchanged. The recommended next implementation is an application-owned complete table-row model, including empty Reference/Debit/Credit cells; BentoPDF can be reconsidered separately for native text editing after fidelity and integration requirements are resolved.

## Static audit

The following is read-only source inspection. Browser evidence is recorded separately below, so static capabilities are not treated as tested application behavior.

Pinned application: **v2.8.8**, commit `f96cd4e5166f3d51393dfe9f3c440b5bb77802f1`, dated 29 August 2026. Its vendored engine marker is `8ff5002c6cd5`. These differ from the newer `main` source examined in `PDF_EDITOR_OPTIONS_20260921.md`. [Application commit](https://github.com/alam00000/bentopdf/commit/f96cd4e5166f3d51393dfe9f3c440b5bb77802f1), [Pinned package manifest](https://github.com/alam00000/bentopdf/blob/v2.8.8/package.json), [Engine marker](https://github.com/alam00000/bentopdf/blob/v2.8.8/vendor/bentopdf-pdfium/.upstream-version)

### Loading and saving private PDF bytes

| Surface | Verified behavior | Integration implication |
| --- | --- | --- |
| App `openFile(file, sourceUrl = null, knownBytes)` | Reads `file.arrayBuffer()` unless supplied `knownBytes`; also uses `file.name.replace(...)` | Accepts a browser `File`; wrap a Blob/ArrayBuffer in `new File([bytes], name, {type:'application/pdf'})`. A bare Blob is insufficient because it has no `name`. No PDF URL/upload is required |
| App exports | `openFile`, `engineReady`, zoom controls, document description, `setOnSaved` | Not a complete component SDK; no exported destroy or saved-byte callback |
| App `saveFile()` | Commits active edits, calls `saveSpliced`, applies pending tag/alt-text surgery, constructs a PDF Blob, and triggers an anchor download | Final PDF bytes exist locally, but this function is private |
| App `setOnSaved(fn)` | Callback receives `(sizeInKb, fileName)` | It does **not** return the Blob or bytes; cannot directly implement the existing reviewed-byte handoff |
| Core `PdfEngine.open(bytes, password)` / `reopen(bytes, pageIndex)` | Loads a `Uint8Array` into WASM; reopens byte snapshots for undo/history | ArrayBuffer input needs `new Uint8Array(buffer)` |
| Core `save(opts)` / async `saveSpliced(opts)` | Returns local PDF bytes, or null on failure; supports native save and a content-stream splice path | A lower-level byte API exists without a paid service, but bypassing the app save routine would omit its active-edit/tag steps |

Sources: [App open/save/export code](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/app.js#L9232), [App wrapper interface](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/logic/edit-pdf-text-page.ts), [Core loading](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/core.js#L531), [Core byte export](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/core.js#L1907)

**Practical conclusion:** an integration can process and return bytes entirely locally, but needs a maintained adapter/fork that exposes the **final bytes after the existing save pipeline**. The app initializes shared module state and binds fixed DOM IDs; do not treat it as an independently mountable React component. Opening a document also performs protection/preprocessing for content arrays, pattern artwork, Type3 text and fragile fonts. Retain these steps when adapting. The bounded save/reopen results are below; application byte transfer is still unimplemented. [Application implementation](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/app.js)

### Native editing versus complete table rows

The pinned core/header expose native paragraph creation, commit, resize, move, delete, duplicate, object manipulation, and saving. The inspected HTML, app/core JS and native editcore header contain **no identified semantic table-row API/control** that creates every column, preserves blank cells, shifts subsequent rows, and paginates totals/footers. This is a bounded negative finding, not a claim about every internal engine path. Paragraph reflow, paragraph duplication, line breaks, and object selection do not establish the missing Reference/Debit-row behavior. [Paragraph primitives](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/core.js#L997), [Pinned native API header](https://github.com/alam00000/bentopdf-pdfium-viewer/blob/8ff5002c6cd5/packages/pdfium/build/code/editcore/editcore.h), [Editor controls](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/pages/edit-pdf-text.html)

**Decision boundary:** native-text editing may replace substantial low-level custom code; full invoice-row insertion remains an application feature unless the browser trial demonstrates otherwise. Do not promise that a populated-cell duplicate will infer the missing cells.

### Fonts and runtime resources

- The native loader resolves the vendored `bentopdf-pdfium/editcore.wasm` as a local asset. `PdfEngine.create()` initializes it in the browser; its open/save methods operate in WASM memory. No paid/cloud call is present in this path. [Engine loader](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/engine-loader.js), [Core initialization](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/core.js#L411)
- The 2.8.8 native editor has `PdfEngine.localFonts`, populated through `window.queryLocalFonts()` and font blobs. Its provider checks whether a font covers the requested codepoints; Thai candidate families include Tahoma, Leelawadee UI and Noto Sans Thai. System-font access needs browser support and permission; the code reports Chrome/Edge when unavailable. This is not proof that the original font has every new glyph or that every Thai edit shapes correctly. [Font provider](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/core.js#L355), [Local font access](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/app.js#L10118)
- **Version correction:** the newer `main` implementation's automatic `fallbackFonts` integration is absent from this pinned native editor. Although v2.8.8 contains a shared font-loader utility elsewhere, its native editor wrapper does not import/connect it. Do not credit 2.8.8 with the later implementation. [Pinned wrapper](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/logic/edit-pdf-text-page.ts)
- Spell checking fetches a local `dict/en.txt.gz` resource. The full toolkit has optional CDN dependencies for other operations; those should not be conflated with native text editing. The browser trial below completed the tested native path with external connections blocked. Static self-hosting is documented, so a separate document server is not intrinsically required. [App source](https://github.com/alam00000/bentopdf/blob/v2.8.8/src/js/editcore/app.js), [Pinned static-hosting instructions](https://github.com/alam00000/bentopdf/blob/v2.8.8/STATIC-HOSTING.md)

### Exact no-cost licensing boundary

The pinned application's manifest declares **AGPL-3.0-only**, and its LICENSE contains AGPLv3. Its pinned licensing note says there is no license key and the paid distribution contains the same publicly available source. The no-cost route is therefore available, subject to AGPL obligations; this is not an MIT-style unrestricted embedding claim. Preserve notices and provide corresponding source where required for the adopted/modified work. Merely placing the current application on a public Git repository does not decide whether its license and source offer meet those obligations. [Pinned LICENSE](https://github.com/alam00000/bentopdf/blob/v2.8.8/LICENSE), [Manifest](https://github.com/alam00000/bentopdf/blob/v2.8.8/package.json), [Pinned licensing note](https://github.com/alam00000/bentopdf/blob/v2.8.8/docs/licensing.md)

The same tag's `docs/licensing.md` calls an undistributed internal company tool free, while `licensing.html` distinguishes internal tools whose source is not shared and requests producer/license PDF metadata. Record this prose inconsistency; do not silently choose the most permissive sentence or treat an iframe as eliminating licensing obligations. The exact integration/source-disclosure scope and metadata policy must be settled before adoption, without changing this app's license in the trial. The engine fork also contains inherited MIT package files alongside its root AGPL declaration and vendored-package AGPL declaration; retain the complete applicable notices rather than assuming the whole fork is MIT. [Pinned website licensing text](https://github.com/alam00000/bentopdf/blob/v2.8.8/licensing.html), [Engine root license](https://github.com/alam00000/bentopdf-pdfium-viewer/blob/8ff5002c6cd5/LICENSE), [Inherited engine-package license](https://github.com/alam00000/bentopdf-pdfium-viewer/blob/8ff5002c6cd5/packages/pdfium/LICENSE), [Vendoring declaration](https://github.com/alam00000/bentopdf/blob/v2.8.8/.github/workflows/update-bentopdf-viewer.yml)

## Browser trial evidence

### Reproducible environment

- Downloaded the official `dist-2.8.8.zip` release: **140,917,726 bytes**, SHA256 `6b11a6bd5fcaebf55b408d23cc7e01a34d6a7beb563d63781373eabf6f5ce887`. [Release](https://github.com/alam00000/bentopdf/releases/tag/v2.8.8)
- Extracted unchanged under ignored `.tmp/bentopdf-poc/extracted`; no vendor files entered the application source or Git. The native editor was `/edit-pdf-text.html`, not the separate annotation editor `/pdf-editor.html`.
- Served only on `127.0.0.1:5224`, with GET/HEAD only. Content Security Policy limited script/connect/font/image/frame resources to the local origin, blob/data as appropriate; external connections were blocked. COOP/COEP were enabled. Both native editing/export cases completed under this restriction, with no console warnings/errors returned for the trial tab. This establishes local operation for the tested path, not a network audit of every tool in the distribution.
- Native engine WASM in this build: **7,330,128 bytes**; Brotli asset **2,420,171 bytes**. The full ZIP includes unrelated optional office tools and is not an appropriate production editor payload.
- Created synthetic A4 invoices with five headings, a sparse credit row, a description continuation and an untouched footer/page marker using existing pdf-lib/fontkit. No OPERA/customer PDF or signed-in application tab was read or changed. Local system-font permissions were not requested.
- Harness and evidence are retained locally under `.tmp/bentopdf-poc/`: `serve.mjs`, `make-fixtures.mjs`, `verify-trial.py`, fixture manifest, original/exported PDFs and rendered output. Start from the repository root with `node .tmp/bentopdf-poc/serve.mjs`. Fixture regeneration creates a new baseline; preserve the recorded files/hashes for comparison with this run.

### Results

| Acceptance item | Result | Evidence and limits |
| --- | --- | --- |
| Edit text with characters absent from the source subset | **Pass for content; fail for original styling** | Changed `D12345 - 1` to `abcdefgh` using the real Find & Replace UI. Exported text is extractable; old value is absent. The original Plus Jakarta Sans Bold subset was replaced with regular Helvetica. The neighboring `Voucher No.` label was merged into the rewritten run and shifted vertically; its font was already Helvetica. No original-style fidelity claim |
| Export and reopen | **Pass for both exercised fixtures** | Browser displayed successful export, local files were parsed and rendered independently, then reopened in BentoPDF. The saved two-page marker was found on page 2 after reopening |
| Multi-page editing | **Pass for the bounded case** | Changed only `SYNTHETIC-PAGE-2` to `SYNTHETIC-PAGE-2-EDITED`. Both pages, all five headings and the footer text remained. Page 1 was text-identical and pixel-identical at scale 2 (144 dpi). Page 2 changed only in the marker region |
| Undo / Redo | **Pass for the tested replacement** | Closed Find, used Ctrl+Z, verified edited marker absent and original marker present. Ctrl+Shift+Z restored the replacement, confirmed by search and the exported bytes |
| Add a complete five-column row, including blank Reference/Debit | **Not provided by the inspected controls/API; acceptance not met** | Edit All/Text/Images/Shapes and paragraph Duplicate/Delete are available. No semantic row-insertion control/API was identified. Do not describe paragraph duplication or five manually positioned text boxes as a passing Add Row operation |
| Keep table/totals unchanged during the text edits | **Pass for these fixtures only** | Pixel comparison found no changes outside the affected voucher line or page-2 marker. The source fixture itself has a crowded/overlapping footer label and amount; the export preserves it. This trial does not claim to correct that source layout |
| Exact reviewed-byte handoff into Katathani AR | **Not implemented** | Final bytes are downloadable locally. The public wrapper callback exposes size/name only; a reviewed-byte adapter still needs development and testing |
| Thai shaping, large real OPERA files, cross-page row flow | **Not tested** | No customer document, font permission or production integration was used. No performance benchmark or broad browser compatibility claim |

Saved-file verification used pypdf text/font inspection plus pypdfium2 rendering and Pillow pixel differences. Original/edited renders were opened and visually inspected. Browser screenshot capture was unavailable for this tab, so output render inspection is evidence of the saved PDF, not a screenshot-based review of the editor UI. Find & Replace sometimes initially showed `Not found` while navigating/rebuilding its index; a subsequent Next match found the expected text. This is recorded as a trial observation rather than a diagnosed upstream bug.

![Original subset-font voucher versus BentoPDF export](evidence/bentopdf-20260921-font-comparison.png)

### Exact fixture/output identities

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `02-subset-font-five-columns.pdf` | 3,372 | `4be8365bf21eb4a1861763ccfb533927f8db3cb4e3985a5dbc12f0133b351405` |
| `02-subset-edited.pdf` | 2,738 | `c0e0e3f80c7124c84ae7df53ce9483f724abe6fff4a64817202819552f8f5614` |
| `03-two-page-five-columns.pdf` | 4,670 | `dcd56ba70ac79679a30cfaeafb7612d94d2ef0d17d3d5c2c49faa8b616c4d92e` |
| `03-two-page-edited.pdf` | 6,391 | `e80e13209be405e0d960c4192bfc964340ceb991d283eb655d02aa617e4566bd` |

Subset comparison at scale 2: changed pixel bounds `[699,155,938,177]` (includes label and value). Two-page output: page 1 has no changed pixels; page 2 bounds `[475,1511,547,1524]`, covering the added marker suffix. Detailed machine-readable results: [verification](evidence/bentopdf-20260921-verification.json). The standard-font single-page fixture was generated but not separately exercised; the two-page case includes an edited standard Helvetica-Bold marker.

## Next implementation boundary

The trial is complete; replacement is declined for now. The missing-cell issue should be fixed at the application's table model: determine and retain all columns, create editable empty cells for every new row, and shift subsequent content/totals as a logical row with safe page boundaries. Keep explicit font replacement, source originals, mandatory Preview acknowledgment and the existing exact reviewed-byte handoff. A new engine alone does not supply those guarantees. This report does not claim that the current sparse-row bug or the customer's overlap rejection has been fixed.
