# Explicit revenue base claims without a subtype

Status: proposed bounded implementation contract. Parent approval precedes implementation; financial/source qualification and independent review remain required. No deployment.

## Independent role authority

Oracle's [26.3 transaction-code configuration guide](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_admin_financial_cashiering_adding_transaction_codes.htm) describes Transaction Type as optional, with a blank value permitted. The separate Revenue Group setting identifies sales charges as revenue. The cached public 26.3 FOF `trxSetupType.revenue` schema likewise defines true as hotel revenue. These facts support an explicit revenue certificate without inventing a FoodAndBeverage subtype.

The [26.3 transaction-code overview](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/c_admin_financial_cashiering_about_transaction_codes.htm) requires Tax transaction type when configuring a tax posting. This certificate must not classify VAT from an absent subtype, a name, percentage or POS itemizer alias. Actual VAT remains independently identified and summed from posted source rows.

The seven current candidate cases have paired explicit Revenue/F&B/revenue=true metadata, absent subtype, nonTaxable=false, taxInclusive=false and the restrictions below. Every affected exact check scope contains an actual explicit VAT row. Six invoices also contain independently proved mapped fees; one has a direct-zero component. The implementation must compose these known roles rather than introducing another incompatible whole-invoice branch. Mixed/default mapping roles outside these certificates remain unresolved.

## Closed V2 component

Add one alternative POS-owner kind to the existing V2 envelope:

```ts
type ExplicitRevenuePosComponent = {
  kind: 'posted-pos-explicit-revenue-base';
  definitions: ArOnlyPosDefinition[];
  interfaces?: PosInterfaceEvidence;
};
```

It owns the complete inspected POS remainder and is mutually exclusive with ordinary, posted-native and posted-fee POS owners. The existing opaque direct-zero component may coexist. Do not modify V1, V3, old POS verifiers or their accepted role taxonomy.

Create a narrow pure role certificate for an atom with all of:

- Exact paired same-hotel/code definition and selected-source group agreement.
- `classification.type === 'Revenue'`, group F&B, and `classification.transactionType` genuinely absent. Null, malformed or an explicit contradictory subtype is not absence.
- `trxSetup.revenue === true`, `nonTaxable === false`, `taxInclusive === false`, `manualPosting === false`, `useForPaidout === false`, `depositPostingOnly === false`, and `compTransaction === false`.
- No active adjustment, associated transaction, configured generated child, or unknown inclusive-generates policy. Known supplied bucket flags must not introduce a new calculation interpretation.
- The unchanged full-source POS inspector's selected/source amount, ID, date, scope, cashier, window, paidOut/deferred, descendant, membership and sibling-closure checks.

The certificate returns taxable base identity only. It does not fill in a subtype, change source metadata, infer a discount from sign, or consult a label or mapping to select a role.

The component verifier first applies that certificate to eligible absent-subtype atoms. All other atoms use existing explicit native base/service/VAT role checks or the existing strict mapped-fee certificate unchanged. Require at least one newly certified base and at least one actual VAT identity. Every scope containing a new base must contain explicit actual VAT; every fee scope retains its independently proved base/VAT context. Preserve exact complete scope keys and source columns. Do not impose a nominal percentage, one-VAT cardinality or positive-only sign rule.

Complete paired property interface evidence is required if and only if any strict fee is present. Call the existing `verifyMappedFeeCode` for those fee codes. Mixed ST/DC or default usages of an explicit revenue-base code are not used as tax authority: its independent revenue certificate governs that code. The same mappings cannot certify a NonRevenue/default code.

Return one exact selected-source signed-cent claim per atom: VAT for existing explicit VAT identities, taxable for independently certified bases/services/fees. Existing global aliases/coverage and strict residual wrapper, embedded Revenue and Payment validation remain unchanged. No extra generated IDs, calculator result, native controls or replacement money.

## Reader selection and evidence fence

Select the new domain from the full source plus initial paired-role read scopes before invoking old subtype-dependent planners. A missing optional subtype currently makes those old planners throw; do not use a catch-and-fallback path. With zero atoms, use the existing source-only discovery for scopes and final opaque verified exclusion token.

The planner must establish at least one exact new-base candidate and otherwise supported native/fee roles before any interface requests. Preserve all existing strategies for packets without the new certificate. Read definitions and any required complete active interface mapping before and after the existing single financial fresh read. All pairs must be stable; provider errors and source mutations do not trigger receipt, native, Guest or weaker-proof fallback. No fee means zero interface/receipt requests.

Use the existing common display finish; new SourceClaims display support remains a separate reviewed task. Financial acceptance does not imply native body parity.

## Required RED tests and qualification

- Positive missing-subtype explicit revenue base with actual VAT; signed amounts and repeated/adjusted VAT retained literally; ordinary native scopes alongside; optional strict mapped fees; optional verified direct-zero component; unchanged original model lines and final sums.
- Revenue=false/missing, explicit Tax/NonRevenue/unknown subtype, null subtype, wrong classification/group/hotel/code, nonTaxable/inclusive/manual/paidOut/deposit/comp flags, generates/associations/adjustments, missing or changed paired definition all refuse this certificate.
- No actual VAT in a new-base scope, unknown/default fee role elsewhere, mixed SC mapping, extra/missing/duplicate code evidence, alias or hidden child in either iteration order, unknown window and unselected sibling all remain refused.
- No convenient subtype or amount rewriting; no map call for no-fee candidates; no receipt/native calls; provider/source/config failures propagate. Existing reader proof kinds and old corpus admissions remain intact.
- Rebuild all 1,402 captured invoices, preserve all 1,328 current admissions, and record newly admitted cases rather than assuming seven. Independently compare every native AR footer field, then parent fresh-read/render/reopen each new case. Keep stored-native acceptance distinct from fresh AR PDF generation. No deployment follows automatically.
