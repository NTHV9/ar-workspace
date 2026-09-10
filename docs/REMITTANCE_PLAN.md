# Remittance Implementation Plan

> Execute with superpowers:subagent-driven-development for independent API, UI and evidence work, then review the complete increment. Root owns migrations, SQL fixtures and live deployment.

**Goal:** Staff can record and review remittances with exact invoice links, private evidence and truthful reported-versus-OPERA summaries.
**Architecture:** Existing React shell and Worker API, service-only Supabase commands, private inspected file storage. No new provider, paid resource, automatic sending or legacy dependency.
**Spec:** REMITTANCE_DESIGN.md and src/remittance/model.ts. Owner confirmed one Hotel/Account per notice.

## Task 1 — Domain validation and authenticated Worker API

Files: worker/remittance/{validation,api}.ts; tests/remittance-validation.test.ts and remittance-api.test.ts. Root integrates worker/index.ts.
- [x] Add failing cases for exact money/date/scopes, unknown amounts, allocation overflow, duplicate invoice IDs, revision/command/reason requirements, malformed paths, CSRF and missing actor.
- [x] Implement strict normalized input and query parsing. Request limit1MiB and max5000 line identities are operational guards, never silent truncation. Root SQL independently validates amounts/identities and uses command dedup.
- [x] Implement design routes against root RPC signatures and sanitized actionable errors. Evidence operations are delegated to the Task3 module. UI diagnostic shares real validation/RPC/storage helpers while keeping synthetic business rows uncommitted.
- [x] Run focused tests/typecheck and self-review. No provider mutation, deployment, migration or commit in subtask.

## Task 2 — Remittance workspace and account navigation

Files: src/remittance/{Remittances.tsx,remittance.css}; src/App.tsx; src/AccountDetail.tsx; tests/browser/remittances.spec.ts.
- [x] Preserve established visual world and English UI. Add Remittances navigation, account-scoped entry, filters/summary/record list and retained back context. Keep invoice identity fields distinct.
- [x] Implement create/edit review, scoped paginated invoice selection and optional allocations, decimal-safe totals, unknown labels and no finance mutation. Preserve edits on failures/token refresh; command IDs stay stable for retries.
- [x] Add notice detail/history and recoverable void/restore with explicit reason. Add evidence upload/retry/remove/download using current server limits. Pending uploads block conflicting edits and unsupported file errors retain user context.
- [x] Add explicit Connection test under a diagnostic URL flag, reusing authenticated API without selecting a customer account. All normal API failures show real unavailable states, never examples as fallback.
- [x] Test synthetic fixtures for counts30,000/3invoices/1notice, overlapping invoice open dedup, zero vs unknown, invalid allocations, stale revision/retry/void, upload failure and navigation. Capture/inspect1440x900,1280x800,390x844; references unchanged. No real account writes/commit/deploy.

## Task 3 — Private evidence and isolated storage diagnostic

Files: worker/remittance/{files,diagnostic}.ts; tests/remittance-files.test.ts and remittance-diagnostic.test.ts.
- [x] Reuse static PDF/PNG/JPEG inspection. Reserve file ID/hash/bytes with a private RPC before upload; retry exact IDs after uncertainty, reject conflicting contents, finish only after byte/hash read-back. Do not upsert over existing storage bytes.
- [x] Private file reads check owner, key scope and checksum; metadata removal retains bytes and tombstone. Configurable defaults:10MiB/file,50files/notice,100MiB total, with tested hard ceilings20MiB/200files/512MiB. These are explicit resource guards, not account/portfolio row caps.
- [x] Diagnostic uses fixed synthetic PDF and isolated diagnostic path/receipt; no real remittance/account record and no deletion. Return only categorical status/size/hash to authenticated UI. Reuse common storage transport/checksum code.
- [x] Run meaningful retry/conflict/ownership/redirect/inspection/hash tests and self-review. No external writes or commit in subtask.

## Task 4 — Database, review and live verification (root)

- [x] Add new notices, lines, immutable revisions, commands, file reservations and private diagnostic receipts after checking actual schema. Add service-only owner/revision RPCs and RLS/no direct client writes. Never modify OPERA or workflow values in normal routines.
- [x] Implement deduplicated summaries, historical identity snapshots and unknown/zero distinctions. Synthetic fixtures verify money/counts/edits/retries/permissions and roll back completely. A runtime diagnostic returns after a deliberately rolled-back synthetic subtransaction.
- [x] Independent review of API/UI/file/data seams; fix load-bearing findings. Build, typecheck, full unit suite and targeted browser checks with synthetic evidence.
- [x] Verify Git remote/visibility and staged privacy, Push to NTHV9/ar-workspace, deploy existing Worker with unchanged secrets/cron, run authenticated diagnostic and anonymous boundary checks on Cloudflare, confirm zero test business rows/events.
- [x] Update PROJECT_STATUS with exact source/deployment/migration/evidence, limitations and next work; return a reviewable milestone.

## Execution ledger

- 2026-09-10: Owner answered single Hotel/Account per notice. Root preflight found no remittance objects; business sent events0. Existing approved workspace/branch and application services remain the targets. Design ref pages were opened; no old business gates imported.

- Pre-release: four reviewed migrations applied with actual versions20260910125100/125102/125104/125107; synthetic SQL behavior+permissions passed and rolled back with0notice/line/synthetic-account rows. Full490unit tests andTypecheck/Build passed. Peerreview fixes cover scoped diagnostic assertions, exact restore-command replay, retained/reservedbytequota andconflict/screenshotclarity. Normal customer records were not test inputs.

- Live completion: source0eb387d5651d0d134d4df1681a8d02f0677cb9f4 deployed;22Cloudflarebrowser cases and19anonymous boundaries passed. At20:08:22ICT, database diagnostic rolledback and private622-bytePDF readback/hash verified. One isolated retained receipt; no business notice/line/history/file rows orsyntheticAccounts remain. Details inREMITTANCE_VERIFICATION.md.
