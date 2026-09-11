# Internal OPERA Statement trace — 2026-09-09

## Actual inclFolios=true GET trial — 2026-09-09

After owner approval, administrative Workflow ab607d47-8d2b-405e-bc66-5ac7c3940e92 read the exact two Invoice identities from the prior KAT Statement job. It first verified fresh scoped Invoice history, then called getARStatements with inclFolios=true, inclPrinted=true, inclZero=false and only those transactionNo values. No postStatements was called.

Observed response: requested2/returned2, exactScope=true, balancesMatch=true, returned inclFolios=true. Top-level keys aRStatements/links; Statement keys hotelId,balance,accountId,invoices,reportSeqNo,inclFolios,statementName,type. Invoices contain accounting and reservation/Folio identifiers. No PDF strings and zero links; no output-file identifier was observed. The flag is accepted, but this GET still returns a prepared JSON descriptor, not a combined PDF.

Raw response retained only in private jobs/{existing-job}/trial/combined-selection UUID JSON. The normal application's default remains inclFolios=false; true was explicitly opted into by this administrative trial. Typecheck146unit tests and connector build passed; deployed sourcee754c26e01ec09344e4599f58d4d03d40ef03231, deploymentd8412470f3b248ea8b6305821a88767c, Workflow versioncf212878-1c67-4e77-8175-81e2b6386169. Hosted health confirmed source SHA and database connectivity. This does not prove native combined Statement acquisition or its PDF page contents.


## Print Invoices enabled HAR comparison — 2026-09-09

Owner supplied1.1.har,2.1.har,3.1.har after selecting Print Invoices. Read locally only; no new API/report execution.

-1.1.har has14requests. The known Print Invoices control (fe7:sbc2:odec_sbc_sbc) is submitted with value t in entries2,10,11,12,13, confirming the setting was enabled.
-2.1.har has125requests. Entry118's completed Batch Reports table contains four rows: row0 Statement, rows1–3 use kat_ar_folio_vat_revised. All four show Finished Successfully. Previous2.har entry98 had one Statement row.
-3.1.har has twoGETrequests, including one reportviewer GET returningHTTP200/application/pdf. Its BATCH reference exactly matches the completed response in2.1.har. There is no separate observed OHIP /ars or /med request and no new reportSeqNo field in this captured flow.
-The body captured in the HAR is348bytes of browser viewer representation, not native PDF bytes. This evidence establishes four completed report jobs and one PDF retrieval request, not the actual PDF page count, exact merged file contents or selected-only Aging. No connected Edge/PDF tab was available for additional visual inspection.
-The ARS contract provides inclFolios on getARStatements and on Statement descriptor/processing criteria. Its description matches including associated Folios with the Statement. This is a concrete next read-only parameter trial, not evidence it returns combined PDF bytes or that it is identical to the UI implementation.

No POST was repeated, no settings were changed by the agent, and raw HAR/customer files remain outside Git. The new trace proves the effect of Print Invoices in the native UI while retaining the same unresolved server-side BATCH creation/retrieval boundary.


Scope: inspect the native OPERA Internal/Customized Statement path. R&A Publisher is not substituted for this report. No new Statement, print action, email, report configuration or accounting mutation was invoked in this investigation.

## Captured browser sequence

| Evidence | Request/event | Observed result |
|---|---|---|
| 1.har entry0 | ADF UI action for Create Statement | Batch Statements Options |
| 1.har entry1 | Options Process Statements action | Batch Report Destination and native template |
| 1.har entry5 | Destination Process action | Launches batch-report window |
| 2.har entries92,95,98,102 | ADF custom event pollReport to LaunchPage | Entry98 contains Finished Successfully and first numeric BATCH reference |
| 3.har entry0 | GET reportviewer, ex=PREVIEW, rep=that same BATCH reference | HTTP200, application/pdf, inline, no redirect |

The numeric BATCH reference first becomes visible in the completed pollReport RESPONSE, not as an explicit reportSeqNo input in the captured requests. Scope-limited inspection of the captured OPERA request and response bodies found no reportSeqNo, P_REPORT_SEQ or P_ARRAY binding. Generic launchId strings in static ADF code are UI window infrastructure, not an established AR report-ID mapping.

Sample XML contains P_REPORT_SEQ, but it is Sample Data and cannot establish the runtime binding or equality of identifiers. The file/route labels do not prove BATCH equals the preparation reportSeqNo. No identifier substitution was attempted.

## Actual supported history API check

Used the published GET /ars/v1/hotels/{hotelId}/profiles/{profileId}/accounts/{accountId}/statementsHistory on the same KAT Account, with the profile identity taken from fresh getAccount(Statement) output. No guessed profile ID, time filter, API pagination or report filename.

Workflow c467daf0-dfcc-4bc0-86df-871f877f16e7 completed:
- one history entry
- zero reportFileName fields with a value
- zero statementNo fields
- zero links
- no matched captured BATCH reference
- lastStatementInfo supplied no file or Statement number

Raw history/summary remains in the existing private document job's trial/statement-history UUID object. These results do not establish which earlier action produced the history entry; in particular, do not infer actual billing, sending, or that a UI preview is equivalent to postStatements.

## Verified boundary

The browser captures show stateful ADF/JSF page actions and a viewer GET; they do not expose a standalone external render request. The supported history endpoint adds no file identifier or download relation for the checked Account. Native Statement backend creation/retrieval is therefore still unverified. It is not proved impossible, but further replay of the same requests or substitution of IDs has no evidence basis.

Do not copy UI cookies/ViewState into Workers, retry generation automatically, modify the native template, or implement a synthetic substitute while claiming native integration. Manual import of an OPERA-produced PDF or a separately labelled system renderer would be a separately approved workflow choice, not completion of the current automatic native acquisition objective.

## Implementation and validation

Administrative history reader and Workflow audit added, source b122d209ce521a65c1a18ff061f2b18bccbdc3bd on codex/opera-refresh. Cloudflare deployment13f35d623d1a4d8da5dadc22c0baa916; Workflow versionb9402333-6b6d-4620-a109-6f53dc957ad9. Typecheck,145unit tests and connector bundle passed; hosted health confirms deployed SHA and database connection. No frontend or database schema change.
