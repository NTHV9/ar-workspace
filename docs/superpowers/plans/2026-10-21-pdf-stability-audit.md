# PDF Workspace stability audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Find and repair regressions in everyday PDF editing introduced during the recent editor/native-text rollout, without adding features.

**Architecture:** Compare changes since `b0b1fb2` (before the October editor repair implementation) with the current release. Exercise shared source extraction, mask/render/export, layout movement and UI session/package operations; qualify native and fallback paths separately.

**Tech Stack:** React/TypeScript, PDF.js, pdf-lib, pinned PdfCraft WASM, Vitest, actual browser UI through CUA.

**Spec:** Owner's stability approval on 21 October; `docs/PRODUCT_SPEC.md`, `docs/DECISIONS_AND_OPEN_ITEMS.md`, `docs/PDF_WORKSPACE_REPAIRS_20261019.md`.

## Global Constraints

- No new editor feature; no accounting/OPERA/Sheet mutation or real email for these tests.
- Private real templates/source copies remain ignored. Synthetic data is used for editable test documents.
- Keep original-glyph/artwork checks, account/file identities, exact reviewed-byte handoff, Undo/Redo and left/right header independence.
- Never infer arbitrary PDF coverage from unit counts; record skipped cases and original-file limitations.
- Existing worktree and deployment runtime bindings remain intact; deploy only verified fixes.

## Review Focus

- Ordinary source text close to rules, bank panels and tightly spaced footer/header fields.
- Clear/delete/restore versus replacement; same-line native edits versus raster fallback.
- Long/multiline Voucher and address edits, preserving adjacent columns and table totals.
- Multiple pages/accounts, attachments/scans, filename and delivery changes after edits.
- Preview/download/handoff failure recovery and unchanged source/business data.

### Task 1: Differential field qualification

**Files:** Private browser matrix under `.tmp/pdf-stability/`; `src/pdf/{engine,source-extraction,source-text,mask-background}.ts`; tests added only for demonstrated failures.
- [x] Inventory changes and existing acceptance limits.
- [x] Run replace/clear probes on detected fields across six hotel templates, a multi-page template and the already-obtained real source pair.
- [x] Qualify native acceptance/refusal explicitly and inspect pixel changes outside edited fields.
- [x] Minimize any failure, write regression, fix and repeat its original probe.

### Task 2: Staff workflow verification

**Files:** Existing `tests/browser/{right-header,row-actions,source-deletion,native-background,batch-workspace}` harnesses and private mixed-document harness.
- [x] Actually click/edit address, Voucher, table and total; exercise newline/remove/clear/Undo/Redo.
- [x] Exercise scan/attachment, rename/reorder/delivery, preview and downloaded output.
- [x] Exercise batch account switch and PDF/email handoff through synthetic callbacks; no real send/history.
- [x] Document limitations and repair any demonstrated regression before claiming coverage.

### Task 3: Release and evidence

**Files:** `docs/PDF_STABILITY_AUDIT_20261021.md`, `docs/PROJECT_STATUS.md`.
- [x] Run relevant/full regression checks for actual fixes and independent final review.
- [x] Publish only verified changes if needed; preserve runtime tracker bindings and verify deployed source.
- [x] Report confirmed failures/fixes, tested workflows, untested cases and any disabled capability honestly.

## Execution rulings

- Audit performed with the documented bounded matrix and staff workflows; see `docs/PDF_STABILITY_AUDIT_20261021.md`. No assertion of every PDF/browser/sequence coverage.
- Ruling: quarantine the attempted dense-heading fallback after independent artwork counterexamples, as authorized by the owner's stability/isolation requirement. Keep the 16 REFERENCE refusals openly unresolved rather than ship unsafe masking.
- Ruling: separately fix the newly reproduced real-source header-shrink regression with an empty-intersection guard, verified by a red/green test and actual UI/PDF output.
- Full table-drag matrix and every hotel's actual customer documents were not repeated; these limits remain explicit. No real email or business history was produced.
- Final release checks/deployment are recorded in PROJECT_STATUS; only the geometric fix, defensive regression tests and audit documentation are included.
