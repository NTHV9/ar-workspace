# Actual posted wrapper VAT claims

Parent approved the two remaining wrapper cases as the next bounded implementation slice. Main Sol implements; Astra reviews. No deployment.

## Problem and authority

The current net-only wrapper verifier uses current nominal service/VAT formulas and a base-only VAT bucket. The two actual cases have complete posted ownership and explicit tax amounts: one uses the base plus posted service as the VAT base; the other has fractional posted allocations that differ slightly from the current nominal calculation. Do not widen arithmetic tolerances or recalculate their tax.

The new certificate uses actual component net/gross and actual child amounts, exact IDs/references and paired typed role definitions. Current definitions corroborate roles, not historical rates or membership. Keep the old net-only proof unchanged.

## Exact envelope and claim

Reuse the existing flat `ArOnlyWrapperNetVatComponent` evidence record (`wrapperId`, `packageReference`, `componentId`, `generateIds`, paired root rules and paired generated rules). Add a closed V4 singleton envelope:

```ts
interface PostedEmbeddedVatComponent {
  kind: 'posted-embedded-vat';
  components: ArOnlyWrapperNetVatComponent[];
}
interface ArOnlySourceClaimsProofV4 {
  version: 4;
  kind: 'ar-only-source-claims';
  sourceBefore: CurrentArTaxSource;
  sourceAfter: CurrentArTaxSource;
  components: [PostedEmbeddedVatComponent];
}
interface PostedEmbeddedRootClaim {
  role: 'taxable';
  component: 'posted-embedded-vat';
  sourceKind: 'reservation-wrapper';
  signedCents: number;
  actualPostedVatUnits: bigint;
}
```

Initial V4 claims selected **Wrapper roots only**. No POS, direct-zero, transfer/current-rule or second component is introduced in this slice. Ordinary unclaimed Wrapper, Revenue-with-embedded-tax and Payment rows retain the existing strict residual path. V4 produces no POS display region.

## Ownership and posted amounts

- Extract/export the existing wrapper `verifyOwnership` as a shared helper with its authority unchanged. Retain all package/component/tax IDs, known windows, dates, source scope, selected-wrapper amount reconciliation, reverse-reference closure and cross-structure aliases in both iteration orders.
- Discover the affected wrapper-ID set from source components identified by `discoverWrapperNetVat`. That old ratio is a **read-strategy discriminator only**, never the new VAT amount authority.
- For every affected wrapper, include **all** actual components under its exact package reference, even components whose original nominal check happened to pass. Require exact evidence component/generate-ID coverage, no omissions/extras/duplicates and consistent paired metadata for every reused hotel/code across records.
- Do not force unaffected wrappers into the new certificate. In particular a separate MISC wrapper with a normal single VAT child remains strict residual; it is not relabeled Lodging/F&B or silently ignored.
- Preserve global ownership of claimed and unclaimed selected roots and their embedded children. Explicit unresolved financial member/group declarations cannot override the verified tree. No new monetary anchor record or synthetic child is created.
- Require actual component net plus all actual child amounts to reconcile to its actual gross using the **same existing twelve-decimal conservation tolerance**, not a wider tolerance. Sum actual component gross and reconcile to the selected wrapper's signed cents once.

## Paired role certificate

For each claimed component, keep the bounded root Revenue classification with Lodging/FoodAndBeverage and RM/F&B group, nonTaxable=false, uncomped/non-adjusted, and the existing supported current setup shape. The actual two child entries must bind to that real component ID and to exact paired definitions: one native SVC/NonRevenue child and one Tax/VAT child, with source code-group agreement and valid explicit tax bucket identity. Retain leaf no-descendant/association/adjustment and scope restrictions.

Do **not** require actual service or VAT amount to equal a current percentage formula. Do not require the VAT bucket to contain base alone: a known configured bucket may include the service child. Current rule/code data is not asserted to be historical proof. Unknown conditional/UDF/bracket interpretations must not become a source of computed money; this slice preserves the existing bounded supported configuration structure.

`actualPostedVatUnits` is the sum of actual verified VAT child amounts for the complete wrapper, using the shared 12-decimal helpers. Keep every actual child amount, sum with other invoice VAT, and round only once. No calculator or seven-percent replacement amount.

## Registry, model and reader

- Validate the whole-source before/after fence and exact V4 singleton before issuing claims. Resolve these real wrapper IDs only in the reservation source; preserve V1/V2/V3 contracts.
- Model aggregation keeps the original wrapper financial line and adds its `actualPostedVatUnits` exactly once. Preclaim actual selected root IDs and preserve global child alias validation through the shared ownership proof. Unclaimed rows still undergo their unchanged strict validation. No generic bypass of nominal checks is added to the old model path.
- Reader source-shape plans the affected full-wrapper region, reads all needed component/child definitions, takes the existing one financial fresh snapshot, and rereads the same definitions. Cache exact hotel/code reads within each phase only. No provider/error fallback, report, Guest source or calculation.
- Rate/country/City Ledger display helpers use the common finish path. V4 has no POS region in this first slice.

### Prior-proof retention amendment

Recorded retention testing found previously qualified packages containing both an old net-only exception component and a normal Others/MISC single-VAT sibling inside the same wrapper. Their unchanged old net-only proof plus strict residual model succeeds; forcing every such package into V4's two-child full-wrapper domain is a strategy regression.

Retain the prior composition when **all** discovered exception components satisfy the exact unchanged old component facts. Extract those facts as a pure planning predicate shared with the old throwing verifier; do not maintain a weaker duplicate. Validate shared complete-source ownership before strategy selection. Select the old proof before the financial fresh fence, leaving its sibling components under the unchanged strict model. If the old facts are not eligible, select V4 and require its existing complete full-wrapper certificate. Both final verifiers remain authoritative after paired evidence collection.

This is deterministic evidence-based planning, not catch-and-retry or provider/error fallback. Ownership, malformed source, source mutation and provider errors must not be interpreted as permission to switch profiles. V4's supported child cardinality/role domain is unchanged. Tests must include a same-package strict single-VAT sibling, original alias controls in either order, and the actual-deviation source shapes that still select V4. Full retained-admission sets must be compared, not just aggregate success counts.

## Tests and acceptance

RED tests cover actual base-plus-service VAT, fractional service allocation rejected by the old nominal formula, multiple components per claimed wrapper, a separate untouched MISC/single-tax wrapper, original gross/IDs unchanged, and one final VAT round. The old net-only proof must keep its old contract.

Reject incomplete packages, missing/extra component or tax evidence, wrong scope/reference/window/date/code, inconsistent paired definitions across reused codes, foreign/missing root or leaf roles, hidden descendants, package-anchor/monetary-ID aliases, aliases against strict residual taxes in either order, actual net/gross nonconservation, source/config mutation and caller-supplied replacement VAT. Do not test matching native totals as a rescue condition.

Review focused tests/typecheck, replay all recorded invoices retaining the existing baseline, and independently compare all seven actual AR fields. Parent fresh-reads both cases and renders/reopens their PDFs. Relevant missing leaf definitions have now been captured in stable pairs; no invented record is needed. No deployment follows automatically.
