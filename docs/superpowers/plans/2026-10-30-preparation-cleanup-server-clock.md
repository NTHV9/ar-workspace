# Start exact exited-job cleanup using the authoritative server clock

Owner asks to verify that first-round files are physically removed while preparing round two. Live QA showed both rounds discarded but first-round files still waiting with retention_due; no claim phase had started. The Worker transient cleanup pre-check compares a newly assigned SQL dueAt to Date.now(), which can be frozen/behind during that request. Exact historical Worker timestamps were not logged, so the precise skew is not claimed measured.

- [x] Regression uses the real retention runner and synthetic RPC/provider boundaries: a SQL-due fresh item with a Worker clock behind by1ms/1s/5min is skipped before claim.5 tests fail,2 pass before fix.
- [x] For exact transient/approved cleanup rows, always request the SQL claim for waiting/claimed/uncertain state. SQL retains due/lease/identity/eligibility checks and wait/busy returns without provider access. Keep blocked/deleted no-op, unknown-outcome reconcile, exact job candidates and global/monthly sweep unchanged.
- [ ] Focused/full tests, independent review and required GitHub qualification before Worker deployment; preserve currently served frontend assets and live SQL migration20261030103406.
- [ ] Verify immediate first Exit cleanup and repeated real PDF preparation without sends/Sheet dates; remove exact disposable test bytes; preserve Sent facts and user work.

Already enabled separately: silent Exit App source eb3df7405cd41afb1dd02629d495b65eff2908a2/Worker2a0535f2-eb76-495a-8489-79f6cd6bff66; recreate-scope SQL source9f3ba7f6c60130be26769553d6d9371b65934085/PR157/CI1088/migration20261030103406. Three older retired queued metadata jobs remain deferred.

Local full qualification:4,973 units/9 existing skips and typecheck/build pass. Independent review READY with33 tests across three files. New real-runner tests prove SQL wait/busy ->zero provider inspection/removal and uncertain reconcile ->no second deletion. General/monthly sweep is unchanged. Live first two WAKL QA jobs were eventually cleared by ordinary maintenance; both now have zero objects/drafts/deliveries and218 Sent fingerprints remain unchanged. Immediate cleanup after this Worker patch remains unverified until deployment.
