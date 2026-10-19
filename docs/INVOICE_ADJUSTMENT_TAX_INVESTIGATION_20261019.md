# Invoice adjustment tax discrepancy — investigation

## Confirmed

An owner-supplied comparison shows the same gross invoice amount but different
VAT, taxable net and non-taxable amounts. The exact selected production job was
read through the existing scoped diagnostic workflow. Its current model
reproduces the discrepancy; a comparison against the supplied reference fails.
No source PDF, accounting record, Sheet date or email was changed.

The additional AR posting is absent from the reservation net/VAT response.
The current model reads its exact transaction with includeGenerates and accepts
an otherwise verified Revenue posting without generated taxes as non-taxable.
That inference is contradicted by the supplied printed OPERA reference.
Missing generated-tax detail is not sufficient evidence of non-taxability.

This is upstream of PDF Workspace editing. The existing model tests explicitly
assert non-taxable classification for positive and negative AR adjustments
without generates; passing those tests did not validate printed OPERA parity.

## Remaining work

- Obtain authoritative printed invoice tax fields or equivalent explicit API
  evidence for AR adjustments. Do not replace missing evidence with a blanket
  percentage calculation or classify all Revenue adjustments the same way.
- Preserve exact hotel/account/invoice/folio scope and reconcile signed amounts,
  partial payments and mixed taxable/non-taxable postings.
- Verify positive adjustments, negative rebates, genuinely non-taxable charges,
  ordinary invoices and rounding against independent OPERA references.
- Compare original PDF files for line descriptions/reference differences also
  visible in the owner screenshot; screenshot detail alone is insufficient for
  exhaustive text/layout verification.

## State

Diagnosis reproduced against the live selected job. Application fix not yet
implemented or deployed. Private diagnostic outputs remain under the primary
checkout's ignored `.tmp/invoice-reliability/` directory. No real customer
identities, documents or raw provider responses are included in this report.
