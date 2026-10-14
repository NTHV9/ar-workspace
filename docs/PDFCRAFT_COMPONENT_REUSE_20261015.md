# PdfCraft v0.8.0 — selective component reuse

Research date: 15 October 2026. Scope: retain the existing AR PDF Workspace and identify useful open-source parts. This is a source review and bounded feasibility assessment, not an implementation or production qualification.

## Recommendation

Start with **comparison as a review/testing aid**, then investigate **native export for a narrow set of edits**. Native editing has greater potential benefit, but also much higher correctness and integration risk. Keep region/table movement as a separate problem: PdfCraft's current object mover does not solve the observed table-grid failure. Compression is useful only if output quality survives, and page organization already substantially overlaps our implementation.

Do not embed the entire PdfCraft app or replace PDF.js on the present evidence. No component was added to production, deployed or enabled by this research. No package installation, cloud mutation, email or original-PDF change was performed. Only this sanitized report was authored.

## Evidence and current baseline

- **Source inspected:** the upstream `v0.8.0` tag points to commit `9931329b9fae0b05373b4dc3ac7c58541f0891a4`. The workspace declares version 0.8.0, Rust edition 2024 and Rust 1.95. Its crates are at `crates/edit`, `crates/render`, etc.; do not assume a `crates/pdfcraft-edit` directory. [Tag](https://github.com/storytold/pdfcraft/tree/v0.8.0), [workspace manifest](https://github.com/storytold/pdfcraft/blob/v0.8.0/Cargo.toml).
- **Previously tested:** official native and loopback web builds render the trial sources; same-height Latin replacement, one targeted white redaction and merging worked. An added address line hid VAT text beneath the table; moving text/Form selections did not preserve the table grid. Shipped default-font Thai replacement was refused. These are observed results on the bounded trial corpus, not universal capability claims. [Trial report](PDFCRAFT_TRIAL_20261015.md).
- **Our actual export:** `exportProject` in [engine.ts](../src/pdf/engine.ts) copies unedited pages with `pdf-lib.copyPages`. Edited/new pages are painted into an opaque PNG and embedded into a new PDF page, nominally 300 dpi subject to a 20-million-pixel cap. Thus native text/vector preservation already exists for untouched pages; edited pages lose source text searchability and vector scalability. The raster route also intentionally excludes original hidden text, streams and annotations from those edited pages. Native export must account for that changed safety property.
- **Our existing model:** [flow.ts](../src/pdf/flow.ts) moves selected raster fragments; [native-graphics.ts](../src/pdf/native-graphics.ts) detects path/image bounds for editing and row barriers. [source-extraction.ts](../src/pdf/source-extraction.ts) and [source-text.ts](../src/pdf/source-text.ts) use PDF.js operators/glyphs. A method called “native editing” in the UI should not be mistaken for native PDF content-stream export.
- **Business handoff:** [review-handoff.ts](../src/pdf/review-handoff.ts) retries the same reviewed revision and uploaded bytes. Any comparison, optimization or native rewrite must finish **before** final review. Do not silently transform bytes after approval or before sending. Preserve transient preparation, exact-byte handoff, backend ownership/revision checks and human Draft/Send Now. [Current decisions](DECISIONS_AND_OPEN_ITEMS.md).

## Ranked shortlist

### 1. `pdfcraft-compare`: useful first, small integration surface

**Source available:** `compare(old, new)` accepts words with page indices and bounding boxes and returns inserted/deleted/replaced regions. The crate also exposes `visual_regions` over RGBA buffers. Its Cargo manifest has no dependencies; it does not require the PdfCraft editor, parser or egui UI. [Implementation](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/compare/src/lib.rs), [manifest](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/compare/Cargo.toml).

**AR value / proposed reuse:** feed our existing text extraction and rendered pages into a small adapter; use changed regions in regression diagnostics or an optional before/after view. This is the best first candidate because it can help expose unrelated content movement without changing how we save PDFs. A small Rust-to-WASM wrapper or carefully attributed TypeScript port is an implementation choice to measure, not something the upstream source already supplies to our React app.

**Tested separately in this research session:** the parent trial ran native `doc_compare` with visual comparison on the original versus address-newline output; it reported two inserted words, one deleted word and a visual change region in a single approximately 208 ms sample. This confirms the command works on that pair, not a browser performance improvement or successful automatic defect diagnosis.

**Limit:** text diff alone cannot detect VAT hidden behind a fill when the text remains extractable. Our bitmap-only edited pages also have no text layer to compare. Visual comparison must accompany text comparison; matching images do not establish valid accounting data, semantic reading order or secure redaction. Thresholds/antialiasing can produce false positives. Measure whether it catches our known occlusion/grid regressions without flagging every harmless rendering difference.

### 2. `pdfcraft-edit` + `content` + `cos`: greatest potential, narrow pilot only

**Source available:** line/block editing rewrites content streams, and unchanged pieces can remain byte-for-byte intact. `register_text_font` supports explicitly loading a font face into a document. The edit crate directly depends on annot, cos, content, fonts, model, kurbo, thiserror and unicode-bidi; fonts adds skrifa/harfrust. This is a library stack, not a single function to copy. [Text editing](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/edit/src/text.rs), [regions](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/edit/src/text_regions.rs), [edit dependencies](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/edit/Cargo.toml), [font dependencies](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/fonts/Cargo.toml).

**AR value / proposed reuse:** explore a separate export path for a tightly qualified same-height text correction or added text. Potential benefits are searchable edited text, sharper print output and avoiding whole-page rasterization. None of those benefits is established for all our documents by the existing Latin smoke test. Unsupported documents/operations must remain explicit and retain the current validated route.

**Blocking limitation:** `ObjectKind` includes Added, Text and Image; Forms are surfaced through the image inventory. The mover validates targets and operates on a clone before committing, but it does not inventory arbitrary standalone painted paths as movable objects. A page-sized Form is not a semantic table group. This source structure is consistent with the observed text/grid separation; it is not a solution for adding rows or moving an arbitrary table with borders, fills and nearby columns. [Object inventory and atomic movement](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/edit/src/objects.rs).

**Thai remains unqualified:** upstream distinguishes document fonts from interface fonts. NOTICE listing Noto Sans Thai in release assets does not prove the replacement pipeline selects or correctly shapes it. Explicit suitable-font import, combining marks, mixed Thai/Latin and copy/search round trips need actual tests. Do not infer working Thai editing from UI rendering or bundled-font notices. [Document-font discovery](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/engine/src/text_fonts.rs), [NOTICE](https://github.com/storytold/pdfcraft/blob/v0.8.0/NOTICE).

### 3. `pdfcraft-redact`: useful companion to any native export

**Source available:** removes marked content, handles Forms and overlapping annotations/fields, and verifies remaining glyph/inline-image residue. The engine adds a renderer-based residue check beyond the redaction crate's own interpreter. It also handles full-rewrite requirements and signed-document refusal. Reusing just `apply` would omit part of the upstream safety behavior. Dependencies include cos, content, fonts, model, forms, edit and annot. [Crate](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/redact/src/lib.rs), [dependencies](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/redact/Cargo.toml), [engine integration](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/engine/src/lib.rs).

**AR value / proposed reuse:** if edited pages become native PDFs, targeted removal could preserve searchable content elsewhere while eliminating the replaced material. Today's raster export already excludes source hidden text on edited pages, so redaction is not an immediate standalone deficiency that warrants importing the whole engine.

**Tested:** one white redaction saved/reopened and the targeted phrase disappeared from independent extraction while nearby VAT remained. This does not certify arbitrary images, vectors, metadata, attachments, nested/shared Forms or earlier revisions. A pilot must inspect the final saved file, require the proper full rewrite, test shared-resource isolation and fail without replacing the original on any uncertainty. Retain independent visual and extraction checks.

### 4. `pdfcraft-optimize`: measurable benefit, quality must be qualified

**Source available:** audits space, resamples supported images, compresses streams and removes unused resources. It deliberately skips image types it cannot faithfully decode. The crate depends on cos/content/model/annot and `image` with JPEG support, without egui. Cancellation may leave its working document partially optimized; the caller must discard that working copy. The engine job wraps optimization, optional hidden-information removal and a full write. [Optimizer](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/optimize/src/lib.rs), [dependencies](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/optimize/Cargo.toml), [engine job](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/engine/src/optimizer.rs).

**Additional parent-session CLI samples:** `doc_reduce` produced these saved-file sizes. These are feasibility observations from local private copies, not quality acceptance or browser benchmarks:

| Trial class | Input bytes | Output bytes | Reduction |
|---|---:|---:|---:|
| Web Invoice | 78,363 | 65,986 | 15.8% |
| Web Statement | 220,980 | 89,211 | 59.6% |
| Scan | 203,298 | 202,516 | 0.4% |

The tested default reduction uses lossy 150-ppi/JPEG-quality-60 settings. The parent independently checked that all three outputs retained page counts and exactly matching extracted text; visual inspection of the first reduced Statement and Invoice pages found content present but some rasterized template labels/footer visibly softer. This is a practical quality tradeoff, not lossless equivalence. A smaller file is not proof that small text, logos, thin lines or scan detail are intact. Prefer first measuring lossless stream/resource cleanup; consider image recompression only as an opt-in operation against a defined print/visual quality target. Run it before Preview approval, preserve the selected original if output is worse, and do not strip document semantics as an accidental side effect of a broad preset. No storage/transfer savings at production scale have been established.

### 5. `pdfcraft-organize`: reuse only for a demonstrated gap

**Source available:** rotate/delete/move/duplicate/import pages, preserve effective inherited attributes while rebuilding page trees, and manage related destinations and metadata. Its direct dependencies are content, cos and thiserror. The library has no egui dependency, but consumers must supply snapshots/undo and final serialization. [Implementation](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/organize/src/lib.rs), [manifest](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/organize/Cargo.toml).

**AR value / tested:** the trial combined an Invoice and scan successfully. That establishes basic feasibility, while our current `pdf-lib.copyPages` already handles ordinary native page packaging. Adoption is low priority unless fixtures demonstrate a concrete advantage in complex resources, annotations/forms, links, large packages or duplicate-resource size. Keep our Hotel/Account/Invoice membership, attachment selection, filenames and three delivery arrangements outside the library.

## Renderer and integration boundaries

`pdfcraft-render` is worth keeping as an **independent validation renderer**, rather than replacing the existing viewer now. Its implementation describes itself as a bootstrap around hayro plus inspection/repair support from lopdf. The workspace pins patched vendor versions; taking only the manifest's crates.io versions may not reproduce the release. Direct dependencies include cos, fonts, hayro, hayro-syntax, lopdf and others. A second renderer can expose disagreements; it cannot prove which renderer is right without examining the document. [Renderer](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/render/src/lib.rs), [manifest](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/render/Cargo.toml), [patches](https://github.com/storytold/pdfcraft/blob/v0.8.0/Cargo.toml).

The official browser build proves a WASM application exists, not that a small React-ready SDK exists. It depends on `pdfcraft-ui-egui`/eframe and exposes a same-origin parent bridge for open/save/dirty messages. Importing the broad engine also pulls OCR, JavaScript, signing, forms, creation and other unrelated subsystems. Prefer narrow byte-in/byte-out adapters, explicit operation/error schemas and worker isolation for any prototype. Binding size, worker cancellation, memory release and compatibility remain **inferred feasibility / untested integration**. [Web manifest](https://github.com/storytold/pdfcraft/blob/v0.8.0/apps/pdfcraft-web/Cargo.toml), [web bridge](https://github.com/storytold/pdfcraft/blob/v0.8.0/apps/pdfcraft-web/src/main.rs), [engine manifest](https://github.com/storytold/pdfcraft/blob/v0.8.0/crates/engine/Cargo.toml).

The inspected full web WASM was 38,059,629 uncompressed bytes in the prior trial. That is not the size of a hypothetical compare-only build. Native CLI timings are not comparable with PDF.js browser loading, current AR export or remote OPERA generation. No comparative browser benchmark has been performed. [Trial timing limits](PDFCRAFT_TRIAL_20261015.md).

## Licensing and attribution

The source workspace is offered under **MIT OR Apache-2.0**, not a requirement to adopt both. Preserve the applicable license/copyright notices for copied or distributed components and record any modifications. Third-party code, bundled fonts and icons carry their own notices; selecting a narrow crate changes what actually ships, so produce an attribution inventory from the resulting build rather than assuming the top-level license covers every asset. [MIT](https://github.com/storytold/pdfcraft/blob/v0.8.0/LICENSE-MIT), [Apache](https://github.com/storytold/pdfcraft/blob/v0.8.0/LICENSE-APACHE), [NOTICE](https://github.com/storytold/pdfcraft/blob/v0.8.0/NOTICE), [attribution inventory](https://github.com/storytold/pdfcraft/blob/v0.8.0/ATTRIBUTION.md).

ArtCraft names/wordmarks/logos in `docs/brand` are explicitly excluded from the open-source grant. Do not import its branding into AR or imply endorsement. A modified distribution must follow the separate brand terms. No reason to copy the full app's branding/assets for component reuse. [Brand terms](https://github.com/storytold/pdfcraft/blob/v0.8.0/docs/brand/LICENSE-brand.txt).

## Smallest useful next experiment — proposed, not implemented

1. Use sanitized synthetic fixtures reproducing the known VAT occlusion, text/grid separation, rotated/cropped pages, Thai combining marks, shared Forms and scans. Keep the current implementation as the baseline and retain original reference files.
2. Compare current output and narrow native-edit output with independent rendered images **and** text extraction; include intentional unrelated-content changes to evaluate the comparison tool. Require unchanged material outside the authorized edit, searchable intended text where native output is promised, no lost amounts, and correct page packaging.
3. Benchmark in the same browser/device: cold and warm loading, first page, edit-to-preview, export, peak memory, responsiveness, failure/cancellation and downloaded bytes. Repeat representative small and large documents. Measure comparison overhead separately from PDF parsing/rendering.
4. Only integrate a component if measured benefit outweighs adapter/toolchain/maintenance cost. Preserve the existing React design, business identities, review acknowledgement, exact reviewed bytes and explicit failure path. The address/table insertion case remains unqualified until both text and graphic geometry move correctly together.

Status: **proposed component reuse; source inspected; bounded native/browser tests documented separately; no production integration, deployment or enablement.**
