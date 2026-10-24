## Final release outcome — 24 October 2026

The AR-only replacement is enabled in production (source `4ff69f9`, Worker
`fe256593-7393-4fcc-bf82-a6b96ef42f62`). All 1,402 source cases and 9,814 native AR
monetary fields qualify, preserving every previously qualified case. Final item
content and TAX ID checks satisfy the owner's documented semantic/layout criteria.
The final full suite passes 4,334 tests; build passes. Six post-deployment UI-created
PDFs across all six operating hotels pass all 42 monetary and complete item-row
comparisons. No email, billing/Sheet history or OPERA ledger writes occurred.
See PROJECT_STATUS.md for the exact evidence inventory and preserved-artifact checks.

# AR Invoice parity audit — 23 October 2026

## Current result

All **1,402 generation candidates have current OPERA AR Invoice references**:
**1,398 monetary matches and four unresolved automatic-generation cases** after
the shared qualification fix. None awaits an AR reference or has an unresolved
reference identity. The four unqualified cases now refuse output; they are not
counted as fixed or generated. The full goal is not complete.

| Hotel | Matched | Unresolved |
|---|---:|---:|
| KAT | 459 | 0 |
| TSK | 76 | 0 |
| TLKL | 89 | 1 |
| WAKL | 233 | 0 |
| TLFO | 109 | 0 |
| TSAN | 432 | 3 |

References are current **AR Invoices**, never Guest Folio parity passes. Each
comparison checks gross, before-VAT, VAT, NonVAT, printed outstanding, debit and
credit. Identity uses hotel/account/Folio plus exact selected Invoice evidence
where Folios repeat. Single-Invoice proofs preserve the filter, selected row and
hash. Amounts alone never establish identity. Duplicate references count once.
A queue is not a pass until the PDF is captured and independently checked.

Failed large batches were recovered with smaller selected groups. The last
already-printed Invoice was found using an exact filter and still had a positive
balance; including previously printed statements enabled its reference. Absence
from a displayed list was not interpreted as zero. Every destination was Preview
to Print; no emails were sent.

## Scope and generation coverage

Discovery read 413 accounts across six operational hotels without account-read
failures. Inventory time: 2026-10-22T11:44:26.104Z. There are 1,969 nonzero rows;
1,402 positive independently selectable invoices have complete selectors. TSUN
is outside the application's active financial scope, not newly certified empty.

| Hotel | Candidates | Missing selectors | Credits | Not independently selectable |
|---|---:|---:|---:|---:|
| KAT | 459 | 110 | 16 | 10 |
| TSK | 76 | 30 | 4 | 2 |
| TLKL | 90 | 82 | 9 | 0 |
| WAKL | 233 | 56 | 1 | 0 |
| TLFO | 109 | 40 | 2 | 0 |
| TSAN | 435 | 198 | 7 | 0 |

Baseline generation produced 1,401 PDFs / 1,915 pages and one unverified-tax
refusal. Independent extraction/rendering found no printed-model, page-bound or
rendering errors. Eight transport failures succeeded on bounded retries; initial
attempts remain preserved. This generation coverage is separate from monetary
parity. Missing-selector and credit rows are not counted as generated invoices.

## TAX ID — implemented and deployed

The reader now uses `taxInfo.tax1No` from the already identity-verified linked AR
profile when the matching selected folio payee tax number is blank. A populated
matching payee retains precedence. Identity/address and source checks remain;
there is no extra profile request. Malformed values fail closed, and another
payee's tax identity is excluded.

- 1,402 captured-source replays: 1,362 models unchanged, 39 gained TAX ID, original
  TLKL refusal retained. Every other model field is identical except print time.
- All 39 PDFs rendered using actual active templates and independently extracted:
  expected tax IDs and unchanged monetary fields are present. Native AR shows the
  same ID in 36 tax fields and three address VAT lines. Those three retain address
  text and additionally display the tax field. Native domestic documents also
  repeat IDs across those locations; address text is not used to infer/remove IDs.
- Four affected hotel template headers visually checked; values fit their fields.
- Fresh provider-backed generation using the deployed source succeeded for KAT,
  TSK, WAKL and TSAN samples. Extracted PDFs contain TAX ID and all seven monetary
  fields match qualified models. This used a bounded authenticated remote
  diagnostic, not a new application document job.
- 231 test files / 2,549 tests, TypeScript and Vite builds pass. Independent review
  found no actionable issue and independently reran 66 reader tests.

Deployed source: `643c2c09ee718f85235bb540ed3771c2b068e0c7`.
Worker: `d5e6ce2f-5c09-4388-bc83-77d1c3284c1b`.
Exact-source health/database verification and six anonymous access checks pass.
All 42 previous bindings are preserved except COMMIT_SHA. No database migration.

## Shared direct zero-tax qualification — implemented and deployed

Ordinary PDF reads now inspect completed date/check groups with no posted VAT.
Explicit NonVAT requires exact posted identity/amounts, stable scoped rules and
charge calculations, and an unchanged financial source. Other groups require
source-bound complete native control totals and the existing aggregate qualifier.
The qualifier's reconciliation rules remain unchanged; no per-code net/exclusion
guess or per-Invoice override was added. Missing or ambiguous controls refuse.

Selected postings are compared by verified unique transaction ID, so a reordered
response does not falsely count as financial mutation. Every row field remains
fenced; duplicate IDs or changed dates/codes/amounts/references still reject.

- Full ordinary-read replay: **1,398 matches, four expected refusals**, no lost
  previously matching invoice, no other model-field regression, 39 TAX IDs retained.
- Fresh provider-backed runs for all 27 affected-branch candidates: 23 generated
  PDFs independently match all seven actual AR fields, four refusals produce no
  PDF. Six previously matching ambiguous-Folio cases retain explicit proof support.
- WAKL now matches all AR fields; changed output visually inspected.
- Final tests: 233 files / 2,578 tests; TypeScript/Vite builds pass. Independent
  implementation and ordering reviews found no actionable issues.
- Source `6fdf0ae9a91f1f269bf0b51c5dbd0d071b98f380`, Worker
  `9ad734ea-a578-4188-9fa5-30260ce79048`. Exact-source health/database and six
  anonymous access checks pass. All previous 42 bindings preserved except SHA.

## Original five findings and four remaining source blockers

One WAKL split food charge and one TSAN laundry adjustment are classified as
NonVAT by the direct zero-tax group path, while native AR includes them in
before-VAT. Two more TSAN documents have native footer gaps: before-VAT + VAT +
NonVAT does not equal printed gross. The web assigns those amounts to NonVAT.
One TLKL document refuses because its internal control cannot qualify the
inferred classification. Actual native PDFs and source evidence remain private.

Fresh exact-posting and code-rule reads were obtained for all five. The affected
branch has 27 invoices across 14 hotel/code pairs. All 14 rule responses were
stable across paired reads. Current configuration stability is not historical
posted-rule proof.

A blanket NonRevenue exclusion was rejected: a TLKL restaurant carrier has the
same relevant NonRevenue/revenue=false/no-generates facts as two TSAN excluded
amounts, yet native AR includes it in before-VAT. Group, description and manual
posting permission do not establish footer treatment. No production monetary
rule was changed to fit this hypothesis. A private arithmetic experiment is
only diagnostic; existing native aggregate overrides must be considered before
interpreting its estimates.

One original WAKL discrepancy is now corrected using the existing complete native
aggregate proof. The remaining three TSAN cases return an ambiguous folio selector;
TLKL returns VAT/NonVAT controls without complete qualified totals. Native AR PDFs
are available for manual audit, but the current API path cannot obtain equivalent
exact-invoice evidence automatically. This same source limitation has persisted
across consecutive goal turns and fresh provider verification. It is not solved
by treating current code configuration as historical tax evidence.

Next: establish exact native AR footer provenance or separately proven shared
classification. Do not force native arithmetic, weaken the existing native
full-total contract, add per-Invoice overrides or infer universal NonVAT from
missing Generates. These four cases still need implementation, complete-set
regression tests and live verification before the goal can be complete.

### Questions prepared for the OPERA integration owner

1. Which supported API retrieves the current AR Invoice PDF or its stored net,
   VAT and NonVAT totals by hotel, AR account and AR transaction/Invoice identity,
   when several AR invoices share reservation, Folio, date and window?
2. Which response supplies the exact `storedFolioId`/`folioId` namespace for stored
   folio retrieval? The inspected AR payment-detail responses omit those fields;
   no substitution of Folio number or sequence is assumed.
3. Which historical posted field distinguishes NonRevenue amounts included in
   native before-VAT from amounts excluded from the tax footer? Current
   `nonTaxable`, `revenue`, transaction type and absent Generates do not uniquely
   establish it for the observed counterexample.

No support email, subscription, permission or paid-service change was performed.

## Evidence and operational boundaries

Ignored `.tmp/invoice-parity-20261022/` contains source traces, PDFs, hashes,
selection proofs, the 102-batch aggregate and diagnostics. Raw customer data and
temporary credentials are not committed. Diagnostic processes were stopped;
nonce/session files removed. No billing activity, Sheet dates, ledger data or
sending history changed. Authorized OPERA printing can advance print metadata.

## Display qualification and accepted wording (23–24 October 2026)

The owner accepts source-backed `Accommodation Charge` where native AR prints
`Accommodate Charge`, provided all other compared row fields and source ownership
are exact. The first 25 identified routed rows are an observed initial subset,
not an exhaustive corpus count; later controls contain the same accepted pair.
The final source/body census determines the total. Reports must count accepted
semantic differences separately from exact text matches.
Keep the API wording; do not add a typo replacement or rewrite native/parser
baselines. Other wording differences need their own evidence or acceptance.
Amounts, independent debit/credit columns, dates, references, invoice/account/hotel
identity and row ownership still require exact source qualification. The bounded
policy is recorded in `superpowers/plans/2026-10-23-ar-tsan-nonrouted-rate-display.md`.

A targeted TSK rerender from an existing capture passed the current verifier:
one PDF, one page, all seven financial fields and the complete visible body match
native AR. The sole change against that verified capture was preservation of a
literal source reference suffix after the exact NA package marker. Financial rows,
Tax ID and guest counts were retained. Visual inspection confirmed the complete
suffix is readable without body/footer overlap. This is body/financial acceptance,
not a claim of pixel-identical header or signature layout. Detailed customer
artifacts remain in the ignored private evidence directory.
