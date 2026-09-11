# Remittance increment — verified results

## Shipped behavior

The owner confirmed one Hotel and one Account per notice. Remittances now supports a received-date/reference/source-note record, exact invoice links, an optional reported total and optional per-invoice allocations. Missing amounts remain unspecified. Reported totals count once per notice; the summary deduplicates linked invoices and their saved OPERA open balances across notices.

Pending covers all received dates. Received activity uses the selected received-date range. All records can show voided notices for audit, while summaries exclude voided records. Corrections, void/restore and evidence changes retain revision history. Old invoice identities remain visible if current source data disappears; missing/unverified values never become zero. Linked balances zero is an observation of saved OPERA data, not a cash receipt or an inferred settlement.

Supporting evidence accepts inspected static PDF, PNG and JPEG files in private Supabase Storage. Exact file IDs, hashes and revisions govern retries. Removed links retain bytes and can be restored after verification. Defaults are 10 MiB per file, 50 active files and 100 MiB retained/reserved bytes per notice. Unlinking does not free retained byte quota; restoring does not count retained bytes twice. No automatic deletion or Drive archive was enabled.

## Source, database and deployment

- Repository: public NTHV9/ar-workspace; branch codex/opera-refresh.
- Deployed source: `0eb387d5651d0d134d4df1681a8d02f0677cb9f4`.
- Worker ar-workspace deployment: `5167f983036f4d0482cc9ac614f62c96`.
- Workflow ar-workspace-refresh version: `c878bcad-207a-40e8-859c-2df8044176b9`.
- App: https://ar-workspace.ar-c82.workers.dev/?remittances=1 .
- Supabase ar-workspace / jmyvpurzmoiecpydjrci. Applied migrations: `20260910125100_ar_remittance_core`, `20260910125102_ar_remittance_commands`, `20260910125104_ar_remittance_evidence`, `20260910125107_ar_remittance_diagnostic`. Local filenames were aligned with actual management migration versions without changing their SQL.
- Existing secrets, OPERA/Gmail schedules, workflow concurrency and legacy services were preserved. No OPERA accounting write, customer email or paid add-on was performed.

## Tests actually completed

- Typecheck and frontend/Worker builds passed. Full unit suite: **490 tests / 57 files**.
- Browser tests against deployed Cloudflare source: **22 passed**, including 21 Remittance cases and the Picker referrer regression. Existing Reports → Account → Back navigation was also checked by the UI subtask.
- New paths reject unauthenticated callers before data/storage access: 13 Remittance routes, plus the six existing thread boundaries checked by the release script. The unit access test also rejects another verified email before any data RPC.
- SQL runtime tests used a dedicated synthetic Hotel/Account scope and a subtransaction that rolls back before returning. Checks covered one notice/three invoices/30,000, overlapping invoice dedup, absent allocations/total, received-date versus pending views, invoice pagination, duplicate IDs/commands, cross-hotel/child/unverified selection rejection, partial balance changes, missing source preservation, correction reasons/revisions, pending uploads, evidence hashes/replay/retained quotas, void/restore/history and source workflow isolation.
- The diagnostic scopes its assertions to its own synthetic IDs; unrelated real mail activity cannot falsely fail the test. Public writers are service-only; new tables use RLS and client write privileges are absent. Security advisor returned only informational RLS-with-no-policy notices for deliberately inaccessible private tables. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Review fixes included completed restore replay without depending on Storage availability, counting retained bytes, showing latest saved invoice links/allocations during conflict review, and internally consistent synthetic screenshots.
- Twelve exact viewport images were verified at **1440×900, 1280×800 and 390×844** for list/detail/editor/review. They contain synthetic data only. Full-page captures are private/temporary; original design references remain unchanged.
- GitHub source CI passed: https://github.com/NTHV9/ar-workspace/actions/runs/34480417511 .

## Live Browser → Worker → Supabase proof

At **20:08:22 ICT on 10 September 2026**, the deployed authenticated diagnostic completed the real database command/rollback checks, uploaded a fixed synthetic PDF to an isolated private diagnostic path, and read it back with exact byte count and SHA-256. The browser displayed Database passed and rolled back / Storage verified / Business records changed no.

Post-checks confirmed **one verified diagnostic receipt and 622 retained bytes**, with the known synthetic PDF checksum. Remittance notices, lines, command/history rows and normal notice evidence rows all remained **zero**. There were no surviving synthetic Accounts. Business sent events and workflow billing dates/reminder stages remained **zero**.

Normal notice create/edit/void/restore and evidence lifecycle were tested through browser fixtures and the real database rollback routines. The live storage proof used the isolated diagnostic path and shared storage/checksum transport. Per the owner's instruction, no customer Account was used for a persistent remittance test or customer send. This does not claim that real customer notices have already been entered and operationally reconciled.

## Remaining scope

Entry and interpretation remain explicit staff actions. There is no automatic classification of Gmail replies, OCR allocation, inferred cash receipt, auto-hold or auto-send. Cash-collected/payment-allocation metrics and full daily bill-entry coverage remain separate work requiring the source/metric decisions in DECISIONS_AND_OPEN_ITEMS. Retention/purge policy, backup restore proof and legacy Google cleanup are also separate; this increment did not silently resolve them.
