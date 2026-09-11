# Preserve source PDF text and simplify editing

Owner request: remove the two explanatory paragraphs from document creation/preparation; edit text with the original font, size, color, weight and position; make editing easier and support adding/removing lines. Statement stays app-generated and Invoice/Folio comes from OPERA. PDF edits never change ledger data.

## Constraints

- Preserve reviewed-byte handoff, no editor-project storage for transient work, undo/redo, mandatory Preview and actual acknowledgment, privacy, output flattening on edited pages and native copy for untouched pages.
- Preserve approved PDF workspace visual language. Simplify the operating controls, not Portfolio/Account layout.
- Original font support must be grounded in PDF data/rendering, not silently replaced by Arial/navy/padding. If exact glyph/style cannot be reproduced, surface the limitation; do not promise universal fidelity.
- No public customer PDF/screenshot/log. Synthetic committed fixtures; private samples may be inspected read-only with metadata/raster evidence outside Git.
- Branch codex/pdf-source-editing. Root owns hosted deploy/PR/merge and public audit. No new integrations, DB migration or accounting write expected.

## Task 1: Source text extraction and faithful replacement rendering

Own src/pdf/engine.ts, src/pdf/types.ts, src/pdf/model.ts and new engine-specific modules/tests only. Do not edit PdfWorkspace.tsx, DocumentRoute.tsx, UI CSS or existing browser fixtures without coordination. No subagents, commit, push or deployment.

Reproduce style loss using a synthetic PDF with black regular/bold and colored/italic text; assert actual detected/rendered source versus replacement. Current detectText drops font/color/weight and drawLayer forces top baseline with3px/2px padding; replacement factory currently hardcodes Arial/navy/boldfalse. Implement source-grounded font metadata, size, color, baseline/x, weight/italic and spacing preservation. Consult installed pdfjs-dist source/current primary docs. Support embedded font glyph mapping where available; don't emit corrupted glyphs silently. Resolve source-style references against current loaded PDF (legacy restore must not trust stale arbitrary CSS/font references).

Expose a clear helper `createReplacementLayer(run: DetectedText, id: string): PdfLayer` for UI, preferably in a focused module; tell parent exact import. It creates a replacement using detected original geometry/style with no fixed padding offset and preserves all needed source references for redraw/export. Provide a reset-style helper if needed; parent may use factory and retain edited text. Define typed/validated metadata with bounded values. Existing legacy projects without metadata still work safely. Source metadata must not enable external URL/font fetch or arbitrary CSS injection.

Render same-text replacements as close to original pixels as possible, preserving color/baseline/weight and real font where available, and test replacement with a new digit, multi-character text and multiline. Edited pages remain opaque exported raster (300dpi cap unchanged); no hidden original text may leak. Parent handles text editor interaction and line insertion/removal. Ensure text layout can expand its box without changing font size and reports overflow rather than clipping new lines silently. Coordinate helper/interface for layout measurements.

Tests: meaningful extraction/render comparisons with synthetic regular/bold/italic/color source and available embedded font; missing glyph handling, safe restore metadata validation, source redraw after reload; preserve existing PDF model/export tests. May create dedicated Vite harness/browser test files for your engine tests. Report limitations accurately; no guessed100% promise.

## Task 2: Root UI and line controls

- Remove the two exact user-specified paragraphs, no replacement technical prose.
- Default to direct source-text selection. Clicking text selects existing edit instead of duplicating layers, then focuses the text field. Keep mouse drag/resize and undo/redo.
- Initialize/reset edits using source factory. Put text editing and line insertion/deletion first; font/position controls remain available as advanced formatting. Source formatting remains unchanged until the user explicitly changes it.
- Add/remove text lines at caret; Enter/newline supported, auto-grow within page and clear overflow handling. Ask whether table rows are also wanted; continue independent font work while awaiting answer.
- Update tests and inspect synthetic 1440×900/1280×800 views and PDF output. Retain Preview → email handoff and transient cancellation guards.

## Task 3: Verify and deliver

- Independent scoped review, relevant unit/browser tests, full typecheck/build, public Git audit and push.
- Deploy exact tested source to ar-workspace with --keep-vars, verify deployed browser/assets/health and denied unauthenticated access, merge clean CI-green PR with expected head.
- PROJECT_STATUS and latest decisions report actual results and PDF limits. Keep original design reference bytes.
