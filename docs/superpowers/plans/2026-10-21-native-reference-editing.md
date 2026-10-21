# Native REFERENCE editing qualification

> **For agentic workers:** Use superpowers:executing-plans inline, with independent final review.

**Goal:** Qualify direct source-text replacement/deletion for the real Invoice REFERENCE heading without masking its artwork or adding UI steps.

**Architecture:** Extend the existing pinned PdfCraft line adapter only where image painting is enclosed in balanced graphics-state blocks and never contains text. Preserve resource graphs and all non-text operators. Empty edits remove only the exact matched line; all surviving lines/pages must retain identity/style/geometry. Keep unsupported Form/transparency/text-transform cases and existing raster safeguards conservative.

**Spec:** Owner-approved direct-text trial on 21 October; actual Invoice/Statement plus six private installed hotel templates, Preview/download equivalence, Undo/Redo, unchanged financial/business data.

## Constraints
- No original file overwrite, OPERA/Sheet/history change or real email.
- No dense raster-mask fallback; rejected experiments remain isolated.
- No font substitution, ambiguous matching, unbounded resources, silent clipping, or unverified changed adjacent text.
- Preserve private inputs outside Git. Rebuild pinned WASM with existing isolated toolchain only.

## Tasks
- [x] Add failing native image/clear/identity/resource tests; qualify isolated image blocks and deletion with complete surviving-text/resource checks.
- [x] Connect qualified empty/direct edits to editor rendering/export, retaining source identity and lifecycle; test current box and mixed edits.
- [x] Test actual real REFERENCE replace/delete/Undo/Redo/Preview/download and six templates, including unaffected pixels/resources and multiple pages.
- [ ] Independent review, regression/typecheck/build, evidence and conditional deployment only after qualification.

## Open qualification boundaries
Form XObjects, signed/forms/annotations, ambiguous shared text, transformed text and unsupported fonts remain refused. Do not claim every uploaded PDF is supported. Existing page/row transforms must be explicitly tested before enabling their native route.
