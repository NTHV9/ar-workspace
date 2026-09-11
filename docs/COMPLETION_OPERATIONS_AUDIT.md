# Operations and recovery audit

Audit time: **10 September 2026, 20:35 ICT** (13:35 UTC). Scope: read-only provider management metadata, database schema/privileges/aggregate counts, repository recovery controls, and a proposed restore drill. No backup was restored, no customer row or provider credential was read, no external setting changed, and no paid resource was created.

The existing **Supabase Pro entitlement and actual physical-backup inventory are verified**. A successful backup restore remains **unverified**. The initial read-only snapshot contained all 33 applied migration names, but 20 older migration filenames had different version timestamps from live history. This is a recovery/deployment bookkeeping issue; normalized SQL-body comparisons matched for all 33.

This audit uses PRODUCT_SPEC sections 19–21 and the latest PROJECT_STATUS checkpoint. Earlier unchecked handoff checkboxes are historical requirements, not evidence that subsequently tested features are currently failing.

Owner clarification received before handoff: retain app-owned file bytes in both Supabase and Drive for **one calendar month after work completion**, with **no quota overage or additional charge**. Completion requires every file-linked invoice to be OPERA-verified zero and no pending email/document work. Reopened/unknown invoices or pending work at deletion time block/reset eligibility; lightweight business/sending history is preserved. No further clarification is needed for this criterion. No deletion is enabled or performed by this audit. The latest product direction is Statement renderer only, with native Statement APIs to be retired; Invoice documents remain OPERA-sourced. Those implementation changes are outside this read-only audit.

## 1. What was verified

| Area | Evidence observed during this audit | Limit of the evidence |
|---|---|---|
| Supabase project | Management connector: `ar-workspace`, ref `jmyvpurzmoiecpydjrci`, region `ap-southeast-1`, `ACTIVE_HEALTHY`; database release `17.6.1.166`, SQL server `17.6`, database size reported as 17 MB | Project health is not a successful restore test |
| Subscription | Organization `ar-katathani` returned `plan: pro` | No assumption about an additional PITR subscription |
| Included backup entitlement | Current Supabase documentation states daily backups with seven days of access on Pro | The project's individual backup timestamps/statuses were not returned by the available tools |
| Backup format expectation | Current documentation says physical backups are the default for the project's Postgres generation | Inference from the documented version rule, not a directly inspected backup record |
| Actual backup inventory | Root subsequently verified the live dashboard: physical backups at **2026-09-09 19:44:47 UTC**, **2026-09-08 19:43:47 UTC**, and **2026-09-08 13:06:35 UTC**. PITR page offers Enable: the add-on is not enabled | This is inventory evidence, not a restore. This subagent's browser surface was unavailable; root's authenticated browser supplied the verification |
| Cost controls | Root verified live billing: **Spend Cap enabled**, upcoming/projected total **$25**, one Micro project showing 48 compute hours/$0.65 fully covered by compute credits | A billing snapshot does not guarantee future organization usage or uncapped add-ons |
| Usage, root verified 20:49 ICT | Billing cycle **September 7–October 7**: uncached egress **0.032/250 GB**, cached egress **0.006/250 GB**, average Storage usage **0.004/100 GB**, MAU **2/100,000**, disk overage **0** | Dashboard warns metrics can lag by one hour. Average billable Storage usage is not current object-byte size |
| Disk infrastructure, root verified 20:50 ICT | Provisioned disk **2 GB**; total used **0.27 GB**, including DB **31.9 MB**, WAL **80 MB**, system **167.9 MB**. Spend Cap explicitly limits disk to **8 GB**; automatic expansion at 90% remains within the included 8 GB | `pg_database_size` alone does not cover WAL/system/provisioned capacity. No disk setting changed |
| Local restore tooling | `psql`, `postgres`, `pg_ctl`, `pg_dump`, `pg_restore`, `docker`, and `podman` were not found on PATH or checked conventional installation directories. WSL executable returned installation/usage help instead of a distribution inventory. The pinned Supabase CLI **2.117.0** is callable through `pnpm dlx` | No PostgreSQL/container runtime was installed. CLI availability alone does not provide a local database server |
| Database permissions | No anonymous/authenticated direct grants on inspected private tables. The only client-callable private function was `is_member`; public app exceptions were `ar_health` and authenticated `ar_validate_collection_selection` | This is a schema/privilege snapshot, not a complete penetration test |
| Security advisor | 18 informational “RLS Enabled No Policy” findings on private tables | These tables intentionally deny direct client access; the findings are not a reason to add broad read policies |
| Private file bucket | `ar-working-files.public=false`; only an authenticated SELECT policy for approved members and permitted validation/job paths; no client INSERT/UPDATE/DELETE policy observed | Worker resource limits enforce size/type; bucket-wide `file_size_limit` and MIME allowlist are null |
| Remittance files | Remittance paths are excluded from the direct authenticated Storage policy; owner RPC and checksum-verified Worker downloads govern access | No customer file bytes were downloaded during this audit |

The daily backup entitlement, physical-backup default, and exclusion of Storage object bytes are documented by [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups). Database restoration can cause downtime. A seven-day entitlement does not establish seven existing backup files or an observed recovery point objective. No 15-minute RPO is promised.

The security advisor's informational finding is explained in [Supabase's database linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## 2. Files, archives, credentials, and retention

**The app's Storage page manages the confirmed Google Drive archive destination. The working files themselves are in the private Supabase bucket `ar-working-files`. Gmail retains its own sent messages/attachments under Google's separate policies.** These are distinct stores.

Read-only Storage metadata returned:

| Prefix | Objects | Sum of metadata byte sizes |
|---|---:|---:|
| `jobs` | 79 | 10,942,295 |
| `validation` | 4 | 221,402 |
| `remittance-diagnostics` | 1 | 622 |
| Total | 84 | 11,164,319 |

These are metadata counts, not a fresh checksum scan or independent object backup. Document jobs include originals, editor saves/exports, and email working evidence. Remittance removal retains its bytes and immutable reservation; its total-byte quota includes removed/reserved files.

The saved Drive target metadata showed one verified, restricted target. There was one synthetic archive with one `read_verified=true`, `trashed` file receipt. No business archive receipt existed at this snapshot. This audit did not refresh Google permissions or read Google tokens. The prior live Drive proof is recorded in PROJECT_STATUS and DRIVE_ARCHIVE_PLAN; the current database target metadata alone does not prove Google sharing has remained unchanged since that verification.

Automatic archiving and automatic cleanup remain disabled in the inspected application. The owner has approved **one calendar month after completion** for app-owned file bytes in Supabase and Drive: every file-linked invoice must be OPERA-verified zero, with no pending email/document work. The deletion-time check must block/reset eligibility if an invoice reopens, becomes unknown, or work becomes pending. Lightweight business history and unrelated Google files are outside this byte deletion. Root will implement the separate coordinator; this audit runs no deletion. The narrow, owner-approved behavior of trashing the exact synthetic Drive test file after verification is not a general retention implementation.

Database backups contain database records and Storage metadata, not the Storage object bytes. They do not automatically preserve Google Drive files, Gmail messages, Cloudflare secrets, Google OAuth configuration, or source-control history. Physical backup availability also does not imply a directly downloadable logical dump. A separate application-data export is the practical input for an isolated local drill; see [Supabase CLI backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

Provider refresh tokens and resumable upload sessions are encrypted private records. Their recovery depends on the matching server-side encryption key or a deliberate reconnection process. A login session is not a replacement for those provider credentials. No secret values, connection payloads, auth sessions, one-time recipients, file IDs, or customer JSON/PDFs were read or placed in this report. Repository ignore rules cover `private/`, environment files, local Worker configuration, keys, and logs; the tracked-name check found no matching sensitive paths. This is not a full content-based secret scan.

## 3. Migration history alignment

Management history and the repository each contain **33 migration names**, with no name missing on either side. **13 versions match; 20 differ** as shown below. All 33 stored migration bodies have matching comparison hashes after removal of line comments, whitespace, and semicolons. That normalization check is useful evidence against accidental content omission; it is not a SQL semantic proof or a full installed-schema diff.

| Migration name | Repository version | Applied version |
|---|---|---|
| `ar_workspace_statement` | `20260909135000` | `20260909134301` |
| `ar_account_workflow` | `20260909160000` | `20260909154442` |
| `ar_email_workspace` | `20260909164000` | `20260909163151` |
| `ar_gmail_connection` | `20260909165000` | `20260909165030` |
| `ar_email_save_guard` | `20260909170000` | `20260909165532` |
| `ar_gmail_claim_guard` | `20260909170500` | `20260909165840` |
| `ar_mail_delivery` | `20260909173500` | `20260909172444` |
| `ar_mail_revision_guard` | `20260909174500` | `20260909173137` |
| `ar_mail_receipt_provenance` | `20260909180000` | `20260909174523` |
| `ar_mail_reconcile_schedule` | `20260909181500` | `20260909180437` |
| `ar_collection_queue` | `20260909182000` | `20260909180533` |
| `ar_mail_reconcile_fence` | `20260909183000` | `20260909182000` |
| `ar_supplemental_attachments` | `20260909190500` | `20260909185507` |
| `ar_test_supplemental_snapshot` | `20260909194500` | `20260909195210` |
| `ar_test_command_guard` | `20260909195000` | `20260909195329` |
| `ar_email_templates_rich` | `20260909205357` | `20260909210404` |
| `ar_activity_reports` | `20260909205630` | `20260909210438` |
| `ar_sent_evidence_immutability` | `20260909210914` | `20260909211037` |
| `ar_billing_channel` | `20260910062740` | `20260910064154` |
| `ar_drive_archive` | `20260910093801` | `20260910100854` |

There is also a version collision: repository `20260909182000` names `ar_collection_queue`, whereas live `20260909182000` names `ar_mail_reconcile_fence`. Therefore a blind `db push` or migration-history repair is inappropriate.

Proposed correction: review the name/body mapping, align repository filenames to the already-applied versions using collision-safe temporary names, then verify exact version/name sets and replay the reviewed chain into a disposable local target. Preserve installed production history. This audit did not rename files, repair history, apply SQL, or replay migrations.

The four recent remittance filenames already match the applied `20260910125100/02/04/07` versions. Repository source at inspection was commit `d526733c37be1a98ea4c4bf482fcbe666691706d`; its documentation records the deployed application source separately.

## 4. Recovery controls and their practical boundary

The current code provides useful interruption recovery:

- Refresh uses shared leases, lease renewal/fencing, scope checks, and atomic publication. Saved source errors/missing records do not become verified zero. Repository cron configuration remains OPERA 07:00/19:00 ICT and read-only Gmail reconciliation every 15 minutes.
- Document generation disables automatic retry of provider rendering. Interrupted generation can remain uncertain instead of silently generating another report and changing print history.
- Gmail commands preserve durable delivery/correlation identities. `checkDelivery` verifies actual SENT evidence and attachments; scheduler failures do not trigger resends. The reconcile batch operates only on existing unresolved delivery rows.
- Drive reserves exact remote file IDs, verifies metadata/hash, and resumes the same command/session. Remittance evidence similarly reserves immutable identities and never overwrites an existing object on retry.
- Remittance revisions/commands preserve history, and completed restore retries use saved command results without requiring Storage to be currently available.

Live aggregate observations: refresh runs were 59 succeeded/23 failed, all terminal; reconciliation runs were 81 complete; mail deliveries were five test sends marked sent; business sent events and remittance notices were both zero. Document jobs were 19 ready, three partial, one failed, and one uncertain. These historical aggregates are **not** a claim that 23 refresh failures are current outages or that uncertain document generation should be retried automatically. Last successful refresh was 20:10:24 ICT; last completed reconciliation was 20:30:26 ICT.

**A database rollback does not roll back Gmail, Drive, OPERA print history, or Cloudflare workflow instances.** No general restore-maintenance write hold was found in the reviewed app entry points. Existing `checkDelivery` requires the delivery row: it cannot independently recover every send performed after the chosen backup if the corresponding command/receipt row no longer exists. A production restore therefore needs an explicit write freeze and post-backup provider reconciliation before any new send, draft creation, archive, or document generation is enabled. This boundary is not solved merely by the regular 15-minute reconciliation schedule.

The existing real remittance rollback diagnostic and 622-byte storage proof are valuable transaction/storage checks. They are **not** backup restoration tests.

## 5. Proposed safe application-data restore drill

Status: **proposed, not executed**. The default target is a disposable local PostgreSQL 17/Supabase-compatible environment using an existing or no-charge toolchain, outside the repository, with outbound provider access denied. No paid project, branch, PITR, production restore, live credential reset, or quota overage is authorized. Confirm the export's resource impact before running it; a local target does not itself guarantee that provider reads incur no overage.

1. **Capture backup metadata without restoring.** With an available authenticated dashboard or scoped management reader, open the existing project's [Backups page](https://supabase.com/dashboard/project/jmyvpurzmoiecpydjrci/database/backups/scheduled). Record backup type, success status, timestamps, retention window, and PITR state only. Do not click Restore or enable an add-on.
2. **Prepare the local target and evidence directory.** Establish a named disposable database/container and encrypted access-controlled output directory outside Git. Verify the resolved target is local and unrelated to the live project. Use PostgreSQL 17-compatible tools, necessary extensions, Supabase roles/auth/storage schema dependencies, and synthetic auth identities. Discover CLI syntax via `--help` when installed.
3. **Prove schema rebuilding first.** Reconcile the filename/history mapping above, apply the reviewed migration chain only to the disposable target, and verify functions, triggers, views, grants, RLS, and denied client writes. Run existing synthetic rollback fixtures locally. This stage uses no customer export.
4. **Prepare a separate controlled application-data export.** A real recovery proof requires an authorized, transaction-consistent private export of app configuration, invoice/workflow state, immutable history, sent-event/delivery receipts, document/editor manifests, remittance evidence metadata, and Drive command/file receipts. Retain stable identities and relationships. Export through a credential supplied securely to the tool; never print it. Do not include provider connection/OAuth-state payloads or live auth sessions in the drill. Sanitize embedded upload-session fields, and use a documented local-only auth-identity mapping for foreign keys. A synthetic-only seed proves mechanics but must not be reported as proof that real saved configuration/workflow is recoverable.
5. **Restore only into the isolated target.** Restore the reviewed app data with provider endpoints disabled and no production secrets. Record table counts, identity/key checks, canonical per-table hashes, constraints, historical dates/stages, settings, and immutable command receipts before and after. The export should use a consistent snapshot; PostgreSQL documents `pg_dump` consistency and archive formats in its [PostgreSQL 17 reference](https://www.postgresql.org/docs/17/app-pgdump.html). A current logical export drill and a restoration of a particular managed daily backup are separate claims.
6. **Exercise recovery failure cases locally.** Verify exact command replay, stale revision rejection, missing object bytes reported as unavailable rather than regenerated, retained evidence restoration, unknown source balances remaining unknown, and no duplicate sent events. Simulate a Gmail send completed after the backup, including the harder case where its delivery row is missing. The system must keep sending blocked until that gap has been reconciled; it must not infer failure from a missing row.
7. **Prove the file boundary separately.** Begin with known synthetic files and checksum manifests. For selected real files, use a separately authorized encrypted object export and preserve exact IDs/paths/size/hash. Test unavailable bytes explicitly. Restoring Storage metadata alone does not satisfy file recovery; a Google sent attachment or edited Drive export must not be assumed identical to an original OPERA PDF.
8. **Record results and retain evidence privately.** Report elapsed restore time, chosen source time, actual loss window, rows/checksums validated, missing objects, missing external receipts, and any manual steps. Do not claim an RTO/RPO before measuring it. Keep the drill target isolated; cleanup is a separate scoped action against that exact disposable target.

For an eventual real production restore, additionally preserve a pre-restore private receipt inventory, stop mutating routes and scheduled jobs through an approved maintenance mechanism, verify the exact backup point/target, and reconcile all external actions after that point. Resume read-only verification first. Sending and other provider writes remain disabled until unresolved or missing receipts have been reviewed.

## 6. What still needs owner involvement

- Backup inventory and current Spend Cap are now verified through root's authenticated dashboard. No further owner input is needed merely to repeat that metadata check, and no password or token should be pasted into chat.
- Where not already authorized and provisioned, the owner needs to identify/accept the private encrypted location and scope for a real application-data/file export, and make any required database credential available through secure tooling. Existing authorization should be reused; the agent can prepare the disposable local runtime and reviewed commands without requesting duplicate approval.
- A future production restore requires a specific target, restore point, and downtime/write-freeze decision. That is separate from this harmless audit and the proposed local drill.
- Retention criteria are fully confirmed as stated above; no repeat permission question is needed. Gmail messages and immutable business history are not included in the byte-deletion instruction. No additional paid capacity or quota overage is authorized.

**Completion status:** read-only operations audit completed; Pro entitlement, managed physical-backup inventory, current Spend Cap, private boundaries, metadata, and the initial migration mapping verified. Application-data export/restore, object recovery drill, measured RTO/RPO, and post-restore external reconciliation are not yet verified.

### Later local drill evidence — 21:25 ICT

After this audit, the owner authorized a disposable local PostgreSQL 17 runtime, and root reviewed the scoped synthetic dump script. A **local synthetic logical restore** passed with 37 migrations, six SQL rollback fixtures, matching data hashes/counts, preserved permissions/RLS, and no duplicate SENT event on replay. The server was verified stopped; the 419,376-byte synthetic dump remains private. See RECOVERY_RUNBOOK.md. No live application data, managed physical backup, Storage object bytes, Google resources, or provider credentials were restored; those boundaries above remain explicit.
