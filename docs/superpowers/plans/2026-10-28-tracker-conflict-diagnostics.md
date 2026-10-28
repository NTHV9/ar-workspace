# Tracker Conflict Attribution and Snapshot Freshness Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans; obtain an independent scoped review before release.

**Goal:** Distinguish future tracker write failures without full provider logging and prevent date writes from reusing a snapshot after a possibly committed append.

**Evidence boundary:** The actual pre-incident workbook patches all four intended blank dates successfully in memory. Historical returned conflict branches were not logged, so the exact original branch remains unproven. No Phuket append jobs existed for the observed incident; the separately reproduced append-freshness defect must not be described as its historical cause.

**Architecture:** Provider write outcomes carry only allowlisted static reason labels, mutation-started flag and optional bounded HTTP status. The existing sync stores first/latest diagnostics in private outbox metadata through a lease/owner/region-checked RPC, with no dates or provider payload. Any possibly mutating append or observed version change forces a validated reread/import before ordinary date writes. Existing Sheet authority, CAS, actual-Sent and no-duplicate controls remain intact.

**Constraints:** Do not enable global Cloudflare observability, expand credentials/plans, resend mail, weaken identity/CAS checks or change invoice balances. Diagnostics remain bounded to existing queue records and unavailable to ordinary users.

- [x] Write failing provider attribution, private recorder and append/date freshness regressions, including privacy and failed-reread cases.
- [x] Add additive private metadata/RPC and static provider diagnostics; persist them through existing sync without blocking receipt handling if diagnostic recording fails.
- [x] Refresh snapshots after any possibly mutating append and prove the date writer receives the current version; preserve frozen uncertain append intent.
- [ ] Run relevant tests, full SQL contracts, required CI and independent review.
- [ ] Deploy exact qualified source/migration while preserving existing resources; verify actual tracker state and existing dates without sending email or manufacturing a production conflict.
- [ ] Record historical limits and release evidence; remove task-created local workbook copy if permitted.

## Local qualification

- Regression tests were observed failing before implementation; final focused suite: 133 passed.
- Typecheck, production build and full unit suite: 4,934 passed, 9 intentional skips.
- PostgreSQL 17: 152 migrations, 50 rollback fixtures and registered concurrency contracts passed.
- Independent scoped review: READY after correcting unknown post-upload exception attribution and recording diagnostics after durable outcomes.
- Public build is byte-identical to the currently qualified 92-file site. Full GitHub qualification and production release remain pending.
