# AR Invoice parity audit — 23 October 2026

## Current result

All **1,402 generation candidates have current OPERA AR Invoice references**:
**1,397 monetary matches and five unresolved cases**. None awaits a reference or
has an unresolved identity. Four generated PDFs differ in tax-base/NonVAT fields;
one refuses generation. The full goal is not complete.

| Hotel | Matched | Unresolved |
|---|---:|---:|
| KAT | 459 | 0 |
| TSK | 76 | 0 |
| TLKL | 89 | 1 |
| WAKL | 232 | 1 |
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

## Five monetary/source cases — unresolved

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

Next: establish exact native AR footer provenance or separately proven shared
classification. Do not force native arithmetic, weaken the existing native
full-total contract, add per-Invoice overrides or infer universal NonVAT from
missing Generates. These five cases still need implementation, complete-set
regression tests and live verification before the goal can be complete.

## Evidence and operational boundaries

Ignored `.tmp/invoice-parity-20261022/` contains source traces, PDFs, hashes,
selection proofs, the 102-batch aggregate and diagnostics. Raw customer data and
temporary credentials are not committed. Diagnostic processes were stopped;
nonce/session files removed. No billing activity, Sheet dates, ledger data or
sending history changed. Authorized OPERA printing can advance print metadata.
