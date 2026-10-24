# AR-only POS source probes — 23 October 2026

Status: read-only research and scoped probe preparation. No new financial proof,
production route, service subscription or accounting write is approved by this note.
The current baseline is 1,212 seven-field matches and 190 unqualified captured
Invoices. Current AR PDFs remain acceptance references; Guest Folio reports are
excluded from every proposed source.

## Recommended next step

Read the actual POS receipt and interface itemizer mapping for six privately
identified scopes. The useful new evidence is an explicit mapping from an OPERA
transaction code to a service-charge itemizer, rather than a service-looking
description or a NonRevenue/F&B flag.

Oracle's interface guide defines itemizer families: `SC1`–`SC16` are service
charges, `DC1`–`DC16` discounts, `TX1`–`TX63` taxes and `ST1`–`ST16` sales. It also
documents mapping transaction codes to individual itemizers. This provides a
specific role-evidence hypothesis to test; it does not prove that any particular
property has that mapping configured. [Oracle interface transaction-code guide](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.2/ocsuh/t_admin_interfaces_configuring_property_interface_transcation_codes.htm).

Conditional inventory: 70 of the 158 role failures contain only the three
service-labelled unsupported code scopes under investigation. Of these, 50 also
pass the current receipt-partition arithmetic and cardinality checks (11 TLKL,
39 TSAN). These are planning counts, **not qualified outcomes**. Do not relax the
other 20 partition failures while qualifying a service role.

## Exact read contracts

1. `GET /csh/v1/hotels/{hotelId}/check/{checkNumber}` (`getCheckDetails`). The
   documented selectors are property and check number only. Response fields are
   `checkDetailsInfo` text, encoded `checkImageInfo`, `checkNumber`, `checkDate`,
   links and warnings. No reservation/date query flag is documented. The selected
   scopes use 21-digit check identifiers: preserve them as strings and do not
   truncate, convert to Number, or guess a shorter receipt identifier. Validate
   returned identity/date and any receipt outlet against source evidence before
   using its contents. [Oracle Cashiering 26.3 contract](https://raw.githubusercontent.com/oracle/hospitality-api-docs/main/rest-api-specs/property/v1/csh.json).

2. `GET /int/config/v1/hotelInterfaceTypes?hotelIds=<hotel>&interfaceTypes=Pos&includeInactive=false`
   (`getHotelInterfaces`). The first two query parameters use repeated-value
   array encoding. Read `hotelInterfaces[]` and validate its property/type before
   using the returned `logo`; do not invent a logo from a code or name.
   [Oracle Interface Configuration 26.3 contract](https://raw.githubusercontent.com/oracle/hospitality-api-docs/main/rest-api-specs/property/v1/intcfg.json).

3. `GET /int/config/v1/hotels/{hotelId}/logos/{returnedLogo}?fetchInstructions=TransactionCodesInfo`
   (`getHotelInterfaceDetails`). Here `fetchInstructions` is an array encoded as
   repeated query values; request only the single `TransactionCodesInfo` value.
   Inspect `details.transactionsInfo.itemizers[]` (`splitCode`, `splitPost`,
   `splitFactor`) and `transactionCodes[]` (`code`, `tipCode`, outlet/serving-period
   selectors and `itemizersShortInfo[]` containing `code`, `itemizerName`,
   `itemNumber`). Join the actual numbered itemizer definition; a free-text
   `itemizerName` by itself is insufficient. Capture only the allowed transaction
   mapping section, not any unexpected communication/credential section.
   [Oracle Interface Configuration 26.3 contract](https://raw.githubusercontent.com/oracle/hospitality-api-docs/main/rest-api-specs/property/v1/intcfg.json).

Only fixed-path GET capabilities belong in the diagnostic. No report, POST,
print, arbitrary returned-link fetch, configuration update or permission change.
The normal configured OPERA origin and hotel headers remain authoritative.

## Private scope packet

`.tmp/invoice-parity-20261022/astra-pos-check-probe-scopes.private.json` contains
the exact authorized-source manifests, check/date/window/cashier values and
selected transaction IDs. No customer identifier or amount is copied here.

| Index | Evidence question |
| ---: | --- |
| 0 | TLKL service role for code 2706, with base and VAT siblings |
| 1 | TLKL service role for code 2436 and explicit Tax/F&B code 2437 |
| 2 | TSAN service role for code 2206 |
| 3 | TSAN distinction between tip code 2204 and service code 2206 |
| 4 | Repeated VAT records sharing one exact receipt scope |
| 5 | A negative discount sharing a receipt with positive charges/VAT |

Start with 0–3. Read paired receipt/config responses around a fresh, fully
paginated selected-source interval. Retain raw allowed evidence privately, hashes
and observed timestamps. A returned receipt for another date, missing identity,
multiple possible mappings or changed response is an unresolved result, not a
license to use arithmetic to choose a candidate.

The parent already performed five exact-ID `transactionDetails` probes with
`includeGenerates=true`: all 25 requested IDs were returned with stable pairs,
but no parent/group/receipt linkage fields were supplied. This route succeeded
as a read and currently supplies no extra ownership proof for those examples.
Do not repeat it unchanged or call it an API failure.

## Smallest implementation if the mapping is actually present

Add a separate, explicit POS role-evidence record bound to property, returned
interface/logo, exact mapping row and numbered `SC` itemizer. Require an
unambiguous code-to-role mapping consistent with the actual selected receipt and
transaction-code metadata. Stable current mapping validates the observed posting
relationship; it must not be described as historical configuration.

Extend only the NonRevenue/F&B **service** admission when this proof succeeds.
Keep complete source snapshots, exact selected identities, receipt closure,
known windows, cashier consistency, separate signs, one VAT atom per partition,
posted amounts and rounding checks unchanged. Keep tips, discounts, non-revenue
exclusions, multiple VAT atoms and unknown receipt ownership outside that task.
Do not copy receipt totals into the Invoice or replace its posted VAT.

Required negative cases: SC mapping to another code/property/interface; duplicate
or ambiguous mapping rows; ST/DC/TX/tip masquerading as SC; missing itemizer
number; changed split factor or mapping; foreign/reused receipt date; incomplete
selected check; contradictory current role; unknown source-to-interface mapping;
and unchanged gross masking a VAT/before-VAT/NonVAT difference. Preserve all
existing cross-structure identity and cancellation tests.

Qualification must compare every before-VAT, VAT, NonVAT, gross, outstanding,
debit and credit value against actual current AR PDFs. Per-item source-role and
receipt membership proof is separate from footer agreement. Preserve selected
visible lines. The five known native description/reference differences remain
separate and must not be described as solved by a tax-proof change.

## Routes not to substitute automatically

`revenueTypeMapping.serviceChargeTrxCode` is an explicit service mapping, but the
documented feature serves event posting and proforma invoices. Do not apply it
to ordinary restaurant POS postings without event provenance. [Oracle revenue
type mapping guide](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.4/ocsuh/t_osem_configuring_revenue_type_mapping.htm).

Generic export `MappingCodes`, `otaTaxType`, current revenue flags and descriptions
do not independently establish POS receipt ownership. Receipt text/image lacking
code or identity linkage can help diagnosis but must not become an amount-only
matching fallback. If the new probes lack usable evidence, record exactly which
mapping/receipt field is absent and choose a different bounded source probe.

Public contracts are cached under ignored `public-contracts/` in the private audit
directory. Candidate counts and raw scopes are also private; no fixtures containing
customer data belong in Git.

## First receipt probe results

Four paired reads returned stable plain receipt text. No structured check-number
or check-date echo and no image were returned. Body dates agree with the selected
posting dates. The printed CHK number is **not** the opaque 21-digit lookup key;
the two TLKL printed numbers do not even match the suffix of its leading portion.
Do not invent a prefix/substring conversion. Preserve the exact requested key
and property as lookup provenance, and validate separately parsed body date and
outlet. This observation does not establish a general identifier transformation.

| Probe | Observed reconciliation | First-profile decision |
| ---: | --- | --- |
| 0 | Receipt base, service, VAT and payment each equal the selected posting buckets exactly. | Useful service-role candidate, awaiting actual itemizer mapping and fresh complete source interval. |
| 1 | Receipt beverage base, service, VAT and payment each equal the selected posting buckets exactly. | Same boundary as probe 0. |
| 2 | Full receipt has a higher base/payment than the selected AR group; service and VAT are unchanged. Selected source includes an offsetting base adjustment. | Exclude adjusted receipts from the first role extension. Never replace selected money with receipt money. |
| 3 | Receipt lists two room-charge tenders, while the selected AR group is one portion. Receipt tips are separately labelled and included in its before-VAT arithmetic. | Exclude split allocations and tip treatment until their own identity/allocation proof exists. |

Private audit: `astra-pos-receipt-audit.private.json`. The classification of source
code roles used in that comparison remains diagnostic; matching sums alone do
not make the mapping qualified. Line-item cents can also differ from the printed
receipt category subtotal because of POS allocation/rounding; do not recalculate
OPERA postings from item lines.

Scope index 6 was added to the same private packet: a TSAN 2206 receipt with three
positive selected atoms and unchanged partition checks already passing. It is a
more suitable first-profile candidate than adjusted probe 2, subject to reading
its actual receipt. Original indices 0–5 are unchanged.

The first interface-mapping response projection produced empty `details` objects.
This is a response-shape investigation, not evidence that configuration is absent.
Inspect only fixed-path key/type structure to locate the documented mapping
section; do not dump arbitrary credential/communication sections or silently
treat an unexpected envelope as an empty mapping.

## Actual itemizer joins and bounded Task 2E1

The successful INT mapping captures require a correction to the earlier role
hypothesis. TLKL/SP01 and TSAN/SP03 join the service codes through numbered item
21 to **SC0 and SC2**. TSAN's tip code joins numbered item 20 to **SC1**. Therefore
the SC family does not distinguish automatic service charge from gratuity.
`itemizerName` and `splitText` must not become classification shortcuts.
TLKL/M801 supplies another consistent SC-family route for its service code;
consistent numbered aliases are intentional and must not be rejected merely
because more than one SC itemizer maps to the same destination.

Task 2E1 combines explicit SC-family mapping with the **actual receipt's** labelled
10% service-charge bucket. It does not turn every SC mapping into service income.
The fixed-path INT endpoint used by the reader is
`/int/config/v1/hotels/{hotelId}/logos/{returnedLogo}` with the single
`fetchInstructions=TransactionCodesInfo` value.

The agreed interfaces are:

```typescript
interface PosReceiptEvidence {
  hotel: string;
  checkNumber: string; // exact opaque source key used in the GET
  before: unknown;
  after: unknown;
}
interface PosInterfaceEvidence {
  hotel: string;
  discoveryBefore: unknown;
  discoveryAfter: unknown;
  mappings: { logo: string; before: unknown; after: unknown }[];
}
interface ArOnlyPosServiceProof {
  version: 1;
  kind: 'ar-only-pos-receipt-service-vat7';
  sourceBefore: CurrentArTaxSource;
  sourceAfter: CurrentArTaxSource;
  definitions: ArOnlyPosDefinition[];
  interfaces: PosInterfaceEvidence;
  receipts: PosReceiptEvidence[];
}
```

Create `worker/invoice/pos-receipt-service.ts` for pure parsing/mapping validation
and `worker/invoice/ar-only-pos-service-proof.ts` for whole-source qualification.
Use a new exclusive `InvoicePacket.arOnlyPosServiceProof` route. Reuse existing
POS identity/closure/metadata/partition checks; do not change an actual F&B
classification into a fabricated SVC classification to pass an old verifier.

`parseFullServiceReceipt(raw, expectedDate)` returns the parsed business date,
printed check string and base/service/VAT/total cents. The bounded format requires
one closed receipt, one opening and closing date matching the source date, a
contiguous footer of unique FOOD/BEVERAGE subtotals, Service Charge 10%, VAT 7%
and Payment, explicit THB, zero change, and exactly one matching room-charge
tender. Tips, discounts, unknown footer fees, multiple tenders, duplicate footers,
missing text, and contradictory structured echoes are unsupported. Do not derive
the lookup key from the printed check. The exact GET request key is retained as
provider lookup provenance, separately from parsed receipt display identity.

`verifyMappedScCode(interfaces, code)` verifies paired complete active discovery,
one paired safe mapping response for every returned logo, and every current use
of the target code. Resolve `itemNumber` to `splitPost`, require factor 1 and a
consistent SC-family role; require a documented SC1–SC16 witness. SC0 may be a
same-post alias, never sole authority. Unknown/untyped or contradictory ST/DC/TX
uses, missing joins, changed pairs, or omitted interfaces fail. Multiple logos
are acceptable only when their role evidence agrees; no guessed producer prefix.

The whole proof requires exact receipt/source base, service, VAT and gross cents
for each exception check. Its atoms must be positive, with one VAT atom and one
distinct unsupported SC-code candidate. Each receipt binds one complete scoped
exception group and may not be reused for a second date/window/group. Ordinary
POS groups retain their existing independent checks and need no new receipt.
All existing monetary output remains the sum of actual selected postings.

Reader sequencing: complete initial source; all used metadata, complete active
discovery/mappings and required receipts; complete fresh source; reread all used
evidence. Require the complete source and evidence pairs to remain unchanged.
Keep bounded concurrency, forbidden capability exclusion, existing reviewed bytes
and production routing unchanged. Synthetic fixtures cover full receipts 0/1/6,
adjusted/split/discount receipts 2/3/4/5, SC1-tip ambiguity, partial mapping coverage,
changed factors, foreign or reused receipt scope and every cross-structure ID
counterexample retained from earlier stages.

## Corpus check for Task 2E1

All 218 paired receipt reads were stable. 205 contain text; 13 are empty responses.
An independent diagnostic parser found 189 full-format receipts. Applying exact
selected-source bucket equality to the required exception checks leaves **28 of
the 50 planning candidates** (10 TLKL, 18 TSAN). These are conditional candidates,
not implemented or qualified results. Missing receipts, split tenders, discounts,
and source/receipt allocation differences remain explicit reasons. The formal
implementation and actual AR seven-field replay determine the final result.

Evidence is private in `astra-service-corpus-audit.private.json`. A possible later
receipt-independent **taxable-fee** proof is a separate review: SC may represent
service or tip, so it must not claim automatic 10% service. Any such profile must
retain exact closed positive posting scope, explicit metadata, complete mapping,
one posted VAT atom, full-base VAT coverage and actual AR footer qualification.
It must not be added silently to Task 2E1 to improve the pass count.

## Bounded Task 2E2 — independently mapped taxable fees

This subsequent, separately reviewed profile does not claim that every fee is an
automatic 10% service charge. Its envelope is `ArOnlyPosFeeProof`, kind
`ar-only-pos-mapped-fee-vat7`, with complete before/after source snapshots,
`ArOnlyPosDefinition[]` and paired `PosInterfaceEvidence`. It has no receipts.
Implementation lives in `worker/invoice/ar-only-pos-fee-proof.ts` and returns
the distinct financial role `fee`, never a fabricated SVC source classification.

Candidate metadata must explicitly identify NonRevenue/F&B, nonTaxable=false,
taxInclusive=false, manualPosting=false and compTransaction=false, with no
Generates, associated-code or active adjustment configuration. Every candidate
code must have its own complete, stable numbered SC mapping. An explicit tipCode
can corroborate an SC join on the same mapping row, but cannot qualify by itself.
Default, minibar, posting-account, ST/DC/TX or unresolved uses remain ambiguous.

Each exception check must contain only positive source atoms, a genuine eligible
base, exactly one actual VAT atom and exact string check identity in both selected
and posted views. Multiple fee codes are allowed only when each independently
qualifies. All fee amounts participate in the existing full-base 7% check with
the unchanged one-satang bound. No fee amount or VAT is recalculated. A selected
AR portion can qualify from its own complete postings; the system does not infer
an allocation fraction from a larger receipt.

The existing POS inspector supplies scope, source completeness, window/cashier,
descendant, reverse-reference and duplicate-ownership checks. Model admission
preclaims every selected POS identity and retains strict validation of all other
components. NonVAT, graph, transfer and legacy/native proof mixtures remain out
of scope. Eligibility is selected from source and metadata before provider effects;
there is no catch-and-fallback after a receipt, identity or network error. The old
receipt profile remains available only through its own independent strategy.

Counterexamples retained: exempt or undercovered fees, negative adjustments and
cancellation, multiple VAT atoms even when their sum agrees, missing base/fee,
unselected siblings, changing or incomplete mapping, contradictory roles,
unmapped non-revenue amounts, descendants/deferred tax and cross-structure IDs.
Unknown NonRevenue codes are not admitted merely because other codes qualify.

Independent review of this bounded implementation found no remaining actionable
P0–P2 issue; seven focused suites (150 tests) passed in the independent rerun.
This is local code-review evidence, not production enablement. Every new admission
still needs all seven actual AR footer fields checked, followed by fresh source
and generated-PDF qualification for the admitted shapes. The complete migration
and the separately tracked display differences remain open.

## Verified route correction and live results

The initial FOF `customData` operation returned `details.customDataInfo`, as its
operation purpose suggests, not the requested transaction mapping. Empty projected
objects were our endpoint-selection problem, not evidence of absent configuration
or an OPERA outage. A bounded structural diagnostic established the section name
without reading its arbitrary values or any credentials. The custom data section
remains opaque. The documented INT `getHotelInterfaceDetails` path above is now
used, with the same discovered-logo authorization and strict field projection.

Paired live reads succeeded for all 13 discovered active POS interfaces across
three properties; all discovery and mapping pairs were stable. Actual SC itemizer
joins exist for the targeted service codes, and tip items are distinct. Mapping
presence is not yet a historical role or selected-receipt qualification claim.

Seven scoped check bodies are now privately captured. Initial checks 0/1 reconcile
full receipt totals and typed amounts with the selected AR postings; check 2 has
an adjusted base, and check 3 has split room-charge tenders. Whole receipt totals
must never replace a selected AR portion. Printed check IDs differ from opaque
lookup IDs; no guessed prefix/suffix conversion is authorized. The next financial
proof must bind request identity, receipt context, mapping and fresh selected
postings, preserving all existing partition and ambiguity checks.

Final client verification: 2,862 tests in 243 files, typecheck/build and diff checks
pass. No financial model or production routing change. Raw receipts/mappings stay
in ignored audit storage. All authenticated previews stopped and nonce/session
files were removed.
