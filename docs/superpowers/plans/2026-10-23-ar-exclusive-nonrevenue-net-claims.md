# Actual posted exclusive non-revenue net claims

Status: bounded report-policy proposal for parent-approved implementation and qualification. No deployment or universal Oracle footer-policy claim.

## Authority and explicit inference

Oracle's [property-interface configuration guide](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.2/ocsuh/t_admin_interfaces_configuring_property_interfaces.htm) defines All Charges as a default posting destination. An interface mapping's ST/DC/TX/default aliases therefore do not, by themselves, classify an already posted OPERA row's tax footer role.

The [26.3 transaction-code guide](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_admin_financial_cashiering_adding_transaction_codes.htm) separates the optional reporting subtype, revenue flag, paid-out and inclusive-generates settings. The [26.3 overview](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/c_admin_financial_cashiering_about_transaction_codes.htm) requires explicit Tax type for tax postings. Cached 26.3 FOF schema defines `revenue` and `nonTaxable` independently. Oracle's [Reporting and Analytics field definitions](https://docs.oracle.com/en/industries/hospitality/opera-reporting-analytics/ddrna/SA_Definitions.pdf) distinguish taxable non-revenue from non-taxable non-revenue amounts.

These sources establish that NonRevenue does not mean NonVAT and that transport aliases are not the only role authority. They do **not** specify every custom Katathani AR footer formula. The narrow policy below is an explicit current-AR report-policy inference: closed, exclusive, nonmanual F&B non-revenue charges with actual VAT in the same source scope contribute their actual posted net amounts to the taxable-net bucket. Every new invoice must pass independent native AR field qualification before this policy is enabled.

The private source audit identifies 45 conditional invoices whose remaining unknown atoms fit this certificate and have actual explicit VAT in their scopes. Other overlaps include independently certified missing-subtype revenue, tax-inclusive charges, a MISC role and a taxless scope. Those are not silently folded into the new certificate. The two manual MISC excluded-footer cases remain outside it. Counts are evidence, never runtime allowlists or promised admissions.

## Pure certificate

Create `ar-only-exclusive-nonrevenue-pos-claims.ts` with a closed alternative V2 POS-owner component:

```ts
interface ExclusiveNonRevenuePosEvidence {
  kind: 'posted-pos-exclusive-nonrevenue';
  definitions: ArOnlyPosDefinition[];
}
```

The component owns the complete POS remainder; it cannot coexist with another POS owner. The existing opaque direct-zero facet may coexist. No interface, receipt, native control or replacement-money evidence is accepted by this component.

A new atom certificate requires all of:

- Exact paired current hotel/code definition, agreeing with the selected-source transaction group.
- `classification.type === 'Revenue'`, explicit subtype `NonRevenue`, group F&B, and `trxSetup.revenue === false`.
- Explicit `nonTaxable === false`, `taxInclusive === false`, `manualPosting === false`, `useForPaidout === false`, `depositPostingOnly === false`, and `compTransaction === false`.
- No configured child generates, associated transactions, adjustment policy or inclusive-generates policy. Supplied bucket configuration must not introduce an unreviewed calculation interpretation.
- Unchanged full-source POS identity and closure: actual selected/source IDs and amounts, THB, hotel/reservation/folio/known window/date/check/cashier, no deferred/paid-out/descendant/group-member contradiction, no duplicate or unselected same-scope monetary sibling.
- Actual OPERA `postingBreakdown.netAmount` and `grossAmount` equal the selected/source signed amount exactly, with no embedded tax child. This is the row's explicit posted net amount, not an amount derived from a native footer difference.

Call this role `exclusive-nonrevenue-charge` internally if a distinct identity label is useful. Never call it service, tip, discount or revenue merely from its sign or interface aliases. Its footer claim is taxable net only; it contributes no fabricated VAT.

Classify all other remainder atoms with the existing native base/service/explicit VAT certificates or the independently reviewed absent-subtype explicit-revenue certificate. Require at least one newly certified non-revenue atom. Every exact scope containing one must contain at least one actual explicit VAT identity. Preserve literal selected/posted check agreement for those scopes. No nominal seven-percent check, positive-only restriction or VAT cardinality restriction is introduced.

An explicit Tax row remains VAT under its existing certificate and can never become this non-revenue charge. A default/allCharges alias does not make a row VAT, NonVAT or excluded. Unknown/manual/MISC, taxInclusive=true, paid-out, taxless new-charge scope, partial or unowned groups remain unsupported. All claimed VAT IDs contribute once; all new charges retain their exact signed net source amounts. Global claim aliases, zero-token exclusions and strict residual financial validation remain intact.

## Reader and display sequencing

Plan from the original full source and exact initial definitions before old subtype/fee planners. Select this component deterministically only when the **entire** remainder fits its independent certificates. Read the same definitions again across the existing single financial fresh-source fence. Do not call transport mappings to prove this role, catch a failed mapping verifier to authorize it, or fall back after a provider/source failure.

This stronger independent policy can change the internal proof kind of already qualified strict-SC invoices. Old verifiers remain unchanged for their existing contracts and for packets outside the new certificate. Preserve every previously admitted amount, source ID, date, reference and financial line. Do not conceal a body regression: the shared SourceClaims POS-display adapter is a required companion before enablement, so existing qualified grouped body rows remain grouped when the internal financial owner changes. Intermediate captured financial replay may report display gaps while that companion is under construction; it must not report full PDF parity.

No raw POS mapping ambiguity is discarded from audit history. It simply does not supply authority to this separate, explicitly qualified report policy. No code, hotel, invoice or native-total allowlist.

## RED tests and qualification

Positive tests cover signed exclusive non-revenue net charges, repeated and offsetting actual VAT, adjusted actual amounts, ordinary native scopes, an absent-subtype explicit-revenue base, optional verified direct-zero claims, and strict embedded residuals. Assert original packet/model financial bytes and exact VAT identities, without calculating tax or relabeling subtype.

Reject every missing/contradictory required flag; Tax/unknown/MISC subtype or group; inclusive charge; manual or paid-out role; generated/associated/adjusted/nested/group-owned rows; missing scope VAT; raw check mismatch; source amount mismatch even if totals cancel; duplicates/aliases in either iteration order; foreign/missing scope; stale metadata/source; forged zero exclusions; extra interface/native/amount evidence. Retain the two excluded-footer manual MISC counterexamples and the tax-inclusive F&B counterexamples.

Reader tests prove source-only deterministic planning, no interface/receipt/calculator/Guest calls for this certificate, one whole-source fence and complete paired definitions, no error fallback, and existing strategies outside its domain. Preserve old pure-verifier tests; internal proof-kind assertions may change only where the new explicit domain is intentionally selected, with financial and display invariants tested instead.

Run the full 1,402 recorded corpus and report the exact new set and all baseline retention. Independently compare taxableNet, VAT, NonVAT, gross, outstanding, debit and credit to actual AR references; matching gross or conservation alone cannot qualify a case. Parent captures fresh full source/config pairs and reopens generated PDFs for every new admission. Separately validate all affected prior POS body grouping after SourceClaims display integration. Unknown residual roles remain visible work items. No deployment follows automatically.
