# Dashboard flow — owner-feedback follow-up

Documentation checkpoint: 3 October 2026. Branch: `codex/dashboard-flow`. **Implementation/test checkpoint.** Local validation is complete, including the production build. Final deployment and CI evidence is recorded in the delivery PR.

The owner rejected the prior delivered Dashboard as stiff. That feedback supersedes the earlier scoped SHIP acceptance. This follow-up keeps the billing/outstanding overview and urgent Accounts but changes the rhythm and emphasis within the existing Luminous AR identity.

## Implemented

- Unboxed exposure figures and a quiet filter toolbar replace the heavy summary containers. Outstanding leads; supporting balances remain easy to compare.
- Billing and priority Accounts share one asymmetric light field. A larger desktop ring (up to 210px from effective CSS) leads, New invoices becomes supporting context, repeated legend/Account separators are removed, and compact hotel badges identify the Account ledgers.
- Billed and Not billed controls respond to hover, focus and click. They emphasize the relevant ring sector and update its visible percentage and accessible label. Exact original amounts and invoice counts remain adjacent. This inspection does not introduce a new API call or invoice drill.
- Both SVG sectors retain their actual shares during emphasis. The synthetic 20% unbilled case explicitly checks `stroke-dasharray="20 100"`, so fading the billed sector cannot turn the remaining sector into an apparent full ring.
- Mobile supporting measures use compact rows while retaining all counts and exact million-scale captions. Long Account names are included in the million-scale capture fixtures. The continuous aged Account list, exact hotel/billing disclosure and existing drills remain.

Implementation is scoped to `src/dashboard/ManagementDashboard.tsx`, `src/dashboard/ManagementVisuals.tsx` and `src/dashboard/management-visuals.css`, with focused coverage in `tests/browser/cfo-dashboard.spec.ts`. The [surface brief](../.impeccable/surfaces/src-dashboard-dashboard-tsx.md) records the final local treatment.

## Design-system boundary

Plus Jakarta Sans, the established cool-white/navy world and the hotel age-band palette remain. Local billing accents are teal `#2c9995` and amber `#ddba68`; the shared field fades from pale mint through cool white. Its 16px corners replace the former two separate 14px panels. Local 5px hotel badges and 7px chart tracks remain subordinate. Desktop figure steps are 40px Outstanding, 43px ring percentage and 26px supporting exposure, with 20px section titles and responsive reductions.

These are observed Dashboard variants rather than new global tokens. Global `DESIGN.md`, `.impeccable/design.json`, original reference PNGs and prior review captures remain unchanged. Existing global drift and synthetic evidence badges are not canonized. Reduced-motion handling remains in force.

## Review and validation

The fresh `dashboard_rhythm_review` scored four material findings. The first fix review resolved three but identified a mobile count regression. The second fix restored the counts; the final remaining finding was resolved with **SHIP**. This final verdict is limited to the scored fixes, not a fresh whole-surface acceptance or evidence of live financial correctness.

The implementation run reported:

- **1,574 unit tests passed.**
- **15 focused browser cases passed**, covering both regions at 1440/1280/390, scoped drill/return, source uncertainty, exact chart selection, mobile count visibility, long Account names, million-scale captions and real Billed/Not billed inspection.
- **Forced TypeScript check passed.** Production build passed; the local build log is `.tmp/dashboard-flow-production.log`.
- Before/after layout detector files `.tmp/dashboard-rhythm-layout.json` and `.tmp/dashboard-flow-final-detector.json` both contain `[]`. The latter was captured after the main layout correction but before the final count/SVG correction. No detector rerun after those last corrections is claimed.

## Capture provenance

The following are local browser captures of the implemented UI with synthetic CFO fixtures, not customer data, live provider verification or generated artwork. The implementation/finish pass reviewed these captures. Earlier `dashboard-` captures remain preserved.

| Files under `.impeccable/review/` | Coverage |
| --- | --- |
| `flow-dashboard-phuket-1440.png`, `flow-dashboard-phuket-1280.png`, `flow-dashboard-phuket-390.png` | Phuket overview and responsive flow |
| `flow-dashboard-khao-lak-1440.png`, `flow-dashboard-khao-lak-1280.png`, `flow-dashboard-khao-lak-390.png` | Khao Lak overview and responsive flow |
| `flow-dashboard-phuket-full-1440.png`, `flow-dashboard-khao-lak-full-1440.png` | Full comparison and Account-list continuity |
| `flow-dashboard-millions-1440.png`, `flow-dashboard-millions-1280.png`, `flow-dashboard-millions-390.png` | Exact large amounts, long Account names and priority-row fit |

## Financial and deployment boundaries

Billing completion remains original billed value / (billed + unbilled value) for the selected period. Not Required, Setup needed and credits are supporting categories, not additions to that denominator. Closing balances remain separate from period-entry original values. Actual first billing remains the billing evidence; Draft does not count. OPERA age >60 remains distinct from Past Due date. Signed credits, missing-data states, duplicate-child handling and Hotel + Account identity retain their previous meanings. Remittance does not settle debt.

No backend, schema, authentication, email or accounting-rule change. This document records local implementation/test evidence; the prior version's deployment does not establish deployment of this follow-up. Final deployment and CI evidence is recorded in the delivery PR. Real signed-in live UI validation is still blocked by the expired Google session requiring owner sign-in. Source health will be verified when this revision is deployed. No new live financial result is claimed.
