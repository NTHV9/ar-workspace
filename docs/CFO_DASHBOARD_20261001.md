# CFO Dashboard — 1 October 2026

Status at this documentation checkpoint: **implemented and tested locally**. Deployment and enablement of this extension are **not yet verified**; the final live evidence will be recorded separately in PROJECT_STATUS.

The owner requested a Dashboard that lets supervisors/CFO see billing completed and remaining, then Accounts/Invoices older than 60 days immediately, using the supplied Sheets as a structural reference. The confirmed threshold is **OPERA Invoice age strictly >60**, independent of days after Due date. Both Sheets were read in the signed-in browser; they remain separate reference data. No actual customer values, Sheet data export or private browser captures are stored in this evidence packet.

The implementation extends the existing Luminous AR Dashboard through local code. It preserves the app identity and original reference files. The scoped reviewer requested an initial correction, then returned two passing follow-up verdicts with disposition **ship**. No further design exploration is required for this scope.

## Implemented

- The first report strip shows signed Outstanding, Billed · still open, Not yet billed and Invoice age over 60 days, with exact THB amounts and item/invoice counts.
- A compact period-entry section shows New invoices, Billed and Not billed original values, plus Billing not required and Setup needed totals. The full breakdown compares each hotel.
- Hotel aging shows all six Invoice age ranges, Outstanding, Over 90 invoice count and 61–90 not billed invoice count. Account type summaries show signed outstanding, item count and 61+ invoice count.
- A continuous Accounts over 60 days list supports Account/Hotel/type search and every visible sortable column. Default order is Open · THB descending. Each Account opens the exact Hotel + Account invoice drill; returning retains report scope, search and sort.
- Legacy Billing, Follow-Up and period activity remain available on demand. A management source failure without retained data opens the detailed Dashboard automatically. Loading, incomplete coverage, unavailable history and retained-source failures are explicit.
- The mobile filter disclosure retains dates, selected scope and active-filter count while closed. Money values stay on one line; comparison tables scroll within their own keyboard-focusable regions.

Relevant source: `src/dashboard/Dashboard.tsx`, `ManagementDashboard.tsx`, `management-dashboard.css`, `management-data.ts`, `worker/dashboard/management-api.ts`, `management-model.ts`, and the read-only migration `supabase/migrations/20261001113000_ar_management_dashboard.sql`.

## Financial basis and boundaries

Closing Outstanding and hotel/type amounts use verified current saved OPERA data or a daily closing snapshot for the selected end date. The report names its source mode and source timestamp. Missing historical snapshots remain unavailable. Signed credits remain in net outstanding and aging amounts; positive open 61+ invoices determine aged Account membership and counts. The 60-day boundary excludes age 60 and includes age 61. Duplicate child invoices do not increase the collection total.

The period-entry section is a separate saved portfolio cohort: eligible invoices with OPERA transaction dates within From/Through, valued at their original invoice amount. It includes verified cleared invoices where eligible, excludes child duplication and credit original values, and classifies actual first billing through the closing date as Billed. Actual externally recorded billing dates use the same existing workflow evidence; Draft does not count. Billing not required and Setup needed remain separate from Not billed. A selected historical daily snapshot freezes closing-balance evidence, not these saved portfolio original values; the report does not imply an immutable historical portfolio export.

Unknown is never a verified zero. Separate completeness flags guard balances, aging and period-entry coverage. The client checks hotel identities, age boundaries, duplicate Hotel + Account identities, signed range reconciliation and cohort reconciliation before displaying a complete result. Remittance/reply evidence does not reduce or settle OPERA debt.

The new API is a read-only GET over the existing actor, regional Hotel and Account scope protections. The SQL function checks the financial actor and dates, reuses existing quality/snapshot fences, and grants execution only to the backend service role. This work adds no business writes, email sending or authentication scope.

## Tested locally

- **1549 unit tests passed**, including management result validation, search/sort and API scope/query checks.
- **The SQL rollback fixture passed locally**: actor/date/ACL validation; signed ranges and partial balances; strict 60/61 boundary; credits excluded from positive aged membership; no child duplication; cleared period entries; original values distinct from open balances; identical Account IDs across hotels kept separate; missing age/credit evidence kept unknown; unavailable history and regional scope.
- **Seven CFO browser cases passed**: Phuket and Khao Lak at 1440 and 390, exact signed totals and period-entry values, continuous aged Account populations, contained table overflow, list sort/search and exact scoped drill/return, unavailable aged coverage, and visible closed mobile filter scope/count. Desktop period-entry totals fit within the first 900px viewport; mobile period money uses `white-space: nowrap`.
- Existing table/progressive behavior was checked. One Windows failure writing an existing evidence file was an evidence-file I/O failure, not an application behavior failure; this checkpoint does not claim a completely passing broader browser run from that attempt.

The six screenshots are synthetic, captured after fonts were ready and include the final money-nowrap correction:

- [Phuket desktop](../evidence/cfo-dashboard-phuket-1440.png)
- [Phuket mobile](../evidence/cfo-dashboard-phuket-390.png)
- [Phuket full desktop](../evidence/cfo-dashboard-phuket-full-1440.png)
- [Khao Lak desktop](../evidence/cfo-dashboard-khao-lak-1440.png)
- [Khao Lak mobile](../evidence/cfo-dashboard-khao-lak-390.png)
- [Khao Lak full desktop](../evidence/cfo-dashboard-khao-lak-full-1440.png)

Test sources: `tests/management-dashboard.test.ts`, `tests/sql/management-dashboard-rollback.sql`, `tests/browser/cfo-dashboard.spec.ts` and synthetic management fixtures. The screenshots demonstrate the built UI with synthetic data; they do not prove production service results.

## Current limits

The read-only SQL is installed and reconciled on the existing database. UI deployment and final verification are recorded in PROJECT_STATUS and the delivery PR. Only connected hotel ledgers are reported; hotels appearing in the Sheets outside the current registry are not introduced. Saved source coverage and source timestamps remain the report's limit, and period-entry original values retain the separate basis above.

The design pass records this local surface in `.impeccable/surfaces/src-dashboard-dashboard-tsx.md`. It does not modify global configuration, DESIGN.md or its sidecar. Synthetic capture badges, incumbent miniature brand lettering and uppercase metric kickers are not canonized as reusable rules.

Final database validation: the read-only migration is applied to the existing project; source fingerprint `45e84a1bc895f7fa737d93bc42b64f9e` matches local source, with direct anonymous/authenticated execution denied. Current Phuket and Khao Lak source/age/period coverage and hotel/aged-Account/period-split reconciliation pass. Period-entry totals include signed credits and zero/cleared roots, matching the existing Invoice-entry basis. Provisional Account-type rules remain Setup Needed until Account confirmation, while actual first billing remains evidence of Billed. UI deployment is recorded in the delivery PR and PROJECT_STATUS.
