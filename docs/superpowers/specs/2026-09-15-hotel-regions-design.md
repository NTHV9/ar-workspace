# Phuket and Khao Lak hotel regions

## Owner-approved scope

Extend the existing workspace to six OPERA properties in two separately viewed regions:

| Region key | Display | Ordered properties |
|---|---|---|
| phuket | Phuket | KAT, TSK |
| khao-lak | Khao Lak | TLKL, WAKL, TLFO, TSAN |

The owner requested the same existing functionality for the four Khao Lak hotels. Khao Lak Billing Required, Credit Term and recipient profiles start separately; do not copy Phuket Account settings merely because Account No. matches. No real balances, customer identities/documents, credentials or one-time test recipients go into Git or public test evidence.

## Design

One application, one supported hotel registry, and one regional selector. The owner has already specified using the existing Phuket design and functions; preserve those surfaces while generalizing hotel comparisons. Do not duplicate the app or provision paid projects. Default old links without a region to Phuket unless an explicit operational property identifies Khao Lak. Within a region, All Hotels means the hotels of that region. Do not offer a mixed six-hotel total by default.

Switching region resets incompatible hotel/account/item filters after the existing dirty-work checks. Keep valid date/view preferences. Invoice/document/email commands remain one Hotel + Account, and remittance remains one Hotel + Account per notice. Account No. reporting groups compare matching unambiguous accounts only within the selected region; they never share workflow state.

Current Aging shows all six existing age columns and Net open last, with one row per property and Total within each Account Type/Account group. Phuket order stays KAT, TSK; Khao Lak order is TLKL, WAKL, TLFO, TSAN. Retain current typography, colors, shadows and responsive behavior. Add distinguishable hotel colors. Hide/show aging columns remains available; do not require horizontal scrolling at supported desktop widths.

Dashboard totals, hotel splits, drills, Collections, Reports, Remittances and options must share the selected regional scope. SQL defaults used by old callers remain Phuket. Only explicit Khao Lak requests aggregate the four new hotels. Backend validates the region and hotel combination; incompatible account selections fail instead of widening scope. Current Aging and Bill Date/payment-date/closing-date definitions remain unchanged.

## Data and integration

Additive database changes only. Expand operational property constraints and validations to the six approved IDs; preserve historical migration bytes, owner checks, single-property command validation, source identity/pagination and atomic publication. Temporary acceptance fixtures remain explicitly constrained to their synthetic scope.

Use existing OPERA credentials and confirmed gateway to verify the four property reads. Scheduled refresh remains 07:00/19:00 ICT, manual and stale-on-open, with existing per-hotel leases and bounded concurrency. New property discovery is enabled only after schema compatibility and quota preflight pass. Never infer source zero from missing/error data.

The existing email, document and storage flows apply to each new hotel. Sender choice and the four authoritative Statement asset sets are requested from the owner. Until an authoritative template exists for a hotel, report missing Statement setup and never substitute a Phuket logo, legal entity or bank account. Native Invoice/Folio retrieval remains OPERA; do not revive native Statement generation. No email is sent to a customer during implementation verification.

## Acceptance

- Phuket regressions stay green, including old URLs, history and document/file fences.
- Synthetic six-hotel fixtures prove regional counts and signed sums, credit/child rules, Account No. grouping and wrong-region rejection.
- UI proves both region switches, four-hotel splits, all Aging columns, sorting/filtering, drills/back navigation and dirty editor protection at desktop/mobile sizes.
- SQL replay proves existing data/history remain unchanged, new hotel identities work, and cross-hotel commands cannot mix invoices.
- Provider checks use private read-only evidence and synthetic document/email data only. Confirm quota headroom without buying capacity.
- Only claim production enabled per surface when its actual prerequisites and live checks have passed.
