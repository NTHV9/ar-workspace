# Dashboard clarity correction — 5 October 2026

The owner reported that the live Dashboard's hotel-aging title/ranges were hard to read and Billing progress text was crowded. This checkpoint records the authorized scoped correction to variant 3, its local verification and the remaining deployment boundary.

## Implemented behavior

`src/dashboard/ManagementVisuals.tsx` and `src/dashboard/management-layered.css` retain variant 3's composition and replace the center aging columns with **Invoice Aging**: six independent labeled amount/bar rows and All hotels/Hotel selection. Every range is a full-width button with a 47px source minimum height, including zero, small and credit values. Bar length never shrinks its interaction target. The local browser checks confirm all six range targets are at least 44px at 1280, 661 and 390 widths. Hotel selectors remain separate 34px/36px controls.

Hover, keyboard focus and activation select a range and reveal exact signed THB and item count. The footer opens the existing all-hotel or selected-hotel open-invoice list; it does not claim an age-range-filtered drill. Existing exact `addAmounts` sums are retained. A final count guard preserves unavailable range counts rather than interpreting missing counts as zero.

Billing progress retains the compact ring, Billed/Not billed inspection controls, exact amounts, invoice counts and accessible share label. **New invoices** is an aligned label/value row. The initially closed native **Other invoice totals** disclosure exposes Billing not required, Setup needed and applicable Credits as aligned rows. Large values wrap within their own columns. Existing billed/unbilled hover, keyboard and touch inspection remain; SVG sectors keep their actual proportions.

Observed local treatments retain self-hosted Plus Jakarta Sans, navy/cool-white surfaces, six age-range colors and 16px panels. Age labels/amounts use 12px, reducing to 11px at 480px and below; tracks use 6px with 7px row corners. The billing ring is 96px, growing to 112px above 1450px. These values describe Dashboard components and do not replace shared design tokens.

## Financial and privacy boundaries

- OPERA Invoice age >60 stays distinct from Past Due. Aged unbilled remains the billing-required unbilled subset with count and current open amount.
- Billing completion uses selected-period original billed value divided by billed + unbilled value. Other categories are supporting totals outside that denominator. Actual billing evidence remains distinct from Draft.
- Signed credits, verified-zero versus unavailable evidence, current/closing balances versus period activity, Hotel + Account identity and existing ledger scope remain explicit. Remittance does not settle OPERA debt.
- Existing runtime API paths remain. Synthetic review fixtures are isolated test data; private actual financial JSON/screenshots are not copied to the repository or public assets.
- This correction changes frontend presentation and focused browser tests. No backend, schema, authentication, email, provider credentials, retention or accounting change is part of it.

## Local evidence and raster provenance

All 14 captures below exist in `.impeccable/review/` and were generated from local browser tests with **synthetic data**, font readiness and animations disabled. They are review evidence rather than shipping application images or real customer screenshots. Synthetic Staff/test badges are evidence scaffolding.

| Capture family | Coverage |
| --- | --- |
| `clarity-dashboard-phuket-{1440,1280,390}.png` | Phuket desktop/laptop/mobile viewports |
| `clarity-dashboard-khao-lak-{1440,1280,390}.png` | Khao Lak desktop/laptop/mobile viewports |
| `clarity-dashboard-{phuket,khao-lak}-full-1440.png` | Both full desktop pages, including supporting ledger sections |
| `clarity-dashboard-millions-{1440,1280,390}.png` | Large exact THB values and long Account names |
| `clarity-billing-expanded-{1280,661,390}.png` | Full pages with large totals and Other invoice totals expanded |

The documenter inspected Phuket 1440, Khao Lak 390 and expanded billing 661 alongside the source and scope brief. Other captures were inventoried; this documentation pass does not claim an independent visual re-review of every capture.

The parent run reports **21/21 focused browser cases, fresh TypeScript and production build passed after the final count-null guard**. Browser coverage includes both regions, exact aging selection and scoped drill, ring focus/touch, signed credit inspection, unknown age coverage, preserved count/amount measures, visible million-scale totals, six full-size age targets, expanded billing and no horizontal page overflow. The **1,574-unit suite passed before the final one-line guard**; no subsequent unit rerun is claimed. Exact amount arithmetic continues to use the existing tested helper.

One layout detector pass in `.tmp/dashboard-clarity-detector.json` returned `[]`. This is an advisory detector result, not whole-application correctness evidence. The scoped reviewer returned **SHIP**, with all five review sections and no scored fixes. The latest correction contract omits a separate QUALITY BAR field; this is recorded as a process limitation without inventing a field or widening the audit. Prior acceptance and baselines remain evidence of their own scopes.

## Deployment checkpoint

**Proposed/authorized:** the owner's clarity correction within variant 3. **Implemented:** scoped frontend behavior above. **Tested:** local synthetic checks and captures above. **Deployed/enabled:** not yet verified for this correction at this checkpoint.

The deployed original variant 3 was read before this correction. That inspection does not prove the corrected page is live and supplies no new live financial outcome here. Final deployment/source verification and PR/CI state are recorded separately in PR #115. Its earlier unrelated Voucher-harness CI failure is not reported as a passing whole-smoke result.

Global `DESIGN.md`, `.impeccable/design.json`, original references and earlier captures remain unchanged. Historical global Dashboard-composition drift, miniature inherited brand lettering and synthetic capture badges are not promoted into reusable rules or repaired by this scoped work.
