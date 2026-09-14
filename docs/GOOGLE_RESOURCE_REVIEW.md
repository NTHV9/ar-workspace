# Google resource cleanup review

## Completed retirement — 14 September 2026

The owner authorized deleting the retired Google Cloud AR system, corrected the protected companion task to **Detail One Shot**, and explicitly instructed deletion without a backup. No database export, secret-payload backup, or new final backup was created. Resource names and dependencies were checked against live provider metadata and the retired repository before deletion.

Deleted from `ar-project-506410`:

- Cloud Run service `opera-ar-prod-app` and its revisions; jobs `opera-ar-prod-backup`, `opera-ar-prod-backup-retention`, and `opera-ar-prod-migration`.
- Cloud SQL `opera-ar-prod-postgres`, using explicit `--no-enable-final-backup`. Deletion operation `d53f2a34-007c-40b3-9cb7-c68f00000064` completed at `2026-09-14T13:29:18.136Z`. The instance had `retainBackupsOnDelete=false`; querying instance-scoped backups after deletion returns a provider authorization error and is not used as proof of an empty backup list.
- Seven Scheduler jobs: `opera-ar-prod-gmail-maintenance`, `opera-ar-prod-v2-scheduler`, `opera-ar-prod-vault-purge`, `opera-ar-prod-hourly-refresh`, `opera-ar-prod-lifecycle-reconciliation`, `opera-ar-prod-backup`, and `opera-ar-prod-backup-retention`.
- Pub/Sub topics `opera-ar-prod-gmail` and `opera-ar-gmail-watch`, and subscription `opera-ar-prod-gmail-push`.
- Artifact Registry `opera-ar-prod-containers`, previously reporting 5,666,676,066 stored bytes.
- Thirty-two inspected `opera-ar-prod-*` secrets and the twelve retired service accounts listed in the historical inventory below. Removed 27 exact IAM memberships for those deleted identities, preserving the policy etag and every other member/audit setting.
- Workload identity pool `opera-ar-github`, whose provider allowed only the retired GitHub repository's production workflows; custom roles `operaArPubsubPlanReader` and `operaArTerraformLockManager`.
- Three old monitoring alert policies, log metric `opera-ar-prod-backup-unknown`, and budget `opera-ar-prod monthly budget`. No notification channels, monitoring dashboards, or uptime configurations remained in the project inventory.
- Bucket `opera-ar-tfstate-5d081c297841`: removed its unlocked retention/soft-delete settings for the authorized disposal, then deleted the 132 enumerated object generations under the exact `opera-ar/production/` prefix and the empty bucket. No state contents were downloaded.
- OAuth clients `OPERA AR Gmail` and `AR Collection System Web`. Google returned a transient error on the latter's first deletion attempt; a refreshed retry succeeded, and both are absent from the active Credentials listing. Google retains its normal 30-day credential recovery window.

Protected and checked:

- Both Google projects remain active. `aging-master` (943853574328) belongs to Detail One Shot/AgingMaster; its `Aging Master Desktop` client matches the protected program's configured client ID and was unchanged. No write was made in that project or to its Drive files.
- `ar-workspace`, `ar-workspace-gmail`, and `ar-workspace-picker` remain in the AR Project. The default Compute identity `208708155572-compute@developer.gserviceaccount.com` remains active, following the owner's earlier explicit instruction. Questions about its purpose did not authorize deleting it.
- Current Cloudflare/Supabase resources, Gmail, Drive files, OPERA credentials and ledger remain unchanged. Current Worker health still reports `ok`, `database_verified`, `connected`, and source `6f8c123270e0eec279ccb8eb6dca526920cd8a7c`. A signed-in live Drive folder verification passed at 20:38 ICT with Restricted sharing.
- Post-deletion provider lists are empty for Cloud Run services/jobs, Cloud SQL instances, the inspected Scheduler region, Secret Manager, Storage buckets, Artifact Registry, Pub/Sub, active workload pools, old alert policies and log metrics. The only user-managed service account left is the explicitly protected Compute identity. No VMs, disks, snapshots, external addresses, routers or BigQuery datasets were present.
- The unrelated `iron-fire-506816-h8` project was not deleted: no evidence linked it to the retired AR deployment, and billing was disabled. Project-wide APIs, billing links, Google-managed service agents and audit logs remain in place for shared/current use. Historical charges are not reversed by deleting resources.

## Historical pre-retirement review

The owner requested cleanup of old Google Cloud resources while continuing Drive integration, then explicitly protected the default Compute service account. The Credentials screen is inside the shared AR Project; it is not a list of separate projects. Do not delete the entire project because the new application's Google integrations use it.

Protected resources:

- Project ar-project-506410 while the new application's Google Login, Gmail and Drive depend on it.
- Default Compute service account 208708155572-compute@developer.gserviceaccount.com (explicit owner instruction).
- The new application's OAuth client ar-workspace-gmail and its active callbacks/secret bindings.
- OAuth client ar-workspace, whose Google UI redirect URI matches the new Supabase project callback. This is the current Google Login client.
- Any new Drive/Picker configuration created for this application.

At that earlier review, cleanup was not yet performed. Exact resource inventory and dependency evidence were required; a legacy name alone was not proof of safe deletion. The completed retirement above supersedes that pending status.

## Inventory from the Credentials screen

The new application uses the two ar-workspace OAuth clients and the new ar-workspace-picker key. A runtime source search found no Google service-account credential/impersonation references in the new Worker/frontend. This establishes separation from the listed legacy identities; it does not prove that the legacy application has stopped using them.

Historical legacy cleanup set (now deleted as recorded above):

| Kind | Exact resource name |
|---|---|
| OAuth client | OPERA AR Gmail (created August 26, 2026) |
| OAuth client | AR Collection System Web (created August 23, 2026) |
| Service account | opera-ar-prod-backup@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-drive-archive@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-drive-archive@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-drive-purge@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-drive-purge@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-gmail-push@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-gmail-push@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-migration@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-runtime@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-prod-scheduler@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-deploy@ar-project-506410.iam.gserviceaccount.com |
| Service account | opera-ar-plan@ar-project-506410.iam.gserviceaccount.com |

This credential inventory alone did not include compute/database/storage resources. The separately verified retirement above removed those legacy cloud services under the owner's later authorization. Preserve the explicitly protected default Compute service account and all current app credentials.
