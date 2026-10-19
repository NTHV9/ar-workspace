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

## Portal and alternative-source verification

- Read-only Developer Portal inspection confirms the approved AR client and
  matching Enterprise/Gateway. A temporary display-suffix diagnostic confirms
  the deployed application key belongs to the inspected application; no full
  key or secret was returned. Its subscribed plans are API Catalog, Hospitality
  Property and OAuth. Hospitality Data APIs is absent from the available edit
  choices. The dialog was cancelled; no changes saved.
- Oracle's Data API prerequisites describe a separate Reporting & Analytics
  Data Access add-on for hoteliers. No subscription was added or purchased.
  This finding is distinct from the owner's correctly approved operational
  client or staff permissions.
- `calculateTaxes`, although mentioned in Oracle release notes, is absent from
  both the current published CSH specification and the inspected API catalog.
- An exact, single-run native folio PDF test succeeded. The returned COPY OF
  INVOICE includes historical charges and a settled City Ledger payment, omits
  the later AR adjustment and reports zero outstanding, while displaying the
  updated VAT. Therefore its complete footer does not reconcile and it is not
  qualified as an automatic replacement or a selectively borrowed tax source.
  Downloaded bytes were SHA-256 verified, independently extracted and rendered.
  The exact test Workflow instance holding those bytes was deleted successfully;
  the temporary byte-return and credential-suffix diagnostic branches were then
  removed. No original preparation, user PDF or accounting record was deleted.

## Remaining source dependency

## 20 October — safety correction and journal result

The exact adjustment cashier/day posting journal returned one entry, matching
the selected adjustment transaction. Metadata reports one result, one page and
hasMore=false; there are no linked tax entries in that response. This does not
establish a zero-tax charge and does not authorize a percentage fallback.

Removed the unsafe AR fallback that added the entire adjustment to non-taxable
value solely because includeGenerates returned no taxes. After identity and
amount checks, that unverified path now fails with
`document_invoice_ar_tax_unverified` before rendering/upload. The document UI
explains that the original OPERA invoice is required for that item. Explicit
generated VAT, separately posted VAT and explicit non-taxable breakdown paths
remain unchanged. Existing stored/reviewed PDFs are not rewritten.

Three regressions failed before the change and passed afterward. Full local
suite: 2,008 tests / 201 files; TypeScript and production build pass. Independent
Astra High review found no P0-P2 issue in the guard. This is a correction of
unsafe classification and prevention of incorrect output, NOT completion of
automatic VAT generation for unsupported AR adjustments.

Deployed safety correction source `2c3eec9f10917bc38bb79a734ea7a9d4720e6568`,
Worker `f069dfc0-4701-4714-b74d-fb772c1475a5`. A fresh exact-job production model
probe now returns `document_invoice_ar_tax_unverified`, confirming the affected
invoice is refused instead of receiving fabricated non-taxable classification.
The probe does not change the existing preparation or its previously generated
bytes. Live health/database checks pass; six anonymous protected routes reject
access. All previous runtime bindings match except COMMIT_SHA.

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

Final deployed source `7f9c86de511cc1b8d94aa4854528bcdca931657b`, Worker
`f4184134-afc8-42e7-a39e-73fd4fd7e270`. Exact-commit health, database validation
and six anonymous protected-route checks pass. Immutable binding comparison
matches the pre-investigation production configuration except COMMIT_SHA.
Only the supplement correction affects
ordinary document generation; extra Data API reads are opt-in privileged
diagnostics. Existing preparations/reviewed bytes are not rewritten.

Sources: [Oracle Data API request contract](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_oauth_token_api.htm),
[Oracle gateway errors](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_common_error_messages.htm),
[Data API prerequisites](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/r_prerequisites_oracle_hospitality_data_apis.htm),
[official Postman collection](https://github.com/oracle/hospitality-api-docs/blob/main/postman-collections/reporting-and-analytics/R%26A%20Data%20APIs.postman_collection.json).
