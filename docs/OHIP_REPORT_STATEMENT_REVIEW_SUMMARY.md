# Report and Statement portal review — 2026-09-09

Reviewed the owner's two existing Edge OHIP tabs exactly as filtered: Report with API Module selected, and Statement. Opened all matched modules and read every operation row's method, URI, identifier and available Info description. Info is stored in the displayed links' data-title attribute; five Report Master rows had no description, so published summaries and request/response schemas supply their meaning. Independent primary-schema review supplements the UI evidence.

| Search | Modules | Operations |
|---|---:|---:|
| Report |7|33|
| Statement |3|17|
| Total |10 module appearances|50 distinct operations|

Per-operation tables: [Report33](OHIP_REPORT_OPERATION_REVIEW.md) and [Statement17](OHIP_STATEMENT_OPERATION_REVIEW.md).

## Applicable to the new AR system

- getFolioReport: native reservation Folio/Invoice PDF, already tested in the app. Its reservation/window/date selectors do not establish standalone AR Statement rendering.
- getARStatements: selected AR Statement preparation, already tested. JSON descriptor and reportSeqNo, not a proven PDF download.
- postStatements: relevant native Statement processing, already tried once; actual response201{} plus API-base Location supplied no PDF.
- getStatementsHistory: legitimate reconciliation metadata read, already tested; the checked Account returned no filename/number/link.
- getReports/getAllReports/getReportParameters: legitimate template/configuration discovery, already tested for kat_statement/tsk_statement. Not report execution.
- getProfileAging and report-related LOVs can support scoped data or configuration lookup; their presence in the catalog is not an integration test.
- getBusinessDate/pingBackOfficeOperationsService are supporting date/service reads, not document renderers.

## Search matches that must not be treated as a renderer

generateChannelBillingStatements concerns Channel contract billing and is in the deprecated Channel module; it is not an AR selected-Invoice Statement. postGenericReports creates configuration rather than returning generated PDF output; the embedded printReport destination metadata is not an established download contract. postReminders updates native reminder-cycle/history after generation/sending and is not a safe PDF-only substitute. emailFolioReport sends email and was not invoked. Cashier closure lists/postings, membership statement LOV, catering container configuration and guest service requests are different functions.

No new native Internal AR Statement PDF acquisition operation was identified in these50search matches. This is a conclusion about the inspected results/contracts, not proof no other Oracle/private/entitled API exists.

No report generation, email, accounting change, subscription/key action, schema migration, package install or deployment occurred during this review. Raw customer data and credentials were not copied. Both user tabs were returned to their original search results.
