# Posted net with a current inclusive flag

Parent approved this bounded follow-on. Preserve the existing exclusive NonRevenue certificate unchanged. No deployment is authorized.

## Evidence and claim

The three remaining metadata-scope cases contain four direct F&B NonRevenue atoms whose current configuration sets `taxInclusive=true`. Their actual selected amount, source posting amount, explicit posting-breakdown net amount and gross amount are all exactly equal. None has an embedded tax child or configured generates, associations or adjustments. Every affected exact check scope contains separate, independently identified actual VAT postings. Current configuration does not establish that these actual historical atoms contain unreturned VAT.

The new certificate uses the explicit **posted net** and exact source ownership. It neither derives an inclusive split nor calculates current tax. Native AR footer matching is acceptance only. Taxless standalone atoms remain outside this slice.

## Exact V2 boundary

Create a new alternative complete POS owner:

```ts
interface ExplicitPostedNetNonRevenueEvidence {
  kind: 'posted-pos-explicit-net-nonrevenue';
  definitions: ArOnlyPosDefinition[];
}
```

Use a separate module/predicate; do not change `exclusiveNonRevenueCandidate` or the generic POS metadata verifier to permit the flag.

The new predicate requires the existing strict Revenue/NonRevenue/F&B/revenue=false domain, explicit nonTaxable=false/manual=false/paidOut=false/deposit=false/comp=false, but **taxInclusive must be exactly true**. Configured generates/associations/adjustments and inclusive-generates policy remain absent; supplied bucket configuration cannot introduce another interpretation. Reject unknown/missing flags and other groups/subtypes.

Actual ownership is validated through unchanged `inspectArOnlyPos` or its opaque-zero remainder accessor: exact selected/source identity and amount, actual breakdown net=gross=selected, no embedded taxes, no descendants, no membership aliases, known window and complete sibling closure. The predicate alone does not authorize money when called on planning atoms.

The complete owner supports:

- At least one newly certified current-inclusive-flag atom.
- Existing unchanged strict exclusive NonRevenue atoms.
- Existing explicit native base/service/VAT roles.
- The independently reviewed missing-subtype explicit Revenue base.
- Optional existing opaque direct-zero facet in the shared envelope.

Every new or reused NonRevenue and absent-subtype revenue scope retains exact literal selected/posting check equality and actual explicit VAT presence. No interface evidence is accepted; mapping aliases do not create a role. Return exact selected-source taxable/VAT signed-cent claims, aggregate every real VAT ID once and retain the original financial lines. No sign, nominal percentage or one-VAT restriction.

Source-plan this complete new domain before old current-configuration subtype/inclusive validators. All definitions must be paired across the existing one whole-source fence. Unsupported atoms remain refused; provider failures never switch financial domains. SourceClaims display uses the same verified POS region and native group metadata, without reclassifying money.

## Tests and qualification

RED tests: valid current-inclusive/no-generates atom with explicit recorded net=gross and separate VAT; positive/negative or repeated actual VAT unchanged; coexistence with strict exclusive NonRevenue, absent-subtype Revenue and verified direct-zero evidence. Preserve the 45 certificate's refusal of current-inclusive atoms.

Reject net/gross/selected disagreement, an embedded/generated/associated child, any configured generate/adjustment, missing actual scope VAT, raw check mismatch, missing/contradictory flag, different group/type, duplicate or reverse alias, stale source/rules, native/interface evidence and calculator-derived replacement amounts. The current flag alone never suffices.

Review focused tests and typecheck, retain the complete recorded financial baseline, then parent fresh-read all three cases and compare every native AR field and generated PDF. Qualify grouped body rows through the SourceClaims display companion separately. No runtime native PDF, Guest route, per-code exception or deployment.
