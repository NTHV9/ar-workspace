# Storage budget and completed-file retention

Implemented for the owner-approved Worker and Supabase project. The latest deployment/enablement record is in PROJECT_STATUS.md. This is an application guard, not a claim that all provider billing is metered by the app.

## Cost boundary

- The verified Supabase Pro Spend Cap protects covered provider overages. No plan, PITR, compute or paid add-on was changed.
- App defaults: 1 GiB stored files, 2 GiB managed file transfers per Thai calendar month, 256 MiB logical database, with 20% reserved headroom.
- Storage bytes and logical DB bytes come from actual project metadata/pg_database_size. Unknown measurements block admission. DB size is not WAL/system/provisioned disk size.
- Managed file egress starts at activation. The full bounded response is charged before each request, including interrupted downloads. Auth, non-file API traffic, direct provider access and pre-activation traffic are outside this meter. It does not claim to reproduce the Supabase billing cycle or bill.
- Immutable uploads reserve space before dispatch. An uncertain result keeps its reservation. Checking a stored file verifies exact length/SHA without repeating POST. A timer never refunds the reservation.
- New work/staging receives a measured DB growth guard. Provider result settlement remains writable so a completed external action is not hidden by the app allowance.
- Every active PDF, editor, email attachment, remittance and Drive-source Storage transfer uses the shared helper. Existing ownership, selection, revision, checksum and no-duplicate checks remain.

## Retention behavior

Completion requires all linked invoices to be OPERA-verified zero and no pending document/email work. Holds, disputes, reopened/unknown source states or unresolved commands protect the files. The first observed valid completion begins one calendar month in Asia/Bangkok, with month-end clamping. Stale source checks defer deletion without resetting an otherwise unchanged completion clock.

The coordinator runs after a full OPERA refresh. It enrolls only files with app receipts, checks every shared reference, and rechecks immediately before dispatch. Cross-command transaction fences protect against new references or conflicting source publication while a deletion is armed/uncertain. Claim IDs and immutable target snapshots prevent duplicate blind deletes.

Supabase deletion uses the Storage API, never SQL deletion of Storage metadata. It verifies object UUID/path/version/length/SHA, then verifies authenticated metadata absence. Google Drive deletion checks the exact file ID, owner, restricted parent, stored receipt properties and SHA; a 404 without a durable acknowledged DELETE is unknown, not proof of deletion. An unknown outcome remains visible for reconciliation.

Only bytes are deleted. Invoice/billing/reminder/sending/remittance metadata and immutable audit history remain. Deleted files return an expired-file message; Drive receipts remain visible without a broken Open link or an automatic re-upload.

## Schema and verification

Applied migrations:

- 20260910213926_ar_operation_budgets
- 20260910213928_ar_file_retention
- 20260910213931_ar_storage_budget_integration
- 20260910213933_ar_retention_integration

All tables are private with RLS and no direct client write grants. Service-only RPCs independently validate the approved actor. No old table/data was reset or dropped.

Local PostgreSQL 17 replay passed 50 migrations and 14 rollback fixtures. Tests cover calendar boundaries, stale/unknown source, shared references, one-winner dispatch, protected concurrent writes, false absence, tombstones, quota limits, uncertain transfers and denied client access. Provider adapters have six isolated HTTP tests, including changed identities and misleading Drive 404s. The full unit suite had 749 tests/77 files before final display refinements; current results are recorded in PROJECT_STATUS.

Hosted budget rollback passed. Hosted retention rollback passed through dispatch/uncertain-state/permissions checks. Supabase correctly rejected an attempted synthetic metadata deletion in the initial fixture; that guard was not disabled. The hosted fixture was rerun without the unsupported SQL deletion. Verified afterward: no synthetic Account, budget reservation or retention item remained. Actual provider deletion verification belongs to the scoped synthetic end-to-end scenario and must be reported separately.

Local browser checks passed all 18 Storage/Drive cases at 1440, 1280 and 390 widths. Screenshots use fictional data. Reference design PNGs were not changed.

Automatic cleanup remains disabled until scoped real-provider deletion tests and remaining operational recovery checks pass. No quota-pressure purge or early deletion is permitted.
