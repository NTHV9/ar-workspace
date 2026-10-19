# PDF Workspace repair implementation plan

> Execute with superpowers:subagent-driven-development; owner-approved scope and execution are already recorded in this conversation. Implementers use Sol Medium and review uses Astra High per owner preference.

**Goal:** Repair the five demonstrated employee PDF editing failures while preserving source/account identity, row editing and exact reviewed-file handoff.

**Spec:** `docs/PDF_WORKSPACE_COMPARISON_AUDIT_20261015.md` plus owner's approval on 19 October of the five-point repair proposal.

**Architecture:** Keep the current React Workspace, history, attachments and delivery groups. Improve geometry handling in existing flow functions. Add a narrow, qualified native single-line PDF editing worker for text fidelity and colored backgrounds; retain deliberate raster processing for complex editing.

## Global constraints

- Statement/Invoice item insertion still moves the full row; stationery insertion affects only its own column/group.
- Destination overlap must never erase unrelated text/amounts without visible feedback; no silent overwrite.
- Original source bytes and OPERA/DB financial records remain unchanged. No mail send is needed for this repair.
- Retain Undo/Redo, filenames, source identity, selected-page packaging and exact final-preview bytes for handoff.
- Native replacement requires unique verified source/page/text/bounds, visible opaque fill, unchanged supported font/style, expected text, no unapproved font substitution or block rewriting. Rejected cases must preserve input bytes.
- No paid add-ons or external service changes. No customer PDFs, tokens or private evidence in Git.

## Tasks

### A. Existing layout and UI repairs
- [x] Add failing regressions for same-column address/VAT spacing with stationary right fields; repeated grow/shrink and restoration; ordinary full-row table flow.
- [x] Implement bounded stationery-group spacing and refuse ambiguous/colliding changes instead of losing content.
- [x] Add destination collision checks for table/area moves, including text, layer and non-text artwork. Keep Undo and safe moves usable; provide a clear visible rejection/preview path.
- [x] Fit inserted images using intrinsic aspect ratio and preserve it during ordinary resize.
- [x] Use visible/export page ordering for Differences labels, including attachments and content filters.
- [x] Run focused behavioral tests and typecheck; record exact changed files and results.
Ownership: PdfWorkspace.tsx, use-native-editing.tsx, flow/row-layout/model/types as necessary, geometry/image helpers and their tests. Do not edit engine.ts/native bridge files.

### B. Qualified native text and background fidelity
- [x] Add failing regressions for the blue-header white-mask defect and native refusal cases (invisible/stroked/translucent text, mixed runs, stale/ambiguous targets and substitution).
- [x] Build a reproducible pinned PdfCraft line-only WASM adapter with licenses; do not expose diagnostic/block APIs.
- [x] Integrate byte processing through an isolated worker and validated source matching. Use the same candidate in editor rendering and final preview/export; avoid double-painting source replacements.
- [x] Preserve background when raster fallback is necessary; never silently conceal a failed native edit or approve different final bytes.
- [x] Validate actual exported PDFs with independent text and rendered-image checks; bound/cache resources and release stale sessions.
Ownership: engine.ts and new native/worker/background modules, native build/attribution assets and tests. Do not edit PdfWorkspace.tsx or A-owned geometry/types without coordination.

### C. Integration and acceptance
- [x] Independently review A and B against the approved scope and reported failures.
- [x] Run the relevant regression suite, typecheck and production build.
- [x] Exercise the actual browser Workspace against synthetic address/table/color/image/attachment fixtures. Reopen exported PDFs, inspect VAT/totals/untouched pages and exact review handoff.
- [x] Record implementation/test/deployment states separately and publish only after passing applicable acceptance checks.

## Review focus

Address edits with multiple nearby columns; moving onto background artwork or partially overlapping a selection; image decoding failure/aspect ratio; duplicate native text across pages or fonts; stale async preview/worker results. Each belongs to A or B regressions above and the final browser acceptance.

## Preflight

A and B share the engine/geometry boundary but own different files. Public PdfProject shapes stay backward compatible; any new field requires model validation. B consumes existing source maps without mutating originals. Root coordinates cross-file changes and final acceptance. The owner has already approved implementation; no repeated design confirmation is required.
