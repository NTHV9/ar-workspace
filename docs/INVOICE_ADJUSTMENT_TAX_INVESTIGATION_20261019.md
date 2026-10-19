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

## Original PDF comparison

Both supplied files contain a Statement and an Invoice. Text extraction plus
independent Poppler rendering confirms equal selected balance, Invoice gross,
debits/credits and Statement aging totals. The Invoice footer incorrectly moves
the entire additional AR posting into non-taxable value, reducing displayed VAT
and taxable net. This is not an editor rasterization or rounding issue.

Additional differences: the adjustment supplement is missing from the printed
Reference column, package rows use a generic transaction-code description,
Cashier number/name differ, the print operator is blank, country is abbreviated,
and Statement description omits an additional source reference. Print timestamps
are expected to differ. Header/footer positions and font weight also differ;
no claim of pixel-equivalent stationery is made.

The supplement matches the source posting's remark field. Implemented the
bounded fallback from an absent printed check to that remark, retaining existing
routed narratives/check precedence. A failing synthetic regression was observed
before the fix. Cashier/package/print-operator differences need source-specific
mapping evidence; do not replace them from arbitrary latest rows.

## Additional source diagnostics

- The complete selected reservation transaction read with posted-AR and
  generates flags did not contain the additional AR posting. Reservation reads
  are therefore not yet a verified substitute for this posting's tax evidence.
- Oracle's FinancialTransactionDetailsExtended schema exposes Folio tax fields.
  The first privileged query returned HTTP 403; this alone did not establish a
  staff-role/permission problem. The owner explicitly states permissions exist.
- Corrected the Data API Accept contract and added bounded completed multipart
  handling plus sanitized HTTP-200 GraphQL errors. Independent Astra High review
  approved both corrections. The documented trailing-slash endpoint still
  returns the exact gateway reason `No Subscribed Plan or API found`.
- The canonical endpoint without a trailing slash is also present in Oracle's
  official Postman collection. Its separate exact-scope live probe returned the
  same HTTP 403 and exact gateway reason after content-negotiation correction.
  Application-key subscription/environment/route must be verified before
  prescribing any permission change. No subscription or permission was changed.

## Remaining work

- Obtain authoritative printed invoice tax fields or equivalent explicit API
  evidence for AR adjustments. Do not replace missing evidence with a blanket
  percentage calculation or classify all Revenue adjustments the same way.
- Preserve exact hotel/account/invoice/folio scope and reconcile signed amounts,
  partial payments and mixed taxable/non-taxable postings.
- Verify positive adjustments, negative rebates, genuinely non-taxable charges,
  ordinary invoices and rounding against independent OPERA references.
- Resolve the remaining source-field differences identified in the original
  PDF comparison above, without fabricating original operator or cashier data.

## State

Diagnosis reproduced against the live selected job. Supplement fallback and
privileged diagnostic improvements are deployed; the VAT calculation is still
unchanged and the financial discrepancy is NOT fixed. Full local suite passed
2,006 tests / 201 files; focused Data API client tests passed after the canonical
route change. Exact deployed-source health/database/access checks passed.
Private diagnostic outputs remain under the primary
checkout's ignored `.tmp/invoice-reliability/` directory. No real customer
identities, documents or raw provider responses are included in this report.

Deployed source `ba675c4f9b47c744d214340b322cbd5b3872483e`, Worker
`16d38578-8d96-4c56-a4c0-add1226f2b42`. Only the supplement correction affects
ordinary document generation; extra Data API reads are opt-in privileged
diagnostics. Existing preparations/reviewed bytes are not rewritten.

Sources: [Oracle Data API request contract](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_oauth_token_api.htm),
[Oracle gateway errors](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_common_error_messages.htm),
[official Postman collection](https://github.com/oracle/hospitality-api-docs/blob/main/postman-collections/reporting-and-analytics/R%26A%20Data%20APIs.postman_collection.json).
