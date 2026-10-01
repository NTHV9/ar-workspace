---
version: 1
slug: "src-dashboard-dashboard-tsx"
primary_target: "src/dashboard/Dashboard.tsx"
related_targets: ["src/dashboard/ManagementDashboard.tsx","src/dashboard/management-dashboard.css","src/dashboard/management-data.ts","worker/dashboard/management-api.ts","worker/dashboard/management-model.ts"]
---

# Dashboard management summary

MODE: Operate / Read. Extend the established Dashboard in the Luminous AR system; code-led implementation. No new visual world or comp round.
SCOPE: CFO/supervisor summary for Phuket and Khao Lak, followed by sortable/searchable Accounts with OPERA Invoice age strictly over 60 days. Keep existing period activity and drill-downs available.
CONTENT: User-supplied Sheets show hotel/type aging comparisons, period-entry billing progress, and 61+ day Agent totals. Read both actual Sheets on 1 October; use their structure, never copy customer values or connect Sheet balances to the app.
FIRST VIEWPORT: Date/scope controls, a compact signed outstanding/billed-still-open/not-yet-billed/61+ summary, then period-entry original-value billing totals before the hotel aging table. Amounts carry visual priority; invoice counts stay beside them. Desktop shows the compact period totals within the first viewport. Mobile shows a closed filter disclosure with dates, selected scope and active-filter count.
SIGNATURE INTERACTION: Select an overdue Account ledger and open its exact Hotel + Account invoice list without disturbing report filters; search/sort the full Account population, preserve the previous position on return.
QUALITY BAR: Exact signed THB, missing not zero, no child double count; actual first billing only, unknown term/setup visible; credits remain signed and never disguise reductions. Fast database-only summary read, old source/error retry, desktop 1440 and compact 390 captures, keyboard sort/filter, no horizontal page overflow. Remittance notices never settle OPERA debt.
UNRESOLVED: None for threshold: owner confirmed OPERA Invoice age >60, separate from past Due date. Reference includes hotels outside current registry; report uses connected hotel ledgers only.
SEED KEY: inherited-cfo-sheet-summary; local extension, no concept-seed required.

## Implemented surface — 1 October 2026

The existing Dashboard shell, self-hosted Plus Jakarta Sans and Luminous AR light surfaces remain the design basis. The CFO extension uses one divided four-measure strip: navy Outstanding, neutral Billed · still open, amber Not yet billed and rose Invoice age over 60 days. Desktop values use 28px tabular figures; the strip becomes a two-column grid at 1050px and uses 18px figures at 600px. Exact money stays on one line.

A compact period-entry strip precedes the detailed comparisons. Desktop uses three parallel New invoices / Billed / Not billed measures; mobile uses aligned label/value rows with the invoice count below each value. Billing not required and Setup needed remain visible supporting totals. This local reporting treatment does not replace the global design system.

Hotel aging uses the six OPERA Invoice age ranges in one comparison table, followed by Over 90 and 61–90 not billed invoice counts. White tables have fine blue-gray dividers, pale headers and a navy Total row; signed credit figures remain visible. Narrow tables scroll inside keyboard-focusable regions, without horizontal page overflow. Account types use a compact divided summary rather than another card grid.

The continuous Account list defaults to Open · THB descending, supports Account / Hotel / Type / Invoices / Open / Not billed / Oldest sorting and Account/Hotel/type search, and opens the exact Hotel + Account 61+ invoice drill. Returning retains the report scope, list search and sort. Legacy Billing, Follow-Up and period activity live in an on-demand disclosure; a summary error without retained data opens that disclosure.

## Evidence and data boundary

Closing measures and hotel/type comparisons use verified current saved OPERA data or the selected closing-date daily snapshot. Period-entry billing totals separately use original values of eligible saved portfolio invoices whose OPERA transaction dates fall within the selected period; actual first billing through the closing date determines Billed, including externally recorded actual billing dates. Draft is never billing evidence. A historical closing snapshot does not turn the period-entry original values into a frozen historical ledger.

Strictly over 60 means OPERA Invoice age >60, independent of days after Due date. Unknown balances, age coverage or period-entry coverage show unavailable values and source notices. Signed credits remain in Outstanding and aging amounts; the aged Account list represents positive open invoices. Remittance notices do not reduce OPERA debt. Duplicate children do not increase the collection total.

Local validation recorded in [CFO Dashboard evidence](../../docs/CFO_DASHBOARD_20261001.md): 1549 unit tests, the management SQL rollback fixture and seven CFO browser cases passed. Six font-ready synthetic captures cover Phuket/Khao Lak at 1440/390 and both desktop full pages. The final money-nowrap correction is included. The scoped reviewer disposition is **ship** after the two fix batches and final ship verdict; no further design exploration is required.

Status at this documentation checkpoint: **implemented and tested locally; deployment and enablement of this extension are not yet verified**. Original design references are preserved. Synthetic capture badges are evidence scaffolding, not design rules. This extension does not canonize incumbent miniature brand lettering or uppercase metric kickers, and does not change global configuration, identity, authorization or business write/send behavior.

Final database validation: the read-only migration is applied to the existing project; source fingerprint `45e84a1bc895f7fa737d93bc42b64f9e` matches local source, with direct anonymous/authenticated execution denied. Current Phuket and Khao Lak source/age/period coverage and hotel/aged-Account/period-split reconciliation pass. Period-entry totals include signed credits and zero/cleared roots, matching the existing Invoice-entry basis. Provisional Account-type rules remain Setup Needed until Account confirmation, while actual first billing remains evidence of Billed. UI deployment is recorded in the delivery PR and PROJECT_STATUS.
