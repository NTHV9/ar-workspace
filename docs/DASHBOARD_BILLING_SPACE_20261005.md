# Dashboard Billing progress space — 5 October 2026

The owner rejected the preceding compact Billing progress as cramped. The latest explicit feedback authorizes this scoped reflow and supersedes the earlier right-rail/variant-3 topology constraint while retaining the established app identity and financial meanings.

## Implementation

`ManagementDashboard.tsx`, `ManagementVisuals.tsx` and `management-layered.css` place Billing progress across the center/right columns at the top. The left exposure/type column retains its arrangement. Invoice Aging and priority Accounts sit below the wide panel in the center; aged-unbilled and Billed · still open sit below it on the right.

The desktop ring grows to 148px. New invoices, Billed and Not billed are three open groups with exact 18px amounts and 12px counts; supporting categories remain in Other invoice totals. At 1199px the panel spans the two-column layout beneath the summary row. At 750px and below, the figure groups stack beside a 128px ring; at 480px and below, the ring is 104px and amounts are 15px. Billed/Not billed keyboard, hover and touch inspection retain their actual ring sectors and accessible share label. The six 47px age rows and existing ledger drills remain.

The desktop first-900px check applies to amount/count for **Invoices over 60 days** and **Unbilled invoices over 60 days**, including million-scale values at 1440/1280. Billed · still open remains below aged-unbilled; its exact caption/count may continue below 900px. Giving billing more space moves the aging/priority content lower, and no first-900px claim is made for that separate billed-open measure.

OPERA age >60, billing-required aged-unbilled count/amount, selected-period original-value billing denominator, actual billing evidence, signed credits, unavailable-not-zero values and Hotel + Account boundaries retain their meanings. This is frontend presentation/test work; no backend, schema, email, financial-rule or provider change.

## Local verification and raster provenance

The parent run reports **21/21 focused browser cases, fresh TypeScript and production build passed**. Existing coverage includes exact aging/ring inspection, scope-preserving drills, count/amount retention, unknown coverage, signed credits, large exact totals, expanded billing, mobile layouts and no horizontal page overflow. No fresh unit-suite or whole-smoke result is asserted for this reflow.

All 14 files below exist in `.impeccable/review/`. They are locally generated **synthetic test-data captures**, not customer screenshots, live financial validation or shipping application imagery. Test badges are evidence scaffolding.

| Capture family | Coverage |
| --- | --- |
| `wide-billing-dashboard-{phuket,khao-lak}-{1440,1280,390}.png` | Both regions at desktop/laptop/mobile widths |
| `wide-billing-dashboard-{phuket,khao-lak}-full-1440.png` | Both full desktop pages |
| `wide-billing-dashboard-millions-{1440,1280,390}.png` | Million-scale exact values and long names |
| `wide-billing-expanded-{1280,661,390}.png` | Full pages with supporting totals expanded |

The documenter sampled Phuket 1440, millions 1280 and expanded billing 390 alongside the three source files and current scope contract; the other files were inventoried. Earlier captures and original references are preserved. The previous clarity detector returned `[]` before this reflow and was not rerun; no detector result for the wider layout is claimed.

Fresh full scoped review `wide_billing_finish` returned **SHIP**, with all 14 captures valid and no scored fix. It checked the readable/unclipped wide ring and three open figure groups including million values, expanded supporting totals at every checked width and both aged amount/count indicators in the desktop first view. Billed · still open continuing below the fold is an accepted space tradeoff. The latest contract lacks a separate QUALITY BAR field; that remains a process limitation, without a fabricated field or global-system repair. This verdict accepts the wider revision within the scoped surface; it is not a whole-app or live-data audit.

## Delivery boundary

**Authorized/implemented:** the wide Billing progress reflow. **Tested:** local synthetic checks above. **Deployed/enabled:** not yet verified for this revision. The preceding clarity correction is already live, but that is not wide-panel deployment evidence. Final review, source deployment and CI state are recorded separately in PR #115.

Global `DESIGN.md`, `.impeccable/design.json`, other pages, original references and earlier evidence remain unchanged. Historical global composition drift and synthetic badges are not promoted into reusable rules or repaired. Private actual financial JSON/screenshots are excluded from these records.
