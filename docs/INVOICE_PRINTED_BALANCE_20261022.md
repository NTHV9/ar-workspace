# Printed Invoice balance and applied AR payments

## Implemented, tested, deployed and enabled

Source `b01c7f19746bea972c16e7414617cfc3a2e8bc72`, Worker
`805beea3-17e8-4395-aa19-ada9af4fb139`. Production health/database and six anonymous
protected email routes pass; all 42 bindings are unchanged except COMMIT_SHA.
Tracker push/writeback remain enabled.

The owner identified that the current OPERA AR Invoice still shows its full
invoice amount, although its Statement shows a smaller remaining receivable.
Both specifically requested originals were downloaded through the exact OPERA
AR Invoice selection and independently rendered/read. They have zero Non-VAT
and reconcile net plus VAT to their invoice charge total. In the partial-payment
case, the native Invoice does not include the later AR allocation as a credit.

The PDF model incorrectly mapped current `invoice.balance` to the template's
`BALANCE` and amount-in-words. It now uses the selected posting net, which was
already required to reconcile exactly to `invoice.amount`. Actual selected
Payment lines remain included, including reversals. Separately applied AR
payments do not reduce this printed footer. The live AR balance is still checked
against the selected manifest before generation. No Statement/dashboard/read
API, tax calculation, account ledger or payment record is changed.

## Validation and limits

- Two behavioral cases failed first, then passed: an external allocation with no
  invoice Payment line, and an external allocation in addition to an already
  printed Payment. Input packets and AR balances remain unchanged.
- Six old assertions were corrected to distinguish printed Invoice balance from
  current AR balance; their separate source/freshness/transfer checks remain.
- Full suite: 2,443 tests / 227 files, TypeScript, production build and diff check
  pass. Independent targeted review: 90 tests / five files, no remaining P0–P2.
- Captured 87-case differential: 43 models compute, 44 retain identical previous
  refusals. One computed model has the expected printed-balance correction; all
  other model fields and outcomes are unchanged. Not a fresh 87-case generation.
- Two previously qualified actual transferred-Invoice packets were rendered.
  Their one-page PDF footer/Folio/tax checks match independent OPERA references,
  all text fits page bounds, and visual review passed. The paid example now
  prints its invoice amount while retaining its lower AR balance in source data.

This corrects a shared printed-balance defect; it does **not** resolve the three
remaining automatic tax-source cases. Those still require complete evidence.
Fresh read-only packets after native printing still omit the same tax details
and stored-folio identifiers. No per-invoice tax override was added.

A new read-only investigation successfully fetched the existing TSAN AR RTF
through its catalogued attachment ID. It binds the footer to `TOTAL_GROSS`,
`VAT1_AMT`, `TOTAL_NON_TAXABLE` and `TOTAL_NET-TOTAL_NON_TAXABLE`; those bindings
identify the expected data, but do not alone establish an automatic API source.
Private PDFs, RTF, packets and comparison outputs remain outside Git.
