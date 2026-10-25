# Activity-driven OPERA Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reduce idle OPERA Workflow steps while keeping saved-first UI, live work and daily ingestion correct.
**Architecture:** Private expiring actor/hotel activity gates only proactive OPERA cron. Versioned ten-account steps use bounded parallel reads and staged-ID retry recovery.
**Tech Stack:** React/TypeScript, Cloudflare Workers/Workflows, private Supabase PostgreSQL functions.
**Spec:** `docs/superpowers/specs/2026-10-25-active-opera-refresh-design.md`

## Global Constraints
- Preserve 07:00/19:00 Thai runs, manual refresh, tracker/Gmail behavior, full pagination and atomic publication.
- No credentials/customer bytes in Git, tests or logs; only synthetic fixtures and aggregate evidence.
- No partial balance publication, accounting writes, automatic email, new paid service or UI redesign.

## Review Focus
- A revoked or cross-region actor cannot keep another hotel's activity alive.
- Failed activity lookup must fail closed for optional refresh without blocking tracker maintenance.
- A partial batch replay must skip staged identities without accepting unknown IDs or replacing snapshots.
- Legacy in-flight workflows retain their original durable step layout.
- Browser focus/token/region changes and background tabs must not sustain obsolete activity.

## Task 1 — Shared activity and scheduling
Files: migration from CLI; `worker/refresh/activity.ts`, `worker/index.ts`, `worker/access/scope.ts`; `tests/refresh-activity.test.ts`, `tests/reconcile-schedule.test.ts`, SQL rollback fixture.
- [x] Write and run red tests for idle/active cron, daily schedule independence, exact activity body/auth/region/Origin/hold and failure behavior.
- [x] Add service-only private table and `ar_refresh_activity_touch(actor,hotels)` / `ar_refresh_active_hotels()` functions; recheck current regional membership.
- [x] Add POST `/api/refresh/activity`, registering actor activity only for allowed hotels, without performing OPERA reads. Gate proactive cron after tracker work; daily branch bypasses activity. Read failure skips optional work, not a full fallback refresh.
- [x] Qualify SQL permissions/expiry/dedup/revocation using synthetic rollback; run focused tests green.

## Task 2 — Batched and faster verified reads
Files: `worker/refresh/accounts.ts`, `backend.ts`, `workflow.ts`; migration staged-ID helper; `tests/refresh-account-batches.test.ts` and dispatch tests.
- [x] Write/run red tests for ten-account grouping, concurrency three, replay, interrupted partial staging, failure drain, identity validation and invalid-account publication blocking.
- [x] Add `accountBatchVersion:2` only to newly dispatched normal refresh parameters; keep old instances on legacy account steps.
- [x] Add `stageRefreshAccountBatches(...)` and service-only `ar_refresh_staged_accounts(run,ids)`; retain each staged snapshot and count-only outputs. Use existing independent-read pool of three inside each bounded group.
- [x] Compare synthetic durations and durable step counts against legacy at identical account/read coverage; run focused tests green.

## Task 3 — Browser activity and saved-first behavior
Files: `src/refresh/activity.ts`, `src/App.tsx`; unit and browser tests.
- [x] Write/run red tests for immediate visible heartbeat, recent interaction, hidden/idle pause, focus resume, failed request, token/region teardown and request overlap.
- [x] Add a minute heartbeat with ten-minute idle window, server-owned six-minute lease; mount only for authorized non-review, non-recovery users. On resume request stale-on-open refresh without blocking saved data or creating per-tab jobs.
- [x] Verify actual current UI with held OPERA/background response; saved balances remain visible, publication updates later, dirty edits preserved, tracker hints independent.

## Task 4 — Review and release verification
- [x] Full unit suite, TypeScript, build, SQL rollback, focused browser checks; inspect source changes and independent review, repair material findings.
- [x] Update decisions/status with defaults, measured synthetic gains, scope and deployment evidence. Apply/deploy only to confirmed existing project/Worker after reviewed verification; read back identity/configuration/permissions and anonymous boundaries. If credentials/tools prevent deployment, report implemented/tested versus pending deployment accurately.

## Execution ledger
Owner selected this behavior directly and requested implementation; proceed inline without a second confirmation of that same direction. Existing unrelated original-checkout docs remain untouched in the managed worktree. Baseline: 1,961 unit tests pass. No activity gate or batching has been deployed yet.
