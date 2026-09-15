# System regression audit — 15 September 2026

Scope: another complete application audit after the six-hotel and presentation changes. Baseline `7b35287ac8719f1b862495f7c026e800112a69c6`. Customer records, provider tokens and native customer files are excluded from this report and repository evidence.

## Confirmed findings and fixes

| Finding | User impact | Repair and evidence |
|---|---|---|
| Collections retained a foreign account when changing hotel | Account selector appeared to show All while a hidden URL filter removed valid work | Clear foreign account/focus on explicit hotel change; preserve the matching hotel and All scope. Reproduced for Phuket and Khao Lak; regional regression passes. |
| Collection KPI navigation retained a conflicting latest-sent filter | A KPI with work opened an empty table | KPI navigation clears the conflicting filter to match the KPI scope. Failing reproduction turned green. |
| Sign out bypassed unsaved-work checks | Unsaved Templates or Account settings could disappear without warning | Apply existing dirty-state checks before logout. Cancel does not issue logout or lose inputs; clean pages exit directly. Tests cover both editors and a pending logout. |
| Expired email files looked temporarily unavailable | The user received retry guidance for a file no longer available | Return 410 for verified expiry and explain fresh document preparation or reattaching the original supplemental file. Other errors and unsaved email content remain unchanged. |

Collections also stopped re-reading the same catalog on local filter/sort changes. Catalog memoization retains owner/region boundaries; token, publication and explicit reload paths still refresh.

## Coverage

| Area | Verification |
|---|---|
| Core logic and APIs | 1,194 unit tests passed after repairs; TypeScript, production build and public-asset validation passed. |
| Complete browser inventory | Initial full run: 449 cases across deployed assets and local PDF/editor harnesses; 446 passed, three failures referenced retired Portfolio selectors. Updated assertions preserve lighting, contrast, viewport and paper checks. Final inventory: all 461 unique scenarios passed across the full run and targeted recovery described below. |
| Collections and logout | Collection suite 14/14; logout suite 4/4, all against actual components with synthetic service responses. |
| Email file expiry | API and browser regressions cover verified expiry versus ordinary failures, editable message preservation and retained attachment state. |
| Database | All 78 migrations and 33 registered rollback suites replayed in disposable local PostgreSQL. Synthetic dump/restore fingerprints matched and the server stopped. No live database export. |
| Live application | Existing authenticated session opened Dashboard, Portfolio, Collections, Reports, Remittances, Templates, Storage and Current Aging. Checked both regions and source refresh completion; no observed page error. |
| Live data | Application Portfolio, current Dashboard and Aging invoice counts reconciled across all six hotels, using their actual readers and including nonzero root credits. Account/Aging net amounts and invoice sums have distinct source bases; one source account includes an Aging credit outside the observed invoice balances. No amount was rewritten to force agreement. |
| Live services | Public health/database and 19 unauthenticated boundaries passed. Existing Drive destination reverified as Restricted. File budget is active with no pending upload reservations; technical log cleanup reported successful maintenance. Six current OPERA refreshes succeeded; no expired active leases were found. |

Historical reference screenshots are retained unchanged. Newly generated synthetic captures remain in the private audit workspace. Independent review found no remaining defect in the final repair scope.

## Improvements and practical limits

- The scheduled financial-history queue remains slow: some hotels wait behind earlier work. A running job was progressing, with valid leases. This is a performance follow-up; no concurrency, paid capacity or history policy was changed by this audit.
- Some Khao Lak accounts still require their deliberately separate billing/credit-term/recipient setup. The live queue labels this work as Setup needed. These business settings need owner input, not guessed defaults or copied Phuket settings.
- The source-level account credit noted above should be explained separately from invoice totals if a future UI needs reconciliation details. It is not evidence of a changed invoice amount or a reason to alter OPERA values.
- This run did not recreate retired acceptance schemas, issue new real Gmail sends, create Drive test files, reset passwords or change customer settings. Sending/reply handling, authentication recovery, PDF edits, supplemental uploads and retention failure paths were exercised with regression fixtures. The prior audit's real-provider sends are historical evidence, not repeated claims for this run.
- A passing audit covers the exercised scenarios and observed service state; it is not a guarantee that every future source response or interaction is defect-free.

## Release verification

Deployed source `b5bc85191e5a4df9fed3a883bb942d8ee2f226ad`, Worker `75c61bd8-8af0-4fe5-8823-e4d613c73939`. Health/database and all 19 anonymous boundary checks passed on that source. A signed-in live Collections check confirmed a cross-hotel account filter clears and the new hotel's work remains visible.

The full final browser inventory ran 461 cases. It passed 446 immediately; 15 could not navigate during a browser/network interruption (`ERR_NETWORK_IO_SUSPENDED` on localhost and `ERR_INTERNET_DISCONNECTED` on the deployed site). Once connectivity was healthy, the unchanged source passed all 15 in the targeted recovery run. These failures are retained as evidence; no application patch or assertion relaxation was used to suppress them.

All 461 unique cases therefore have passing evidence on the release, including the new regressions. Original reference screenshots remain untouched. Integration: [PR43](https://github.com/NTHV9/ar-workspace/pull/43).
