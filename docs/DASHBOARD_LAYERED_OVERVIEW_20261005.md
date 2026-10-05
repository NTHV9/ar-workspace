# Dashboard layered overview — 5 October 2026

The owner selected variant 3 and authorized implementation/deployment. This document records the source implementation and local evidence checkpoint before deployment; authorization is not deployment evidence.

## Implemented scope

Only the Dashboard body changes. `src/dashboard/Dashboard.tsx`, `ManagementDashboard.tsx`, `ManagementVisuals.tsx` and `management-layered.css` implement the selected three-column overview inside the existing application shell. Global header/design and other pages remain outside scope; `DESIGN.md` and `.impeccable/design.json` are preserved.

Left: Outstanding, Invoices over 60 days and Account-type balances. Center: signed hotel aging columns and priority Accounts. Right: compact Billing progress, **Unbilled invoices over 60 days**, then Billed · still open. Placing aged unbilled immediately below billing is the one adaptation to the selected topology. The report-filter control sits inline with the desktop page title and retains selected date/scope context while closed. The full Account list and exact hotel/period tables remain below. Narrow layouts stack the sections, retain exact values and counts, and keep table scrolling inside their regions.

The local treatment preserves Plus Jakarta Sans, navy/blue/teal identity and cool-white surfaces. Observed Dashboard variants use 16px corners, 18px spacing, 16px section titles, 32px/27px overview amounts and a compact 96px desktop billing ring. These values describe this surface and do not replace shared tokens.

## Financial meaning and privacy

- Over 60 means OPERA Invoice age >60, separately from days after Due date. Aged unbilled is the billing-required unbilled subset, with count and current open amount.
- Billing progress uses selected-period original values and actual billing evidence; it is distinct from current/closing open balance. Supporting Not Required, Setup needed and credits do not enter the billed/(billed + unbilled) denominator.
- Signed credits, unknown-not-zero source handling, exact amounts, Hotel + Account identity and existing drill scopes remain. Remittance does not settle debt.
- Application financial values continue to use the existing real API path. Synthetic fixtures are test evidence only. Private prototype financial snapshots are not included in the application or Git; no private snapshot was read or copied for this documentation.
- No backend/schema/auth/email or financial-rule change is claimed by this visual work.

## Evidence and provenance

All captures below are locally rendered **synthetic test data**, not customer data, live API validation or production screenshots. They are review artifacts, not shipping application imagery. The visible synthetic badges are test scaffolding.

| Capture family in `.impeccable/review/` | Coverage |
| --- | --- |
| `layered-dashboard-phuket-{1440,1280,390}.png` | Phuket desktop/laptop/mobile viewports |
| `layered-dashboard-khao-lak-{1440,1280,390}.png` | Khao Lak desktop/laptop/mobile viewports |
| `layered-dashboard-{phuket,khao-lak}-full-1440.png` | Full desktop pages and supporting ledger sections |
| `layered-dashboard-millions-{1440,1280,390}.png` | Large exact THB values and long-name regression content |

The documentation pass confirmed all 11 files exist and visually inspected Phuket 1440, Khao Lak 1280 and millions 390, alongside the four implementation files and scope direction contract. Other captures are inventoried, not independently visually re-reviewed by this pass. Source confirms the retained counts, exact million captions, signed column geometry, scoped controls and reduced-motion handling.

The parent implementation run reports **1,574 unit tests, 18 focused browser cases, fresh typecheck and production build passed**. The full **165-case smoke suite was still running** at this documentation checkpoint; no result is asserted here. Fresh reviewer verdict: **SHIP**, limited to the scored fix list. Resolved checks cover inline filters, compact billing and aged-unbilled KPI within the first 900px at desktop widths 1440/1280 including million values, readable long names and no amount overlap. This is not a new whole-surface or whole-application audit.

## Status and boundaries

**Proposed/selected:** variant 3, selected by the owner. **Implemented:** Dashboard body. **Tested:** local synthetic checks above. **Deployed/enabled:** not yet verified for this revision at this checkpoint. No real signed-in live UI or new live financial outcome is claimed.

Original references, previous captures and global design files remain preserved. Historical global Dashboard composition prose is pre-existing drift; this scope does not repair or canonize it. Existing miniature brand lettering and synthetic capture badges are not promoted into design-system rules. Subsequent deployment, smoke-suite completion and live validation require their own evidence entry.
