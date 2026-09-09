# Native selected Statement API research — 2026-09-09

## Printed Invoice visibility: complete read-only audit — 2026-09-09

Workflow a9e0c809-d238-467f-ac53-b1f84c42a3bb compared the same KAT Account through normal getAccount, getAccount with the documented Statement fetch instruction added, and zero-inclusive invoicePayments history with complete pagination and duplicate/root-count checks.

Actual result: normal Invoices41; with Statement41; history452invoice/payment rows, of which43Invoices have nonzero balances. Exactly2open history Invoices are absent from both Current variants, both printed=true. Both are the earlier selected POST-trial identities. The Statement instruction adds zeroInvoice rows. Account header balance is stable between Current reads; Current Invoice sum does not match Account, while full open-history sum does match Account. Private raw results stored only under the existing job's trial/visibility UUID object.

This confirms a printed-item coverage gap in the getAccount projection for this sample; it does not prove all environments or Account Types behave the same. Do not classify missing Current rows as zero. A focused regression now proves the current pipeline rejects publication of a missing printed-but-open Invoice. Normalization was not relaxed, no invoice was removed or changed, and this audit did not publish a financial snapshot or issue report POSTs.

Prospective correction requires a scoped reconciliation that retains exact shared identities/balances, restores only positively verified open printed rows from complete history, checks parent/child context and Account totals, and validates stability before atomic publication. Native document validation must use the same confirmed identity source so restored rows are not wrongly rejected by Current-only checks. Unknown discrepancies remain fail-closed. This design is not implemented/enabled by this diagnostic patch.

External rendering/authentication follow-up and a draft Oracle inquiry are in STATEMENT_EXTERNAL_CONTRACT_FOLLOWUP.md. No message was sent. Generic OAC Publisher authentication must not be assumed equivalent to OHIP client credentials; actual tenant reporting product/entitlement remains unknown.


## Complete three-window HAR capture — 2026-09-09

Owner provided Downloads/1.har,2.har,3.har in UI order after enabling automatic DevTools for popups. All were read locally; no raw capture, customer content or state/credential values were copied into Git.

- 1.har:7requests. Entry0 returns Batch Statements Options, entry1 Batch Report Destination/kat_statement, entry5 launches the batch window.
- 2.har:106requests. Entry98 at05:04:35.350Z returns Finished Successfully and the reportviewer URL with a concrete batch reference.
- 3.har:1request at05:04:37.375Z. GET on the observed UI host /OPERA9/opera/operacloud/reportviewer with ex/rep query parameters returnsHTTP200, Content-Type application/pdf and Content-Disposition inline, without redirect. The batch reference EXACTLY matches that in 2.har entry98. This establishes the browser-side chain through the PDF retrieval request.
- No Cookie/Authorization/x-api-key request headers are present in these sanitized captures. Their absence is not proof of anonymous access or that UI session authentication is unnecessary. No external-authentication experiment was performed.

PDF-body caveat: 3.har content reports348bytes/base64. Decoding yields HTML containing an embed type=application/pdf with src=about:blank/internalid, not %PDF- binary; pypdf rejects those captured bytes. This is evidence of a viewer representation in the export, not a usable PDF file. Combined with the live rendered Statement screenshot from the same UI run, the request headers and matched batch establish successful browser viewing. Do not treat the348-byte body as the original PDF or ask the owner to repeat the same capture merely to obtain it.

Browser trace collection is sufficient for the current question. Remaining integration gap: a supported external operation to create the native batch/output and retrieve it using authorized backend credentials. The captured generation steps are ADF/JSF UI posts, not exposed Publisher run or OHIP renderer requests; internal server operations are not visible in browser HAR. reportSeqNo from getARStatements must not be assumed equivalent to BATCH ID. Never transplant JSF ViewState or browser cookies into the Worker. No new Create Statement or UI refresh is needed for this analysis.


## Viewer reload failure — owner screenshot, 2026-09-09

Owner screenshot shows the correct reportviewer tab returning Report Execution Error / Report not found after refresh. Network displays HTTP200 for the document; this is an HTML error page, not a successful PDF. The prior advice to reload an already-viewed report is not reliable for this flow and must not be repeated.

This is consistent with transient or context-dependent report output, but the screenshot does not prove single-use consumption, a timeout duration, expired session, or a configuration defect. Do not change OPERA configuration based on this generic error message.

Re-read the named local opera-statement-pdf.har after this report: it still contains104entries and zero reportviewer requests, matching the earlier Batch Reports capture. Therefore the latest failure is established by the screenshot, not by a newly exported HAR. No need to request another copy merely to confirm the visible failure.

Any future successful-download capture must be armed for new report popups before their first navigation, then observe one explicitly initiated preview. Do not keep refreshing failed report IDs, repeat creation blindly, or treatHTTP200 alone as PDF evidence.


## Second HAR: batch report window — 2026-09-09

Read Downloads/opera-statement-pdf.har locally. Despite its filename, its104entries capture the LaunchReader / Batch Reports LaunchPage window, not a direct PDF-tab reload. No reportviewer request, application/pdf response, or /services/rest/ request is included. No Cookie/Authorization/x-api-key request headers were present by header-name inspection; preserve all HAR content privately.

Evidence progression:
- Task-flow navigation uses307/302 redirects between OPERA9 and tenant UI routes.
- Entry22 is LaunchReader POST; entries56,91,94,97,100 are LaunchPage POSTs returning ADF text/xml.
- Entry97 contains Finished Successfully and invokes ODEUtils.WindowManager.launch / OperaUtils.launchUsingCustomScheme with /OPERA9/opera/operacloud/reportviewer, ex=PREVIEW and an observed rep=BATCH_{id}.
- Thus the parent-tab HAR proves launching the batch window, and this second HAR proves the batch window returning a concrete viewer URL after completion. Neither exposes the server-side renderer API or proves external OHIP authorization for that URL.
- The existing UI PDF was already visually verified. Repeating Create Statement is unnecessary. If direct retrieval headers/body are needed, capture specifically the tab whose address contains /reportviewer, not the Batch Reports status tab.

A focused official documentation search did not establish reportviewer as a supported external Property API. Oracle documents Property API client credentials and application-key authentication separately: https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_authenticating_to_oracle_hospitality_property_apis_ocim.htm . Do not replay JSF ViewState or transplant UI cookies into the Worker as an undocumented substitute.


## Local HAR inspection — 2026-09-09

Read the owner-provided Downloads/opera-statement.har locally without copying it into the repository. It contains12entries:6form POST requests to the OPERA UI faces/opera-cloud-index/OperaCloud route and6image GET requests. All captured requests returnedHTTP200. Form responses are text/xml ADF partial UI responses, not JSON OHIP results or PDF. No Cookie/Authorization/x-api-key request headers were present by header-name inspection; the file still contains customer UI content and JSF ViewState and must remain private.

Request sequence aligns with the observed UI:
- Entry0 returns Batch Statements Options.
- Entry1 returns Batch Report Destination and kat_statement.
- Entries8/9 are UI destination/printer initialization events.
- Entry10 returns ODEUtils.WindowManager.launch / OperaUtils.launchUsingCustomScheme and a UI /launch URL with TPLNG/TPFLSCRN keys. Parameter values and state tokens were not printed.
- Entry11 completes popup handling.

There are zero captured reportviewer requests, zero PDF MIME responses, and zero /services/rest/ Publisher requests. The HAR covers the parent tab; the report-window and PDF-tab network requests are absent. This does not prove the server cannot use Publisher internally.

Earlier proposed evidence step (superseded by the reload failure below): capture the existing reportviewer PDF tab's Network on a single reload and export a separate sanitized HAR outside Git. No further Create Statement is needed merely to capture that GET. This may establish PDF retrieval method, headers, redirects and browser authentication dependencies; it will not by itself establish a supported external OHIP rendering API or the missing server-side batch creation contract.


## Owner-prepared Edge UI trial — 2026-09-09

Owner explicitly authorized using the already-selected three Invoice rows in Edge. Operated the existing OPERA tab without changing selection: Create Statement → Batch Statements Options → Process Statements → Batch Report Destination (kat_statement, Destination set to preview) → Process. Exactly one UI sequence; no Email/Print destination selected.

Batch Reports showed Complete / Finished Successfully. A new tab displayed a one-page native Statement of Account PDF at the observed UI route:
https://{OPERA-UI-host}/OPERA9/opera/operacloud/reportviewer?ex=PREVIEW&rep=BATCH_{observed-id}

The real batch ID and customer screenshot remain private to the browser; no raw screenshot/customer PDF/HAR enters Git. The PDF visibly contained exactly the three selected Folios, with their row amounts and Balance Due matching the selected total. It also printed Voucher references.

Scope finding: Aging Summary represented the whole Account and did not sum to the selected Balance Due. Do not describe this native template's Aging as selected-only, or silently alter the template/PDF to imply otherwise. This proves selected line membership and selected Balance Due for this UI sample, not selected Aging.

The observed reportviewer is an OPERA UI route on the UI host, not a proved OHIP/Publisher external API. We have not established its request method/response headers, how the batch ID is obtained, its supported external authentication, or the server-side rendering sequence. No browser cookies were copied to the Worker or used to make external API calls.

Tool limitation: the connected Edge extension exposes page controls and rendered PDF screenshots, but no Network capture/DevTools control API. The owner opened DevTools; a Network HAR export is still needed to inspect the captured request sequence. Request a sanitized HAR saved outside Git, inspect locally while suppressing credentials/customer content from output, and retain only structural findings. Do not claim Network was captured by the agent.


Status: **research and tenant metadata reads complete; native Statement PDF transport not verified or enabled**. This task performed public documentation reads and local specification inspection only. No credentials, customer payloads, OPERA mutations, email, cloud changes, commits, or push. Native reservation Folio transport already proved by the parent task is outside this investigation.

## Owner-authorized POST trial — 2026-09-09

The owner subsequently explicitly asked to try getARStatements → postStatements. This supersedes the earlier decision not to make a speculative POST for this one bounded trial. The normal document generator remains unchanged and does not issue this POST.

- KAT job75e9a596-1c57-4fc2-96c7-cbe74a80bba5, two previously selected eligible Invoices. Fresh Current Account and prepared descriptor membership/balances matched before POST.
- Exactly one POST to /ars/v1/hotels/{hotelId}/accounts/{accountId}/statements, preserving the native descriptor in criteria.statements and matching inclZero=false/inclPrinted=true/inclFolios=false criteria. Database claim and immutable prepared marker prevent repeat execution.
- Actual response: HTTP201, application/json;charset=UTF-8, two-byte body {}, no body links. Location resolves to the gateway's /ars/v1 base with no query. It is not a PDF/download resource. Follow-up guard rejected that base before any request; later runs read retained evidence and did not repeat POST.
- Before/after whole-response digest differed. Follow-up found the two selected transaction IDs absent from Current Account invoices, but each appeared exactly once in invoicePayments history with the SAME nonzero balance as the prepared descriptor. History query completed with hasMore=false. Do not call the invoices paid/cleared, claim Current membership unchanged, or assume the cause of the changed representation.
- Further investigation must establish how printed Statement items are represented in Current Account and its Statement fetch instruction before changing refresh normalization. Existing exact Current/history validation preserves the prior snapshot on mismatch; do not bypass it or remove these open items.
- Private evidence only: jobs/{jobId}/trial/prepared.json, response.bin, response-metadata.json, summary.json and audit JSON. No customer bytes in Git. Summary's initial status field was rendered as unknown by Workflow output; retained metadata was subsequently read and confirmed postHttpStatus=201.
- Read-only follow-up instance d57cf3a7-efe9-4aee-92bd-0b33d1b07ab3 confirmed identity/balance facts. The document remains uncertain/requires review, not ready, and no billing/send event was recorded.
- Source4c3dddb8f722346f7ba86e604fb2134d53210c88, deployment4a2954881270432c84b250042c0b636f, Workflow versionf25acd6e-55e7-4d05-bc23-e402e9edd299. Build passed for initial trial, subsequent backend changes typechecked and connector bundle built;128unit tests passed before the final read-only diagnostic expansion. No frontend change.
- Native Statement PDF acceptance remains incomplete. The proposed two-operation sequence worked as preparation/processing, but this live response does not demonstrate PDF generation/download.

## Parent integration update — 2026-09-09

Root subsequently performed authorized tenant reads. Published reports exact-name queries returned0; `/allReports` with includeUnpublished=true returned exact report definitions for kat_statement and tsk_statement,1each,hasMore=false. Both descriptors areIndividualOpenItems; report metadata hasParameters=false,formToRun=O9_GENERIC_FORM,procedureRequired=true. Parameter reads returnedemptylists andno rendererlinks. Follow-up on source e34439c confirmed both reports have moduleType=Cus, customized template present, data source present/typeODT, externalReportUrl absent andisUrlDynamic=false. Read-only runs: KAT152a91d5-14b3-4e1e-912f-3a73a73d4ce4; TSKfdc900ed-e23f-49df-9946-f46c1f2758dd. These fields do not establish report execution or attachment mapping. These are actualmetadata findings, notStatementPDF execution evidence. NativeStatementtransport remainsunverified andanowner questionrequests the specificOracleexecution/downloadcontract. No speculativepostStatements orreportconfigurationmutation.

## Finding

The published contracts establish selected Statement **preparation**, report **configuration/parameters**, and Statement **print-history processing**. They do **not** establish a complete native Statement PDF rendering/download transport. A successful `postStatements` response cannot be treated as a PDF, and calling it speculatively would risk print-history/numbering changes without acquiring a document.

The exact missing contract is the operation that executes the configured Statement report with the prepared `reportSeqNo`/selection context and returns PDF content or a documented attachment/download identity. This is an external integration gap, not evidence that OPERA cannot produce Statements. No report name, parameter binding, attachment ID, bill number, or renderer path should be invented.

## Evidence and reproducibility

Official public repository HEAD observed: `dd631fbd5d0fce74a7dbdf96b43f07ce587211f2`, committed 2026-09-04. Cached `ars.json`, `medcfg.json`, and `repcfg.json` content was compared with that pinned revision and matched (ignoring surrounding whitespace). All three advertise OPERA Cloud release `26.3.0.0`.

Primary specifications:

- [Accounts Receivables contract](https://github.com/oracle/hospitality-api-docs/blob/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2/rest-api-specs/property/v1/ars.json)
- [Media/content contract](https://github.com/oracle/hospitality-api-docs/blob/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2/rest-api-specs/property/v1/medcfg.json)
- [Report configuration contract](https://github.com/oracle/hospitality-api-docs/blob/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2/rest-api-specs/property/v1/repcfg.json)
- [Official Postman collections](https://github.com/oracle/hospitality-api-docs/tree/dd631fbd5d0fce74a7dbdf96b43f07ce587211f2/postman-collections)
- [Oracle guide: AR Statement generation and numbering](https://docs.oracle.com/en/industries/hospitality/opera-cloud/22.5/ocsuh/t_accounts_receivable_generating_accounts_receivable_statements.htm) — historical product behavior context, not the current transport contract.

Inspected public property-v1 module inventory, full paths in `ars`, `medcfg`, `repcfg`, `csh`, and additionally `ops`, `bof`, `cms`, `expcfg`, `cshasync`. Inspected request URLs/names in the cached property collection (2,410 requests) and workflow collection (276 requests). These sources did not supply a Statement report renderer. This is a bounded search; it does not prove no private, newly published, or separately entitled Oracle API exists. Additional downloaded public specs are only under `.cache/oracle/`.

## 1. Selected preparation: exact contract

```http
GET /ars/v1/statements?hotelId={hotel}&accountID={accountId}&transactionNo={selectedA}&transactionNo={selectedC}&inclFolios=false&inclZero=false&inclPrinted=true
```

Operation `getARStatements`; JSON response. Query spelling is `accountID`, with uppercase `ID`. `hotelId`, `accountID`, and `transactionNo` are arrays encoded as repeated keys (`collectionFormat: multi`); transaction numbers are numeric in the schema. `transactionNo` means the unique Invoice transaction identifier. Do not replace it with `invoiceNo`, which can recur across folios. The older `/accounts/{accountId}/statements` GET is explicitly deprecated.

`inclPrinted=true` is a deliberate application proposal for repeat document preparation; the published default is false. Retain the already tested application's flags unless a separately validated change is necessary. No `offset`/`limit` parameters exist on this preparation operation. Do not invent pagination. Enforce returned membership and fail if the requested set is incomplete or duplicated.

Response `definitions/statements` contains `aRStatements[]`, `links`, and `warnings`. Each `aRStatementType` contains:

| Field | Published type / meaning |
|---|---|
| `hotelId`, `accountId` | Property and unique AR Account identity |
| `balance` | `currencyAmountType`, Statement balance |
| `invoices` | Array of `aRInvoiceType`, max 4,000 |
| `statementNo` | Integer, when numbering functionality is on |
| `reportSeqNo` | Integer, internal sequence used to mark Statement invoices |
| `inclFolios` | Boolean |
| `statementName`, `reportFileName` | Report names to use for printing; not binary content |
| `type` | `BalanceForward` or `IndividualOpenItems` |

Source pointers: ARS `paths./statements.get`, `definitions.statements`, `aRStatementType`, `aRInvoicesType`, `statementType`.

Local `worker/opera/selected-statement.ts` verifies exact A/C membership and selected balance with B excluded; parent reports those checks passed in both hotels. That proves the preparation JSON only. Neither this schema nor that test proves PDF rows, grand total, aging scope, or template output. A `BalanceForward` report especially needs explicit scope verification; never represent its account-wide balance-forward/aging amounts as selected totals.

## 2. Report metadata and parameters: concrete next reads

Use the exact `statementName`/`reportFileName` from the validated descriptor to find the configured report for the same property:

```http
GET /rep/config/v1/reports?hotel={hotel}&name={encodedObservedReportName}&includeInternalReports=true&includeUnpublished=false&includeWatermarkDetails=false
GET /rep/config/v1/reportParameters?id={observedModuleId}&idContext={observedContext}&type={observedType}
```

`/allReports` is also a published GET with the same relevant filters. `name` is a **partial** name/description search, so require exact identity/property matching in the returned reports. Both discovery operations accept `limit` but no `offset`; use narrower known-name/id queries or documented returned links instead of assuming a complete result when limited.

`getReports` returns `reports.reports` via `reportsType`, whose report objects include `moduleId` (`uniqueID_Type`), `reportName`, `hotel`, `moduleType`, `hasParameters`, `formToRun`, and `procedureRequired`. Preserve the actual module ID/context/type. The official cached Postman example uses `idContext=OPERA&type=ModuleId`; this is contract evidence for the identifier convention, not permission to invent an ID.

`getReportParameters` returns a top-level `reportParameters[]` via `reportParametersType`. Individual parameters include `name`, `label`, `dataType`, `value`, date/format masks, display order, and LOV details. Parameter names and runtime bindings for the actual hotel Statement template are **not known** from the static schema. Metadata does not itself specify how to execute a report or submit these parameters.

Source pointers: REPCFG `paths./reports.get`, `paths./allReports.get`, `paths./reportParameters.get`, `definitions.reportType`, `reportParameterType`.

## 3. Statement processing POST: exact shape and limitations

```http
POST /ars/v1/hotels/{hotelId}/accounts/{accountId}/statements
Content-Type: application/json
```

Body schema is `statementsToBeGenerated`. Its relevant shape is:

```text
criteria:
  statements: array<aRStatementType>  # validated returned descriptor(s), max 4,000
  statementCriteria:
    filterDate: dateRangeType
    statementText: string
    inclZero: boolean
    inclPrinted: boolean
    balanceForwardDate: date
    inclFolios: boolean
```

The schema does not declare these nested properties required. This does not establish which property-specific combinations work. Selection is carried through `criteria.statements[].invoices`; `statementCriteria` has no transaction-ID list. The safest prospective payload preserves one validated native descriptor and its exact selected Invoice identities, rather than constructing an account-wide request.

Crucial inconsistency in the published description: the operation text says it returns Statement number/report sequence when numbering is used, but its actual `201` schema is only `status` with `warnings` and `links`, plus a `Location` response header. No PDF property or typed Statement-number response is declared. Record observed outcomes privately and require a documented follow-up before implementing delivery.

`aRGenerateStatementCriteriaType` explicitly describes processing printed Statements to create history and update invoices; its `statements` field refers to details received from the fetch operation and sent to printing. This suggests a print-processing/finalization role, but the required renderer/POST ordering is **not established**. Do not assert that POST necessarily precedes or performs rendering.

Source pointers: ARS `paths./hotels/{hotelId}/accounts/{accountId}/statements.post`, `definitions.statementsToBeGenerated`, `aRGenerateStatementCriteriaType`, `aRStatementCriteriaType`, `status`.

## 4. Side effects, reconciliation, and non-duplicate handling

The historical Oracle guide explains that numbering assigns unique per-property Statement numbers and associates invoices; invoices already associated require unlinking before joining another Statement. The current ARS contract independently exposes `unlinkInvoiceFromStatement`. This application must not invoke unlinking as an automatic workaround.

The current specification defines `x-request-id` as an incoming request identifier, with a UUID pattern. It offers **no idempotency guarantee**. Reusing that header is not sufficient to prevent duplicate Statement generation/processing.

Proposed application controls: durable command keyed to owner, Hotel, Account, immutable selected Invoice manifest/order, source snapshot, report identity, and action intent; atomically claim before an outbound write-like operation. Store request ID and provider outcome privately. After a timeout/disconnect or unpersisted response, mark outcome ambiguous and prevent automatic repeat. A client retry should recover the existing command rather than issue another POST.

The published reconciliation read is:

```http
GET /ars/v1/hotels/{hotelId}/profiles/{profileId}/accounts/{accountId}/statementsHistory
```

Use verified profile/account identity, not guessed identifiers. Optional filters include `dateSent` and `reportFileNameWildCard`. History records expose `reportName`, `reportFileName`, `dateSent`, and `statementNo`; this is not a guaranteed command-id lookup or document download. A coincidentally matching date/name is insufficient to disambiguate concurrent work. Preserve an unresolved state when exact evidence is unavailable.

Print history does not establish that the app actually billed/emailed a customer. Do not update first billing date, stage, or actual-send statistics from OPERA print history.

## 5. Transport boundary and decision

`medcfg` has native `getFolioReport` for a specific reservation, generic attachment fetch by attachment identity, and customized-letter retrieval. No reviewed contract maps `statementNo`, `reportSeqNo`, or `reportFileName` to either attachment ID or customized-letter ID. The official customized-letter example uses `ResvConfLetterId`. Trying a Statement report filename as that ID, or putting a Statement number into Folio `billNumber`, would be guessing.

`postGenericReports` configures report definitions; it is not a PDF execution endpoint. Do not create generic report configuration in an attempt to render an existing Statement. No email endpoint is appropriate as a download workaround.

Next actions, in order:

1. Perform the two report metadata reads above with the parent task's authorized OPERA reader; retain only field presence/status/count evidence in Git.
2. Inspect documented returned HATEOAS links privately for an actual renderer/attachment relation. Reject arbitrary URLs, cross-host credential forwarding, and undocumented parameter substitution.
3. Obtain the tenant's published API operation/Oracle confirmation for native Statement report execution, exact parameter binding (including selected `reportSeqNo`), output retrieval, and required sequencing relative to `postStatements`. This is a specific missing contract, not a request to re-prove Folios.
4. Only once transport and durable command handling exist, run one bounded native selected A/C test in each hotel. Validate actual PDF bytes, all selected/excluded identities, selected total and aging scope, and record numbering/history outcomes. Keep customer bytes private.
5. Until this passes, expose native Statement unavailable with a precise reason. Invoice-only workspace acquisition may continue independently. No silent system-generated Statement fallback and no completion claim for native Statement acceptance.

Root task owns the combined `PROJECT_STATUS.md` update to avoid concurrent edits; cite this report and retain Task 1 as incomplete until real native PDF transport is proved.
