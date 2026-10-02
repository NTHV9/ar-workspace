---
version: 1
slug: "src-dashboard-dashboard-tsx"
primary_target: "src/dashboard/Dashboard.tsx"
related_targets: ["src/dashboard/ManagementDashboard.tsx","src/dashboard/ManagementVisuals.tsx","src/dashboard/management-visuals.ts","src/dashboard/management-visuals.css","src/dashboard/management-dashboard.css","src/dashboard/management-data.ts","worker/dashboard/management-api.ts","worker/dashboard/management-model.ts"]
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


## Direction contract — Visual CFO overview, 2 October 2026
THESIS: The owner chose billing/outstanding overview and urgent Accounts together. Make the existing reporting surface visual: a billing completion diagram beside a ranked attention list, with comparable hotel aging beneath. Keep exact ledgers as drill-down content.
OWN-WORLD: Inherit Luminous AR navy, cool white, self-hosted Plus Jakarta Sans and meaningful blue/teal/amber/rose. Use spacious chart plots and flat legends rather than additional nested panels.
STORY: Understand current exposure, see progress for the selected period, then open the specific Hotel + Account invoices that need attention. Invoice age remains distinct from Past Due.
FIRST VIEWPORT: Compact period controls; a four-measure exposure strip; a wide period-billing chart with exact values left and three priority Accounts right. Secondary hotel/type comparisons follow. Existing money, unknown-data handling and date semantics remain.
FORM: Established Dashboard extension, owner-pinned overview + priority composition from the structured reply. Surface seed 52de4bfe was explored; the explicit combined preference determines hierarchy. Code-led extension of the existing shipped chart/ledger world, without replacing global identity. Signature interaction: chart hover/focus exposes exact values, hotel selection highlights its aging distribution and opens its ledger. Chart transitions respect reduced motion.
FINISH: Scoped finish verdict SHIP after the two scored fixes; implementation and synthetic local evidence documented below. The inherited DESIGN.md and .impeccable/design.json remain unchanged. This is not a new whole-surface audit or live-data verification.

## Implemented visual overview — 2 October 2026

This section supersedes the 1 October table-first composition for the management overview. The compact four-measure strip leads into a two-column billing/attention story, followed by hotel aging, a native Hotel & billing figures disclosure, Account-type proportional bars, and the continuous aged Account list. The story stacks below 850px; narrow screens retain exact values and scoped controls. Three priority rows, including their metadata, fit the checked 1440px desktop first viewport. Million-scale summary figures have visible exact THB captions; title text is supplemental.

The billing ring uses selected-period original billed value / (billed + unbilled value), with exact amounts and invoice counts beside it. Not Required, Setup needed and credits are separate supporting values, never part of that denominator. Unknown coverage and a verified zero denominator stay distinct. Priority Accounts are ordered by unbilled amount, then open amount and oldest age, with deterministic Hotel + Account ties; the top three expand to all. Invoice age >60 remains separate from Past Due date, and each Account opens its exact ledger scope.

Hotel aging uses a common signed amount scale across hotels, with credits left of zero. Hover, keyboard focus or selection reveals the exact hotel/range amount and item count; View hotel invoices opens the selected hotel's open-invoice ledger, not a range-filtered drill. Exact hotel and billing tables remain available in the disclosure. Account-type tracks compare positive amounts against the largest absolute type amount; signed exact amounts remain visible and negative values do not become positive bars.

The inherited Plus Jakarta Sans, cool-white surfaces, navy text and meaning-bearing colors remain. Local variants in management-visuals.css use muted teal (#298f91), sky (#629ed1), indigo (#6574ce), lavender (#9473b8), amber (#c28d27) and coral (#c56573) for age ranges; the priority surface is pale rose (#f5ebed), and the summary anchor is navy (#17364d). Local 14px panel corners, 4px chart tracks, 38px/27px ring figures, 30px/25px/18px summary figures and 18px/17px section titles serve this surface only. They do not replace global tokens. Data marks and priority actions stay flat; inherited panel lighting remains. Reduced-motion preferences suppress transitions and scrolling animation.

Validation: 1,574 unit tests, forced TypeScript build and production build passed; 14 CFO browser cases cover Phuket/Khao Lak at 1440/1280/390, exact chart selection, scoped drill/return, unavailable coverage, million-scale values and priority-row bounds. One detector run reported a width transition (removed) and scoped palette/type/radius advisories (recorded here). The finish reviewer marked both scored issues resolved: third priority row below the desktop fold, and exact million-scale totals available only in title text. The final SHIP verdict covers those fixes. Capture provenance and limitations: [Dashboard visual evidence](../../docs/DASHBOARD_VISUAL_20261002.md).

Status: implemented and tested locally; this visual revision is not yet deployed, merged or confirmed enabled. The real signed-in browser check is blocked by an expired Google session requiring owner sign-in. No live financial outcome is claimed. No backend, schema, authentication, email or financial-rule change. Original reference images, global DESIGN.md and its sidecar are preserved; existing global drift and test-only capture badges are not canonized as reusable design rules.
