# Dashboard: outstanding billing and Account-first detail

## Horizontal Hotel comparison and 61+ labels — latest owner refinement

The owner selects one Account-name comparison row with separate Hotel columns, superseding vertical Hotel groups in the two Account tables. Full THB figures remain. Each Hotel cell retains its exact Hotel + Account ID, number/type, amount/count and Invoice drill. Existing single-ledger Invoice/payment/sent details and other Hotel comparison matrices keep their scope.

Alignment is presentation-only: NFC, whitespace and case normalization of names. If any Hotel has duplicate matching names, the entire name group remains independent ledger rows; blank names never align. Alignment/ambiguity is established from the full authorized response before search, and search preserves valid counterpart cells. Missing cells and unknown amounts have different labels; confirmed zero remains zero. No cross-Hotel row-total balance is created. Sorting values uses the selected Hotel, with unavailable/missing values last.

Dynamic details render 200 complete comparison rows per increment (up to 800 Hotel cells in Khao Lak), and distinguish comparison rows from underlying Account counts. The expanded aged list retains its previous all-rows behavior; it is not claimed to share the 200-row limit. Mobile comparison scrolls horizontally with sticky Account names and consistent responsive column widths.

The owner explicitly confirms **61 days and above**, rather than 62 and above. Only visible labels change from over 60 to 61+; internal keys and the existing integer-age `age > 60` membership stay unchanged. An actual repeatable-read check confirms management totals exactly equal positive verified Invoice rows with `age >= 61` in both regions. Each region had one exactly-61-day Invoice in that sample, and those rows were included.

Verification: 70 affected unit cases and TypeScript pass. The 49-case related browser suite had 48 passes and one ambiguous test locator; the exact-locator correction passes its scoped rerun. A further mobile test passes with geometric assertions that the last Hotel heading and amount remain outside the sticky name column and inside the viewport. Root caught and verified correction of the initial mobile occlusion from the actual capture; desktop Phuket/Khao Lak and final mobile captures are inspected. Impeccable reports ten advisories and no quality warning. Astra gives functional GO; no financial/schema/backend changes accompany this refinement.

Deployed source `5a66ba63d1f91795779159760f3da448834008ca` as Worker `1303e63a-00c2-41c5-ba70-0002319b5a95`. Health verifies that source, database_verified and OPERA connected; 26 plaintext bindings, ten secret names and three workflows remain with no unintended variable changes. Signed-in production verifies one searched Account-name row with two independent KAT/TSK cells; clicking TSK loads only its three matching records and Back returns to the comparison. The visible 61+ metric matches the earlier actual Invoice reconciliation. [Application CI run 37605730602 passes](https://github.com/NTHV9/ar-workspace/actions/runs/37605730602). PR 118 is updated and remains unmerged.

## Full figures and explicit Hotel detail groups — 7 October follow-up

Owner requests full monetary figures instead of compact millions and clearer Hotel separation in the lower details. Summary amounts now use the exact existing THB formatter once, without abbreviated figures or a duplicate caption. Desktop figures scale within their cards; narrow mobile cards form one readable column.

Both the Account drill and expanded Accounts over 60 days table now have explicit Hotel row-group headings, containing the Hotel code/full name, filtered Account count and full filtered group amount. Other column sorts apply within each Hotel; Hotel sort moves entire groups. Same-name/same-ID Accounts across hotels remain separate. Group headings are excluded from the 200-Account rendering budget, with partial display labeled explicitly; search, scroll, selected-ledger routes and Back remain unchanged. Search footer counts reflect the filtered population.

The owner clarifies that this applies to every table in Dashboard, not other pages. Invoice/payment/sent detail records also receive Hotel row-group headings before pagination. Existing hotel comparison tables retain their row/column orientation with full Hotel names; the status breakdown now has explicit Hotel columns instead of a combined hotel cell. Source measures and exact identities remain unchanged.

Verification: **48 browser cases**, **64 affected unit cases**, TypeScript and the browser/production builds pass. Cases cover exact million-scale amounts at desktop/mobile, same-name Hotel groups after sorting, grouped aged/Invoice/payment/sent details, 250 Accounts/search-reset scrolling, comparison columns, retained drill filters and progressive loading. Root inspected the full desktop table and exact-number desktop/mobile captures; Astra gives GO for both Account groups and the remaining Dashboard tables. Impeccable reports advisory palette/type differences only, with no quality warnings. Captures are private under `.tmp/dashboard-hotel-groups/visual/`; the two progressive-test captures were preserved there and their tracked reference bytes restored. No backend, schema or financial-data change is part of this follow-up.

Deployed source `6385d1f7c20f6434ca1fde9c971a2ccdd826929f` as Worker `2a93974c-4d0f-492d-b809-2d764af6999e`. Fresh health matches source, database_verified and OPERA connected; readback preserves 26 plaintext bindings, ten secret names and three workflows with no unintended variable changes. Signed-in production shows full summary amounts and distinct KAT/TSK Account groups after searching and sorting by Account name. Selecting one Account produces the matching single-Hotel Invoice group; Back returns to the Account view. The existing PR 118 contains this follow-up and remains unmerged.

Status: implemented, tested and deployed; migrations 103–104 applied and verified. Signed-in production flows verified in both regions.

## Owner decisions

- Billing progress summarizes outstanding invoices from all issue dates, not only invoices issued in the selected period. Keep the selected report's as-of date explicit; do not substitute current data for an unavailable historical snapshot.
- Summary drilldowns show Accounts before their matching Invoices.
- Needs attention separates hotels clearly. Ledger identity remains Hotel + Account, even when names match.
- Simplify the Dashboard for supervisors/CFOs while preserving the existing application theme and other pages.
- Use Impeccable. The installed skill is 4.5.0; its pinned engine 0.1.11 initially had an incomplete download. The official asset was resumed, its published SHA-256 verified, and both engine-probe and Dashboard context completed successfully. No global configuration was changed.

## Diagnosis

The pictured period cohort classifies the selected day's new invoices as Billing not required. Those amounts are hidden under the previous supporting disclosure; the main billed/unbilled cells consequently appear empty despite outstanding billed/unbilled work elsewhere. Existing outstanding metrics are the appropriate source for the main progress view.

Do not reinterpret Setup needed as an exclusive financial partition: existing metric membership can overlap billed/unbilled/not-required. Present it as a separate settings notice. Credits remain signed and outside the required positive-balance completion denominator.

Read-only production baseline on 7 October: management summary for 1–7 October took 1,104.391 ms / 35,577 shared buffer hits for Phuket and 1,094.868 ms / 35,573 hits for Khao Lak, one diagnostic execution each. Neither execution read shared blocks or spilled temporary blocks. These are database timings, not browser latency or a load-test distribution.

## Implementation plan

1. Reduce repeated management-query work without changing financial membership, coverage, historical snapshots or service-only access.
2. Provide bounded Account summaries for balance drills; load matching Invoice details after choosing an Account. Retain the selected age range throughout the drill.
3. Use outstanding billed/unbilled amounts for progress, show not-required and credits visibly, and separate setup notices from the denominator.
4. Group attention items under hotel headings, preserve exact Account identity, and reduce duplicate lists through progressive disclosure.
5. Verify SQL equivalence and Account-to-Invoice reconciliation, API scope and pagination boundaries, loading/error states, keyboard use and responsive visuals. Run Impeccable's detector after the final UI changes.

## Evidence boundaries

No new email, Sheet write, OPERA accounting change, permission change or paid resource is part of this work. Production migration/deployment and measured improvements must be recorded separately after verification. Preserve all existing reference images and unrelated work.

## Implemented and verified

- Outstanding Billing uses the existing billed/unbilled open-value metrics. Not-required and signed credit amounts are visible, Setup remains an overlapping notice, and verified zero required balance has an explicit empty state rather than a misleading progress ring.
- Balance details use a protected bounded Account summary endpoint. Search/sort and continuous scrolling retain exact Hotel + Account identity; choosing an Account loads matching Invoices and provides Back to accounts. Age ranges survive the App URL whitelist and same-hotel drills retain a preselected Account. Unknown ages mark the filtered result incomplete.
- Needs attention has hotel columns on desktop and stacks on narrow screens. Account types form a compact full-width supporting section; the duplicate long aged table remains available through a search/sort disclosure. Other pages and global design tokens remain unchanged.
- First browser pass identified five failures (two age-route propagation failures, two fixture/readiness defects and one stale horizontal-only layout assertion). All are addressed with behavior-preserving regression assertions. Final focused browser suite passes **37/37**, including 250 Accounts, search/clear/continuous scrolling, exact age drill/back, exempt period invoices with outstanding billing, signed credits and unavailable coverage.
- Full unit suite passed **1,686 tests** before the final small scope/layout corrections; the final affected unit subset passes **50 tests**, and TypeScript passes. Synthetic desktop and mobile confirmation captures are private under `.tmp/dashboard-account-first/visual/`; reference PNGs are preserved.
- Impeccable context succeeds against the actual Dashboard surface brief. The manual detector found an inherited width transition; it was removed without other animation changes. Palette/type advisories describe the existing local surface variants and were not used to rewrite global configuration. Root inspected both desktop and mobile captures; Astra's final scoped review gives functional GO after checking the scroll-observer and Account-scope corrections.
- Actual PostgreSQL repeatable-read DDL rollback comparison returns identical complete management JSON in **four cases**: Phuket/Khao Lak, current 7 October and historical 6 October. The exact tested migration 103 is applied. Subsequent actual Account summaries reconcile invoice counts and amounts to the original open metrics in both regions.
- Migration 103 alone does **not** establish a live speed improvement: fresh single executions are approximately 1.17 seconds and 34,980 buffer hits, against the roughly 1.10-second baseline. Its strong synthetic result with dense reminder history is not presented as production speed. A separate measured scope-predicate optimization is under investigation.

## Measured scope optimization — migration 104

The hotel-scope SQL helper has a fixed search path and does not inline into each invoice filter. Migration 104 resolves the same hotel set once per call and uses an equality predicate against that set. Exact 103 body hashes, replacement counts and declaration guards fence the transform. It changes three readers, preserves grants and guards, and writes no financial rows.

Local full-JSON comparisons cover both readers, current/historical reports, all six hotels and regional scopes, signed credits, unknown ages, stages and pagination. Actual repeatable-read DDL rollback comparison again passes all four current/historical regional management cases. Astra approves the scoped transform; the exact tested 104 is applied.

Actual production full-RPC samples after 104:

| Scope | Initial baseline | After 104 | Shared hits before → after |
| --- | ---: | ---: | ---: |
| Phuket | 1,104.391 ms | 330.504 ms | 35,577 → 11,896 |
| Khao Lak | 1,094.868 ms | 208.772 ms | 35,573 → 16,751 |

No shared-block read or temporary spill was recorded in these samples. These single diagnostic executions support improvement in this Database path, not a browser latency SLA or peak-load guarantee. Production source updates continued during the broader investigation; exact equivalence was separately tested inside repeatable-read transactions.

## Deployment and actual use

- Application source `b8c64d4e12d190da83c3ffb30ba6ed35b0241807` is deployed as Worker `fd07c723-535a-4e16-862b-a4e9387a09ee`. Health reports status ok, database_verified, OPERA connected and the exact source. Twenty-six plaintext bindings, ten secret names and three workflows remain, with no unintended variable changes or new QA routes.
- Signed-in Phuket shows populated outstanding billing figures and separate not-required/credits. Outstanding opens 71 Accounts; selecting one exact Hotel + Account opens its 578 matching Invoice records, with continuous rendering and a working return to Accounts. These are point-in-time UI observations, not static fixtures or permanent counts.
- Signed-in Khao Lak shows its four Hotel headings. Its positive balances currently require billing-rule setup, rather than containing verified required-billing membership. The empty progress message therefore explicitly reads **Billing rules need setup**, preserving actual zero billed/unbilled figures and visible setup totals. A 909-invoice synthetic regression, zero-setup and unknown cases pass; no actual settings or dates are fabricated. Actual counts continue changing with normal source refresh.
- [PR 118](https://github.com/NTHV9/ar-workspace/pull/118) is attached and stacked on the tracker integration branch; it is not merged. The main implementation [CI run 37585973933](https://github.com/NTHV9/ar-workspace/actions/runs/37585973933) passes. The final small setup-copy correction has five passing affected unit cases, TypeScript and a fresh production build; its new CI run was pending at this recording.
- The normal production Dashboard tab is left available. No new emails or customer-file mutations were required for verification.
