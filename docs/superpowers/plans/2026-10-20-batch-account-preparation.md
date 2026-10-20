# Batch account preparation implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, followed by one independent whole-change review. Preserve this plan as the execution ledger.

**Goal:** Preserve Collections selection across accounts and prepare, review and explicitly send separate messages from one batch.

**Architecture:** A batch coordinates existing Hotel + Account document jobs and existing per-draft delivery claims. It does not combine ledgers, attachments or recipients, introduce a second mail implementation, or auto-send on load. Each work group keeps its collection stage. Batch metadata is private to the authenticated user's browser tab; server-side jobs and delivery claims remain authoritative.

**Tech stack:** Existing React/TypeScript, private document APIs and Gmail delivery APIs.

**Spec:** Owner-approved conversation and `batch-agent-mail.html` interaction mock, plus the refinements below.

## Approved behavior and constraints

- Keep the current Collections master/detail layout. Switching account/filter/stage does not clear selected invoices; stale/uncollectible invoices are removed with an explicit notice.
- Scope each selection by hotel, account and current work stage. Selection and document preparation do not require recipients. Verify recipient completeness before sending.
- Keep the existing PDF editor and email composer, including scans, filenames, rich text, signatures, threads and supplemental attachments.
- Switching within a batch preserves tab-only PDF editing state and saves email edits before switching. An unsuccessful save or active operation blocks switching. Leaving/discarding the batch uses existing abandonment protections for every job.
- A PDF snapshot is an in-memory editing session, never a saved editor project. Release editor rendering resources when switching. Reviewed bytes continue through existing private review/version checks.
- The final review lists account, hotel, stage, recipients, files and blockers. One human command sends reviewed entries, with at most two requests in flight. No auto-send on reload and no automatic resend after an uncertain result.
- Existing delivery claims, server permissions, current policies, actual-Sent evidence and Sheet writeback remain the single business source. Draft is not Sent.
- Preserve single-account preparation. Do not activate TSUN or change account defaults.
- No real customer sends for testing. Existing one-time test recipient authorization may be used only with synthetic content and no business history, if a new live test is needed.

## Review focus

1. Same account/invoice identifiers in different hotels must not collide.
2. Refresh, holds, changed stages and hidden filters must not silently send stale selections.
3. Switching PDFs must retain scan sources, geometry, filenames and Undo without leaking another account's bytes.
4. Closing/reloading during creation or delivery must reuse durable commands and never duplicate sending.
5. Empty recipients, system billing, changed mail revisions/policies and pending attachments must remain blockers at send time.

## Tasks

- [x] **1. Collections basket.** Add `src/batch/selection.ts` and its tests; integrate multi-scope selection and a removable summary into Collections/QueueWorkPanel. Preserve the existing single-account route.
- [x] **2. Batch preparation coordinator.** Add typed owner-scoped tab state and bounded creation helpers in `src/batch/`, a common preparation dialog and batch route. Reuse stable per-entry document command IDs and server identity checks. Wire App navigation/leave handling.
- [x] **3. Editor/composer adapters.** Add optional embedded/suspend adapters to DocumentRoute, PdfWorkspace and EmailComposer. Preserve single-job behavior; expose snapshots and validated saved mail revisions without duplicating rendering or delivery code.
- [x] **4. Batch review/send.** Render per-entry readiness and a final confirmation. Reuse existing send/check APIs, exact saved revisions and explicit stages; reconcile uncertain results without resend.
- [ ] **5. Verification and release.** Run behavioral unit/browser regressions, actual interactive synthetic PDF/account switching and mail isolation tests, full tests/build, independent review, then scoped deployment and health verification. Record implemented/tested/deployed separately.

## Execution ledger

- Planning: existing selection resets on `focusKey`; existing DocumentRoute abandonment must not run on batch switching. Existing mail send claims already fence duplicate sends; preserve that boundary.
- Ruling: batch selection remains within the currently selected region, matching the current Collections data access model. Hotel/account/stage identity stays explicit inside that region.
- Ruling: no new paid resources or database schema are required for the initial coordinator. Browser-tab batch metadata contains selectors and durable command/job IDs; it does not contain provider tokens or PDF bytes.
- Ruling: tab-only PDF sessions require an explicit memory budget and a before-unload warning. They are not advertised as recoverable editor projects after browser closure.

- Implemented tasks 1–4 using existing document/mail APIs; no schema changes. Verified 2,079 unit tests, TypeScript/build, actual synthetic browser workflows, PDF extraction/rendering and independent review. See `docs/BATCH_ACCOUNT_VERIFICATION_20261020.md`. Release checks pending.
