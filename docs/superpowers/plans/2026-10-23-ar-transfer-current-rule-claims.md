# Transferred AR Current-rule Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Parent approved this bounded follow-on; Sol implements and Astra independently reviews. No additional permission question or deployment is authorized.

**Goal:** Qualify an unchanged whole-invoice AR transfer using exact transfer lineage and the already approved current AR rule/calculator contract.

**Architecture:** Extend the shared source-claims envelope with a distinct current-rule component. It owns actual selected AR root IDs and their original signed amounts once, and records a separate OPERA current-rule VAT projection. It does not create historical tax children, fake tax IDs or replacement financial lines.

**Tech Stack:** Existing TypeScript OPERA readers, `verifyArTransfer`, `revalidateArTransfer`, `verifyArSimulation`, bigint invoice precision and Vitest.

**Spec:** `2026-10-23-ar-only-source-claims.md`, the existing bounded `ar-only-current-vat7` policy, and this parent-approved transfer domain.

## Evidence and interpretation

Private replay revalidated both captured whole-transfer lineages, including fresh source/destination account/history/posting snapshots. Four selected AR adjustment roots exist in exact `transactionDetails` responses even though they are absent from the reservation net/VAT ledger. No generated children were returned. The existing `verifyArSimulation` contract accepts the recorded rule/calculator evidence for all four roots; its projected VAT plus actual posted VAT matches both native AR VAT totals.

The original calculations were captured only once per root. Fresh paired calculations, rules and lineage are still mandatory for qualification. Matching a native delta alone is not proof.

[Oracle's 26.3 AR invoice guide](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_accounts_receivable_viewing_and_managing_invoice_details.htm) documents negative rebate charges and transfers of AR charges. It does not establish that AR tax children can never exist. This component therefore makes a **current-rule/report-projection** claim, not a historical posted-tax claim.

## Global constraints

- No Guest Folio/report source, native controls, native lookup, per-invoice override or fallback.
- Same-property THB whole transfers only; no compressed, partial, multi-hop or unrelated account mismatch.
- Preserve the exact existing current AR rule restrictions, including full-VAT7 scope. Do not widen the actual-posted-tax component or derive tax independently as `gross * 7 / 107`.
- All selected amounts and financial line IDs remain unchanged. Existing posted VAT remains actual posted VAT.
- No accounting writes, printing by the verifier, email, new access, paid service or production deployment.
- Keep actual account/customer/source evidence in private audit files only.

## Exact envelope and internal claim

Add a third version to the **existing** source-claims union, not another whole-invoice proof property:

```ts
interface TransferredCurrentArRootEvidence {
  postingId: string;
  rules: unknown;
  rulesAfter: unknown;
  generatedRules: unknown[];
  generatedRulesAfter: unknown[];
  calculation: unknown;
  calculationAfter: unknown;
}
interface TransferredCurrentArRuleComponent {
  kind: 'transferred-current-ar-rules-vat7';
  lineageBefore: ArTransferInput;
  lineageAfter: ArTransferInput;
  roots: TransferredCurrentArRootEvidence[];
}
interface ArOnlySourceClaimsProofV3 {
  version: 3;
  kind: 'ar-only-source-claims';
  sourceBefore: CurrentArTaxSource;
  sourceAfter: CurrentArTaxSource;
  components: [TransferredCurrentArRuleComponent];
}
interface CurrentArRuleClaim {
  role: 'taxable';
  component: 'transferred-current-ar-rules-vat7';
  sourceKind: 'ar-detail';
  signedCents: number;
  projectedVatUnits: bigint;
}
verifyTransferredCurrentArRuleClaims(
  packet: InvoicePacket,
  evidence: TransferredCurrentArRuleComponent
): Map<string, CurrentArRuleClaim>;
```

Version 3 initially accepts exactly that one component. It is an intentionally bounded registry extension: no POS, zero-tax, fee or posted-graph mixture is introduced here. Versions 1/2 retain their existing exact schemas and acceptance. Reject extra component/evidence properties, duplicate/empty root lists and other financial proof envelopes. The legacy `packet.arTransfer` / `arSimulations` paths remain absent; lineage and simulations are component evidence, not legacy model bypass flags.

## Review focus

1. Source-account mismatch accepted without an exact source/destination transfer match.
2. A selected root missing from the evidence, or an extra unselected root being claimed.
3. Actual generated tax children silently replaced by a calculation projection.
4. Current calculator output being mislabeled or serialized as a posted tax identity.
5. Source, lineage, rule or calculation mutation crossing different read intervals.

## Task 1: Pure lineage and root verification

**Files:** create `worker/invoice/ar-only-transferred-current-rule-claims.ts`; add synthetic proof fixtures/tests.

- [ ] Write RED tests for one selected negative AR root plus otherwise valid posted wrapper VAT, using a complete source positive/offset transfer pair. Root rows deliberately omit hotel/reservation fields, as the actual API does.
- [ ] Call `verifyArTransfer(lineageBefore)` and `revalidateArTransfer(beforeEvidence, lineageAfter)`. Bind both inputs' manifest/account/invoice/postings/postedRows to the corresponding full outer source snapshots and the packet. Caller-supplied internally valid but unrelated lineage must fail.
- [ ] Preserve all existing whole-transfer checks: same hotel, exact accounts, transferred-in uncompressed destination, complete source lookup, exactly two transferred-out zero-balance source history rows with equal opposite amounts, identical invoice/folio/date/reservation/internal-window identities and identical full selected-posting fingerprint.
- [ ] Discover missing reservation-source roots from the full original packet. Their actual selected IDs must exactly equal the closed `arDetails[].ids` request/response set and the component evidence root IDs. Reject duplicate IDs, extra response rows, nonempty/malformed subPostings, parent/package links, deferred tax, supplied paidOut other than false, or contradictory supplied scope fields.
- [ ] Require signed selected debit/credit, AR-detail debit/credit, postedAmount and supplied transactionAmount to agree exactly. Require Revenue type and exact transaction code/date/folio/aRInfo invoice. Account ownership must match the verified transfer source or destination as permitted by the lineage; no broad account exception.
- [ ] Validate optional selected-row `postedAmount`, `transactionAmount` and `transactionType` too: if supplied, they must agree with the actual Revenue root and signed gross. Stable paired contradictions are not valid evidence.
- [ ] Omitted hotel/reservation fields are bound through the exact scoped reader request and verified lineage. Any supplied hotel/reservation/window identity must agree; never invent omitted fields.
- [ ] Scan full selected/reservation/AR source for actual nested or reverse-linked children owned by these roots. Actual child taxes require a posted graph adapter, not this projection. Reject root aliases with selected, component or tax identities owned elsewhere.
- [ ] Explicit financial member lists or grouping metadata on a projected root require a separate membership proof and are unsupported in this initial slice. Also reject another source row's explicit member list that owns a projected root ID. Empty optional member arrays may be accepted only as a tested no-members case; malformed or nonempty root lists must not be ignored.

## Task 2: Reuse the current AR rule contract

- [ ] Reuse `verifyArSimulation` without loosening its inclusive/nonTaxable/comp/association, named bucket, generated-code, NoAdjustment, no-UDF/no-tax-bracket, explicit VAT7/native-service and amount-reconciliation checks.
- [ ] Require before/after root rules, each exact generated-code definition and the **complete calculator response** to be canonically identical. Enforce exact generated-rule coverage and duplicates independently; do not rely on the old helper to check its optional `generatedRulesAfter` field.
- [ ] Check any supplied hotel or currency on calculator root, result and **every** charge, including the input echo. Foreign scope refuses. Actual generated rows can use `level: SubGroup`; do not impose TransactionCode-only on every charge. No new interpretation of display formula text is needed.
- [ ] Keep the existing full-gross VAT7 current-rule guard, not just the simulation helper's broader basis contract. Net-only VAT or other current-rule families remain out of scope.
- [ ] Convert the verified current-rule VAT to the same twelve-decimal units used by the model; round only once with the other invoice VAT. Reuse or extract the existing precision functions into a small shared module without changing their arithmetic. Never round a root's projected VAT to cents first.
- [ ] Return a claim for the actual root ID and signed gross exactly once. `projectedVatUnits` is an internal calculation result; no synthetic tax posting ID or extra line is created.
- [ ] Add RED counters for changed basis/rate, unknown rule property/UDF/bracket, missing or duplicate generated code, changed calculation, foreign echo/result/part currency or hotel, actual child tax, wrong source account and stale lineage. A correct native aggregate must not rescue any counterexample.

## Task 3: Composition and reader fence

**Files:** modify `ar-only-source-claims.ts`, `model.ts`, `ar-only-read.ts`; create a bounded current-rule component reader if this keeps the source collector focused.

- [ ] Permit nonempty AR details only for this exact version-3 component; retain the old prohibition for versions 1/2. Verify the whole outer source fence before component claims.
- [ ] Extend the claim registry's source lookup by a closed `sourceKind`: reservation claims still resolve only in reservation rows; current-rule claims resolve only in the exact independently verified AR-detail set. No arbitrary fallback lookup across ledgers.
- [ ] Preclaim these actual root IDs globally. The model keeps their original gross line amounts and adds their internal projected VAT units once. Continue strict posted validation of all remaining Wrapper, Revenue-with-embedded-taxes and Payment rows. No unknown direct/POS/AR root is ignored.
- [ ] Source-shape planning selects the transfer current-rule domain explicitly, before effects. It is not an error fallback from actual-posted proof or native printing.
- [ ] Before the existing financial fresh read, capture exact source lineage, root/generated rules and calculations for unique signed `(code, amount)` scopes. After that same financial read, call `readArTransfer` with the fresh packet data and prior lineage to reread/revalidate source-side history/postings; do not call a helper that redundantly creates another destination financial fence.
- [ ] Reread all root/generated rules and calculations after the fence. Preserve exact scope and pair stability. Provider/source/lineage failures propagate; no receipts, Guest methods or rendering occur in evidence collection.
- [ ] Use the existing common display finish path. SourceClaims POS grouping remains unsupported until a separate display adapter is reviewed; unrelated display evidence cannot authorize financial claims.

## Task 4: Qualification

- [ ] Run focused proof/reader/model and existing transfer/current-rule tests, then typecheck. Obtain independent Astra review before broad qualification.
- [ ] Replay the full recorded cohort; retain every prior admission. Report current-rule projection separately from posted-VAT facts.
- [ ] Parent captures fresh paired full source, complete lineage, root/generated rules and calculations for both actual cases. Verify all seven financial fields against actual AR references, render PDFs and reopen/check them.
- [ ] Test negative lineage variants: unrelated original account, partial offset, extra history row, changed selected membership, compressed invoice and source mutation. None may be admitted by a matching gross or VAT total.
- [ ] Run combined full suite/build after stability and update parent status. No deployment follows automatically.

## Self-review

All five review-focus conditions have explicit tests. This reuses a previously authorized current-rule domain and adds independently verified ownership; it does not convert calculations into historical postings or weaken the actual-posted component. Fresh qualification is still outstanding when this plan is written.
