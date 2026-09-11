# Isolated PostgreSQL recovery drill

This runbook is for a **local, synthetic logical database restore**, using PostgreSQL 17.11. It never restores the live Supabase project, sends mail, contacts Drive/OPERA, or exports live customer data. A managed Supabase physical-backup restore and a real application-data recovery remain separate acceptance claims.

The owner authorized package/tool installation and isolated recovery work. Root reviewed `scripts/recovery/run-drill.ps1`, its stubs, and verification SQL before authorizing the synthetic dump mode. Live export remains blocked pending an exact reviewed table/column allowlist.

## Runtime provenance and private files

The [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/) points to EDB. The [official EDB binaries page](https://www.enterprisedb.com/download-postgresql-binaries?lang=en) linked Windows PostgreSQL 17.11 via file ID 1260491. The artifact was downloaded directly over HTTPS from:

`https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip`

- Archive size: **341,325,378 bytes**.
- Locally recorded SHA-256: **4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf**.
- Extracted only `pgsql/bin`, `pgsql/lib`, and `pgsql/share`: **1,563 files / 141,034,762 bytes**. Bundled pgAdmin/documentation were not installed.
- Both server/client report PostgreSQL **17.11**. `postgres.exe` reports **NotSigned**; no publisher SHA-256 was available on the official page. The recorded archive hash establishes repeatability after the official HTTPS acquisition, not an independent publisher signature.
- No Windows service, startup entry, global PATH change, paid resource, or PostgreSQL/container runtime outside the project-private directory was installed.

`scripts/recovery/prepare-runtime.ps1` reproduces the acquisition/extraction and verifies existing extracted files against the pinned archive rather than overwriting them. Runtime/provenance records, clusters, local password files, logs, and dumps remain under ignored `private/recovery/`. These outputs currently contain synthetic data only. Actual sensitive exports require a verified encrypted/access-controlled destination before use; this runbook does not claim that an ignored folder alone supplies encryption.

## Safety model

`run-drill.ps1` creates a fresh, uniquely named run directory, cluster, source database, and optional restore database. The only network target accepted by the PostgreSQL tools is explicit **127.0.0.1**, default port **55432**. Database names and server identity are checked. No remote connection string or input dump path is accepted.

The local superuser has a newly generated password; host authentication uses SCRAM. Child processes receive only necessary OS paths and the generated private local password file. No provider or inherited PostgreSQL credentials are passed. Tools run without visible windows. `psql -X` prevents personal startup files from affecting the drill, and errors stop execution.

Every start has a `finally` cleanup path. It verifies the run marker and resolved cluster path before stopping only that cluster, including a child created before a failed startup returned. It then verifies `pg_ctl status` and absence of a listener on the selected port. The result records actual `serverStopped`, not just whether startup was attempted. Timeout termination targets only the process tree spawned by that specific tool invocation. No cleanup deletes files or databases; private evidence remains for review.

## Local schema replay

Run from the repository in PowerShell 7:

```powershell
pwsh -NoProfile -File scripts/recovery/prepare-runtime.ps1
& scripts/recovery/run-drill.ps1 -Mode SchemaReplay
```

The baseline manifest captures 33 deployed migration names in their **actual applied order**. Each name resolves uniquely to the current repository file, so older filename timestamp differences do not cause duplicate application. The result records actual source filenames and hashes. This does not repair the production migration table or silently rename repository files.

For reviewed newer migrations, supply names explicitly:

```powershell
& scripts/recovery/run-drill.ps1 -Mode SchemaReplay `
  -AdditionalMigrationNames @(
    'ar_statement_source_policy',
    'ar_account_workspace_read',
    'ar_invoice_exceptions',
    'ar_financial_diagnostic_candidates'
  )
```

Minimal local `auth`/`storage` schemas and roles provide the dependencies needed to replay the application SQL. They include synthetic approved/unapproved identities and claim functions for RLS tests. They are **not** a full Supabase Auth, Storage, PostgREST, OAuth, or billing implementation.

Production Statement template assets are configured data, not migration seeds. The local prerequisites deliberately create synthetic template metadata sufficient for SQL job registration; they contain no rendering assets and do not prove PDF rendering recovery. Real application-data recovery must include the actual approved template configuration separately.

Existing synthetic rollback fixtures verify remittance, email-thread, and Drive receipt behavior. Additional Statement source, Account workspace, and invoice-exception fixtures run when their migrations are selected. Source rows supply actual synthetic `synced_at` values; the strict verified-source clock constraint is preserved.

## Review-gated synthetic dump and restore

Root authorized this mode after reviewing its exact local-only scope:

```powershell
& scripts/recovery/run-drill.ps1 -Mode SyntheticRestore -ApprovedSyntheticDump `
  -AdditionalMigrationNames @(
    'ar_statement_source_policy',
    'ar_account_workspace_read',
    'ar_invoice_exceptions',
    'ar_financial_diagnostic_candidates'
  )
```

The script first replays the schema and rollback fixtures, then creates persistent **synthetic** Account/Invoice settings, a reviewed document/draft, and a SQL-simulated verified SENT receipt. It uses `pg_dump --format=custom --no-owner`, retaining ACLs, against that newly created local source; `pg_restore --no-owner --exit-on-error` restores into a separate new local database. The live project is not a possible target of either command.

Verification compares Account/Invoice/settings/event counts and canonical workflow/settings/SENT hashes before and after. It repeats the same SENT confirmation and requires exactly one event and an unchanged workflow revision. It also checks denied writer privileges, RLS presence, unapproved-user read denial, and approved-user reads. No real Gmail send occurs: the persisted SENT row is explicitly a local simulation.

The private result identifies mode, migration/file hashes, passed fixtures, dump size/hash, source/restored fingerprints, and verified stop state. A schema replay alone leaves `dump: null`; only a completed `SyntheticRestore` run can prove this logical restore path.

## Live export proposal — not enabled or executed

The current scripts have **no live export mode**. Root must approve a versioned exact table/column allowlist after the completion migrations settle. The proposed groups are:

| Data group | Proposed app scope | Exclusions / review |
|---|---|---|
| Account/source/workflow | App Account/Invoice snapshots, Account settings, invoice workflow/exceptions and their histories | Customer data remains private; export is not allowed yet |
| Evidence/history | Immutable sent events, mail delivery receipts/snapshots, command/revision histories, remittances and line/file metadata | Review embedded JSON fields; do not include provider tokens or OAuth verifiers |
| Document configuration | Document jobs/files/editor manifests, upload registrations/revisions, approved Statement template assets, email template versions | Source file bytes require a separate exact-path/hash export |
| Drive references | Confirmed destination metadata, archive/command/file receipts | Omit encrypted resumable upload-session fields; no provider connection payloads |
| Operational guards | Reviewed budget, retention, and reconciliation state needed for safe recovery | Preserve uncertain operations; never infer failure from absent rows |
| Identity mapping | Local-only mapping preserving required owner UUID relationships | No live Auth sessions, passwords, refresh tokens, identities payloads, or OAuth state tables |

Never dump the entire `ar_private` schema's data as a shortcut: it contains provider connection/OAuth-state material. `pg_dump` table filters do not remove sensitive individual columns or embedded JSON fields; tables needing sanitization require a reviewed projection/export path. No live customer rows or DB dump have been downloaded by this task.

A real app-data export must be transaction-consistent, budget its remote egress first, verify the destination's protection, and preserve immutable IDs. Physical managed backup inventory is verified separately in COMPLETION_OPERATIONS_AUDIT.md. Object bytes, Google files/mail, server-side keys, and external actions are not restored by a database dump.

Before any eventual production restore, establish the separate recovery write hold and reconcile post-backup Gmail/Drive/OPERA actions. A delivery row missing from the restored DB is not proof that an email was never sent. No automatic resend, regeneration, or quota-pressure purge is allowed.

## Evidence ledger

- PostgreSQL 17.11 runtime downloaded/extracted and verified against the recorded archive fingerprint.
- Baseline **33-migration SchemaReplay passed**, with three rollback fixtures, synthetic configuration/SENT checks, and local server shutdown. Private run `run-1a6a8eb5ec06404296fd4e0d1e2d46fb`.
- **Expanded SyntheticRestore passed at 21:25:15 ICT on 10 September 2026**: 37 migrations, six rollback fixtures, actual local `pg_dump`/`pg_restore`, matching source/restored counts and workflow/settings/SENT hashes, preserved RLS/privileges, and no duplicate SENT event or workflow revision after replay. The test contained one synthetic Account, Invoice, settings row, and sent event. Private run `run-7889d9b8fd9c40b5b89cdbeb69687f5f`.
- Synthetic dump: **419,376 bytes**, SHA-256 **fc7928b2968e72ce439890c07d5ec0d387cf3df21f15cf457ddfb105c17974f7**. `serverStopped=true` was verified by `pg_ctl status` and no listener on port 55432; no service/autostart remains.
- Earlier failed private runs are retained as debugging evidence. Startup pipe handling and address formatting were corrected; strict source timestamp fixtures and explicitly synthetic Statement template prerequisites were added. No run reached a live project or exported live data. This is not a managed physical-backup restore or a real application-data recovery proof.
- **Local budget SQL verification passed at 21:29:53 ICT**: 38-migration SchemaReplay including the unapplied budget draft and seven fixtures, with all budget test changes rolled back, no dump in that run, and verified server stop. Private run `run-437f6bf4ece144a5b6050fd39b98d487`. It also exercised the final minimal child-environment allowlist.

- Latest complete schema drill: **50-migration SyntheticRestore passed at 04:42:25 ICT on 11 September 2026**. Fourteen rollback fixtures passed; actual local pg_dump/pg_restore compared synthetic settings/workflow/SENT identities and hashes, no duplicate SENT event after replay, and serverStopped=true. Dump736,546bytes; SHA-256bc185f8c9cee9aa4a20576eee4b1e68540c13e44f56114b68a7d6660f408a072. No live export, provider request or managed physical-backup restore occurred.

## Implemented recovery controls — 11 September 2026

The app now has **Storage → Operations & recovery**. The work list is paginated and links existing document/email/archive work; it shows only the latest incomplete source run per hotel. Checking existing SENT uses the original delivery ID and existing evidence verifier. It never creates a replacement delivery.

The metadata-only post-backup audit scans an explicit window of at most31days, pages through Gmail SENT, and compares X-AR-Delivery-ID/RFC Message-ID or saved Gmail provider IDs with restored database receipts. Missing receipts are shown as missing, not inserted or assumed unsent. The audit does not read message bodies/attachments, send email, change billing dates or mark invoices paid. Messages lacking both a saved receipt and an AR marker require manual mailbox review; deleted or altered provider evidence cannot be reconstructed by guessing. Gmail supports the requested metadata headers and pagination: [messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get), [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).

Before a production restore:

1. Set the server-side **OPERATIONS_WRITE_HOLD=true** on the confirmed Worker through a deployment using `--keep-vars --var OPERATIONS_WRITE_HOLD:true`; retain the intended source SHA and other bindings. This flag is outside the database being restored. It is intentionally omitted from repository defaults so ordinary `--keep-vars` deployments do not clear an active hold.
2. Verify the authenticated app shows the write-hold banner and refuses new sends, drafts, document requests/uploads, archives, refreshes and other mutations. Saved reads, authentication and explicit existing-SENT verification remain possible. Cron/new Workflow entry points are also guarded. A flag does **not** recall already-dispatched provider requests.
3. Inventory all three confirmed Workflow queues (refresh, documents, financial) and in-flight HTTP/provider commands. Let known work settle; preserve exact command/provider IDs and reconcile uncertain actions. Do not restore while old execution can still write. Termination itself is not evidence that a provider action did not occur.
4. Keep a private exact allowlist of provider actions/receipts after the selected recovery point. Perform a production restore only with its own concrete authorization; this task has not performed one.
5. After restore, retain the hold. Run the SENT audit from the recovery point through a fixed cutoff and read every page. Verify known pending deliveries through their existing evidence checker. For a missing receipt, recover its original command/snapshot from private recovery material or perform a documented manual history correction based on reviewed source evidence. Never fabricate an expected snapshot, automatically send again, or infer invoice payment from mail.
6. Reconcile exact Drive IDs/uploads, OPERA print outcomes, retention tombstones and budget reservations as well. A database restore does not restore deleted object bytes. Expired/absent files remain unavailable until independently recovered; no automatic source reprint is allowed.
7. Only after discrepancies and in-flight work are resolved, explicitly deploy `--keep-vars --var OPERATIONS_WRITE_HOLD:false` and verify normal reads and one reviewed write. No UI button silently clears the hold.

Normal runtime remains unpaused. The hold is implemented and tested with isolated requests; no production restore or temporary production outage was used to prove it. The latest source/deployment evidence is in PROJECT_STATUS.

## Final verification — 11 September 2026

- 59-migration / 19-fixture SyntheticRestore passed after retiring the disposable namespace; local dump791,013bytes, SHA-256e2b0815687ca8eb34f686e5e0740c1121f941da4b08bd96485fb6ace4ccb6574. Source/restored synthetic identities/hashes and no-duplicate SENT checks passed; server stopped.
- 60-migration / 19-fixture SchemaReplay passed after revoking all retired acceptance RPC permissions. All60 migration filenames now match hosted names/versions;20 historical filenames were renamed with unchanged SQL byte hashes. No server migration history was edited.
- Completed isolated-test Gmail receipts retain only provider ID, delivery ID and sent timestamp in the private session audit after scenario data removal. The main SENT audit labels them as isolated test receipts, so they are not mistaken for lost customer billing receipts.
- Actual provider retention was proved against20 Supabase test objects and3 Drive test files. This does not prove restoration of deleted customer bytes. Preserve this distinction when choosing a future recovery point.
