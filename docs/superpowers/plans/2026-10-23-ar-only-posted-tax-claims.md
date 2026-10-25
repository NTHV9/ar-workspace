# Actual Posted Tax Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Preserve the selected Sol implementer / Astra reviewer workflow. This follow-on plan requires its review gate before implementation; it is not deployment authorization.

**Goal:** Preserve independently identified actual posted VAT even when an adjusted or split AR posting no longer satisfies a current seven-percent relationship.

**Architecture:** Add a posted-tax component to the shared source-claims envelope. Tax identity/ownership and footer classification are verified separately. The model consumes actual selected money and actual embedded tax amounts once; a percentage calculation never supplies replacement money or authorizes an unknown footer role.

**Tech Stack:** Existing TypeScript source readers, bigint decimal arithmetic and Vitest. No new dependencies or provider capabilities are required for the first adapter.

**Spec:** `2026-10-23-ar-only-source-claims.md` and the current AR-only source plan. The owner explicitly requested actual AR financial fidelity, including every VAT/footer field.

## Evidence and limits

A private audit of the 100 then-unqualified invoices summed only actual explicit direct VAT postings and embedded VAT children, retaining twelve decimal places until one final round. Ninety-eight source VAT totals equal the actual AR PDF VAT field exactly. The two exceptions are known transfers with selected AR roots absent from the reservation source. This audit does **not** grant financial admission: unknown footer roles, incomplete ownership and missing AR source remain blockers.

The complete native cohort also contains two invoices whose gross differs from before-VAT + VAT + NonVAT. Their excluded amounts require a separate report-policy claim. Never force conservation by moving those amounts into either printed tax bucket. Shared numeric export mappings do not resolve that policy.

## Global constraints

- Preserve the existing verified baseline and standalone profiles.
- No Guest Folio/report financial source, native-PDF runtime lookup, cached money override or alternative-provider fallback.
- THB only; exact selected/source scope and complete source/configuration pairs.
- No tax reconstructed as `gross * 7 / 107`, `net * 7 / 100`, or a residual needed to reach a native total.
- No unknown monetary atom defaults to before-VAT or NonVAT.
- Private data remains ignored. No production routing, deployment, accounting, email, permission or paid-service changes.

## Review focus

1. Treating an amount called VAT as tax without independent code classification and exact source identity.
2. Counting a selected VAT row and the same embedded VAT child twice.
3. Rounding each embedded component instead of the full invoice's precise actual VAT sum.
4. Treating correct VAT as proof of an unresolved NonRevenue/footer role.
5. Routing a source or metadata error into a weaker proof or a native lookup.

## Interfaces and responsibilities

### First implementation slice: direct posted POS facts

Implement the direct adapter first, before the embedded extension below. Preserve version 1 of `ArOnlySourceClaimsProof`; introduce version 2 with a closed component list:

```ts
type SourceClaimComponentEvidence =
  | { kind: 'direct-zero'; groups: ArOnlyZeroVatNetGroup[] }
  | { kind: 'ordinary-pos-vat7'; definitions: ArOnlyPosDefinition[] }
  | { kind: 'posted-pos-vat'; definitions: ArOnlyPosDefinition[] };

interface ArOnlySourceClaimsProofV2 {
  version: 2;
  kind: 'ar-only-source-claims';
  sourceBefore: CurrentArTaxSource;
  sourceAfter: CurrentArTaxSource;
  components: SourceClaimComponentEvidence[];
}
verifyPostedPosClaims(
  packet: InvoicePacket,
  evidence: { definitions: ArOnlyPosDefinition[] },
  zeroToken?: VerifiedDirectZeroClaims
): Map<string, ArOnlySourceClaim>;
```

Reject unknown/duplicate component kinds, both POS adapters together, empty components, and unknown properties. The `direct-zero` component is mandatory when the original source has direct-zero candidates, absent otherwise. It is verified first; any remainder exclusion still requires its opaque source-bound token. Version 1 normalizes to its existing two adapters without changing acceptance.

`verifyPostedPosClaims` uses the unchanged full-source POS inspector (or verified remainder inspector), exact definition coverage and `verifyArOnlyPosDefinition`. Thus its first footer domain is only the already explicit ordinary base/native-service/VAT taxonomy. Every atom remains covered and source-bound. It returns actual `vat` claims and independently classified `taxable` claims, and requires at least one actual VAT identity. It does **not** call `verifyArOnlyPosPartitions`, require one VAT per sign, or reconstruct VAT at seven percent. The original `ordinary-pos-vat7` adapter retains those checks unchanged.

The initial adapter does not add mapped-fee, discount, mapped-sales, missing-subtype or ambiguous-default footer domains. Each requires a separate policy adapter review. Embedded Revenue/Wrapper/Payment residuals keep their current strict model validation in this first slice; the precise embedded VAT extension is a subsequent independently reviewable task, not an incidental relaxation.

Select this explicit evidence strategy during source planning, never by catching an old verifier failure. The outer envelope still provides exactly one source fence and one financial aggregation.

Create `worker/invoice/ar-only-posted-tax-claims.ts`. Reuse the source-claims envelope's whole-source fence and global ownership registry. The component produces source-bound facts, not an independently admitted invoice:

```ts
type PostedVatClaim =
  | { kind: 'selected-vat'; postingId: string; signedCents: number }
  | { kind: 'embedded-vat'; postingId: string;
      componentId: string; selectedRootId: string; preciseUnits: bigint };

type FooterClaim = {
  postingId: string;
  role: 'taxable' | 'nonvat';
  signedCents: number;
  policy: string; // an explicit implemented policy, never arbitrary caller text
};
```

Bigints and verified ownership tokens are internal derived results. The serialized proof contains actual source/configuration evidence; the verifier recomputes every claim. A later excluded-footer policy must add an explicit independently reviewed claim kind, rather than abusing either role above.

### Direct VAT facts

For each selected direct VAT posting, require exact selected/source ID, hotel, reservation, AR folio, date, currency and signed amount, including consistent debit/credit, posted amount and gross/net fields. Require independently paired code classification identifying Tax and VAT under the existing explicit VAT-definition contract. Preserve existing no-descendant, deferred, alias, window/cashier and complete scope checks where applicable.

The actual VAT amount comes from that selected posting. Its tax identity does not depend on there being exactly one VAT row or on its ratio to another selected row. No sign partition may silently discard or net away an actual VAT identity.

### Embedded VAT facts

Bind the actual tax ID and `referenceTransactionNo` to exactly one component. Bind that component to exactly one selected direct Revenue root or Wrapper package using the already verified source graph. Require scoped current definitions, THB, valid finite precise amounts, exact component gross/net/generated reconciliation, complete children and unique ownership. Refuse a VAT identity also owned by another component or selected direct claim.

Preserve the model's twelve-decimal fixed-point representation and round the total actual VAT once. Do not require each rounded component to reconstruct a nominal seven-percent rate when the posted identity and amount are independently authoritative. Do not silently drop unknown generated children: their contribution and footer policy still require proof.

### Independent footer policy

Every non-VAT monetary contribution must have a complete existing policy certificate. Start by extracting the existing paired metadata/source classification checks for ordinary base and native service, separately from the old percentage-partition guard. Explicit NonVAT and ordinary-revenue zero-VAT policies retain their full calculator, ownership and precedence conditions. A mapped fee requires its complete typed mapping and metadata policy; any broader signed or adjusted fee domain needs its own review and real-source qualification.

This task does not infer roles for ambiguous default/ST/DC/TX mappings, missing subtype definitions, manual NonRevenue exclusions, tax-inclusive unknown adjustments or transferred roots. Correct aggregate VAT is not a substitute for those policies. If a current verifier couples role proof to a rate check, extract the role contract explicitly; do not catch its failure and relabel the atom.

## Task 1: Actual VAT extraction

- [ ] Add synthetic RED tests for an adjusted base with independently identified posted VAT, multiple actual VAT IDs, signed actual VAT, and precise fractional embedded VAT whose sum rounds differently from individually rounded children.
- [ ] Implement source-bound direct and embedded VAT verification with no derived tax amount. Reuse the current identity/ownership helpers; do not edit, splice or fabricate a source packet.
- [ ] Add RED counters for wrong hotel/folio/date/amount, missing or duplicate IDs, selected/embedded aliases in both orders, reverse children, unknown tax definitions, incomplete pages and changed source/configuration pairs.
- [ ] Verify a stable posted VAT amount remains the output even when it is not seven percent of the current base. Separately verify that selected/source disagreement refuses. Keep the older standalone profile tests unchanged.

## Task 2: Footer policies and global coverage

- [ ] Define a closed policy registry returning footer claims only from independent verified source evidence. No arbitrary string, native field or percentage residual can mint a policy claim.
- [ ] Add tests proving the actual-VAT component alone cannot admit an invoice with an unknown basis/footer atom.
- [ ] Preserve explicit NonVAT precedence, including the owner-confirmed existing exception. Reject excluded-footer counterexamples until a separate policy is authorized.
- [ ] Compose VAT facts and footer claims through the source-claims registry. Reject ownership overlap and any uncovered selected monetary contribution; preserve strict residual handling.
- [ ] Aggregate once from original selected lines and precise embedded facts. Assert all original IDs, amounts and source bytes remain unchanged.

## Task 3: Reader selection and qualification

- [ ] Select the evidence strategy from source shape and available policy types before provider effects. Use the existing initial/fresh source fence and paired code reads; no catch-and-fallback after a proof or provider failure.
- [ ] Add reader tests for missing/changed rules and source, no native/receipt fallback, and preservation of existing qualified cases.
- [ ] Run focused Vitest suites and typecheck, then obtain independent review. Do not infer coverage from the 98 VAT-only matches.
- [ ] Parent replays the entire cohort, lists retention and new admissions, and compares all seven financial fields independently with actual AR references.
- [ ] Freshly capture source/configuration for every newly admitted shape, render and reopen PDFs, verify detailed footer fields, and retain visible-body qualification as a separate obligation.
- [ ] Run full tests/build after stable integration. Keep production unchanged until the complete qualification gate is met.

## Plan self-review

All five review-focus failures have test owners above. This plan separates actual tax authority from report-bucket classification and keeps the two missing-source transfers outside its claim domain. It intentionally leaves unresolved policy families visible instead of manufacturing net or tax values. New adapters belong in the shared composition envelope; no additional whole-invoice permutation is proposed.
