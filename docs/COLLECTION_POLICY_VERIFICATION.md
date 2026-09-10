# Configurable collection policy verification

Status: implemented; local/browser and hosted SQL verification passed. Worker/frontend deployment is pending at this record. The all-work Goal remains active.

## Behavior and integration

- Collection rules can add/reorder/retire stable rounds, rename labels and change calendar offsets. Exactly the last active round is terminal. The initial five approved defaults remain policy version1.
- Queue, Composer, templates and historical editing read the shared policy. New handoff pins the version shown during review; a changed policy is rejected before PDF preparation/Gmail work and again under the SQL claim lock. A previously claimed message retains its captured definition through later policy edits.
- Terminal urgency uses the captured send definition. Held/reopened work remains visible, blocks new handoff, and keeps its independent urgent flag. Retired keys remain readable in historical records.
- Reports and Account History display captured labels. Gmail's internal workflow-audit row is excluded from manual-history corrections to avoid duplication. When provider send timestamps tie, the captured per-invoice workflow revision determines the latest stage before UUID ordering.
- No new permanent policy version, business send or customer history was created for testing. Hosted policy head remains version1 after rollback checks.

## Tests executed

- Whole TypeScript check passed. Latest full local unit suite:702tests/70files (includes unenabled financial/retention foundations).
- New policy UI tested1440×900,1280×800,390×844; explicit Preview/confirmation, new round, retirement and changed interval preserved. Failure to load current policy leaves debt visible as Needs review.
- Local policy/queue/template/composer regression:22browser cases passed. Policy/queue/reports regression:17cases passed including immutable captured label after current-policy rename.
- Hosted synthetic policy rollback covers custom stages/templates, pending-version changes, old terminal confirmation, current queue snapshot fields, revision/command replay, exact actor/scope, By System, exception and thread guard preservation. Account evidence rollback covers Gmail/manual provenance and no duplicate history.
- A tied-timestamp fixture exposed random-UUID selection of the current stage; the report projection now uses captured workflow revision to break that tie. The same fixture passed after the fix.

## Applied migrations

- 20260910145824_ar_collection_policy
- 20260910153901_ar_report_stage_evidence
- 20260910154154_ar_account_history_stage_labels
- 20260910154423_ar_sent_order_tiebreak

These changes add policy/evidence metadata and guarded projections. They do not change OPERA money or reset existing billing/reminder history. References and screenshots of real customers are excluded from Git.

## Deployment method

Wrangler4.129.0 now authenticates with account/user read and Workers Scripts write scopes for the confirmed Cloudflare account. The official login stores an encrypted file with its key in Windows Credential Manager; no credential is copied into the workspace or Git. The native keyring backend1.3.0 was installed only in Wrangler's own native dependency directory. Other optional scopes remain ungranted.

The regular CLI deployment must use `--keep-vars` and the pushed source SHA. The checked-in Workflow concurrency2 preserves the deployed bound. Static `_headers` preserves the prior nosniff/frame/referrer behavior, including Google Picker origin-only referrers. A dry run succeeded; live deployment and Picker regression must still be checked.
