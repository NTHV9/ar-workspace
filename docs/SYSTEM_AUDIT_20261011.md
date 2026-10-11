# System audit — 11 October 2026

Owner authorized testing, repairs and synthetic mail to the recipient supplied in the conversation, without business billing/reminder history. Existing operational scope is six hotels; TSUN remains pre-opening.

## Confirmed findings and repairs

| Finding | Change | Evidence |
|---|---|---|
| A refreshed login token temporarily unmounted dirty Account Settings | Keep the previously verified grant only for the same user while renewal is checked; clear on logout, another identity or denied access | Dirty term survives actual token-refresh notification; logout/relogin, changed user, 403 and late old response regressions |
| One local save/revision notice caused two same-tab refresh events | Tag BroadcastChannel notices by JS context; ignore the originating context's duplicate | Same tab receives one event, another tab still one; old string notices remain compatible |
| Hidden tabs continued tracker revision reads | Pause periodic reads while hidden; check on return | One hidden minute adds zero requests; returning checks immediately |
| Bulk Account Type selection scanned the chosen list for every visible row | Build an exact Hotel + Account identity Set once per render | Isolated 1,500-row membership pass: about 926 ms / 2.25 million identity calls to 1.79 ms / 3,000 calls; this is not a whole-page load benchmark |
| Cache generation changed for statements affecting no rows | Migration 113 uses event-specific transition tables and skips empty affected sets | All source tables/events tested; nonempty updates, TRUNCATE and actual Sent changes still invalidate |
| Empty refresh warnings accumulated as stored rows | Migration 113 skips future empty warning records | 621,234 of 621,242 observed quality rows were empty; historical rows preserved, real warning retention and publication invariants tested |
| Identical sheet-conflict observations advanced the reviewed revision | Migration 114 updates only when the fields assigned by that conflict mode differ | Repeated content stable; changed/null/JSON content advances; stale resolution rejects and resolved history remains |

## Performance interpretation

Database inspection found 1,824 cache-generation increments in about 67 seconds and no currently valid entries among 60 entries at that observation. The cache RPC's cumulative mean since 8 September was about 1.16 seconds; this is historical telemetry, not a current-release benchmark.

Migration 113 reduces empty-statement generation writes; it does **not** suppress nonempty identical updates or guarantee cache hits between real publications. Full-row comparison was rejected after measurements showed substantial large-batch cost. The final NEW-only approach retained approximately 26.5 ms for a representative 5,000-row genuine update versus 26.6 ms before; a 1 KB-per-row stress case rose from 41.3 to 62.6 ms. Transition-table materialization has a cost and no general end-to-end speedup is claimed from that change alone.

Live authenticated request samples before release returned 200 for the main surfaces. Observed samples: management Dashboard 386–516 ms, Invoice Register pages 207–376 ms, Collections 427–916 ms, Aging membership 1.68–1.82 seconds. These are individual network samples, not percentiles or controlled before/after comparisons.

## Coverage and current evidence

- Entire unit suite: **1,832 passed both before and after the source fixes**. A fresh combined 71-case Settings, token-renewal, tracker and CFO Dashboard browser run passed. Focused PDF/email and SQL regressions also executed.
- PDF/email: **187 focused unit cases and 14 browser cases** passed, including a new image-only scan test verifying page placement, dimensions, retained pixels and no invented OCR text. No product PDF defect was reproduced.
- Two real synthetic mails, one per regional mailbox, reached verified Sent in approximately **2.9 and 3.2 seconds**. Both `mode=test`, one synthetic attachment each, no business Draft and **zero business Sent events**. Private technical receipts remain for duplicate prevention; recipient is not stored in the repository.
- Signed-in live checks: Dashboard/Credits, Aging and Collections in both regions; Register, original report-sheet links, Remittances, Templates, Storage and Account Settings search/exact hotel navigation. No production settings edited for these checks.
- Anonymous protected endpoints reject access. Read-only database audit found no anonymous privileged AR RPC grants or anonymous/authenticated private-data SELECT grants, no warning/error security-advisor findings, no invoice/workflow/default mismatch, no DRF queue rows and no sender/mailbox mismatch.
- Fresh OPERA diagnostics returned 200/read_verified for all six hotels, verified Aging configuration and passed both sampled Account normalization checks per hotel. Native Folio history still returns provider 400 for KAT/TLKL/WAKL/TLFO; TSK/TSAN lacked the sampled selector. This is the existing provider limitation on the diagnostic native-folio path, not a new failure of the current system-rendered Statement/Invoice route. No print/report generation was requested. This was sampled API validation, not an invoice-by-invoice ledger re-audit.
- Both integrations were current with no failed refreshes in the sampled preceding day. This is a sampled health check, not a guarantee of future provider availability.
- Initial broad browser attempts exposed obsolete login/fixture expectations and a wrong harness origin; those failures were not treated as production defects. Shared fixtures were corrected without weakening current authentication or source-verification rules. The maintained 183-case smoke scope is green across the initial 163 passes and corrected-case reruns (five focused layout/ring cases, ten OPERA/progressive cases, and eighteen tracker/link/short-term cases including the remaining five failures). The separate 71-case release-focused suite passed in one run. Historical full-suite attempts were stopped after fixture/retired-flow drift; this report does not certify every archived browser test.

## Database release

Both migrations passed synthetic local rollback tests and an actual-database candidate transaction. Account, Invoice, settings, Sent and tracker-conflict fingerprints remained unchanged after rolling back fixtures; original functions were restored and no synthetic Accounts remained. Exact reviewed migrations 113 and 114 were then applied. Readback confirms 53 new statement triggers, both original Sent triggers and the conflict guard, with zero synthetic Accounts or test business events.

No historical warning deletion, original-sheet writes, OPERA accounting writes, paid configuration changes, or TSUN activation were performed. Six newly started production refreshes subsequently completed, with zero failed runs and zero new empty quality rows. A later cache sample still had no valid entries; genuine publications continue to invalidate globally, so cache hit-rate improvement is not claimed. Frontend deployment and integrated verification are recorded in PROJECT_STATUS.

## Final release

Normal source `9b6c466c264cd54aaef886f0f9a9acdda60d8c3c` is deployed as Worker `6087320d-97da-4ab7-bb55-fb4324a35a3e`. Health/source and signed-in Account search/navigation pass; runtime/bindings are unchanged apart from COMMIT_SHA. Database migrations 113/114 are enabled. [Review PR 134](https://github.com/NTHV9/ar-workspace/pull/134) remains open.
