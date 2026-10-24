# Direct OPERA AR API audit — 23 October 2026

## Finding and status

There are two documented alternatives worth checking before adding more inferred footer policies: **R&A Data APIs expose typed folio-tax totals**, and **AR invoice records can identify a stored folio that CSH can retrieve without regeneration**. The actual EFolio probe returned **HTTP 403 `NoSubscribedPlanorAPIfound`** for the current application; the stored-document path has not yet yielded a usable stored ID. Neither is qualified as an available, current AR source for this installation. Transactional ARS supplies exact invoices and selected postings but its schema does not expose a general invoice-level net/VAT/NonVAT footer object.

This audit uses Oracle's official **26.3** repository tag, Oracle user guides, and the parent's actual Developer Portal inspection/download. The downloaded ARS contract is **26.4.0.0**, with 62 operations, including seven deprecated operations. A structural comparison against cached 26.3 found **identical paths, parameters, responses, definitions and tags**; only `info.description` and `info.version` differ. Thus the footer/stored-ID conclusions were checked against the actual portal contract, not assumed from an old version. Download SHA-256: `65762060406f1eddb178176cb23331a2d74d903fe9d921598ca175dcdc5c8e10`. Other schemas remain explicitly labeled 26.3 unless separately verified. A portal plan association is not proof that another Data API plan is enabled. The official [AR Invoice Postings Postman request](https://www.postman.com/hospitalityapis/oracle-hospitality-apis/request/92wyt5v/get-ar-invoice-postings) was opened by the parent; it exposes stored-folio selector fields that prompted the stored-ID audit.

**Paused:** the proposed exclusive NonRevenue/F&B policy expansion while these alternatives are tested. Previously qualified financial/display work is retained. No subscription, permission, accounting, report configuration or production change is authorized by this audit. Guest Folio and the prohibited `folioReports` route remain excluded as runtime financial sources and fallbacks.

## Capability map

| Surface | Exact documented operation | What it supplies | Actual evidence / limit |
|---|---|---|---|
| AR invoice and payment | `GET /ars/v1/hotels/{hotelId}/accounts/{accountId}/transactions/{transactionId}/invoicePaymentDetails`, `getInvoicePaymentDetail` | Exact invoice identity, amounts, balance and related invoice/payment information | Used by current source collector and repeated freshness checks. Not a general VAT-footer object. |
| Selected AR postings | `GET /ars/v1/invoicePostings`, `getInvoicePostings` in cached 26.3; portal/Postman also uses AR-oriented naming | Selected transaction IDs, amounts, descriptions/references and grouping-capable fields | All 1,402 invoices captured. No undocumented `fetchInstructions` switch. Group/member/description fields documented in the row schema were absent in the earlier complete selected-row inventory. |
| AR invoice records | `GET /ars/v1/hotels/{hotelId}/accounts/{accountId}`, `getAccount`; AR history/transaction responses | `aRInvoiceType` and related invoice types include `storedFolioId`, `storedFolioName`, `storedDebitFolioId`, `storedDebitFolioName` | Actual stored-ID census in progress; input parameter availability alone is not proof a returned stored document exists. |
| General AR transaction search | `GET /ars/v1/arTransactions`, `getARTransactions`; `POST /ars/v1/arTransactions/searches`, `searchARTransactions` | AR invoice/payment transaction detail with hotel/account/invoice/folio filters | The POST is a search operation, not invoice creation. No general net/VAT footer schema found. Do not confuse returned record amounts with footer breakdown. |
| Reservation posting breakdown | `GET /csh/v1/hotels/{hotelId}/financialPostingsNetVat`, `getFinancialPostingsNetVat` | Explicit per-posting `grossAmount`, `netAmount`, associated generated tax rows | Already used extensively. Required scope is reservation + window, with dates/pagination; **no invoice-number selector** exists on this operation. Selected AR ownership must be reconciled separately. |
| Exact posting details | `GET /csh/v1/hotels/{hotelId}/transactionDetails`, `getFolioTransactionDetails` | Exact transaction IDs, `includeGenerates`, code metadata, typed `aRInfo` and available relationships | Already tested. Four transferred AR roots exist here but have no returned generated children. City Ledger current-vs-foreign invoice ownership was resolved through `aRInfo.invoiceNo`. |
| Grouped folio metadata | `GET /csh/v1/hotels/{hotelId}/reservations/{reservationId}/folios`, `getFolio`, with documented `groupType=CheckNo` | Explicit group descriptions/counts/member relationships and summary posting fields | Actual group probes support source-backed POS display. It is not used as replacement money. A targeted TSAN probe retained `rateCode` but all 25 target wrappers still omitted it and original-reservation fields. |
| Stored-folio discovery | `GET /csh/v1/hotels/{hotelId}/folioHistory`, `getFolioHistory` | Paginated folio history, with documented `aR=true`, invoice/folio/date/reservation selectors | Documented alternative discovery path, not yet established as an available stored-AR document source in this audit. |
| Stored document retrieval | `GET /csh/v1/hotels/{hotelId}/storedFolios/{folioId}`, `getStoredFolioDetails` | `storedFolioDetails.folioReportURL`, hotel, stored ID/name and status; schema describes viewing/printing without regeneration | Must start from a real AR-owned stored ID. No arbitrary guessed ID, Guest document substitution or automatic credential forwarding to the returned URL. Current availability is under investigation. |
| Payment-tax records | `GET /csh/v1/hotels/{hotelId}/reservations/{reservationId}/folioTaxPayments`, `getFolioTaxPaymentsInfo` | Thailand payment-tax records with taxable/non-taxable payment amounts and payment types | Not a generic invoice-tax footer. Matching field names alone do not make it a substitute for unpaid AR charge totals. Untested for this purpose. |
| Balance preview | `GET /csh/v1/hotels/{hotelId}/transactionsTotal`, `getBalanceInfo` | Balance and produced postings for supplied criteria | Schema returns `balance`, `postings`, `trxCodesInfo`, not the required complete net/VAT footer. Not established as a saved AR-invoice footer read. |

Primary transactional contracts: [ARS 26.3](https://github.com/oracle/hospitality-api-docs/blob/26.3/rest-api-specs/property/v1/ars.json), [CSH 26.3](https://github.com/oracle/hospitality-api-docs/blob/26.3/rest-api-specs/property/v1/csh.json). Public schema caches are private workspace research artifacts; no customer data belongs in this document.

## R&A Data APIs: the strongest typed-data lead

Oracle documents a common `POST /rna/v1/graphql/` endpoint for reporting subject areas. EFolio is the billing-folio settlement subject area; AR Accounts Receivable contains accounts, invoices, adjustments and postings; Financial Transaction Details Extended includes additional routing and financial details. This is analytical data access, not Guest Folio PDF extraction. [Calling Data APIs](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_calling_the_oracle_hospitality_data_apis.htm)

### EFolio

The exact 26.3 root is:

```graphql
eFolio(limit: Int, offset: Int, input: EFolioQueryArgumentsType!): [EFolioType]
```

The latest official **v26.4 GraphQL** root removes `limit` and `offset`: `eFolio(input: EFolioQueryArgumentsType!): [EFolioType]`. Its input/output fields remain unchanged. Use the version-correct root; the current gateway 403 did not validate either query version. Exact selectors and bounded response handling are required because no replacement pagination argument appears in the 26.4 EFolio contract. [EFolio 26.4 schema](https://github.com/oracle/hospitality-api-docs/blob/v26.4/graphql/data-apis/EFolio.graphql)

Its `folioTaxDetails` view documents these useful fields:

- Identity: `property`, `invoiceNumber`, `folioNo`, `billNumber`, `billGenerationDate`, `folioTaxSeqNumber`, `folioType`, `billStatus`.
- Totals: `totalGrossAmount`, `totalNetAmount`, `totalTax`, `totalNonTaxableAmount`, `totalNonRevenueTaxableAmount`, `totalNonRevenueNonTaxableAmount`, `totalTaxableRevenue`, `totalNonTaxableRevenue`, `totalPaidOuts`.
- Tax buckets: `taxCode1` through `taxCode20`, `taxAmount1` through `taxAmount20`, `netAmount1` through `netAmount20`.
- Currency/freshness candidates: `fiscalInvoiceCurrency`, `updateDate`, `rnaUpdateDate`, `jRNUpdateDateAndTime`.

Input field names use **`foliotaxDetails...`**, not the output view's camel case. A minimal bounded invoice probe uses property plus exact invoice and folio selectors:

```graphql
query ArFolioTaxProbe($input: EFolioQueryArgumentsType!) {
  eFolio(input: $input) {
    eFolioRecordCount
    folioTaxDetails {
      property invoiceNumber folioNo billNumber billGenerationDate
      folioTaxSeqNumber folioType billStatus fiscalInvoiceCurrency
      totalGrossAmount totalNetAmount totalTax totalNonTaxableAmount
      totalNonRevenueTaxableAmount totalNonRevenueNonTaxableAmount
      totalTaxableRevenue totalNonTaxableRevenue totalPaidOuts
      taxCode1 taxAmount1 netAmount1
      updateDate rnaUpdateDate jRNUpdateDateAndTime
    }
  }
}
```

Variables must be filled from an already validated private AR manifest:

```json
{
  "input": {
    "foliotaxDetailsResort": {"_eq": "<validated hotel>"},
    "foliotaxDetailsInvoiceNo": {"_eq": 12345},
    "foliotaxDetailsFolioNo": {"_eq": 67890}
  }
}
```

The numbers above are illustrative placeholders, not real targets. Property supplies conditional input group 1; invoice/folio supply group 2. Do not submit introspection, broad unfiltered queries, customer names or unrelated child views for this capability check. [EFolio 26.3 schema](https://github.com/oracle/hospitality-api-docs/blob/26.3/graphql/data-apis/EFolio.graphql)

### AR and extended transaction views

`aRAccountsReceivable(...)` exposes AR posting/adjustment/ledger views with `grossAmount`, `netAmount`, invoice/folio IDs, `originalReservationNameId`, `rateCode` and `taxInclusiveYn`. `financialTransactionDetailsExtended(...)` includes exact financial records, routing/original reservation and rate fields, transaction-code `nonTaxableYn`/`revenueYN`, and folio-tax data. These are promising for the unavailable posting-origin and footer-role details. They are documented candidates, not assumed returned values. [AR schema](https://github.com/oracle/hospitality-api-docs/blob/26.3/graphql/data-apis/ARAccountsReceivable.graphql), [extended financial schema](https://github.com/oracle/hospitality-api-docs/blob/26.3/graphql/data-apis/FinancialTransactionDetailsExtended.graphql)

### Access and interpretation limits

Oracle's prerequisites specify R&A OAS 24.4+, OHIP 25.3+, and OPERA Cloud Identity Manager; SSD environments are not supported. The guide states that hoteliers need a Reporting and Analytics Data Access add-on. Existing entitlement must be inspected; **do not buy, enable or expand it as part of this audit**. A schema or portal listing does not prove the present app is entitled. [Data API prerequisites](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/r_prerequisites_oracle_hospitality_data_apis.htm)

The parent read the current application's Subscriptions screen without changing it. It showed API Catalog, Hospitality Property and OAuth, with no Data APIs/RNA tab. Property subscriptions included Accounts Receivables, Cashiering, Cashiering Async, Report Master Data Management and Content Service. Together with the exact EFolio 403 this establishes a current-application access limitation; it does not establish whether the hotel has an unused commercial entitlement elsewhere.

Use the approved gateway, application key and existing bearer credentials privately. The official example uses JSON requests and accepts `multipart/mixed; deferSpec=20220824, application/json`; no credential values are retained in the audit. [OAuth/Data API request example](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_oauth_token_api.htm)

Raw R&A rows may repeat at their underlying grain, and joining child views can multiply rows. Do not deduplicate by equal amounts or sum duplicated totals. Inspect GraphQL errors even when partial data is present. Null/missing totals and permission errors are not zero. [Data API guidance](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_data_apis.htm), [Oracle FAQ](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_faqs.htm)

No freshness SLA was established in this audit. A returned original settlement record may lag or differ from the current adjusted/compressed/transferred AR invoice. Before runtime use, prove exact AR identity, record grain, currency, current membership and update interval against the current AR source fence. Specifically test adjustments/transfers and the two excluded-footer cases. Do not assume every Data API total equals the custom current AR footer solely from its field name.

There is also a concrete documentation inconsistency: the GraphQL comment for `totalNonRevenueTaxableAmount` says “not taxable”, while Oracle's R&A dictionary maps the taxable non-revenue measure to `FOLIO$_TAX.TOT_NONREV_TAXABLE`. Preserve the returned fields independently and verify their meaning against actual records before choosing a footer formula; do not resolve this by silently renaming or combining amounts. [R&A field dictionary](https://docs.oracle.com/en/industries/hospitality/opera-reporting-analytics/ddrna/SA_Definitions.pdf)

## Reporting, exports and binary downloads

`GET /rep/config/v1/reports` (`getReports`), `/allReports` (`getAllReports`) and `/reportParameters` (`getReportParameters`) expose report configuration and parameters. The 26.3 REP contract contains **no general run-report/download-result operation**. Its `POST /genericReports` creates configurable report definitions, including End-of-Day settings; it is not a read-only execution endpoint and must not be tried as a download workaround. [REP 26.3 schema](https://github.com/oracle/hospitality-api-docs/blob/26.3/rest-api-specs/property/v1/repcfg.json)

MED documents `GET /med/config/v1/hotels/{hotelId}/reservations/{reservationId}/folioReports`; that is the excluded route in this project. It must not be renamed, parameter-tweaked or used as a fallback. MED's separate `getFileAttachment` requires an actual authorized attachment identity; it does not establish that an arbitrary AR report is an attachment. [MED 26.3 schema](https://github.com/oracle/hospitality-api-docs/blob/26.3/rest-api-specs/property/v1/medcfg.json)

The official R&A Object Storage Postman collection documents `POST <PortalEndPoint>developer/appapi/v1/os/PARUrl` for an existing file/prefix and `GET .../os/allPARInfo`. This creates a temporary pre-authenticated access URL; it is **not report execution**, not ordinary OHIP AR data retrieval, and not a reason to invent a file name/prefix or create access links now. Existing export/report files and authorization must be established separately. [Official object-storage collection](https://github.com/oracle/hospitality-api-docs/blob/26.3/postman-collections/reporting-and-analytics/R%26A%20Object%20Storage%20APIs.postman_collection.json)

EXPCFG documents available/export-generated records, including `getExportsAvailable`, `getExportColumnsAndFunctions` and `getExportsGenerated`. These may describe an already configured export; they do not authorize creating schedules or changing exports. No direct current-AR footer export was established here. [EXPCFG 26.3 schema](https://github.com/oracle/hospitality-api-docs/blob/26.3/rest-api-specs/property/v1/expcfg.json)

For any actual stored-AR URL, validate its association with the selected AR invoice and approved host/redirect chain before fetching. Do not forward Authorization across hosts automatically. A successful stored original PDF must not be advertised as the current adjusted invoice until its identity and content are checked.

## Actual-probe register

| Probe | State on this audit revision | Meaning |
|---|---|---|
| Transactional ARS/CSH source | Extensively tested across the saved 1,402-case corpus and bounded fresh cohorts | Real current identities and posted amounts available; not a general footer endpoint. |
| Exact City Ledger details | 164 IDs in 67 paired blocks; all detail pairs stable; selected pairs stable under existing ID ordering | Typed current invoice ownership selects 69 display-only offset pairs and excludes foreign-invoice groups. No monetary source substitution. |
| TSAN routed wrapper details | 25 exact wrapper IDs returned in stable pairs | No typed original reservation, posting rate or transaction description supplied. |
| TSAN summary metadata with projected `rateCode` | Same 25 wrapper IDs returned; paired source stable | `rateCode` and original-reservation information absent upstream, not merely omitted by our projector. |
| RNA EFolio exact-invoice query | Both actual requests returned HTTP 403 `NoSubscribedPlanorAPIfound`: the initial 26.3 query (`rna-efolio-live.private.json`) and the exact 26.4 root without pagination arguments (`rna-efolio-26-4-live.private.json`) | Unavailable to the current application under its present plan. This proves neither zero data nor absence of an organization-level purchased entitlement. No totals or latency could be tested. No subscription/access change was made. |
| AR stored-folio identity census | No stored-ID keys in 1,402 original captures: 1,747 account, 2,902 detail and 1,581 postings responses; also absent in 261 fresh live AR packets. Original raw invoice-history coverage was only six calls/three cases. Three new exact history reads each returned one exact target, stable pairs, and no stored-folio fields (`stored-history/0..2.private.json`). | Evidence of absence in those responses, not proof the installation can never store AR folios. No actual stored ID or URL available for retrieval yet. |
| Exact AR folio-history discovery | Reservation-selector and root-id variants returned HTTP 400 `OPERAWS-RSV00060`. Omitting those optional selectors, keeping exact hotel/invoice/folio with `aR=true`/`checkOut=false`, returned stable empty arrays for all three controls. The same three controls with the exact known `folioDate`/`folioEndDate` also returned stable empty arrays, no links and no stored IDs (`ar-folio-discovery-invoice/0..2.private.json`). | No AR history document was discovered for these exact selectors. This does **not** establish installation-wide absence of an archive. Responses also reported count=50 with zero rows/totalResults=0; record that pagination inconsistency, not a clean completeness proof. No report generated or URL followed. |
| REP execution / object-storage download | Public-contract research only | No report executed, PAR URL created, export modified or binary downloaded by this audit. |

## Next decision

1. The bounded current-app EFolio and stored-ID/history checks are complete: no available qualified direct replacement was found. Keep the access failure, empty scoped discovery and provider pagination inconsistency distinct; no installation-wide absence or commercial entitlement conclusion follows.
2. If typed folio totals are available, qualify exact current AR scope and timestamps before replacing any reconstruction. Check every footer field independently; keep source-posting closure and original line identity.
3. If a real stored AR document exists, test its source binding and controlled retrieval separately. It may solve binary retrieval while still needing current-adjustment checks.
4. The parent has resumed the previously approved source-backed financial/display implementation while retaining this audit and its known limits. No paid or access expansion is implied by discovering an alternative; a future authorized entitlement or genuine stored ID can reopen the direct-source path.


## Independent latest-tag REST/Postman inventory (23 October 2026)

This supplementary audit used Oracle's official latest `v26.4` tag (release 19 October 2026), not an assumed `26.4` Git ref. It downloaded **all 61 REST JSON specifications** across Property, Distribution, Nor1 and Security and **all six Postman collections** plus the Property workflow guide. It indexed **3,641 REST operations** and **2,923 Postman requests**, reviewed 181 broad report/document/folio/tax candidates, and separately followed successful-response schema references for binary and tax-total fields. These counts describe public repository coverage; they do not establish installation access or runtime correctness. [Official release](https://github.com/oracle/hospitality-api-docs/releases/tag/v26.4), [official repository](https://github.com/oracle/hospitality-api-docs/tree/v26.4).

Git blob comparison against `26.3` confirms that **all 61 REST JSON contracts are byte-identical**, including the previously reviewed ARS, CSH, REP, MED and EXP contracts. All Property, Property workflows, Distribution and R&A Postman collections are also identical; only the Nor1 collection changed. This is a REST/Postman conclusion, **not** a claim that GraphQL is unchanged. Public evidence cache: `.tmp/invoice-parity-20261022/public-api-inventory/`; exact operation/request indexes and tag comparison are retained there. No credentials or authenticated provider calls were used for this inventory.

The additional modules do not reveal a second general AR-invoice PDF renderer, stored-report executor, or exact AR footer object:

| Additional documented operation | Actual output and boundary |
| --- | --- |
| `GET /act/v1/hotels/{hotelId}/activities/{activityId}/attachments`, `getActivityAttachments` | Existing activity attachment metadata (`fileName`, size, description, hotel, ID and URL), not invoice generation or financial totals. |
| `GET /blk/v1/blocks/{blockId}/attachments`, `getBlockAttachments` | Existing block attachment metadata; no AR-invoice selector or tax-footer output. |
| `GET /crm/v1/profiles/{profileId}/attachments`, `getProfileAttachments` | Existing profile attachment metadata; not proof that a stored attachment represents the current AR invoice. |
| `GET /rsv/v1/hotels/{hotelId}/reservations/{reservationId}/attachments`, `getReservationAttachments` | Existing reservation attachment metadata. Any bytes still require an actual returned attachment and the already reviewed content-service contract, rather than an invented report route. |
| `GET /rsv/v1/hotels/{hotelId}/reservations/{reservationId}/tickets/reprint`, `getReprintTickets` | Reservation package-ticket records (`ticketId`, package, ticket number, issue/consumption dates, price, rate and status). Despite “reprint”, this response is not an invoice PDF or AR tax-footer record. |
| `GET /lov/v1/listOfValues/hotels/{hotelId}/genericReports`, `getGenericReportsLOV`; `.../scheduledReportsExport`, `getScheduledReportsExportLOV`; `.../managerReportDetails`, `getManagerReportDetailsLOV`; `.../beforeIncomeAudit/{beforeIncomeAudit}/endOfDayReports`, `getEndOfDayReportsLOV`; `/listOfValues/moduleId/{moduleId}/parameterName/{parameter}/reportsGeneric`, `getReportsGenericLOV` | Report-selection lists (`code`, name, description, active and flexfields), not rendered report bytes, report execution, or invoice financial rows. |
| `GET /ent/config/v1/hotels/{hotelId}/hotelBrochure`, `getHotelBrochure` | Hotel configuration/general information, not a financial document. |
| `PUT /fof/v1/hotels/{hotelId}/bankAccounts/{bankAccountId}/reprintCommission`, `reprintCommissionCheckByRange`; `PUT /fof/v1/hotels/{hotelId}/commissionPayments`, `processCommissionPayments` | These **do** return report-instance/batch IDs and possibly EFT `exportBlobFile` bytes. They are commission-payment/reprint write workflows, not an AR invoice report read. The binary field explicitly describes EFT export, so its existence does not supply an AR PDF route. They were not called. |

Primary contracts for these exclusions: [ACT](https://github.com/oracle/hospitality-api-docs/blob/v26.4/rest-api-specs/property/v1/act.json), [BLK](https://github.com/oracle/hospitality-api-docs/blob/v26.4/rest-api-specs/property/v1/blk.json), [CRM](https://github.com/oracle/hospitality-api-docs/blob/v26.4/rest-api-specs/property/v1/crm.json), [RSV](https://github.com/oracle/hospitality-api-docs/blob/v26.4/rest-api-specs/property/v1/rsv.json), [LOV](https://github.com/oracle/hospitality-api-docs/blob/v26.4/rest-api-specs/property/v1/lov.json), [FOF](https://github.com/oracle/hospitality-api-docs/blob/v26.4/rest-api-specs/property/v1/fof.json), [Property Postman collection](https://github.com/oracle/hospitality-api-docs/blob/v26.4/postman-collections/property/oracle-hospitality-property.postman_collection.json), [workflow collection](https://github.com/oracle/hospitality-api-docs/blob/v26.4/postman-collections/property/oracle-hospitality-property-workflows.postman_collection.json).

Other reachable `totalTax` fields outside the audited financial modules belong to reservation rate quotes, availability/offers, reservation notifications or share/rate-validation results. Their contracts do not make them the selected AR invoice's settled/posted tax footer. Other binary outputs are digital room keys/images, hotel calendar/maintenance images, and reservation alert scripts. The completed indexes distinguish these false leads from actual document/report output. No new authenticated read is justified solely by their names.

### Exact GraphQL 26.4 delta

The three relevant GraphQL files **did** change. Field/type comparison shows:

- EFolio root changed from `eFolio(limit: Int offset: Int input: EFolioQueryArgumentsType!): [EFolioType]` to **`eFolio(input: EFolioQueryArgumentsType!): [EFolioType]`**. Its input fields and output fields, including all `folioTaxDetails` amounts, currency and update fields, are unchanged. No replacement limit/offset/cursor input is declared in this EFolio contract. An exact invoice/folio filter and bounded response handling remain necessary.
- AR Accounts Receivable has the same root `limit`/`offset` removal; its other field signatures are unchanged.
- Financial Transaction Details Extended removes root `limit`/`offset`, adds input `financialunifiedDetailsFtUpdateDate: DateTimeInput @conditionalInputPair(pair: 2)`, and adds financial-detail output `alternateTransRef: String` and `creditCardNumber4Digits: String`. These are not additional tax-footer totals; the card field is unnecessary for this task and should not be requested.

Latest primary contracts: [EFolio 26.4](https://github.com/oracle/hospitality-api-docs/blob/v26.4/graphql/data-apis/EFolio.graphql), [AR Accounts Receivable 26.4](https://github.com/oracle/hospitality-api-docs/blob/v26.4/graphql/data-apis/ARAccountsReceivable.graphql), [Financial Transaction Details Extended 26.4](https://github.com/oracle/hospitality-api-docs/blob/v26.4/graphql/data-apis/FinancialTransactionDetailsExtended.graphql).

The first actual EFolio probe used the valid 26.3 root with `limit`/`offset`; its gateway 403 did not validate the query against either schema. A separately named private worker used the exact 26.4 root without pagination arguments while preserving the exact hotel/invoice/folio predicates, financial-only output and bounded response reader. The second actual probe also returned HTTP 403 `NoSubscribedPlanorAPIfound`. Both evidence sets and workers are preserved; no application subscription was changed.
