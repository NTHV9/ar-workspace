# Shared invoice generation repairs — 22 October 2026

## Qualified outcome

The owner requested system-level repairs following the current-corpus audit,
not invoice-specific PDFs or overrides. Shared model/read/render changes now
generate **87 of the 96 previously blocked invoices** using fresh OPERA reads
and the actual Worker generator in an authenticated remote diagnostic session.
The remaining nine remain refused; this is not a claim that every invoice or
every external PDF is supported. The earlier 1,624 successful corpus documents
were not all regenerated with this patch.

## Changes

- Normalize horizontal tabs to spaces only in printed text and corresponding
  editor metadata. Preserve original data and reject other control characters.
- Separate explicitly selected Payment postings from revenue and VAT. Verify
  ledger identity, currency, sides and signed amount; display its debit/credit
  side while retaining current AR outstanding independently of charge gross.
- Accept posted VAT on either the net charge or net plus service, including
  currency-rounded generates. Keep net/gross/generated-amount reconciliation.
- For nonuniform posted-tax groups or component rounding outside the simple
  rate check, obtain fresh native VAT/non-VAT controls. Accept only exact whole
  invoice parity; never substitute a guessed VAT value.
- Recognize explicitly named F&B service generates and F&B VAT postings only
  with independently matching native totals. Accounting-group labels alone are
  not sufficient tax classification.
- Verify each calculator percentage against its explicit named base. Service
  outside the VAT base must not be rejected by a second inclusive-gross ratio.
  Only the four supported own numeric bucket keys are accepted; inherited
  property names are rejected before arithmetic.
- Recheck selected postings and current AR identity/amount/balance after native
  report reads. Omitted reservation metadata on financial-detail responses is
  allowed only because the reservation was already verified on the account;
  a supplied mismatch remains a failure. Uncertain report requests are not
  automatically retried.

No per-invoice exceptions, financial ledger edits, Sheet/date edits, email sends,
new provider permissions or changes to externally uploaded PDF handling.
Existing reviewed PDFs are not silently rewritten. Scoped OPERA report reads
may produce normal provider print metadata under the existing authorization.

## Evidence

- Fresh live generation: 87 files, 241 pages, all visible Folio, outstanding and
  page-bound checks passed.
- Independent PDF text checks: all 87 footer gross/balance values reconcile with
  source amounts and explicit Payment rows; 29 files include Payments. Eight
  generated files independently match captured native VAT/non-VAT controls.
- A true OPERA **AR Invoice**, downloaded through the authenticated Edge UI,
  confirms charge gross 70,000, payment credit 36,400, VAT 4,579.44 and outstanding
  33,600. The generated PDF matches these figures. The corresponding Guest Folio
  has a different outstanding amount, so Guest gross/balance is not used as AR
  balance evidence.
- Actual generated-byte native editor tests: 1,138 shorten/clear operations,
  independently rendered with PDFium; zero changes outside the target fields.
- Red/green regressions cover tabs, Payment/reversal signs, currency/scope
  mismatches, VAT bases, rounding, food/beverage classification, native mismatch,
  changing postings/balances, optional reservation metadata and prototype-like
  calculator base names. Independent review found one numeric-base validation
  issue; it was reproduced, repaired and re-reviewed with no remaining P0–P2
  findings.
- TypeScript passes. Release test/build/deployment evidence is recorded in
  PROJECT_STATUS after completion.
- The prior full-corpus browser engine audit remains a prior result. This round's
  new Edge audit tab could not attach/navigate reliably; no new browser click-flow
  pass is claimed. Native editing/render checks above are actual new executions.

## Remaining nine cases

| Count | Unresolved evidence | Behavior |
|---:|---|---|
| 4 | Multiple historical invoices share the available Folio/window selector | Refuse ambiguous native tax evidence; require a proven exact AR report selector. |
| 2 | Native non-VAT total differs from direct ledger classification, although VAT agrees | Preserve the mismatch; current configuration alone does not prove the historical printed classification. |
| 2 | AR adjustment detail reports an account number different from the current selected account | Preserve the account identity fence pending verified transfer/history semantics. |
| 1 | Exclusive and separately posted AR adjustment/reversal components | Preserve the unsupported-rule refusal until exact posted tax attribution is qualified. |

The exact private list, raw packets, native references, generated PDFs, SHA
manifest and diagnostic/test results are under ignored
`.tmp/invoice-generation-fixes/`. Customer documents and identifiers are not
included in this report or committed to Git.
