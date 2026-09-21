# AR Invoice source comparison — 21 September 2026

## Verified finding

The current native-document adapter retrieves a **reservation/Guest Folio**, while the owner's reference invoices use the **Accounts Receivables report family**. The mismatch exists in the downloaded OPERA source before PDF Workspace editing.

Both supplied batches were read privately, including their Statement and Invoice pages. Each reference invoice is headed INVOICE, omits the City Ledger settlement credit from the charges table, and has a nonzero outstanding amount. The matched AR balances in the live app agree with those reference amounts. Two independently generated comparison jobs, each limited to the exact selected invoice, return unedited COPY OF INVOICE source PDFs with a City Ledger credit and zero Folio outstanding balance. Both app source invoices span two pages; each supplied AR invoice occupies one page. Customer identifiers, amounts, PDFs and screenshots are intentionally omitted from this tracked report.

This does not establish a paid/cleared AR invoice. The ledger remains open. Oracle describes the AR invoice as distinct from the historical front-office folio: [Managing AR Invoices / Generating AR Invoice Folios](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.1/ocsuh/t_admin_financial_managing_ar_account_invoices_and_payments.htm). Direct Bill/City Ledger settles the reservation window before transfer to AR: [Managing Direct Bill Transfers](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.3/ocsuh/t_accounts_receivable_direct_bill_transfer.htm).

## Live report-configuration evidence

A bounded control-plane Workflow lookup made GET requests to the documented Cashiering `folioTypeNames` operation, with explicit `folioReportGroup` values Guest and AccountsReceivables. No document rendering, posting, settings change or email is part of this lookup. Both responses matched the requested property.

| Property | Guest report | Accounts Receivables report |
| --- | --- | --- |
| KAT | `kat_folio` | `kat_ar_folio_vat_revised` |
| WAKL | `wakl_folio_vat` | `wakl_ar_folio` |

The responses did not supply a `folioTypeName`. These **report names are not established values for the Media API's `folioType` parameter**. Do not substitute a report name, AR transaction number, or AR invoice number into an unrelated selector based on name similarity.

## Documented API boundary

Current code calls GET `/med/config/v1/hotels/{hotelId}/reservations/{reservationId}/folioReports`, scoped by a verified historical reservation/window/date and THB. The public 26.3 contract exposes reservation identity, folio window, optional bill number, optional folio type, date and reference currency. It does not expose `folioReportGroup`, `reportName`, AR Account ID or AR transaction ID. The configuration lookup proves the AR templates exist; it does **not** prove a supported call that executes them and returns their PDF.

- [Media 26.3 contract](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/medcfg.json)
- [Cashiering 26.3 contract](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/csh.json)
- [Accounts Receivables 26.3 contract](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/ars.json)

The reviewed ARS operations include invoice data, postings, statement preparation/history and printer discovery, but no verified AR Invoice PDF-return operation. The earlier Statement report execution gap is documented separately; a Statement history POST must not be repurposed as a speculative PDF generator. This is a bounded contract finding, not a claim that no Oracle service can ever render AR PDFs.

## Exact information needed for the native route

Ask Oracle/OHIP for the supported operation that generates/downloads an existing **AR Invoice Folio** using the property's **AccountsReceivables** report group, plus:

1. Whether `getFolioReport` supports this AR context and, if so, the exact supported `folioType` and `billNumber` identities and their authoritative source fields.
2. Otherwise, the separate AR PDF operation, selected Account/Invoice/transaction mapping, report-template selection and binary/output retrieval contract.
3. Print-history/numbering effects and retry/idempotency semantics. No accounting post, settlement, receipt or email may be used as a download workaround.

The native generator was not changed to a guessed selector, and its title/balance were not overwritten. The owner subsequently confirmed using the same approach as Statement, pointing to the local Downloads/Folio directory. Inspection found six RTF templates, not exported customer PDFs. New Invoice preparation now uses the supplied hotel template and verified OPERA JSON data. The implemented and enabled replacement is documented in [Workspace Invoice integration](WORKSPACE_INVOICE_INTEGRATION.md); the sections below retain the preceding investigation evidence.

## Six-template feasibility trial

Read the supplied KAT, TSK, TLKL, WAKL, TLFO and TSAN RTFs privately. KAT contains 50 distinct XDO expressions and the other templates 47 each. All define a detail repeat, Debit/Credit totals, VAT/non-taxable fields and BALANCE. A local synthetic three-charge fixture was materialized in generated copies and converted using the existing isolated LibreOffice installation. All six outputs have one Letter page, INVOICE headings, all three distinct references, matching synthetic amounts, and no unresolved XDO markers. All six initial renders were visually inspected; the trial was corrected for directive quotation artifacts and a duplicated currency-word suffix, and the corrected KAT render was inspected. This is a template feasibility proof, not real-data financial validation or production renderer parity.

The subsequent integration completed authoritative charge/tax mapping, private Worker-compatible assets, guarded totals, pagination, same-data comparison and new-job source/version snapshots; see WORKSPACE_INVOICE_INTEGRATION.md for final verification and supported limits. No template or customer values are committed.

## Implemented / tested / deployed

- Implemented `OperaReader.folioTypeName`, the internal `folioTypeProbe` branch, and a selected-existing-job contract diagnostic. Fixed report groups, exact hotel/reservation/invoice checks, redacted metadata and no retries; no public arbitrary-URL proxy.
- Full **1,310 unit tests**, TypeScript/build/public assets and deployment dry run passed.
- Diagnostic source `e7efb0a4ca2bbf1c9a5d3d885b1d0709f42d7bbd` deployed as Worker `de1cece2-cced-481d-8e93-6e51ebfa33eb`. Both live configuration lookups completed successfully. This deployment does **not** enable an AR Invoice PDF fix.
- Follow-up source `0f57f17bf6aac460f0c65ed8ea8a8f3dfb36a37a`, Worker `19a1dadd-efcc-41d4-adaa-aeeeabd33794`: both exact selected-job reads completed, validated Folio identity and returned no Folio type or PDF links. Targeted 15 tests, TypeScript and deployment dry run passed; live health/database and six anonymous boundaries passed. The follow-up performs GETs only and does not print another document.
- The two authorized comparison document jobs may record normal OPERA print history. They did not send email, mark billing, change balances, or alter the user's supplied PDFs. Comparison jobs remain private, unreviewed preparations; no pre-existing job or file was deleted.
- Private working evidence is in ignored `.tmp/private-invoice-comparison/`. No customer document, extracted text, image, account data, provider credential or bearer token was added to Git.
