# Embedded posted VAT and native Non-VAT totals

## Implemented and tested; deployment pending

This shared repair qualifies three more of the original nine source cases. It
contains no invoice-specific overrides and does not change accounting records.

For fully covered inclusive posted generates, the reader can use the actual
posted VAT without requiring an ambiguous whole-folio print. Every selected
Revenue posting must have a closed graph with full taxable-base coverage;
Payment rows remain separate. Parent and child definitions, explicit optional
child hotel/Folio/reservation scope, amounts and lineage must agree. The reader
fetches a second source packet and all definitions again; changed evidence is
refused. An unqualified shape retains the existing native fallback, but a source
change after qualification cannot fall back or print again.

For two Non-VAT cases, the existing uniquely identified OPERA PDF supplies the
complete charge footer: gross, taxable net, VAT and Non-VAT. All four labels must
be unique, ordered on one page, in THB, and reconcile exactly. Gross and VAT must
also match the selected API charges and validated posted VAT. Only complete,
scoped direct Revenue charge atoms can support an aggregate correction; a
bounded exact signed-subset check rejects impossible totals. It does not assign
tax status to individual rows. Current outstanding remains the AR API balance.

Current transaction-code flags are deliberately not used as historical tax
proof: an independently downloaded current AR reference demonstrates that a
currently taxable code can still contribute to that invoice's printed Non-VAT.
The separate broad flag-classification experiment is excluded.

## Verification

- Fresh actual `readInvoiceModel` calls pass for all three cases. The embedded
  case reads 12 definitions twice and makes zero native report calls. Each
  Non-VAT case makes exactly one native report call, reusing its full totals.
- Actual generated PDFs have 1, 3 and 4 pages, with 13, 43 and 64 selected lines.
  Folio, charge footer, VAT/Non-VAT and API outstanding checks pass. All text is
  within page bounds; every page was rendered with independent PDFium and
  visually inspected. Tax totals match independently retained OPERA references.
  Different page counts from OPERA are expected from the existing renderer.
- Final clean release: 2,442 tests / 227 files, TypeScript, production build and
  diff check pass. Review found optional child-scope conflicts; 12 consistently
  conflicting-snapshot cases reproduced the defect and now reject it. Matching
  and absent optional fields retain their intended behavior.
  Targeted independent recheck confirms that finding is resolved with no
  outstanding concrete P0–P2 in the reviewed integration. The reviewer authored
  the standalone native parser/helper, so those parts were reviewed by the
  parent rather than counted as independently approved by their author.
- All 87 earlier captured packets retain identical baseline outcomes: 43
  computed in both versions, 44 retain their prior missing-control refusal.
  This is a differential replay, not a fresh generation of all 87 invoices.

Private packets, source/generated PDFs and rendered comparisons remain outside
Git. No billing/Sheet date, email history, ledger, subscription or permission was
changed. Only authorized OPERA printing metadata may be affected by native reads.

Three original cases remain unresolved: one contains taxless direct charges in
an ambiguous native window, and two have selected AR-only adjustments missing
posted tax evidence. The native identity guard is unchanged. Data APIs remain
unavailable; no new service or cost is enabled.
