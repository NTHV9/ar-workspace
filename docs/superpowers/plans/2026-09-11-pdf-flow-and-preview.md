# PDF typing recovery, fitted Preview and content flow

Owner reports missing glyph errors replacing the entire page/thumbnail while editing a system Statement, Preview not showing a whole page, and row insertion blocked by lower content. Owner now explicitly wants added lines/rows to push later content down with Word-like freedom. This supersedes the prior fixed-page insertion limit; preserve source money/history and human-reviewed sending.

## Constraints

- No OPERA/ledger changes, new backend, database migration or paid services. Keep transient exact reviewed-byte handoff and mandatory Preview/acknowledgment.
- Preserve original font/style where support is known; standard Helvetica/WinAnsi typing must support new ordinary characters such as appending `n` to a synthetic account number. Unsupported exotic glyphs must not destroy the page; never send an output silently missing the requested edit.
- Original source bytes remain unchanged. Edited output stays flattened; untouched native pages stay native. Reflow/export must not clip content or reduce all continuation pages to a low-resolution giant bitmap.
- User requested automatic downward flow and continuation pages. This is not a promise of complete DOCX/Word interoperability or automatic financial-total recalculation.
- All public fixtures/screenshots synthetic. Existing native KAT/TSK samples and system Statement samples are private, may be read only for verification, and must never be committed.
- Root owns code integration, tests, public audit, deployment/merge. Feature branch codex/pdf-flow-and-preview, confirmed ar-workspace Worker/repository only.

## Task 1: Engine font recovery, resilient rendering and flow export

Own src/pdf/engine.ts, source-text.ts, source-extraction.ts, types.ts, model.ts, row-layout.ts and new engine/flow modules/tests. Do not edit PdfWorkspace.tsx, FinalPdfPreview component, use-native-editing.tsx, UI CSS or existing main editor browser harness without coordinating. No subagents, commit, push, hosted writes or deployment.

1. Reproduce the exact typing failure with a minimal system-Statement-style PDF containing Helvetica9, synthetic account `OTA0069`, then append lowercase `n`. Current observed-glyph lookup rejects normal new characters in the source font. Fix authoritative Base14/WinAnsi mapping or consistent same-family font rendering; do not guess custom subset glyphs. Verify real private system Statement and native Invoice samples by metadata/pixel ratios only.
2. Provide an editor-tolerant rendering mode/API returning per-layer issues while preserving the complete source page and valid edits. Validate a failing layer before masking its original. Strict export/Preview must still refuse unresolved edits; thumbnails should never render long exception prose. Tell parent the exact API.
3. Add validated logical content extent (`flowHeight` or equivalent; original page.height remains native sheet height). Insertions can push source and overlays down beyond the original sheet. Deletions restore flow. Export automatically paginates into original-size sheets at safe text-line gaps, preserving every source band and overlay. No clipping of totals/footer/bottom content; avoid splitting text lines or ordinary images where possible. Provide pure `pageCanvasHeight`/flow-edit helpers for UI. Reuse ordered native row/move edits and source-ref mapping; don't lose inserted-cell membership or Undo semantics.
4. Use bounded high-resolution output tiles/fragments instead of rasterizing the entire extended strip at low resolution; edited output should retain current300dpi policy subject to existing per-sheet pixel cap. The editor may use a bounded overview raster. Pagination results must determine final PDF page count and Preview dimensions. Preserve source grouping and selected-only delivery shapes.
5. Tight original text boxes overlap conservative metadata: use sound line/position handling rather than blocking normal adjacent invoice rows. Support source masks/references across flow without dropping text targets. No arbitrary CSS/font URLs. Existing legacy projects validate/reopen safely.

Tests: new ordinary glyph succeeds; genuinely unavailable glyph keeps editor source visible and strict export blocked; multiple edits don't poison other layers; source rebind/reload; content at bottom survives added row, automatic continuation pages, crisp per-sheet exports, deleted rows, repeated operations, source/layer alignment and bounded invalid geometry. Private trial must report only counts/ratios, no customer text.

## Task 2: Root direct editing and Preview

Latest owner steering: make the editing interaction like Word. Direct caret/typing on the document is the primary text interaction; right properties are secondary. Enter/multiline pushes following content, with page continuation. Preserve actual PDF source style where supported and do not claim full Microsoft Word/DOCX equivalence.

- Extract/rebuild final Preview to default Fit page, with actual available width/height and all four page edges visible. Offer Fit width and numeric zoom. Page navigation must cover every output page/file; required acknowledgment still refers to all output pages. Avoid a large header/footer consuming the preview area.
- Wire tolerant editor rendering to a stable canvas container with a short separate warning; no exception text inside thumbnail/page artwork. Keep typed text and recovery controls. Export remains strict.
- Wire virtual content height through paper aspect ratio, overlay positions, drag bounds and thumbnails. Adding text lines/rows grows content and pushes later content (including totals) downward; overflow continues onto output pages. Revise row boundaries to actual source line spacing instead of inflated box height, preserve adjacent fields, blank cells, custom font membership, move/Undo and source-style fidelity.
- Update regressions that encoded the old fixed-page prohibition; replace them with no-clipping/continuation assertions, not weaker checks. Test real tight invoice-row spacing with synthetic equivalents and private read-only trial.

## Task 3: Verification and delivery

Independent scoped review of typography recovery, flow/pagination, Preview and no-data-loss guards. Run appropriate local unit/browser tests and build/typecheck, inspect1440x900 and1280x800. Audit public commit contents, push, deploy exact tested source with --keep-vars, verify actual Cloudflare UI/health/auth, merge CI-green expected head and update PROJECT_STATUS with actual results and limits.
