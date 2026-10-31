# Reviewed invoice send scope implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; obtain a fresh whole-branch review after qualification. Track completion below.

**Goal:** Record actual billing/collection and Sheet write intents only for invoices represented by the final exported attachments, without requiring Preview or reading PDFs after sending.

**Architecture:** Export already traverses delivery groups and original source IDs. Carry compact per-export invoice IDs with the existing exact-byte upload receipt. Validate/freeze the union into the email draft and delivery snapshot before provider submission. Filter the frozen manifest as well as workflow facts, including combined email members. Existing durable Sent and Sheet recovery remain independent of PDF bytes.

**Tech stack:** Existing React/TypeScript PDF exporter, Worker RPCs, PostgreSQL functions and durable tracker outbox; no provider or dependency changes.

**Spec:** Owner's accepted approach in this conversation; PRODUCT_SPEC and current DECISIONS_AND_OPEN_ITEMS.

## Global constraints

- No mandatory Preview click and no additional PDF parsing/provider download after Send.
- No sends/resends or real billing/Sheet corrections in qualification. Owner has already edited the affected live date; preserve it.
- Preserve original document selection, file receipts, retention references and immutable attempted deliveries.
- Statement coverage is its selected source snapshot; deleting individual text is an editor operation, not an accounting scope command.
- Unknown legacy scope must not silently become original-selection billing on a new attempt. Already-attempted delivery recovery keeps its immutable evidence.
- Keep actual source identity, actor/Hotel/Account authorization, CAS, duplicate commands, regional mailboxes and exact byte guards.
- Employee work finishes when Gmail accepts the message; Sheet retries never authorize resend.

## Review focus

- Removing all pages of one invoice excludes it; removing one page of a multi-page invoice keeps it.
- Combined PDF and combined emails preserve invoice identity independently of names/file counts.
- Statement-only and attached invoice PDFs retain their source relationships.
- Changed/rebound packages and lost responses do not reuse stale scope or duplicate commands.
- Sheet failures/manual date edits and deleted temporary bytes do not cause resend or historical date replay.

## Tasks

### 1. Carry exported source coverage

- [x] Add failing model/export/handoff tests for removed invoice, combined, statement, partial-page deletion and renamed outputs.
- [x] Add `invoiceIds` to PDF export metadata; derive it from delivered page source IDs and attachment bindings.
- [x] Carry an immutable `invoice_ids` array in reviewed export receipts through single, batch and legacy save paths; preserve exact retry behavior.
- [x] Run targeted tests/typecheck.

### 2. Freeze and consume scope before Gmail

- [x] Add a real SQL regression: four selected invoices, three exported invoices, one successful fake-provider confirmation; assert only three Sent/workflow/Sheet intents and correct amount.
- [x] Generate a new migration with the Supabase CLI. Validate per-export ID shape/subset and exact receipt integrity, derive canonical scope, freeze email draft IDs and filtered delivery/member manifests.
- [x] Adapt rebind/combined guards to reviewed scope while retaining original job selection for source/cleanup identity.
- [x] Reject unknown scope before new provider admission; preserve reads/recovery for already-attempted snapshots. Cover legacy, invalid/foreign IDs, revision races, reply/combined and actor boundaries.
- [x] Run clean migration chain, existing SQL fixtures/concurrency contracts and new regression.

### 3. Qualify and prepare release

- [ ] Run full units, typecheck/build, relevant browser export/send/batch tests and complete required GitHub checks before deployment.
- [ ] Obtain fresh-context code review and resolve material findings with regression tests.
- [ ] Update PROJECT_STATUS with implemented/tested/deployed distinctions and evidence without customer identifiers.
- [ ] Publish only the qualified exact change through the existing release process; do not alter real invoice dates, send mail or broaden cleanup.

## Execution ledger

- Base: 4a19b9f62e8814e43d88f74e80bfe18c21af3d6d; isolated existing pdf-ui-qualified worktree, new branch codex/reviewed-invoice-send-scope-20261031. Pre-existing dirty documents are preserved and must not be staged wholesale.
- Ruling: continue inline without another plan approval — owner has accepted this precise approach and requests autonomous continuation; review is still required before release.
- Owner subsequently confirms the affected live invoice date was edited manually. No repair of that date or historical send scope is authorized in this implementation.
- RED: six export/handoff cases initially failed; actual pre-migration SQL rejected coverage metadata. Both are green after implementation. Further failing-before/passing-after guards catch combined full-selection equality, legacy package replacement and attempted-package re-rendering.
- Fresh155 migrations +54 SQL rollback fixtures +6 real concurrency/Worker-contract groups passed. Source scope, Sent totals, Sheet intents, staff-date authority, exact retry, legacy rejection/rebind and combined member histories are exercised with synthetic data only.
- Ruling: an older unattempted package may upgrade automatically only from its retained same-revision editor project. Without that provenance fail before rendering; never restore original pages over employee-reviewed bytes. All existing provider attempts including created Gmail Drafts bypass regeneration and retain recovery evidence.
- Independent review found and prompted fixes for three original-selection guards, customer/result counts and frozen email history. Final re-review and GitHub checks pending; no live mutation performed.
