# Dashboard balanced rows — 5 October 2026

The owner's actual screenshot rejected uneven/disproportionate stacks and stranded empty rails. The approved scoped correction supersedes the preceding column topology while retaining the incumbent app world and financial meanings.

## Implemented

`ManagementDashboard.tsx` places four equal summary cards above two aligned pairs: Billing progress + six-row Invoice Aging, then By Account type + Needs attention. `management-layered.css` replaces the old column cascades with equal row grids; `ManagementVisuals.tsx` is unchanged in this correction.

Desktop uses 18px gaps, 16px corners, 164px-minimum summary cards with 30px figures, and 22px panel padding with 17px titles. Billing keeps its 148px ring in a broad half-width panel, with New invoices at 22px and Billed/Not billed at 17px. At 1050px and below, panels stack and summary cards use two columns. Smaller breakpoints reduce ring/type/padding; the Account-type list scrolls internally for density.

Exact money/counts, signed credits, unavailable-not-zero handling, OPERA age >60, billing-required aged-unbilled scope, selected-period original-value billing and exact Hotel + Account drills remain. Supporting totals, hotel/period details and the searchable/sortable ledger remain available. No financial/API/backend/schema/auth/email change; shell, header and other pages retain their existing implementation.

## Local verification and raster provenance

Final local logs confirm **25/25 focused browser cases, 1,574/1,574 unit cases, TypeScript, browser build and production build passed**. Geometry assertions cover summary width/row height/baseline, paired panel width/height/baseline and no page overflow. Existing checks retain exact totals, aged counts, unknown coverage, signed inspection, keyboard/touch controls and scope-preserving drills. No fresh whole-smoke result or live financial outcome is claimed here.

The final-source detector `.tmp/dashboard-balanced-detector.json` contains `[]`. Fresh full scoped reviewer `balanced_dashboard_finish` returned **SHIP**, all 18 captures valid and no scored fix. This is Dashboard acceptance, not a whole-application audit.

All 18 files below exist in `.impeccable/review/`. They are local **synthetic test-data captures**, not customer screenshots or shipping application imagery. The seven-type density fixture includes a signed credit and is synthetic despite its `real-density` filename. Test badges are evidence scaffolding.

| Capture family | Count | Coverage |
| --- | --- | --- |
| `balanced-dashboard-{phuket,khao-lak}-{1440,1280,390}.png` | 6 | Both regions at desktop/laptop/mobile |
| `balanced-dashboard-{phuket,khao-lak}-full-1440.png` | 2 | Both full desktop pages |
| `balanced-dashboard-millions-{1440,1280,390}.png` | 3 | Million-scale exact captions and long names |
| `balanced-expanded-{1280,661,390}.png` | 3 | Full pages with supporting billing totals expanded |
| `balanced-real-density-{1920,1280,661,390}.png` | 4 | Full pages with seven coherent Account types, including credit |

The documenter sampled Phuket 1440, millions 1280 and expanded 390 alongside the source CSS/component and latest contract; the remaining captures were inventoried. Earlier captures and original design references are preserved. The owner's actual screenshot remains private outside Git; it was not read or copied into this record.

## Delivery boundary

**Authorized/implemented:** balanced Dashboard rows. **Tested:** local synthetic checks above. **Deployed/enabled:** not yet verified for this revision. Branch `codex/dashboard-balanced-layout` starts from merged `971fa31`; prior CI fixture/synchronization fixes are already in that baseline. This request adds no test-gate/harness/financial changes. Final deployment/source and CI state will be recorded in the new delivery PR.

Global `DESIGN.md`, `.impeccable/design.json`, original references and other pages remain intact. Historical global composition drift and synthetic badges are not canonized or repaired. No private actual financial JSON or customer image is included.
