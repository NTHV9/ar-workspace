# AR-only Invoice Source Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Keep production unchanged until the replacement is qualified.

**Goal:** Generate current AR Invoices without Guest Folio financial or tax evidence, including all fallback and regeneration paths.

**Architecture:** Keep the capability-limited AR reader separate until qualification. Admit monetary structures through explicit, independently verified proofs bound to two complete source snapshots; use actual current AR PDFs only as comparison evidence.

**Tech Stack:** TypeScript, Cloudflare Workers, existing OPERA reader, Vitest.

**Spec:** Latest owner decision below; `AGENTS.md`, `docs/PRODUCT_SPEC.md`, and `docs/DECISIONS_AND_OPEN_ITEMS.md` remain applicable outside the superseded source choice.

## Owner decision and acceptance

The owner confirmed that `folioReports` must not supply AR Invoice amounts or
tax validation. Guest Folio totals are not AR evidence even when sampled values
match. Remove this dependency from the complete AR preparation path, including
fallbacks and legacy regeneration. Do not substitute mass refusals for the requested
automatic behavior or claim the source migration complete while cases remain.

Reservation/Folio metadata may still identify selected AR postings; this is distinct
from using a Guest Folio PDF as financial evidence. Only exact selected AR posting
identities, their verified posted tax facts, and explicitly qualified OPERA rule
evidence may support generated totals. Actual printed AR PDFs remain comparison
references, never per-Invoice hardcoded output overrides.

## Current evidence

- Deployed source: 6fdf0ae9a91f1f269bf0b51c5dbd0d071b98f380.
- 1,402 current AR references; production qualification has 1,398 matches and four
  refusals. The earlier dependency remains in several reader/model paths.
- Recorded runs for 330 candidates contain a `folioReports` call. This is observed
  use, not an assertion that all 330 require it or would fail without it.
- The later split-footer parser prototype was archived privately and removed from
  this change; improving Guest Folio extraction does not satisfy AR-only sourcing.
- No email, ledger, Sheet dates, historical business activity or paid/access change.

## Tasks

### 1. Establish a separate AR-only reader and capability boundary

- [ ] Add a narrow AR-only entry point that cannot consume `folioReport`,
  `folioTypeName`, Guest PDF bytes, or `nativeTaxControls` as proof.
- [ ] Red-first tests must fail if an AR-only path calls a forbidden capability or
  accepts native control fields. Preserve complete pagination and identity fences.
- [ ] Use `readInvoicePacket(..., false)` only as a metadata/posting collector;
  qualify all monetary branches independently before returning a usable model.
- [ ] Reuse already verified full-VAT current-rule evidence where applicable;
  do not relax its scope, source freshness, posted coverage or calculation checks.
- [ ] Explicitly expose unsupported proof categories during development rather
  than silently falling through to the legacy native path.

### 2. Qualify remaining posted-tax structures without Folio evidence

- [ ] Inventory failures against all 1,402 recorded AR references by proof category.
- [ ] Support closed posted-generate graphs, wrapper components, service/VAT rows,
  transfers and direct NonVAT through independently verified scoped evidence.
- [ ] No amount-only identity matching, blanket non-taxable inference from absent
  Generates, or assumed NonRevenue exclusion. Preserve signed postings and AR
  printed gross separately from remaining receivable balance.
- [ ] Any unavailable source stays explicitly unresolved; a refusal is not a fix.

### 3. Cut over the AR document pipeline

- [ ] Route AR invoice preparation to the qualified AR-only entry point.
- [ ] Remove report-based fallback for new/regenerated AR documents; preserve
  existing reviewed bytes and business history without silent replacement.
- [ ] Check diagnostic/probe paths so their results cannot masquerade as qualified
  AR output. Avoid changes to unrelated Guest Folio features.
- [ ] Prove forbidden API calls are zero across normal, fallback and failure paths.

### 4. Verification and release

- [ ] Replay all 1,402 references; inspect every difference/refusal, all seven money
  fields, tax identity and source changes. No cached per-Invoice amount overrides.
- [ ] Exercise fresh provider-backed representative cases for every new proof
  category, and independently inspect generated PDFs against actual AR references.
- [ ] Run regression tests/typecheck/build and independent review.
- [ ] Deploy only a qualified replacement; preserve all runtime bindings and
  verify the exact live source. Report implemented/tested/deployed/unresolved separately.

## Files and ownership

Reader boundary: `worker/invoice/read.ts` and a new `worker/invoice/ar-only-read.ts`.
Proofs/model: `worker/invoice/model.ts`, `ar-tax-read.ts`, `current-ar-tax.ts`,
posted/embedded/direct evidence modules as justified by tests. Document routing:
`worker/invoice/generate.ts`, `worker/documents/jobs.ts`. Tests stay synthetic;
real capture/PDF fixtures remain in ignored private audit storage.

## Astra review and next bounded Sol task — 2026-10-23

This section is the actionable next task, not permission to cut over or deploy.
Use the owner's chosen GPT-6.1 Sol Medium implementer and Astra High review.
Stage 1 is implemented locally, not enabled. The saved AR-only replay reports
1,138 matches, 264 unqualified and zero forbidden calls across 1,402 references.
The proof inventory contains one Invoice with two closed posted-generate graphs;
both pass the existing graph verifier. It also contains current-rule adjustment
roots and ordinary wrapper components, so a graph-only toy fixture is inadequate.
This review inspected existing code/captures; it did not rerun the full audit or
call external services.

### Findings that constrain the implementation

1. `CurrentArTaxProof` is deliberately a full-VAT-only contract. The model rejects
   taxless direct groups, NonRevenue, incomplete VAT bases and posted graphs under
   that contract. Do not relax it to make the 264 cases pass.
2. `verifyPostedGenerates` already verifies exact selected parent/child identities,
   closed ownership, signed posted amounts and stable rules. It does **not** prove
   that the VAT bucket contains every service amount. Add a separate narrow
   full-base verifier for the AR-only admission; do not use aggregate 7% agreement
   as a substitute for membership (cancellations can hide missing members).
3. A graph proof is not proof of the rest of the Invoice. Ordinary wrapper/direct
   embedded components must retain stage-1 full-VAT checks; unclaimed AR roots
   must retain exact scoped current-rule simulation checks. Any unsupported
   residual posting keeps the whole Invoice unqualified.
4. The replay reader repeats its last captured response when reads exceed the
   capture. It is useful for amount regression, but cannot establish a new live
   before/after interval. Report this limit and retain live qualification later.
5. Zero-tax configuration is not a general NonVAT oracle. The existing explicit
   policy and paired calculations are reusable only within their verified scope.
   NonRevenue flags, names, no Generates, or matching Guest controls cannot settle
   the known contradictory tax-footer treatments.

### Task 2A: Whole-source-fenced AR posted graphs, with full-VAT residual coverage

**Files:**
- Create `worker/invoice/ar-only-posted-proof.ts`.
- Modify `worker/invoice/ar-only-read.ts` and `worker/invoice/model.ts`.
- Add `tests/invoice-ar-only-posted-proof.test.ts` and
  `tests/invoice-ar-only-posted-read.test.ts`.
- Reuse/extend synthetic `tests/fixtures/invoice-posted-generates.ts` and
  `tests/fixtures/invoice-current-ar-tax.ts` without importing real captures.
- Leave `current-ar-tax.ts`'s current proof verification contract unchanged.
- No changes to production routing, `generate.ts`, document jobs, or legacy
  native/transfer/direct-zero/embedded proof admission in this task.

**Interfaces:**
- Add optional `InvoicePacket.arOnlyPostedProof: ArOnlyPostedProof`.
- `ArOnlyPostedProof = {version: 1; kind: 'ar-only-posted-generates-vat7';
  sourceBefore: CurrentArTaxSource; sourceAfter: CurrentArTaxSource}`.
- `verifyArOnlyPostedProof(packet: InvoicePacket): true` validates the envelope,
  exact `arOnlyTaxSource` equality for both snapshots, at least one graph,
  one evidence entry per graph, rule before/after equality and full graph
  membership through the verifier below. Reject native controls (including an
  explicitly present undefined property), current proof, transfer, embedded proof
  and direct-zero proof. Existing `arPostedGenerates` and `arSimulations` carry
  the graph/current-rule evidence; do not duplicate their financial fields.
- `verifyArOnlyPostedGraph(graph: PostedGenerateGraph, evidence:
  ArPostedGenerates, hotel: string): {vatCents: number; ids: string[]}` calls
  `verifyPostedGenerates`, then proves exactly one VAT7 generate whose bucket at
  evaluation time contains the root base and every SVC child exactly once, no
  other member. Follow explicit rule order and bucket flags; preserve posted
  amounts and the existing rounding tolerance. A service generated after VAT,
  omitted base/service or multiple VAT leaves is unsupported in this profile.
- Keep the public `readArOnlyInvoicePacket`/`readArOnlyInvoiceModel` signatures.
  Discover graphs once per captured source, claim all their IDs, and simulate
  only unclaimed AR roots with the current exact identity/full-VAT rules.
  Read all graph parent/child definitions before the second complete source read
  and re-read them afterward (deduplicate codes, bounded concurrency <= 4).
  Re-read simulation definitions afterward as well. Compare the full normalized
  source, then attach this envelope when graphs exist; otherwise retain stage 1.

**Model integration:**
- Verify the new envelope before allowing graphs without native controls.
- Introduce a local strict full-VAT guard that is true for either existing
  current proof or the new posted proof. Apply every current strict scope/type/
  component/full-base check to residual source rows and simulated roots.
- The final new-proof branch permits the verified graphs but requires zero
  NonVAT, no direct POS groups, no transfer and no native-dependent exception.
  Existing current-proof final checks, including its graph rejection, stay intact.
- Count each selected graph line once; add each graph's actual posted VAT once.
  No simulated child amount replaces posted money. Preserve payments, debit/
  credit signs, outstanding versus printed gross, text and TAX ID behavior.
- `arOnlyInvoiceModel` must accept exactly one recognized AR-only proof route;
  no fallback to bare `invoiceModel`, legacy proofs or native reports on errors.

**Review focus and red-first tests:**
- [ ] Positive and negative signed graph fixtures produce existing exact totals
  without native controls; all selected parent/child lines remain visible.
- [ ] A synthetic mixed Invoice has two independent graphs, ordinary wrapper
  components and two simulated adjustment roots. Every part is covered and
  graph children are never sent to charge simulation.
- [ ] Source/rule mutation between reads fails: selected amount/check/cashier,
  invoice balance, wrapper child/tax, graph child/reference, AR root and every
  graph/simulation parent or leaf definition. Pure selected-row reordering passes;
  duplicate IDs still fail. Forged/mismatched snapshots and unknown kind fail.
- [ ] Cancelling positive/negative graphs with wrong children cannot pass on
  invoice totals. VAT on Base with SVC omitted, service after VAT, duplicate
  membership, unclaimed child, shared child, changed nested versus standalone
  child, missing/extra graph evidence, and graph/simulation overlap all fail.
- [ ] Add an otherwise valid graph to a taxless direct row, NonRevenue component,
  net-only VAT component, transfer, embedded F&B exception or rate exception:
  each remains unqualified. No graph proof grants blanket trust to residual rows.
- [ ] Retain the existing legacy test that graph evidence without native controls
  and without this new envelope fails. Existing current proof still rejects graphs.
- [ ] Instrument forbidden `folioReport`/`folioTypeName` calls to throw; count zero
  in success, unsupported, source-change and bounded pagination retry tests.

**Execution and acceptance:**
- [ ] Run the new focused tests red; implement only this task; run them green.
- [ ] Run `pnpm exec vitest run tests/invoice-ar-only-posted-proof.test.ts tests/invoice-ar-only-posted-read.test.ts tests/invoice-ar-only-read.test.ts tests/invoice-posted-generates.test.ts tests/invoice-posted-generates-read.test.ts tests/invoice-current-ar-tax.test.ts tests/invoice-current-ar-read.test.ts` and `pnpm typecheck`.
- [ ] Rebuild/run the existing private AR-only replay. Expected target is 1,139
  matches and 263 unqualified, with zero mismatches and zero forbidden calls;
  investigate any different result rather than loosening guards to hit a count.
  Inspect all seven money fields and TAX ID/line identity for the newly admitted
  case against the actual current AR reference, using private evidence only.
- [ ] Run the full regression suite and build once after focused checks pass.
  Record evidence and unresolved categories in PROJECT_STATUS; no deploy/enable.
- [ ] Astra reviews the diff and counterexample tests before the next task.

### Subsequent phases and evidence gates

**2B — direct posted POS coverage:** The parent's joined remaining-case inventory
identifies 222 direct-POS-only cases and six mixed POS/zero cases. Build explicit
coverage for exact selected date/check groups, signed base/SVC/VAT posting atoms,
their scope and posted rounding. Reuse whole-source freshness. Require authoritative
tax classification/rules for atypical F&B VAT codes; do not use a label alone or
aggregate rate agreement to prove membership. Qualify POS-only first; mixed
taxless groups must wait for their independent proof. Parent/leaf rule evidence
and actual AR references for representative hotel/group/sign shapes are required.

**2C — direct NonVAT:** Reuse `directNonVatProvenance` and paired same-signed-amount
calculations with fresh before/after source/rules; no native fallback. Keep the
existing owner-confirmed narrow exception narrow. Do not count the captured 27
candidate Invoices or 14 hotel/code pairs as 27 qualified cases. The private
`calculation-scopes.private.json` is at the audit root (not in `calculations/`).
Require complete independent proof of the taxable remainder before admission.

**2D — embedded/wrapper and base exceptions:** Extend strict graph membership
proof to selected wrapper components only after proving package ownership,
component completeness and no duplicate taxation. Net-only tax bases, atypical
F&B VAT, rate exceptions and non-revenue inclusion/exclusion require their own
posted/report facts; broadening a full-VAT flag is not an implementation strategy.

**2E — transfers and unresolved footer treatment:** Existing transfer lineage
proves movement, not tax. Obtain source/destination exact Invoice tax facts with
a stable lineage/source interval. The contradictory NonRevenue footer treatment
requires an authoritative historical/report field or a qualified exact current
AR endpoint. If unavailable, report the exact missing evidence and stop guessing;
manual AR PDFs are acceptance references, not runtime amount overrides.

Only after these bounded phases pass does Task 3 cut over the complete AR path.
No phase may advertise all-Invoice coverage while unsupported categories remain.

## Bounded Task 2B implementation — direct posted POS

Add a separate AR-only POS envelope with complete normalized source snapshots and
paired hotel/code metadata. Exact selected IDs must match posted scope, signed
amount, date and check; preserve window/cashier identity and reject disagreements.
Group only those selected atoms by their explicit check/date/window scope; cashier
consistency validates the group and never creates a partition. Reject unexplained
unselected direct Revenue/Tax siblings sharing the complete check scope, including
siblings whose breakdown is missing; never absorb them into selected money. Then
partition positive and negative amounts independently. Require explicit base
FoodAndBeverage, service NonRevenue/SVC, and Tax plus VAT descriptor roles; no
NonRevenue/F&B role inference. Each partition needs exactly one VAT atom and a
base; verify posted VAT against all base/service atoms within posted rounding.
Empty Generates is only a descendant exclusion, never evidence of a relationship.

Initially exclude graph/AR-root mixtures, transfers, taxless groups and ambiguous
roles. Ordinary wrappers/payments retain all existing independent strict checks.
No old proof contract or production route changes. Red-first tests cover identity,
reused checks, missing/duplicate VAT, sign cancellation, metadata/source mutation,
unsupported roles and zero Guest capabilities. Run focused suites, typecheck,
full regression and build; parent owns private replay and independent review.
Paired metadata replay is regression evidence from mixed capture times; fresh live
source/rule intervals remain a qualification requirement.

## Bounded Task 2C implementation — explicit direct NonVAT

Add a separate `ar-only-direct-nonvat` envelope with complete normalized source
snapshots and every exact zero candidate's paired parent rules and same signed
amount calculations. Reuse the existing direct-zero inspector, explicit policy
and verifier; the delegated verifier must return `explicit`. Never pass native
controls or enable its native fallback. Plan zero candidates before POS inspection
because genuine direct NonVAT atoms may have no check number.

Preclaim every admitted NonVAT identity in both shared ownership sets before any
line processing, then sum actual signed posted NonVAT once. Apply all existing
strict full-VAT rules to every residual wrapper/embedded/payment row. Pure NonVAT
and signed cancellation are allowed; POS/NonVAT mixtures, AR roots/graphs,
transfers, unknown NonRevenue and embedded/rate/net-base exceptions remain out.
Preserve payments, printed gross, outstanding and every selected line.

Red-first tests cover policy and signed calculation tampering, complete source
mutation, missing/extra/duplicate groups, cross-structure identity collisions in
both processing orders, pure/cancelling NonVAT, strict wrappers/payments, deferred
residuals and poisoned Guest capabilities. Run focused tests, full suite,
typecheck and build. Parent owns private replay, independent review and status;
no production routing, external calls, commits or deployment.

## Bounded Task 2D1 — net-base VAT in selected wrappers

Add a separate `ar-only-wrapper-net-vat7` proof with complete before/after source
snapshots and exact wrapper/package/component/generate identities. Each selected
wrapper owns a unique package and all its scoped Revenue components; require
known windows, matching dates and globally disjoint posting/generate IDs. Use real
component posting codes and real tax definitions without inventing component
definitions from the wrapper's selected transaction-code list.

An exception component must independently reconcile posted net + SVC + VAT to its
gross, match paired inclusive parent/leaf rules, and preserve ordered explicit
10% SVC then 7% VAT whose bucket contains only base. Validate each posted leaf at
existing precision, including signs. Current metadata validates the observed
relationship; do not describe it as historical configuration evidence. Keep SVC
inside before-VAT service, never NonVAT. The model may bypass only its full-gross
ratio check for the exact verified component IDs. All other scope, rounding,
residual and ownership checks remain strict. No POS/NonVAT/AR/transfer/native or
legacy proof mixtures. The two TSK rounding/allocation profiles stay deferred.

Red-first synthetic tests cover independent cancelling components, complete
package ownership, aliases, missing generates, rule order/buckets/roles/rates,
source/parent/leaf changes, date/window/currency and unsupported residuals. Run
focused tests/typecheck, notify parent at initial green for private replay, then
run full suite/build and independent review. No external calls or routing change.

## Bounded Task 2E1 — exact full-receipt service evidence

Add pure closed-receipt parsing and a typed, complete POS mapping join. Bind each
receipt's opaque lookup key to one exact selected check group; never reconstruct
that key from printed CHK. Require matching source business date, one contiguous
FOOD/BEVERAGE + Service Charge 10% + VAT 7% + Payment footer, zero Change Due and
one full ROOM CHARGE. Tips, discounts, split tenders, unknown fees and adjusted
source/date/bucket discrepancies remain unsupported.

The separate exclusive `ar-only-pos-receipt-service-vat7` envelope retains complete
financial source snapshots, all POS definitions, paired complete active-interface
discovery/all-logo mappings and paired receipt responses. Resolve every matching
code/itemNumber to splitPost at factor 1; require SC-family consensus and a nonzero
SC witness on each resolved post. SC0 alone, default/difference and ST/DC/TX uses
cannot qualify. SC1 can be a tip: only the exact no-tip service receipt conjunction
may authorize an unsupported NonRevenue/F&B code for its own positive group.

Reuse existing POS scope/closure, metadata and integer partition checks; claim all
IDs before model processing and preserve actual posted money. Ordinary POS groups
and independently qualified full-VAT residuals retain their existing checks. No
native, NonVAT, AR graph/root, transfer or legacy mixtures. Tests are synthetic;
private receipt corpora remain ignored. Parent owns recorded/fresh qualification
and independent review. No production routing, external calls or deployment.
## Bounded Task 2E2 — explicitly mapped POS fees

Add a separate exclusive `ar-only-pos-mapped-fee-vat7` envelope with paired
complete financial sources, code definitions, and active POS discovery/all-logo
mappings. Explicit NonRevenue/F&B candidates require nonTaxable=false,
taxInclusive=false, manualPosting=false, compTransaction=false, no generates,
associated codes or adjustments. Map every fee code independently through numbered
SC itemizers; tipCode corroborates only an otherwise numbered SC route. Preserve
the existing receipt-service mapping contract and retain receipt-service exports.

Require positive exception groups, a true base, exactly one actual VAT posting,
exact opaque string checks, existing full-source closure, identity ownership,
window/cashier validation, and selected/source descendant guards. Fees retain a
separate role; the actual posted VAT must satisfy the existing integer 7% bound
on base plus native service plus fees. No 10% assertion, allocation, receipt gate,
nonVAT/AR/transfer mixing, or money replacement. Plan this route before receipt
requests, capture paired metadata around a fresh complete source, and reject any
change without fallback. RED tests cover qualified selected portions, adjusted
bases, negatives, multi-VAT, source siblings, mapping ambiguity and missing joins.
Parent owns private replay/fresh qualification. No routing or external calls.
## Bounded Task 2E3 — explicit mapped POS discounts

Add a separate exclusive `ar-only-pos-mapped-discount-vat7` envelope with complete
paired financial sources, code definitions and paired active discovery/all-logo
mappings. Strict-negative explicit FoodAndBeverage/F&B atoms may receive the
separate discount role only from unambiguous numbered DC1..16 mappings with
consistent DC0 aliases and factor 1. No ST/DC dual use, default/untyped uses,
negative service/VAT, or general reversal inference is allowed.

Exception groups require true positive base, native positive SVC, exactly one
actual positive VAT and positive signed base after discounts. Validate actual VAT
on net base plus SVC using the unchanged BigInt one-satang bound. Retain actual
posted amounts and all existing source closure, identity ownership, scopes and
strict residual wrapper checks. Ordinary signed groups keep the old partition
verifier; no global sign relaxation. Plan from source shape and metadata before
provider effects, capture paired rules/maps around a complete fresh source, and
never fallback after evidence errors. RED tests cover all role/mapping/sign,
cancellation, scope/closure and cross-structure ownership counterexamples in the
private read-only report. Parent owns replay/fresh qualification; no routing or
external calls are authorized here.
## Bounded Task 2E4 — positive scopes with multiple actual VAT postings

Add exclusive `ar-only-pos-positive-multi-vat7` proof with whole paired financial
sources and code definitions. Complete paired interface evidence is required only
when strict 2E2 mapped fees are present. Select all-positive exact source scopes
with at least two explicit current Tax/VAT atoms before new provider effects;
never eagerly classify unrelated established fee roles through a legacy-only
classifier. Keep full source closure, scope/window/cashier/descendant and global
identity ownership checks unchanged.

Require true positive base and at least two unique actual VAT IDs. Preserve every
posted amount and test the sum of actual VAT against base plus native SVC plus
strict mapped fees with the same BigInt seven-percent one-satang bound. No VAT
allocation, tolerance increase or ten-percent service assertion. Nonexception
scopes retain independent signed partitions, mapped-fee scopes retain 2E2
conditions and all residual wrappers remain strict. Test source/config mutation,
signs, across-scope cancellation, unknown roles/mappings, aliases, source links,
provider failures and ordinary signed compatibility before qualification. Parent
owns replay/fresh validation; no external calls, routing or deployment here.
## Approved local rate-display core integration

Keep optional `ArRateDisplayProof` and category-only `arRateDisplayGap` separate
from the exclusive financial envelope. Begin the approved display reader once
before the existing complete-source fresh read. Every successful financial branch
uses one common finalizer: qualify finance first, finish display once, attach its
proof or internal diagnostic, and validate the combined packet. Source/header/rate
mutation propagates as source changed; absent, foreign-profile or unsupported
display evidence retains original descriptions.

The model verifies the approved proof only after financial qualification and
changes derived descriptions for exact selected Wrapper IDs. It never mutates
source postings, money, references, IDs, ordering or row counts. No native/source
text lookup and no per-rate allowlist is added. Integration tests cover all seven
financial return branches, financial/reference invariance, unsupported and foreign
profiles, provider gaps, paired metadata mutations and finance-before-display
ordering. Parent owns final corpus/native/PDF qualification; routing stays off.
## Bounded seam A — independently signed repeated VAT

Add exclusive `ar-only-pos-signed-multi-vat7` proof with whole paired financial
sources and exact paired code definitions; no maps, receipts, fee or discount
exceptions. Select it before positive 2E4 only when a non-wholly-positive exact
check scope has at least two actual VAT atoms in one sign partition. Existing
positive multiVAT and ordinary one-VAT-per-sign profiles retain their paths.

Validate all invoice POS scopes independently by exact group and Math.sign.
Every nonempty partition requires genuine base and actual VAT; base, native SVC
and VAT are the existing explicit roles only. Preserve all signed posted amounts;
use safe BigInt totals and the unchanged abs(100*VAT-7*(base+SVC)) <=100 bound.
No pairing reversals, allocating VAT or cancellation across signs/checks. Retain
all source closure, identity ownership and strict residual wrapper validation.
Use the existing paired-rules/full-source interval; no new provider capability.
RED tests include signed/cross-check cancellation, missing roles/signs/IDs,
source/rule mutations and previous profile compatibility. Parent owns private
replay/fresh/native qualification; no routing, external calls or deployment.
## Approved A+ composition — ordinary positive mapped fees

The signed repeated-VAT envelope may additionally carry complete paired interface
metadata for independent ordinary positive fee checks already covered by strict
2E2. Each such check must be wholly positive with genuine base and exactly one
actual VAT atom, exact raw check identity and the unchanged seven-percent bound.
Every fee code requires the existing complete all-logo numbered SC proof.

Fees are forbidden inside a signed or repeated-VAT exception check; negative fees,
fee checks with multiple VAT atoms, new discount roles and cross-sign cancellation
remain unsupported. Fee-free signed proofs still request no interfaces, and
receipts remain forbidden. Metadata/source pairing, closure and global ownership
are unchanged. This composes independently qualified financial scopes rather than
loosening a role, rate or sign condition.
## Bounded seam B — explicitly mapped sales

Add exclusive `ar-only-pos-mapped-sales-vat7` proof with whole paired financial
sources, exact paired definitions and complete paired active POS mappings. Narrow
candidates are Revenue/Others/MISC with nonTaxable=false, taxInclusive=false,
manualPosting=false, compTransaction=false and no generates, associated codes or
adjustments. Each candidate code requires numbered ST1..16 mapping with factor 1;
consistent ST0 aliases require a numbered witness. All uses across every active
logo must agree; default, minibar, payment, tip, untyped and non-ST uses refuse.

Mapped sales count as proven genuine taxable base. Each exception check is wholly
positive with exactly one actual positive VAT and exact opaque check identity.
Use the unchanged BigInt one-satang seven-percent test on actual base plus native
SVC. Other checks retain native independent signed validation; fee, discount and
repeated-VAT compositions are deferred in initial B. Preserve all source closure,
global claims, residual wrapper checks and display invariants. Select from source
shape/current metadata before mapping effects, with no error fallback or runtime
code/hotel allowlist. Parent owns actual replay/fresh qualification; no routing,
external calls or deployment here.
## Bounded zero-posted-VAT before-VAT policy

Add exclusive `ar-only-direct-zero-vat-net` proof with complete source pairs and
exact groups for every standalone zero-tax candidate. Classify each candidate by
existing directNonVatProvenance first, including the unchanged owner policy;
otherwise require explicit ordinary Revenue/FoodAndBeverage-or-Others,
revenue=true/nonTaxable=false with no generates/associations/adjustments/comp,
known false bucket flags and no paid-out/deposit-only semantics. Unknown candidates
reject the whole invoice. At least one new zero-net atom is required; mixed legacy
explicit NonVAT and new zero-net atoms are allowed.

Corroborate each exact signed atom with stable calculator pairs. Exclusive layout
is exactly one true base with all three bucket amounts equal to the signed amount.
Inclusive layout is one true echo with empty buckets followed by one false same-
code base with all three buckets, sequence zero, total equal to the amount once.
No extra rows, formulas, foreign scope or unknown buckets. Calculator output never
replaces posted money. Legacy explicit NonVAT calculation acceptance is unchanged.

New zero-net source guards require exact signed amounts/identity/date/check, known
window, no descendants or reverse references and no unexplained same-scope source
siblings. Preclaim all consumed IDs globally. Model zero-net contributes actual
gross/before-VAT with no VAT or NonVAT; legacy nonvat-role amounts alone enter the
NonVAT footer. Initial residual scope is existing strict full-VAT wrappers and
payments only. POS, AR roots, net-base wrappers and ambiguous classifications stay
unqualified without legacy fallthrough; five calculator atoms do not prove five
whole invoices. Parent owns replay/fresh/native qualification; no routing or
external calls/deployment here.
