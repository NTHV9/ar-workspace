# Statement PDF external contract follow-up — 2026-09-09

## Direct Publisher-context checks — 2026-09-09

Owner requested continuing without contacting Oracle and explicitly asked to investigate the Publisher run operation. Used the documented BI Publisher /xmlpserver context as a bounded candidate on the two already-confirmed Oracle origins. No credentials, cookies, account identifiers or customer payloads were sent; redirects were not followed.

| Request | Observed result | Limit |
|---|---|---|
| GET OPERA UI host /xmlpserver/ | HTTP401, application/octet-stream, no WWW-Authenticate or Location | Does not establish that Publisher exists behind this path; may be a gateway-level denial |
| GET OHIP gateway /xmlpserver/ | HTTP404, text/plain | Candidate context not exposed through this request |
| OPTIONS OPERA UI host /xmlpserver/services/rest/v1/reports/kat_statement/run | HTTP401, no Allow or authentication challenge | kat_statement is an observed template name but still NOT a confirmed Publisher catalog path; this did not execute run |

No POST run was sent: the correct Publisher host/context, reportPath and selected Invoice parameter binding remain unverified. Do not claim a failed actual report execution from these reachability checks. Official BI Publisher example uses its own host/xmlpserver context and a catalog report path, with multipart ReportRequest and optional ReportData: https://docs.oracle.com/middleware/bi12214/bip/BIPAP/op-v1-reports-reportpath-run-post.html .

Local 1.har/2.har/3.har were checked for Publisher-specific strings. The runReport match in 2.har was Oracle Guided Learning tooltip metadata for RunReportsListing, not a renderer request. Browser inventory at the time of follow-up exposed only an empty in-app browser, with no connected Edge session. Therefore no authenticated UI discovery was performed or claimed. Older named HAR files may have been removed by the owner; they were not recreated or searched elsewhere.

Continue self-service discovery when an existing reporting/Developer Portal session or confirmed reporting URL is available. Draft Oracle inquiry remains unsent; asking Oracle is not a prerequisite imposed by this application. No broad host/path scan, secret forwarding, reporting entitlement change or report-generation retry was made.


Status: **public-source research complete for this bounded question; external transport still unverified**. No tenant requests, report generation, credential reads, configuration changes, or messages to Oracle were performed in this follow-up. Questions below are a draft, not a sent support request.

## What the evidence establishes

The existing [research and HAR findings](STATEMENT_API_RESEARCH.md) establish a working browser sequence ending in `GET /OPERA9/opera/operacloud/reportviewer?ex=PREVIEW&rep=BATCH_{observed-id}` with PDF response headers. Generation is represented by ADF/JSF UI interactions. The sanitized capture cannot establish that an OHIP bearer token authorizes that UI route. It also does not expose the server-side renderer contract. No repeat capture or repeat creation is needed to prove this browser route again.

Oracle's Property API authentication guide documents client ID/secret, application key, scope and enterprise ID, with token requests sent to the Developer Portal gateway. It does not name the OPERA UI `reportviewer` as an external Property API. Therefore extending this token's use to the UI host is **not established by that guide**. This is a bounded evidence conclusion, not a claim that Oracle forbids or cannot support any external report route. [Property API authentication](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_authenticating_to_oracle_hospitality_property_apis_ocim.htm)

Oracle Analytics Publisher does document `POST /services/rest/v1/reports/{reportPath}/run`. It is synchronous, takes a report path and multipart report request, and returns multipart metadata plus report output. That proves a Publisher capability, not that this OPERA tenant exposes a Publisher catalog or that `kat_statement` is its report path. The example's URL prefix includes `/api/xmlpserver`; it must not be appended speculatively to the Hospitality gateway. [Publisher run report](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acppi/op-v1-reports-reportpath-run-post.html)

**Additional authentication finding:** the Publisher REST authentication page links to Oracle Analytics Cloud authentication. That linked contract explicitly requires an OAuth token with user context and excludes the client-credentials grant for OAC REST APIs. Our working OHIP client-credentials flow is consequently not evidence of OAC Publisher access. [Publisher authentication](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acppi/authenticate.html), [OAC authentication](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acapi/authenticate.html)

Do not generalize that OAC requirement to every OPERA reporting deployment. Oracle's OPERA Reporting and Analytics guide distinguishes OAS from older OBIEE and describes an Object Storage delivery option for OAS reports. That is a separate product/environment-dependent capability; no evidence currently maps this tenant's native AR template, selected transaction context, or browser batch to it. No subscription, report schedule or delivery configuration is proposed here. [OPERA Reporting and Analytics guide, Object Storage chapter](https://docs.oracle.com/en/industries/hospitality/opera-reporting-analytics/ugrna/G55947_01.pdf)

Focused searches of official documentation for the exact UI route and external Statement rendering did not establish a supported `reportviewer`/OHIP contract. Existing spec/module inventory findings remain in the prior research; they were not rerun as a substitute for missing evidence. Search absence is not proof of no API.

## Draft questions for Oracle

Subject: Supported external API for native selected AR Statement PDF in OPERA Cloud

We need a backend integration to obtain the property's existing native AR Statement PDF for explicitly selected Invoice transaction IDs. The UI successfully renders the configured `kat_statement` / `tsk_statement` template. The available OHIP preparation/processing sequence returns Statement data and HTTP 201 JSON, without a PDF or a concrete download link.

1. Which supported API operation, base URL and minimum release/entitlement execute this native AR Statement template and return PDF bytes or an output identifier? Please provide its published contract and a redacted request/response example.
2. How are Hotel, Account, exact selected transaction IDs and the preparation `reportSeqNo` bound to rendering? Is `reportSeqNo` related to the UI `BATCH_…` reference, or are they independent identifiers?
3. Does this operation accept OHIP client-credentials authentication? If it requires a separate reporting identity, what product, OAuth audience/scope, grant and least-privilege role are required? Is direct external use of `/OPERA9/opera/operacloud/reportviewer` supported at all?
4. What is the required ordering of preparation, rendering and `postStatements`? Which step assigns numbers, links invoices or records printing, and how can an ambiguous result be reconciled without creating a duplicate?
5. What is the supported file retrieval, expiry/retrieval-count behavior and retry policy? A reload of a previously viewed UI report returned an HTML “Report not found” page despite HTTP 200.
6. Can the native template produce selected-only Aging as well as selected rows and Balance Due? Our UI sample contained selected rows/total but Account-wide Aging. If not, please confirm the intended scope explicitly.

Provide customer identifiers, private traces or request IDs only through an authorized private support channel if necessary. No credentials, browser cookies, ViewState or customer PDFs are included in this draft.

## Integration decision

Keep native Statement acquisition visibly unavailable until the execution and authentication contract is confirmed and a real selected-output test passes. Do not forward OHIP credentials to an unconfirmed host, transplant browser sessions into Workers, assume `BATCH = reportSeqNo`, or generate a replacement PDF while labelling it native. Invoice-only acquisition and the existing editor remain independent. The unknown is the supported external transport, not whether OPERA can render the document.
