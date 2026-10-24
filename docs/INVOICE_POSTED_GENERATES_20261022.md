# Explicit posted AR tax components

## Implemented, tested, deployed and enabled

Source `f1fbe53390825c27b0278a0c5aff958c2feb43e7` is deployed as Worker
`3d1330f6-18f0-4139-8bbe-474efc33b0bf`. Health/database and six anonymous email
boundaries pass. All 42 runtime bindings match the previous release except
COMMIT_SHA; tracker push and writeback remain enabled.

One remaining TSK invoice contains exclusive service/VAT components as both
nested children and individually selected AR postings. The former reader tried
to simulate every row as an inclusive root, while the model rejected nested
components. The repair reads the actual posted amounts and counts each selected
posting once.

The shared path requires a closed one-level graph: exact parent/child IDs,
parent reference, hotel/account/invoice/Folio scope, dates, signed THB amounts and
matching nested/standalone records. Stable parent and child rules must describe
the recorded components. Missing or conflicting children, duplicate coverage,
unknown relationships and conditional rules remain refused. Only remaining
standalone inclusive roots use the existing calculator qualification. Native
tax parity and final unchanged-posting/balance checks remain mandatory; printing
is not retried after it starts. There is no per-invoice override or cancellation
shortcut.

## Evidence

- A fresh current AR print was downloaded through the authorized OPERA UI. Its
  recorded service/VAT adjustment lines and footer match the new live model.
  All 16 selected lines remain present. The production renderer produces one
  page, with matching Folio/footer values, matching posting-amount occurrence
  counts and all text within the page. The original AR print has two pages.
- Clean release checkout: 2,224 tests / 220 files, TypeScript and production
  build pass. The added tests cover signs, missing/conflicting children, duplicate
  claims, cancellation hiding incorrect tax, changing configuration and source
  rows, and missing account identity. Independent review found no concrete P0–P2
  issue; the additional explicit account guard has its own regression.
- All 87 previously repaired cases have no direct-AR-detail graph in their
  captured packets, so this new path is not activated for that baseline. An
  old/new model differential on the 87 captured packets is identical: 43 fully
  compute and 44 retain the same refusal because their fresh qualification
  controls are not included in those raw packets. This is not a claim that all
  87 were freshly regenerated in this round.

The separate Non-VAT classification experiment, Folio History query experiment
and account-transfer qualification are excluded from this release. The other
eight original unresolved cases remain open. Source data, PDFs and replay outputs
are ignored private evidence. No OPERA ledger, Sheet dates, business sending
history, permissions or subscriptions were changed.
