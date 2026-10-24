# Activity-driven OPERA refresh — 25 October 2026

## Accepted behavior and implementation

Owner explicitly requested five-minute OPERA checks only while in use, multiple accounts per Workflow step, retained 07:00/19:00 Thai runs, unchanged fast Sheet synchronization and saved data visible before provider updates. Implementation uses private shared actor/hotel leases, minute heartbeats only in visible recently used tabs, ten-minute interaction-idle detection and six-minute server expiry. Returning input/focus resumes stale-on-open immediately, including suspended timers. Token renewal does not reset idle time. No user-visible layout changed.

Only the proactive OPERA branch is gated. Tracker watch renewal, five-minute fallback, the latest five-second browser revision checks and bounded native projected-value probes stay independent. Those probes may dispatch tracker Workflows when changes are found; they never renew OPERA activity. Backend document/history jobs retain their own scoped provider reads. Daily ingestion and manual refresh remain available without browser activity.

New refresh instances select batching version 2: ten accounts per durable step, at most three independent accounts being read per Workflow. The existing two Workflow slots remain. Retry queries exact private staged IDs and skips completed snapshots; unknown/duplicate returned IDs fail. Legacy instances keep their prior step sequence. Full pagination, exact source identity, verified-zero handling, lease renewal, peer draining, final hotel-membership check and atomic publication remain.

## Verification

- Original local baseline: 1,961 unit tests passed. The initial checkout was older than production and was not deployed.
- Release identity: active Worker version `5ab7acc4-ffa0-4fa0-9ca3-7a1a12eb6129` is explicitly tied by the 24 October release record to source `3d71988`. Its COMMIT_SHA binding still reported older `6fdf0ae`; health SHA alone therefore did not identify the actual deployed code. Our changes were replayed onto `aff8494`, whose product source is identical to `3d71988` and whose additional documents preserve the owner's paused publisher experiment. No paused code/stash was restored.
- Latest-base full units: **4,471 tests / 330 files passed** with four workers. A prior run on an intermediate base hit the existing 5-second invoice-transfer-read test timeout; the bounded-worker full rerun passed without changing that test or its deadline.
- TypeScript, production build and existing-Worker dry-run bundle passed. Build retains the existing large-chunk warning. Temporary release config contains only COMMIT_SHA as a plain variable and keeps remote variables/secrets, avoiding stale local defaults overriding live flags. All four existing Workflow bindings and asset routing remain.
- PostgreSQL 17 local SQL fixture first detected the missing RPC, then passed shared activity, deduplication, expiry, membership revocation/region changes, ACL and staged-ID recovery after migration installation. Fixtures roll back. This uses minimal dependencies matching inspected live helper definitions; it is not a claim of full-schema replay or production rollback qualification.
- Synthetic timing with identical thirty-account source coverage: legacy **30 checkpoints / 60 source reads / 3,000 ms**, batched **3 checkpoints / 60 reads / 2,400 ms**. This is 90% fewer account checkpoints and 20% lower simulated elapsed wait, not a total-bill reduction or live OPERA speed guarantee.
- Current UI regression holds OPERA pending while saved Aging accounts remain visible, then verifies adoption of a new publication. Tracker hidden/catchup/cross-tab tests remain. The first developer-server run had two load/navigation timeouts and one obsolete new-test selector; the selector was corrected to actual Current Aging and fixture-held requests always release. The built-static six-case run passed without deleting baselines or relaxing assertions; latest-base repeat is recorded below.
- Independent review found the missed idle-between-timer-ticks wake; three new cases reproduced it RED, then all nine activity cases passed GREEN. Follow-up review of the actual newest base found no further material issues and confirmed latest tracker probing/quarantine/PDF behavior is preserved.

## Engineering decisions and limits

- Activity defaults are implementation choices, not separately claimed owner-specified numbers. Closing/hiding a tab stops heartbeats; already registered leases expire rather than canceling another person's work. An abandoned visible tab stops renewing after ten minutes; server expiry adds a short grace period.
- The first fresh snapshot still requires complete OPERA work. Existing 07:00 preparation, saved-first rendering and bounded read parallelism reduce waiting without adding an unapproved prewarm hour or publishing partial balances.
- No 500k monthly guarantee: actual use, document/history work and tracker changes share the allowance. Measure billed steps after rollout before claiming savings.

## Release status

Implemented, tested, deployed and enabled on the existing resources. Hosted migration `20261024180635_ar_refresh_activity_batches` is applied. Worker version `d95d4009-6600-4ccc-a6b2-ad6c82594217` serves source `0f96efd8fd199ac922ac3503e333a64dfeea5600`. Health returns200/database_verified, six existing anonymous boundaries and both methods of the new activity route return401. All 41 bindings other than COMMIT_SHA match their previous descriptors/plain values; four Workflows and original cron expressions remain.

Actual hosted activity touch/readback assertions pass inside a transaction that is rolled back; RLS, service-only RPC grants and denied direct activity-table inserts are verified. At01:11 ICT, activity rows/active hotels are empty and zero optional open-refresh runs were created since01:10. This is a bounded idle observation, not a claim that every future cron execution has been monitored.

All six browser cases pass against the actual deployed public assets with synthetic intercepted business APIs. The signed-in Edge browser was closed during work, so actual authenticated employee wake latency/OPERA import duration was not measured. No email, original Sheet edit or OPERA accounting write was performed for verification. Real monthly savings must be assessed from later metered usage.
