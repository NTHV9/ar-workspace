# Remaining product completion plan

> Agent execution: use subagent-driven-development with bounded file ownership, root integration and independent spec/quality review. Owner approved continuous execution, commits and real deployment; ask only unresolved business/destructive scope, not per-file permission.

**Goal:** Finish the approved product, preserve shipped behavior, verify the real deployment and record actual coverage and provider limitations.

**Architecture:** React/Vite/TypeScript and the existing new Cloudflare Worker/Workflow remain the only application runtime. Additive Supabase data/RPCs enforce permissions, atomic commands, immutable history and resource reservations. OPERA is read-only accounting; Statement is rendered here, Invoice remains native API.

**Spec:** PRODUCT_SPEC + latest DECISIONS_AND_OPEN_ITEMS. Audits: COMPLETION_DATA_AUDIT, COMPLETION_WORKFLOW_AUDIT, COMPLETION_OPERATIONS_AUDIT.

## Execution ledger

Every row requires implemented, tested, deployed and enabled evidence separately. A passing unit suite does not prove a provider call. Rows are not complete until their listed outcome has evidence.

| ID | Scope / files | Completion evidence | State |
|---|---|---|---|
| C1 | Statement source policy: DocumentRoute, documents/api/jobs, refresh/workflow, additive source guard | New Statement jobs always workspace; native request/probes rejected before provider calls; Invoice API unchanged; browser creation and package regressions | Pushed/deployed/tested in c369c84 |
| C2 | Invoice exceptions/reopen: worker/collection, additive migration, domain/Account/Queue UI | Hold/dispute/note/release/reopen acknowledgement; revision/idempotency; new handoff blocked, actual prior SENT still reconciles; totals/history retained | Pushed/deployed/tested in c369c84 |
| C3 | Versioned collection policy: shared policy, settings/template/stage pickers, claim/report guards | Add/retire/reorder/interval edits preserve historical stage/version; default timing and immediate terminal urgent; no skipped unsent stage or auto-send | Deployed and verified in e4f56a8 / 8af542f |
| C4 | Account history/external billing: account evidence API/UI, audit projection | Exact Hotel/Account paginated billing/reminder/correction history; By System link and actual staff-recorded date/reference; daily external activity distinct from Gmail | Pending |
| C5 | Financial history: worker/opera/financial-history, coverage tables/workflow, reports | Date-bounded complete history including unseen zero invoices; minimal signed receipt fields; validated current applications; date semantics explicit; atomic coverage publication | Ingestion/report deployed; full TSK published, KAT Workflow verification in progress |
| C6 | Reports: historical entries, zero/reopen observations, daily captured AR/aging, durations/over60-unbilled | Filters/drilldowns reconcile; initial import not today; observed timestamps not financial event dates; receipt and application metrics distinct | Pending |
| C7 | Account Documents & Gmail and Operations exception access | Reach existing jobs/threads, inspect uncertain handoffs, safe reviewed outcomes without resend shortcut | Pending |
| C8 | Global budget, retention and storage UI: operations, additive schema, upload/read integration | Atomic concurrent reservations; unknown usage blocks new costly work; exact eligible-file inventory; one-month policy tested; unrelated/pending/reopened/shared files protected | Budget/retention foundations local; integration/enabling pending; completion criterion confirmed |
| C9 | Recovery: migration filename alignment, included backup inventory, isolated restore and recovery write hold | No production restore; verify DB/object/provider boundaries; safe replay and post-backup Gmail reconciliation runbook; spend cap checked | Synthetic local restore passed; recovery write hold and final runbook pending |
| C10 | Mobile companion/dirty forms/Auth recovery | Desktop PDF editing boundary; narrow screens and keyboard; settings survive refresh; explicit discard; password recovery actual configuration checked | Implemented/deployed; real recovery inbox delivery and actual password change not exercised |
| C11 | Final acceptance, privacy review, push/deploy/runbook | Typecheck/build/unit/SQL/browser/security; synthetic screenshots1440/1280/390; SHA/deployment match; no real customer evidence in Git | Pending |

## First bounded change: C1

1. Add document API tests: absent source defaults workspace for statement/both; native is rejected with no RPC; invoices still use native; renderer size bound cannot be bypassed by omitting source. Run to observe failures.
2. Remove source choice from Prepare documents and state the fixed source in English. Preserve selection order, layouts and acknowledgement. No PDF layout change.
3. Enforce source in Worker creation helper/API and additive DB wrapper. Existing job history is readable; new native Statement jobs cannot be created through older service RPCs.
4. Disable native Statement research workflow flags before any network call, keeping historical evidence files. PDF Invoice probes and current-account verification continue.
5. Run targeted tests and browser creation, then typecheck. Review source/migration, apply only after live schema inspection; push/deploy with unchanged secrets and provider targets.

## Cross-task integration and safety

- Root owns shared App/index/workflow/domain interfaces; delegates create focused modules/migrations/tests. No concurrent provider migrations or commits.
- Current root is the owner-designated workspace on codex/opera-refresh; preserve existing history and public repository privacy rules.
- Every migration is reviewed against current schema and tested with synthetic rollback; no drop/reset, data clearing or RLS bypass.
- Capture financial dates separately from observation times. Do not invent application dates or reversal identities from amounts/text.
- Retention authorization applies to app-owned bytes after defined completion, not ledger/history, Gmail or arbitrary Drive files. Scope is owner-confirmed: every linked invoice verified zero, no pending document/email work, then one calendar month. Recheck at deletion; unknown/reopened sources block it.
- Native Statement research is retired by owner decision, not an unresolved delivery dependency. Non-reservation Invoice/API limits remain truthful.
- Existing template wording, threads, remittances and Drive proofs are reused; auto inbox scanning/OCR/auto-send and legacy resource cleanup are outside this completion plan.
