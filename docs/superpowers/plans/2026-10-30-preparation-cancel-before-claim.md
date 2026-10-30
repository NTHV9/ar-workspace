# Cancel exited preparations before their first PDF claim — implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; independent read-only review before release. The owner approved this decision and execution in chat.

**Goal:** Close explicitly exited, provably never-started preparations automatically; close the three approved old jobs without touching business history, mail or Sheet dates.

**Architecture:** A small immutable private cancellation receipt seals the exact job/file set under the existing global → actor → job → file lock order. File claiming honors that seal. Retirement finalization can distinguish never-created deterministic keys from missing/uncertain real objects; all started/unknown work retains its old protections.

**Tech stack:** Existing PostgreSQL17/Supabase, Worker TypeScript, existing SQL/concurrency qualification. No new provider resource, dependency, schedule or paid service.

**Spec:** Latest owner-approved explanation in chat; docs/DECISIONS_AND_OPEN_ITEMS.md; existing preparation retirement and document claim contracts.

## Global constraints
- Only an existing accepted Exit authority qualifies; age, queued duration, no provider instance, or missing files alone never authorize cancellation.
- Require all current and captured files still initial pending, no claim/output/upload/mail/revision/shared-reference evidence; positive proof is conservative.
- Claim-first remains generating/uncertain and may settle through the existing path. Exit-first is sealed atomically; a late worker cannot create/upload.
- Preserve original Exit receipts and audit, Sent facts, Billing/FU dates, OPERA ledger, auth, unknown-outcome protection, frontend silent Collections return and monthly retention.
- No real mail or Sheet write tests. Exact three production job IDs stay in private operational evidence, not migrations or test fixtures.

## Review focus
1. Slow queue without Exit must remain runnable, regardless of age.
2. Claim/Exit races in both real transaction orders; stale Worker snapshot must not render/upload after losing claim.
3. Generating/uncertain, known bytes, upload intents, Draft/delivery/shared references and mutated snapshots must not qualify.
4. Missing generated keys must not be relabeled as never-created; cancellation evidence immutable, exact and owner-bound.
5. Command-origin and historical accepted Exit, idempotent maintenance/receipts, active-queue exclusion and zero business-date/mail writes.

### Task 1 — Actual regression loop
- Create tests/sql/tracker-preparation-never-started-exit-rollback.sql using current marked Exit → claim API paths. Expect closed discarded and denied late claim, zero objects and no business changes.
- Run against153 current migrations in one disposable local database on the attested stopped test cluster; observe failure before implementation. Keep tests for no-Exit and claim-first unchanged.

### Task 2 — Atomic cancellation and finalization
- Create supabase/migrations/20261030120000_ar_preparation_cancel_before_claim.sql.
- Private immutable preparation_unstarted_cancellations binds owner, retirement, job, exact file IDs, capture digest and cancellation timestamp.
- ar_private.cancel_unstarted_preparation(uuid,uuid) returns boolean; called only under the existing owner/global domain and locks the job/files. It seals/makes unavailable only positively unstarted files and uses standard discard guards.
- public.ar_document_claim_file(uuid,uuid) returns the existing claimed/file DTO and never claims a sealed job.
- ar_private.preparation_finalize(uuid,uuid) invokes the cancellation check and excludes only proven never-created cancelled keys from its missing-object guard. Existing byte/unknown safeguards remain.
- Add SQL negative cases, exact no-op/replay/audit assertions and existing operations queue checks.

### Task 3 — Race and caller verification
- Create scripts/ci/verify-unstarted-preparation-concurrency.mjs for real claim-first/Exit-first sessions; register it in scripts/ci/verify-tracker-sql.mjs and add a before-migration red assertion.
- Add a stale-snapshot Worker test to existing document job tests, proving no renderer/upload after denied claim.
- Run focused/full units, SQL fixtures and real concurrency contracts, typecheck/build and independent review. Required GitHub checks must pass before live migration.

### Task 4 — Exact operational closure
- Re-read the three approved jobs; require accepted Exit, unchanged initial pending files, no objects/uploads/mail.
- Apply only the qualified migration; finalize each exact existing retirement without inventing a new employee Exit or restarting a workflow.
- Verify three discarded closures, audit receipts, denied late claims, zero stored objects and unchanged business/Sent facts. Update PROJECT_STATUS and release evidence.

- [x] Red reproduction
- [x] Implementation and focused green
- [ ] Full local qualification/review/GitHub
- [ ] Exact live closure and verification

Local qualification: clean154 migrations,52 rollback fixtures,6 real concurrency/Worker-contract groups pass. The clean runner reproduced the original before-migration failure. Real sessions observed a lock wait in both orders: Exit-first returns claimed=false and audit/closed discard; claim-first remains generating, admits its already-started peer, finishes through the original discard path, and never receives a never-started receipt. Four Worker tests cover current/stale snapshots and Invoice/Statement no-render/no-upload. Bodyless legacy and started/unknown generation safeguards remain unchanged.

Local final qualification:4,977 units/9 existing skips,typecheck/build pass; fresh read-only review READY (4 independently run Worker tests, CI script syntax checks, SQL/lock/proof review). Existing storage/shared-reference guards remain explicit; reviewer optional isolated variants were not added because the broader graph contracts and core operation/known-byte/draft negatives already protect the supported paths. Local database dropped and reused server stopped. Await required GitHub before any live DDL or the three exact closures.
