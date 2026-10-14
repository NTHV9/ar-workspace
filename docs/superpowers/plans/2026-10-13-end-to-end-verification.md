# End-to-end verification plan

> Execute inline in this session using the already approved five-part scope. Record evidence separately for live services, synthetic integration and simulated browser boundaries. Do not infer complete live coverage from unit tests.

**Goal:** Verify scheduled tracker recurrence, date writeback, reviewed PDF/email delivery, interrupted/concurrent work and regional access without creating customer business activity.

**Architecture:** Observe the normal deployed system without manually triggering tracker checks during the recurrence window. Exercise mutations with isolated synthetic fixtures through current application/SQL/provider code; keep originals, financial ledgers and staff permissions unchanged.

**Tech stack:** Cloudflare Worker, Supabase/PostgreSQL, Google Sheets/Drive/Gmail, React browser tests, Vitest.

**Spec:** Owner-approved checklist in this conversation; `docs/DECISIONS_AND_OPEN_ITEMS.md`, `docs/TRACKER_SYNC_VALIDATION_20261006.md`, `docs/TRACKER_READ_RECOVERY_20261013.md`.

## Constraints and review focus

- No customer email, artificial business Sent, original-sheet test rows, permission expansion or guessed conflict resolution. One-time recipient stays outside Git and permanent configuration.
- Google credentials remain server-side; real employee login must be performed by the owner when no authorized session is available.
- Preserve first actual billing date, Follow 1–3 mapping, per-hotel Account/Invoice identity, exact reviewed bytes and duplicate-command handling.
- Exercise repeated scheduled runs, ambiguous identity, same-field concurrent edits, lost responses/session renewal and scanned-PDF rendering. Report any untested external boundary explicitly.

## Task 1 — Scheduled tracker recurrence and differences

- [x] Capture baseline status for both regions and observe at least three new successful cycles without Check changes.
- [x] Correlate successful timestamps with scheduled Worker invocations; retain only sanitized event/time/status evidence.
- [x] Read all difference pages by category; report counts/reasons and representative failure classes without changing a conflict value.

## Task 2 — Billing and Follow-up date chain

- [x] Inspect and refresh the existing isolated joined proof in `.tmp/tracker-sync/joined-local/` against current code/schema.
- [x] Verify R first-billing and U/V/W Follow 1–3 for both regional adapters, exact identity, replay, unrelated-cell fidelity, first-billing preservation and uncertain/concurrent writes.
- [x] Distinguish current synthetic SQL/provider-boundary evidence from actual Google-provider operations; do not claim a customer send or original-cell write.

## Task 3 — PDF to email

- [x] Build current isolated browser assets; test multiple invoices, an image-only scan, filename changes, editor modifications and exact reviewed-byte handoff.
- [x] Exercise two simultaneous actual test-send requests under one private command ID; both share one delivery with verified Sent/recorded=false. Keep the actual diagnostic message distinct from the manually edited PDF package, which was not cloud-saved/sent.

## Task 4 — Interruptions and concurrency

- [x] Run current conflict/retry/session/duplicate-send scenarios through the real service seams with synthetic data, including two independent sessions.
- [x] Fix only reproducible failures, with a red regression, focused verification and normal deployment/readback when required.

## Task 5 — Totals and real employee boundaries

- [x] Reconcile current summary/detail counts and amounts for each operational hotel under the same publication; retain signed credits and unknown-state distinctions.
- [x] Owner explicitly excluded real employee login retesting; the unused login tab was closed and no staff permissions changed.

## Closeout

- [x] Save `docs/END_TO_END_VERIFICATION_20261013.md` and update `docs/PROJECT_STATUS.md` with passed, failed, fixed and unavailable boundaries separately.
- [x] Preserve original artifacts and private technical receipts; clean only exact disposable test objects created by this run under their approved recovery policy.

## Recorded result

See `docs/END_TO_END_VERIFICATION_20261013.md` for the live/synthetic boundary matrix, manual PDF evidence and data-review limitations. No additional application fix was warranted by these checks.
