# Direct current AR Invoice totals — ongoing investigation

The owner prefers authoritative OPERA totals over additional inferred tax rules.
The target is the current, exact AR Invoice, including adjustments, transfers,
Payments and splits; a historical Guest Folio is not automatically equivalent.
The deployed 87-case repair remains intact. None of the remaining nine cases is
marked resolved by the metadata findings below.

## Verified source findings

- A fresh exact-invoice Data API query still returns HTTP 403 with
  `No Subscribed Plan or API found`. This is the API plan/gateway route result,
  not evidence that the employee lacks OPERA account permissions. No access,
  subscription or paid service has been changed.
- The published CSH Folio History schema exposes both generic `id` and specific
  `reservationIdId`/`reservationIdType`/`reservationIdIdContext` inputs. Sending
  our Reservation ID through `id` produces the unrelated OPERA Void-function
  validation failure. Removing Invoice No or supplying explicit search flags
  does not resolve it. Using the reservation-specific identity does.
- Exact Hotel/Reservation/Invoice/Folio/date searches then returned one history
  row and `hasMore=false` for all nine unresolved cases and the independent
  Payment reference (ten searches). The API's `count` reports the requested page
  size; `totalResults` and the actual array length are one. Do not interpret
  `count` as the returned-row count.
- Those history rows contain Folio amount, internal window ID and `folioSeqNo`,
  documented as the current Folio tax-record sequence. They do not contain a
  `storedFolioId` or the complete printed VAT/net/non-VAT footer. A Folio tax
  record sequence must not silently be treated as a Stored Folio ID.
- The report catalog confirms the separate configured KAT AR folio report. Its
  descriptor says `canRunSeperate=false`, `procedureRequired=true`,
  `hasParameters=false`, and has no exposed report parameters. Discovering this
  report is not proof that the public reservation Folio Report endpoint can
  generate it in the current AR context.

## Local repair and validation

Corrected the shared `OperaReader.folioHistory` request to use reservation-specific
identity while preserving hotel/date/pagination and AR/checkout scope. A synthetic
transport reproduction failed with the old request and passes with the corrected
contract. Focused client/probe tests: 26 passed. This method currently serves the
diagnostic path; normal invoice generation does not gain direct totals from this
change alone. Not yet deployed in this investigation.

## Next verification

### Independently printed AR reference

Cashier authentication succeeded through the authorized UI. A fresh current
TSAN AR Invoice was downloaded using View Folio / Download, not sent by email.
The two-page original confirms gross/outstanding 22,940.00, VAT 1,489.24,
before-VAT amount 21,450.76 and Non-VAT 0.00. Its Folio identity matches the
selected case. The existing model's 800.00 Non-VAT classification is therefore
wrong for this case; the VAT total itself agrees. The corresponding fresh code
configuration explicitly says `nonTaxable=false` and has no generates.

This is evidence to qualify a shared source-classification path, not permission
to set every missing tax breakdown to zero or copy an arbitrary native footer.
The change must preserve exact code/hotel/posting identity, unchanged source
configuration and independent current-invoice tax parity.

### Local classification experiment — not release-qualified

Implemented explicit direct-charge classification with unchanged before/after
code metadata, hotel/code/group identity and mandatory native tax controls. Both
remaining TSAN Non-VAT cases now pass live source reads and native parity locally.
Current metadata alone is not treated as historical tax proof. Both true and false
`taxInclusive` values are supported only with explicit booleans and native parity.

Six previously passing raw packets require this new qualification; one passes,
five refuse because their native Folio selector is ambiguous. Consequently this
financial change is not deployed and is not claimed to preserve the 87-case
baseline. Full current-worktree tests pass (2,219 tests / 219 files), but synthetic
tests do not resolve that live-source limitation.

### Explicit report-selector experiments

On an independently known Payment reference, MED `billNumber=invoice_no` returned
a valid but empty PDF. `billNumber=folio_no` returned a historical Guest Folio:
its total debit and credit both include the checkout settlement, while current AR
has a remaining balance. A successful HTTP response or matching tax footer is
therefore insufficient to classify it as the exact current AR report.

Using the freshly configured AR report name as `folioType` with the known Folio
number returned base64 whose decoded content is an 84-byte report handle, not PDF
bytes. The response has no links. Published MED describes this field as PDF bytes;
no documented retrieval mapping has been established. Do not invent a download
URL or treat a component of that handle as a Stored Folio ID.

Private historical snapshots also prove distinct AR Invoices can share one
reservation/window/Folio/date. One cohort has seven distinct AR invoices sharing
the Folio, including four on the selected date. Thus explicit Folio number plus
date, or matching aggregate VAT/Non-VAT, does not generally prove exact AR scope.
The production ambiguity fence remains in place. Any new path requires documented
exact selector provenance and independent current-AR content/line coverage.

Inspect current AR prints for the unresolved patterns and prove the mapping of
any direct report/data selector before changing generation. Preserve the existing
identity, complete-source and monetary fences. Independently test real PDF bytes
through the application UI while source access is being investigated.

Private responses and the local real-PDF workflow harness are in ignored
`.tmp/opera-direct-invoice/`; no customer PDFs/JSON or authentication secrets are
included here. Current OPERA Cashier access was confirmed interactively after
the user authorized sign-in; credentials are not saved in project files.

## Official references

### Later bounded stored-folio inspection

The existing Property schema offers `getStoredFolioDetails` with a required
folio ID and optional invoice/date/internal-window qualifiers, but the inspected
AR detail responses omit their optional stored-folio identifiers. Read-only
diagnostics tried only source-observed Folio number and sequence values for two
exact affected TSAN history records, with all available invoice/date/window
qualifiers. Both hypotheses returned empty objects containing only empty links;
no report URL was followed and no mapping was accepted. The WAKL diagnostic
stopped before retrieval because its history payment transaction differed from
the current selected AR transaction. These calls did not print or mutate a bill.

The three remaining cases still lack an automatically usable exact source. A
scoped historical tax classification or documented exact current-AR report/data
selector is needed; current code flags and numerical parity alone are not proof.

An additional current AR print was obtained for a remaining AR-only adjustment
case through the exact selected invoice in OPERA. Its native gross/net/VAT/footer
is retained privately. A bounded browser network observation of that authorized
print showed an ADF UI request and session report viewer, not a Property API
response with an exact reusable stored-folio selector. Only paths/statuses and
parameter names were inspected in output; no user-session credential was copied
to the app or diagnostics. Network observation was disabled afterward. This
proves an independent reference, not an automatic application integration.

### Schema and workflow sources

- [CSH API schema](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/csh.json)
- [Media API schema](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/medcfg.json)
- [Report configuration API schema](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/repcfg.json)
- [Oracle AR Invoice printing workflow and distinction from Folio History](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.1/ocsuh/t_admin_financial_managing_ar_account_invoices_and_payments.htm)
