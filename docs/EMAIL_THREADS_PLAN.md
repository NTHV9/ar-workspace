# Gmail Threads Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development for the independent backend and UI tasks, then review the complete increment.

**Goal:** Explicit thread selection, safe Gmail reply handoff, and read-only conversation review on the deployed app.
**Architecture:** Existing authenticated Worker and service-only Supabase writers store a draft-bound provider selection. Gmail remains the conversation source. React reuses the approved Email Composer layout.
**Tech Stack:** React/Vite/TypeScript, Cloudflare Workers, Supabase PostgreSQL, Gmail API.
**Spec:** [EMAIL_THREADS_DESIGN.md](EMAIL_THREADS_DESIGN.md).

## Global constraints

Owner-designated workspace; existing codex/opera-refresh branch; no customer sends, no OPERA ledger writes, no auto-send, no data deletion, no wider OAuth scopes. Synthetic fixtures/screenshots only in Git. Existing Gmail dedup/SENT proof and By System billing guards remain in force. No changes to old Google resources.

## Task 1 — Worker, database and sent evidence

Files: worker/email/threads.ts (new), shared.ts, api.ts, mime.ts, gmail-draft.ts, delivery.ts, sent-evidence.ts; new ar_email_threads migration; tests/email-threads.test.ts, tests/sql/email-threads-rollback.sql plus existing mail tests.
Consumes existing EmailDraft/Recipients/Google OAuth and the shared src/email/threads.ts contract. Produces the three routes specified in the design and provider-verified ThreadChoice on EmailDraft.

- [x] Write failing behavioral tests before implementation. Include malformed/duplicate RFC IDs, CRLF injection, nonparticipating recipient, thread ID mismatch, missing parent, duplicate provider IDs, paginated list and conversation, backend owner/revision/pending-handoff guards, wrong-thread SENT rejection, and unchanged new-message behavior.
- [x] Implement metadata-only Google readers using googleJson, narrow validated URLs/IDs, 10-thread search pages and 50-message display pages. Use provider nextPageToken and explicitly expose nextMessageOffset. Empty/unavailable are distinct.
- [x] Add private selection data and service-only RPCs under existing owner/revision lock discipline. Add expected thread comparison to the atomic delivery claim; no direct client writer. Synthetic SQL checks run inside BEGIN/ROLLBACK and never send provider requests.
- [x] Add validated reply headers to MIME and threadId to both Gmail draft/send requests. Revalidate parent and participants before preparing send. Verify thread/header evidence before recording actual sent. Preserve existing sent evidence and no-duplicate behavior.
- [x] Extend the generic diagnostic to reply only to an existing verified synthetic test delivery with the same recipient hash, recording no account/KPI events. This is a bounded real-provider proof of the same threading path.
- [x] Run focused tests and typecheck; report changed files and any limitations for review. Do not apply migrations, deploy, commit or send mail from the subtask.

## Task 2 — Composer thread chooser and conversation review

Files: src/email/ThreadChooser.tsx and thread-chooser.css (new), src/EmailComposer.tsx; tests/browser/email-threads.spec.ts. Preserve the reference email-composer-v1.png and incumbent fonts/layout.
Consumes EmailDraft.thread and the routes/models above. Produces a reusable chooser with callbacks to restore an updated EmailDraft and propagate busy state to its composer.

- [x] Add synthetic browser cases for paginated search/preview, explicit confirmation, selected subject adoption, clear-selection, dirty-state preservation, backend failures, wrong revision, cancellation, and mobile layout.
- [x] Replace disabled Thread choice placeholder with new/existing choices. Require saved message and explicit Gmail connection. Preview plain snippets as text; no HTML insertion, auto-images, recipient replacement or external navigation except validated Gmail link.
- [x] Choosing a thread shows exact account scope/participants/subject and confirms before POST. Show selected state and read-only subject; choosing new email clears selection explicitly. Subject changes via template must not silently invalidate a selected thread.
- [x] Read/refresh the conversation with clear incoming/outgoing/unknown and exact reply-reference evidence. Paginate messages. Explain that replies do not change balances or collection timing.
- [x] Verify screenshots at 1440x900 and 1280x800 plus a narrow viewport; only synthetic data enters evidence. Run focused browser cases, typecheck and self-review. No deploy/commit/provider sends.

## Task 3 — Integration, live validation and handoff

- [ ] Review both implementations together against the design; resolve load-bearing findings and re-run relevant tests.
- [ ] Inspect live schema for collisions, apply only the new migration, run synthetic rollback SQL. Check anonymous rejection and client grants.
- [ ] Build/typecheck/unit/browser tests, inspect synthetic screenshots and staged files for secrets/customer/test-recipient data. Push only to NTHV9/ar-workspace after remote/visibility check.
- [ ] Deploy to existing Worker preserving secrets/workflow/cron. Verify health SHA, authenticated route behavior and anonymous 401.
- [ ] Send a generic diagnostic reply to the existing synthetic test conversation using only the current authorized recipient. Verify Gmail thread/header/SENT and zero business events. If an inbound reply requires the owner, prepare the exact test and report that limit without claiming it passed.
- [ ] Record source/deployment/migration/results/remaining limits in PROJECT_STATUS and return a reviewable milestone.

## Execution ledger

- 2026-09-10: design and contracts established. Owner's existing approval to continue covers this implementation; no repeated per-file approvals. Work in the explicitly designated existing workspace, preserving the current branch and legacy resources.

- Pre-release: migration ar_email_threads applied as management version 20260910112014; synthetic rollback checks passed with no leftover synthetic jobs, private choices or business events. Independent reviews closed subject/race/history/RFC/hash issues. Full 342 unit tests, Typecheck/Build and 20 thread browser cases passed; 24 existing email regressions passed. Live provider validation follows deployment.
