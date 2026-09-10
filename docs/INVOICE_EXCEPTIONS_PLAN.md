# Invoice exceptions implementation plan

> For agentic workers: execute this bounded foundation task in the current delegated session; root integrates routing/domain/UI and reviews/applies the migration. No provider calls, migration apply or commit from the subtask.

**Goal:** Explicit invoice notes/disputes/holds and reviewed reopening, without financial mutation or loss of billing/reminder history.
**Architecture:** Service-only, revision/command-guarded SQL commands plus authenticated Worker API. An atomic invoice-update trigger records only verified zero → verified nonzero reopen observations. Outer mail-claim wrappers add new-handoff checks while preserving all incumbent guards and reconciliation facts.
**Tech stack:** Cloudflare Worker TypeScript; Supabase PostgreSQL.
**Spec:** PRODUCT_SPEC §§10–11; COMPLETION_WORKFLOW_AUDIT WF-2/3; latest owner confirmation to preserve billing/reminder history on reopen and enter Needs Review.

## Contract

- `GET /api/invoice-exceptions/:hotel/:accountId/:invoiceId` → InvoiceException state with source facts and revision 0 when no exception has been written.
- `GET /api/invoice-exceptions/:hotel/:accountId/:invoiceId/history?page=0&limit=20` → `{rows,total}`, ordered newest revision first.
- `POST /api/invoice-exceptions/:hotel/:accountId/:invoiceId` with `{commandId,revision,confirmed:true,action,reason,...actionFields}` → recorded InvoiceException result. Repeat the same command/input after uncertainty; do not generate a new command automatically.
- `GET /api/invoice-exceptions/commands/:commandId` → `{complete:false}` or `{complete:true,hotel,accountId,invoiceId,revision}`. Missing receipt means unknown, never proof of failure.

Actions: `set_notes` requires `note` and `dispute` strings (blank clears either); `hold` accepts `reviewDate:string|null`; `release` releases only the manual hold; `acknowledge_reopen` clears only the reviewed reopen flag. Every command requires a reason. A review date is a reminder to review the hold, not automatic release. Clearing notes/dispute does not release a hold. Reopen acknowledgement does not release a hold. Replies/remittances cannot invoke these actions automatically.

SQL functions: `ar_invoice_exception_get`, `ar_invoice_exception_history`, `ar_invoice_exception_command`, `ar_invoice_exception_command_get`. All take `p_actor`; exact invoice scope uses `p_hotel,p_account_id,p_invoice_id`. Command uses `p_input`; history uses `p_offset,p_limit`; receipt lookup uses `p_command`.

## Tasks

- [x] Write failing validation/API behavioral tests: exact scope, no client balances, unknown commands, owner checks, CSRF, reasons, strict dates, pagination, normalized replay and provider error privacy.
- [x] Implement worker/collection/exceptions.ts and worker/collection/api.ts only; no root routing/domain changes.
- [x] Draft additive `ar_invoice_exceptions` migration: metadata/history/commands; service-only writers; actor/scope/revision guards; source trigger; immutable audit; owner-bound receipts.
- [x] Add source-row → exception-row lock order to new handoff guards. Do not block an existing delivery replay or actual SENT reconciliation after a later hold/reopen. Preserve thread, package, By System and stage guards by wrapping rather than replacing their logic.
- [x] Add synthetic BEGIN/ROLLBACK SQL acceptance: source transitions, history preservation, distinct flags, command replay after later changes, cross-scope/privileges, mail new/replay/confirm behavior.
- [x] Run focused tests/typecheck; hand off exact root integration instructions. Do not apply or deploy.

## Root integration

Register `/api/invoice-exceptions` and its descendants only after the existing allowlisted Auth check; pass verified `user.id` to `invoiceExceptionsApi`. Do not expose a direct client writer. Root-owned collection/domain reads should attach `exceptions:{held,needsReview,...}` from the new exact-scope metadata, preserve source-zero current clearing, and route positive held/reopened invoices to explicit work/review states. Add safe email API messages for `email_invoice_on_hold` and `email_invoice_review_required`; these are 409 conflicts and never instructions to retry as a new send.

The migration must wrap the public claim versions in force when applied. Run it after the existing thread/By System migrations; coordinate any subsequent round-policy wrapper to retain this guard. Both `ar_mail_claim` and the retained `ar_gmail_attempt_claim` helper are guarded. Reconciliation/`ar_mail_confirm_sent` is unchanged.

CLI-created draft: `supabase/migrations/20260910135554_ar_invoice_exceptions.sql` (Supabase CLI 2.117.0). The draft has not been applied. The temporary manually named draft was replaced with this CLI-generated filename before handoff.


## Verification and handoff

- Initial API test run failed because the new module did not exist. The implemented boundary/validation suite passes **27 tests** (`node node_modules/vitest/vitest.mjs run tests/exceptions-api.test.ts`). Whole-workspace TypeScript build check passed after parallel modules became available.
- `tests/sql/invoice-exceptions-rollback.sql` is written but **not executed by this subtask**. It uses unique synthetic Hotel/Account identities inside BEGIN/ROLLBACK and has no provider calls. Root must run it after reviewing the migration. It exercises note/dispute isolation, hold/release, exact command replay after newer state, owner/scope guards, no writes on rejected revisions, positive/negative verified reopen, unknown/missing distinction, immutable billing/reminder history, new handoff rejection, existing handoff replay, and simulated SENT confirmation after both a later hold and reopen.
- The source-row update and exception metadata occur in the same transaction. Metadata does not modify workflow dates, stages, cash, invoices or OPERA. The read model exposes unverified/missing source amount as null.
- Source transitions include verified zero to any verified nonzero amount, per the bounded task; root current-debt queues should continue excluding credits/child debt from collectible counts under existing rules.
- A hold review date never releases a hold automatically. Acknowledging a reopen leaves any hold in place; releasing a hold leaves a reopen review in place. Notes/disputes alone do not create either flag.
- A mail batch is rejected if any selected exact invoice is held or needs reopen review. Existing claim replays and SENT confirmation are not blocked by an exception raised after the original handoff. Root should retain those invariants when adding round configuration.
- No migration was applied, no provider was called, no customer row was changed and no commit/deployment was made by this subtask.

## Retention integration (latest owner confirmation)

Root has the confirmed all-linked-verified-zero/no-pending-email-or-document-work + one-calendar-month retention rule. This foundation exposes authoritative `reopenedAt` even after the reopen acknowledgement, plus immutable `source_reopened` history. Use a new zero-completion observation after that reopen; do not reuse a pre-reopen deletion clock. Root safety gating must also protect `held`, nonblank `dispute`, and `needsReview` until their explicit resolution. Acknowledging review does not modify source money, release a hold, clear a dispute or change billing/reminder history. No retention deletion is performed by this module.
