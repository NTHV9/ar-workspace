# Native selected Statement API research — 2026-09-09

Status: **researched, not provider-tested or enabled**. This task performed public documentation reads and local specification inspection only. No credentials, customer payloads, OPERA mutations, email, cloud changes, commits, or push. Native reservation Folio transport already proved by the parent task is outside this investigation.

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
