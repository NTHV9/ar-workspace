# AR-only Source Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. The owner already selected Sol implementation with independent Astra review; preserve that assignment.

**Goal:** Combine independently verified direct zero-tax and ordinary POS postings without weakening either proof or changing the financial source.

**Architecture:** One whole-source envelope contains component evidence. Pure component verifiers return disjoint claims over exact selected posting IDs; the existing model aggregates source money once and retains strict validation of all residual postings. Existing invoice profiles remain available and unchanged while this first composition slice is qualified.

**Tech Stack:** TypeScript, existing OPERA reader, Vitest; no new dependencies.

**Spec:** `2026-10-23-ar-only-invoice-source.md`, `../../AR_ONLY_POS_SOURCE_PROBE_PLAN_20261023.md`, and the parent-approved composition design in this plan. This is an approved local implementation plan, not deployment authorization.

## Global constraints

- No `folioReports` or Guest Folio PDF as financial source, tax validator, or fallback.
- THB only. Preserve actual selected debit/credit amounts, VAT postings, identities and references.
- No native PDF values, runtime invoice exceptions, fabricated records, or modified source packets.
- One initial/fresh financial source pair, with all rule/calculation pairs spanning that same fence.
- No email, accounting, cloud-resource, permission, paid-service or production-routing changes.
- Customer captures and PDFs stay in ignored private audit storage. Tracked fixtures remain synthetic.
- Explicit NonVAT policy takes precedence, including the existing owner-confirmed exception.

## Scope and review focus

The first envelope supports **direct zero claims + ordinary native POS** only. Direct zero claims may combine explicitly proven NonVAT and ordinary-revenue zero-VAT/before-VAT atoms. Ordinary POS means the existing base/native-service/VAT metadata and independent sign-partition verifier, including its one-VAT-per-sign and one-satang bound.

Fee, discount, repeated-VAT, mapped-sales, net-base-wrapper, AR posted-graph and transfer components are not accepted in this first envelope. They must later enter through explicit component adapters and tests, not additional ad hoc whole-invoice branches.

Review these five failure classes:

1. Caller-forged exclusion IDs hiding an unverified selected posting.
2. Claims sharing an ID with another component or an embedded tax, in either processing order.
3. A stale or missing component response being treated as a valid empty component.
4. A taxless, unknown or incompatible residual silently entering the legacy model path.
5. A source/configuration failure triggering a different financial provider or proof strategy.

## File boundaries and interfaces

- `worker/invoice/ar-only-zero-vat-net-proof.ts`: extract a pure complete direct-zero claim verifier; retain the current standalone envelope and its at-least-one-new-zero-net requirement.
- `worker/invoice/ar-only-pos-proof.ts`: add a remainder inspector accepting an opaque verified direct-zero token. Keep the original inspector API unchanged. Both use the full selected/source identity sets and complete source closure.
- Create `worker/invoice/ar-only-source-claims.ts`: composition envelope, pure verification and disjoint claim ownership.
- Create `worker/invoice/ar-only-source-claims-read.ts`: bounded evidence collection around the caller's existing financial source fence.
- `worker/invoice/ar-only-read.ts`: select the new strategy from source shape, then use the common display finish path.
- `worker/invoice/model.ts`: recognize the single new financial envelope, preclaim all direct IDs, aggregate actual source money once.
- Synthetic tests: `tests/invoice-ar-only-source-claims-proof.test.ts`, `tests/invoice-ar-only-source-claims-read.test.ts`, and `tests/fixtures/invoice-ar-only-source-claims.ts`.

```ts
type DirectZeroClaim = {
  role: 'nonvat' | 'zero-vat-net';
  signedCents: number;
};
type ArOnlySourceClaim = {
  role: 'vat' | 'nonvat' | 'taxable';
  signedCents: number;
  component: 'direct-zero' | 'ordinary-pos';
};
interface ArOnlySourceClaimsProof {
  version: 1;
  kind: 'ar-only-source-claims';
  sourceBefore: CurrentArTaxSource;
  sourceAfter: CurrentArTaxSource;
  directZero: { groups: ArOnlyZeroVatNetGroup[] };
  ordinaryPos: { definitions: ArOnlyPosDefinition[] };
}
verifyArOnlyDirectZeroClaims(
  packet: InvoicePacket, groups: ArOnlyZeroVatNetGroup[]
): VerifiedDirectZeroClaims;
readVerifiedDirectZeroClaims(
  packet: InvoicePacket, token: VerifiedDirectZeroClaims
): ReadonlyMap<string, DirectZeroClaim>;
inspectArOnlyPosRemainder(
  packet: InvoicePacket, token: VerifiedDirectZeroClaims
): ArOnlyPosAtom[];
verifyArOnlySourceClaimsProof(
  packet: InvoicePacket
): Map<string, ArOnlySourceClaim>;
```

`VerifiedDirectZeroClaims` is an opaque, invocation-local token registered by the pure verifier in module-private storage, with its complete source fingerprint and immutable claim values. The accessor rejects unregistered tokens and tokens bound to another source, and returns a defensive copy. The remainder inspector derives exclusions only through this accessor; it accepts no arbitrary ID set. Tokens are never serialized or stored in `InvoicePacket`.

## Task 1: Pure claim verification and complete source inspection

- [ ] Add a synthetic failing test combining an explicit zero-net atom, an explicit NonVAT atom and one independently valid ordinary POS check. Assert all selected direct IDs are claimed once with their exact signed source amounts.
- [ ] Add failing tests for an extra zero-evidence ID aimed at a POS VAT row, missing zero evidence, duplicated zero evidence, and an invalid zero-policy atom. None may become a POS exclusion.
- [ ] Extract `verifyArOnlyDirectZeroClaims(packet, groups)` from the current zero-net verifier. Preserve all source, recursive descendant, metadata, calculator and NonVAT-precedence checks. It validates every direct-zero candidate. The standalone zero-net wrapper retains its existing envelope/fence checks and requires at least one `zero-vat-net` result.
- [ ] Add an internal POS inspection implementation shared by the unchanged original inspector and `inspectArOnlyPosRemainder`. Every selected ID is collected and checked for duplication before an exclusion is considered. Validate that each token-derived exclusion exists in the selected set; preserve the complete source `byId` map and unselected/reverse-link scans.
- [ ] Test a forged token, a token from another packet, and mutation of an accessor-returned map. None may alter the privately registered validated exclusions or hide source money.
- [ ] Test a real unselected sibling, a missing/unknown sibling window, a reverse child and an embedded alias against excluded zero IDs. A no-check zero atom remains posting-ID scoped; unrelated no-check rows are not one shared check.
- [ ] Run the zero-net, NonVAT and existing POS suites. Require all previous behavior tests to pass before proceeding.

## Task 2: The composition envelope and model aggregation

- [ ] Add `ArOnlySourceClaimsProof` as exactly one financial proof alternative. Reject native controls, legacy proof mixtures, unknown component keys/kinds, empty required components, AR details/graphs/transfers and extra supplied financial proof envelopes. Display evidence stays orthogonal.
- [ ] Verify canonical `arOnlyTaxSource(packet)` against both complete snapshots before obtaining component claims.
- [ ] Verify all direct-zero claims on the full original packet and obtain the opaque token. Then inspect the POS remainder using that token. Require nonempty ordinary POS atoms and exact paired definition coverage for their unique codes.
- [ ] Reuse `verifyArOnlyPosDefinition` and `verifyArOnlyPosPartitions` unchanged. Convert base/service to `taxable`, VAT to `vat`, and direct-zero roles to `nonvat` or `taxable`. Keep component provenance in the returned map.
- [ ] Reject duplicate ownership and signed-amount disagreement when joining maps. Cross-check each claimed ID against the exact selected/source posting. No source records are removed, inserted or rewritten.
- [ ] Preclaim the combined IDs in the model's existing tax/component ownership sets. Add VAT only from `vat`, NonVAT only from `nonvat`; `taxable` adds neither. Actual selected financial lines continue to determine debit, credit and gross.
- [ ] Preserve strict residual validation for Wrapper, Payment and Revenue **with nonempty embedded taxes**. Existing scope, child/reference, amount, tax-code and full-VAT checks still run. Unclaimed direct Revenue without embedded taxes must refuse.
- [ ] Test cross-component and component/embedded aliases in both ordering directions, missing coverage, wrong currency, signed per-check VAT error cancellation, and an ordinary POS definition that actually describes a fee or unknown role.
- [ ] Assert financial lines and packet bytes are unchanged. Assert a valid composition's seven financial fields equal the independently expected synthetic values; no amount comes from evidence-calculation rows.

## Task 3: Bounded reader composition

```ts
readArOnlySourceClaims(
  reader: ArOnlyInvoiceReader,
  initial: InvoicePacket,
  readFresh: () => Promise<InvoicePacket>
): Promise<InvoicePacket>;
```

- [ ] Write a reader test proving one initial/fresh financial pair, rule/calculation reads on both sides, no POS mapping/receipt/Guest calls, and the existing common display finish path.
- [ ] Plan read scopes from the initial source's direct-zero candidate IDs and selected/source rows not owned by those candidates. This planning step only discovers codes for reads: it must not construct a verified token or financial claim. Final verification recomputes the validated claim set from actual paired evidence.
- [ ] Read exact unique rule codes and signed `(code, amount)` calculations before the existing `readFresh` callback. Bound work using current source/read limits and the existing batched reader. Never cache evidence across invoices.
- [ ] Read the fresh source once, compare its whole normalized source fingerprint, then reread the same rule and calculation scopes. Any provider or mutation error propagates; no catch-and-financial-fallback.
- [ ] Build one composed envelope with the actual before/after data. Run the independent composed model verifier before returning the packet to the shared display finisher.
- [ ] Preserve existing standalone NonVAT/zero-net behavior when there is no POS remainder. Choose composition before a standalone proof would reject a genuinely compatible remainder. Incompatible POS roles stay unsupported; no alternate provider follows that refusal.
- [ ] Test missing component evidence, a changed calculation, changed rules, changed source, duplicate/pagination source errors, and provider failures. Assert zero Guest/receipt/interface calls in every counterexample.

## Task 4: Independent review and real-source qualification

- [ ] Run `pnpm exec vitest run tests/invoice-ar-only-source-claims-proof.test.ts tests/invoice-ar-only-source-claims-read.test.ts` and the existing zero-net/NonVAT/POS/model/display suites. Require all tests and `pnpm typecheck` to pass.
- [ ] Obtain independent Astra review before broad qualification. Keep the previously qualified baseline and all counterexamples intact.
- [ ] Parent replays the entire captured cohort, verifies every prior admission is retained and separately lists newly admitted cases. Compare all seven actual AR financial fields; do not use native values to construct proof or money.
- [ ] For new admissions, capture fresh complete source/rule/calculation pairs, render PDFs, reopen them and compare every footer field with actual AR references. Keep native body grouping/reference work separate from financial parity.
- [ ] Run the combined full suite/build once stable. Parent records implemented/tested/qualified status; deployment and production routing remain unchanged.

## Extension rule

Later fee/discount/multiple-VAT/mapped-sales components must implement the same pure claim contract, own a complete independently scoped source region, preserve their current metadata/rate conditions, and pass the global disjoint-ownership and coverage checks. Add an adapter to the composition envelope rather than invent another whole-invoice permutation. Wrapper/AR graph extensions require explicit embedded ownership summaries before they can join; this first slice does not authorize them.

## Plan self-review

All five review-focus failures have explicit tests above. One source fence, exact claim coverage, native independence, calculator non-monetary use, existing policy precedence, and strict residual validation are preserved. The owner has already approved this first slice and the Sol/Astra execution method; no additional permission question is required. This plan does not authorize implementation of later component families or deployment.
