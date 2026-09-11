# Transient document preparation

Owner approval: 11 September 2026, remove the standalone Documents page and saved editor projects. Prepare a fresh package for each new round, review it, and continue to email. Temporary private bytes support the current attempt and retries. Retain business and delivery history.

## Global constraints

- Existing legacy jobs, Drafts, uncertain deliveries, Remittance evidence and archives keep their protection. This is not a bulk purge.
- New jobs have `lifecycle: 'transient'`; existing jobs remain `lifecycle: 'legacy'`. Completion is represented by `closed_at` and `closed_reason` (`sent` or `discarded`) without rewriting generation state or ledger history.
- New jobs never persist editor JSON. Reviewed exports remain private until the delivery is confirmed Sent. A failed or uncertain send reuses the same reviewed bytes. No automatic sending or OPERA accounting changes.
- Exact-object ownership, receipt hashes, reference checks, deletion claim/arm/observation and tombstones remain required. New cleanup must not depend on outstanding debt reaching zero; legacy retention keeps its original policy.
- By System/download-only packages remain temporary until the employee explicitly discards the finished preparation. Downloading alone does not prove actual billing. Never delete a package supporting a Gmail Draft or ambiguous send.
- Preserve existing PDF clarity, required Preview and acknowledgment, selected-only scope, button contrast, inline right Account panel and sticky selection bar.
- Work on `codex/transient-document-flow`; no force push, old-system modifications or secrets/customer evidence in Git. Root integrates, deploys and merges after checks.

## Task 1: Backend lifecycle, reviewed exports and exact cleanup

Implement Worker and Supabase migration support only; do not edit frontend files or shared documentation. Read current schema/functions first, preserve existing rows, create the migration via the pinned Supabase CLI. Do not apply hosted migrations, deploy, commit or push; root owns integration.

Contract consumed by frontend:
- Add optional typed `lifecycle?: 'legacy'|'transient'`, `closed_at?: string|null`, `closed_reason?: 'sent'|'discarded'|null` to DocumentJob. All newly created jobs via current API are transient. Legacy in-flight requests remain deduplicated safely; new completed rounds get new jobs.
- POST `/api/documents/:id/review` with `{revision, exports, acknowledged:true}` atomically validates registered exact PDF receipts, updates revision/exports/ack, and stores audit metadata without project JSON. Exact replay after a lost response returns the already-reviewed job; divergent/stale payload is rejected. No review mutation while a Draft/uncertain delivery depends on the prior revision.
- POST `/api/documents/:id/discard` explicitly closes a terminal transient preparation only if no active generation, provider Draft, pending or uncertain mail depends on it. It must be idempotent, owner checked and fenced against concurrent mail/upload/review/archive writes. Retain all metadata. Legacy jobs are not affected by this endpoint.
- Transient jobs reject project upload/save/read and Drive archive creation server-side. Closed jobs reject uploads/review/new mail/new archive operations and bytes access with a meaningful code. Existing Sent-history reading remains available.
- Confirmed Sent closes the transient job and makes its exact working files eligible for cleanup promptly. No cleanup on Draft, sending, failed, missing evidence or uncertain status. Shared references to other live work prevent deletion. Preserve remittance/legacy attachments.
- Reuse existing retention inspection/claim/arm/provider-absence process; add bounded periodic processing so tab closure cannot strand confirmed-Sent cleanup. Keep old policies intact. Provider reconciliation failures must not change Sent back to failed or allow a second send.

Tests: rollback SQL fixtures for no-project review, replay/conflict, owner denial, Draft/uncertain protection, Sent/cancel eligibility, shared references, legacy retention unchanged, race fences/tombstones. Worker tests for review/discard endpoints, bytes protection and bounded cleanup after confirmed evidence. Use synthetic fixtures only; no real customer mutation.

## Task 2: Account-centered UI and temporary review handoff

Root implements alongside backend work in nonoverlapping frontend files.
- Remove standalone Documents nav/list and route entry; keep per-job links under Account/Collections for in-progress preparation, Draft and delivery history.
- New transient editor does not load/save project JSON or expose Save draft/reopen project. Edits are in memory. Leaving with edits warns they will be discarded.
- Mandatory Preview/acknowledgment remains. `Continue to email` uploads exact reviewed PDFs, calls review endpoint, then opens Composer; no separate Save Documents step. Retry handoff uses the same uploaded receipts after an ambiguous response.
- Reviewed temporary files can be downloaded for By System. Hide Drive archive for transient jobs. Add explicit discard preparation only when backend permits; error preserves the current attempt.
- Closed preparations show retained history and explain files are no longer available; new rounds start through Account selection. Legacy Draft/recovery remains accessible without a global archive page.
- Update navigation, PDF/workspace, account history and error text; all app text English.
- Browser tests cover full synthetic select/review/continue, no project upload, failed handoff retry, mandatory preview, no Docs nav, Draft recovery and discarded/Sent states; verify 1440x900 and smaller laptop with synthetic screenshots.

## Task 3: Integration, hosted verification and closeout

- Review both tasks for spec/safety; fix material findings. Typecheck, build, unit and focused browser suites.
- Inspect hosted schema and data counts; apply additive migration to confirmed project only. Run rollback security/behavior fixtures and Supabase advisors.
- Public Git audit includes code/docs/images/tests; push feature branch, check CI, deploy exact tested commit with --keep-vars, verify health/auth and browser behavior on Cloudflare.
- Merge tested PR using expected head, verify merge tree, update PROJECT_STATUS and DECISIONS with actual implementation/test/deployment evidence and remaining limitations.

## Rulings

- The new policy applies only to jobs explicitly stamped transient. Older evidence remains under the previously approved retention rules.
- Browser closure alone cannot safely cancel a server job or Gmail attempt. Explicit discard closes unused preparation; Draft/unknown send retains exact bytes until resolved.
- No extra human permission is needed for the authorized code, migration, push, merge or deployment scope. Never infer authorization to delete unrelated stored files.
