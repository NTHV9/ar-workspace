# TSAN manual NonRevenue zero-tax footer policy

Proposed bounded financial slice for parent review. This is an empirical current-AR report policy, not a documented universal Oracle tax classification. Do not implement or deploy it merely because it makes a footer balance.

## Evidence and limits

The full 1,402-document native audit has exactly two cases where printed gross differs from before-VAT plus VAT plus NonVAT. In both, the difference is the independently identified positive standalone manual NonRevenue/MISC source charge. Those charges are present in the selected AR body and gross, have actual net=gross and no posted taxes, and are excluded from both printed tax-base buckets. Each invoice also contains one explicitly nonTaxable=true charge, which remains NonVAT, plus ordinary already-supported embedded Revenue and Payment residuals. There is no additional POS remainder in these two cases.

The candidate metadata conjunction is independently observable: TSAN, classification Revenue/NonRevenue/MISC, revenue=false, manualPosting=true, nonTaxable=false, taxInclusive=false, paid-out/deposit/comp=false, and no generates, associations or active adjustment. The captured metadata census finds no other zero-generate charge in this domain. Countercontrols establish that NonRevenue alone, manual alone, empty generates alone and a shared GL mapping are insufficient: nonmanual F&B NonRevenue belongs in before-VAT; manual revenue=true charges retain their existing policy; generated NonRevenue is outside this domain; explicit NonVAT takes precedence.

This supports qualification of a named **TSAN current-AR manual NonRevenue footer-exclusion profile**. It does not prove another property's report behavior or a universal future configuration rule. Native values are acceptance evidence only and must never enter the runtime certificate or act as an override. The initial profile is positive charges only; negative reversal semantics need their own source/native controls.

## Closed source-claims envelope

Use a separate V5 singleton `current-ar-zero-footer` component in the existing full-source SourceClaims envelope. Do not broaden the old direct-zero provenance function or let V1/V2 interpret an excluded amount as taxable/nonvat.

Each component record owns one actual standalone zero-tax selected ID and is exactly one of:

- `excluded-tax-footer`: posting ID plus paired current code rules and the named report-policy provenance.
- `explicit-nonvat`: the existing exact explicit-NonVAT candidate evidence, including its paired calculation where required by that unchanged policy.

Require exact complete `inspectArOnlyNonVat` candidate coverage, no duplicates/extras and at least one new excluded claim. Classify explicit NonVAT first through the existing policy and pure candidate verifier. Unknown zero atoms refuse the whole component. V5 initially accepts only strict embedded Revenue, Wrapper and Payment residuals; an unrelated direct POS region is not silently bypassed. It issues no POS display region.

The new exclusion candidate requires the exact metadata conjunction above, explicit Others/Tax or tax-code annotations are refused, source code-group agreement, positive actual selected cents, actual source net=gross, no actual taxes and no configured children. Retain the existing complete standalone source scope, raw-check agreement if present, known window, selected/source monetary and optional-field consistency, no deferred/nested/parent/package/member declarations, full reverse closure and aliases. Reuse/export those shared source checks without weakening their old behavior. No descriptions, code IDs, GL mappings, native gap or seven-percent relation select the role.

Current zero-charge simulations do not establish footer exclusion. Do not add a calculator solely to pretend that they do. Existing explicit-NonVAT calculation requirements remain unchanged.

## Aggregation and read fence

Claims are `{role:'excluded-tax-footer'|'nonvat', signedCents, component:'current-ar-zero-footer'}` on real selected root IDs. Preclaim them globally once. Preserve all original financial lines, debit, credit, gross, outstanding and actual posted VAT. Explicit NonVAT remains its actual signed amount. Accumulate excluded cents separately and compute before-VAT as `gross - actualVAT - explicitNonVAT - excludedFooterAmount` only from these verified claims. No source money is deleted, reclassified as payment or replaced by a native total.

The reader fetches paired rules for every zero candidate, establishes all provenance before any calculation, reads required existing NonVAT calculations, crosses the one full financial fresh fence, and rereads the same evidence. No Guest/native report or failure fallback. Rate, country and auxiliary City Ledger display remain common-finish behavior.

## Tests and qualification

RED positives cover the new positive excluded role alongside positive and negative explicit NonVAT, unchanged actual embedded VAT, unchanged gross/lines, and an intentional nonzero printed-footer gap derived from source claims. No native number appears in the test input to rescue admission.

Reject non-TSAN, revenue=true, nonmanual, F&B rather than MISC, Tax/Others subtype, nonTaxable=true entering exclusion, inclusive/paid-out/deposit/comp flags, negative excluded charge, configured or actual descendants, unsupported adjustments, foreign scope, inconsistent optional source fields, incomplete candidate evidence, stale pairs, aliases in both orders and unknown direct POS residuals. Preserve all existing V1-V4 and explicit NonVAT contracts, including owner-confirmed policy precedence.

Before enabling, parent must verify the exact source-derived candidate set across all captured rules and invoices, independently compare every native footer field including both intentional gaps, perform fresh paired reads and reopen both generated PDFs. Record this profile's empirical provenance and limits. A missing or changed source must refuse rather than force conservation. No deployment is authorized by this proposal.
