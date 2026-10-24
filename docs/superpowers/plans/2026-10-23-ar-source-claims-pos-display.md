# SourceClaims POS display companion

Status: parent-approved companion to the existing source-claims financial system. DisplaySol implements display helpers; main Sol owns coordinated model/reader hooks. Independent review and native-body qualification precede enablement. No financial policy or deployment change.

## Required outcome

V1/V2 source-claims invoices must retain the same source-backed POS grouping, labels, explicit references, literal debit/credit sums and representative-ID order already qualified for the legacy POS profiles. An internal financial proof-kind change must not turn previously grouped native body rows back into raw base/service/VAT rows.

Use existing complete CSH CheckNo metadata, not a receipt, guessed check decoding or native-PDF runtime input. Preserve original `model.lines` and all seven monetary fields. Keep City Ledger auxiliary offsets and rate descriptions orthogonal.

## Opaque financial ownership region

Add a small internal certificate alongside the shared financial verifier:

```ts
interface VerifiedSourceClaimsPosRegion { /* private, unforgeable brand */ }

verifyArOnlySourceClaimsWithDisplayRegion(packet): {
  claims: Map<string, ArOnlySourceClaim>;
  posRegion?: VerifiedSourceClaimsPosRegion;
};
readVerifiedSourceClaimsPosRegion(packet, region): {
  atoms: readonly ArOnlyPosAtom[];
  identities: ReadonlyMap<string, {
    role: 'taxable' | 'vat';
    signedCents: number;
  }>;
};
```

Keep the existing `verifyArOnlySourceClaimsProof` signature and behavior as a wrapper when useful. Do not accept a caller-created ID set/map as authority. The opaque token is minted only by the same successful full-source component verification; bind it to the exact `arOnlyTaxSource` fingerprint, retain detached immutable data internally, and return defensive copies. It is ephemeral: recompute it from the financial packet when building the model, rather than serializing a trusted flag.

Eligible regions come from exactly one V1/V2 POS owner: ordinary POS, actual native posted VAT, mapped fee, explicit-revenue base, or the independently reviewed exclusive non-revenue component when implemented. The region contains **only that component's actual selected POS IDs**. Exclude direct-zero/NonVAT claims, wrapper/embedded components, payments and City Ledger auxiliary rows. V3 transfer-only and standalone zero proofs produce no POS region.

If direct-zero evidence exists, mint/reuse the existing verified direct-zero token and run `inspectArOnlyPosRemainder` against the full original packet. Never splice a packet or use raw caller exclusions. The region's atoms, roles and amounts must have exact equality with the POS component's final verified claims; unknown component kinds, missing/extra claims, aliases or changed source refuse.

The role names remain taxable/VAT. Do not relabel all taxable atoms as FoodAndBeverage, service or discount to fit the old display role union.

## Display verifier and metadata collector

Extend the existing POS display verifier with an explicit authority union or overload: exactly one legacy successful POS role map **or** one verified SourceClaims POS region. Old financial profile guards remain unchanged. For SourceClaims, accept only the supported V1/V2 owner and the opaque region; reject V3, unknown/mixed financial envelopes and forged/cross-packet tokens.

The existing context/membership helpers may accept the opaque region through the same defensive accessor. Every check remains:

- Exact hotel/reservation/known window and complete bounded pages; outer counts exclude expanded children, page boundaries and optional hasMore remain validated.
- Explicit header/member group IDs/counts; header representative is an actual member and is not counted again as money.
- Exact complete group membership, no cross-group aliases, no dropping extra zero/foreign/unknown members to make a group fit.
- Actual member code/date/check/reference/cashier and available arrangement fields agree with source.
- Description from source groupDescription; reference from the minimum actual member ID's explicit AR reference under the already qualified suffix-preserving rule.
- Order by actual date and header representative ID, independently from reference selection.

SourceClaims financial owners can legitimately certify negative, repeated or offsetting taxable/VAT atoms. Permit their literal signs in a complete metadata group because the financial owner has already proved them. Do not reuse the legacy fee-positive/discount-only display heuristic, split signs, net columns, or drop zero-sum rows. This is display of admitted money, not a new role or rate decision. Legacy profiles retain their own checks.

### Before the financial fresh read

The initial collector cannot possess final paired financial claims yet. Add a **read-scope-only** planner for source-claims POS contexts, reusing source-only discovery from `ar-only-source-claims-read.ts`. It may identify candidate zero scopes for selecting windows but mints no exclusion token, financial claim or final display membership. No arbitrary ID list is accepted from callers.

Use the existing bounded `readPosDisplayPages` collector. Initial pages can be checked for their own scope/pagination consistency; final complete ownership must use the verified region after financial qualification. Keep the legacy collector unchanged where practical. A distinct `beginArSourceClaimsPosDisplayRead(reader, initial)` session with `finish(fresh, verifiedRegion)` is a clear boundary.

Start the session only after a supported source-claims financial strategy is selected and before its existing financial `readFresh`. Read the same complete metadata contexts afterward. Do not add another financial fence or silently start metadata after the fresh financial snapshot. No POS region/candidate means no additional POS metadata call.

## Core integration

Main Sol coordinates all successful V1/V2 branches through the common finish path. Financial verification and strict residual validation run first. Obtain the opaque POS region from that verified result, finish the appropriate metadata session, and derive display rows once with the existing rate and City Ledger companion outputs.

Do not make display evidence sufficient for financial admission. Unsupported/provider-missing optional display evidence retains the original selected rows with an explicit diagnostic gap; source or paired-membership mutation retains existing fail-closed behavior. No catch that switches to a different financial proof or native source.

Original financial lines stay unchanged; the derived display array covers every selected ID exactly once through raw or grouped rows. City Ledger auxiliary IDs remain separately proved and disjoint. Renderer checks literal column conservation and exact coverage; no financial totals are recomputed from a new policy.

## RED tests and acceptance

Positive tests: V1 direct-zero + ordinary POS; V2 native posted VAT; mapped signed fee; absent-subtype revenue; exclusive non-revenue when available; mixed-sign and repeated VAT groups; ordinary residual wrappers/payments; POS grouping plus rate labels and City Ledger offsets together. Assert unchanged `model.lines`, IDs, amounts, seven footer fields and original packet bytes.

Negative tests: forged/serialized/cross-source region, arbitrary exclusions, missing/extra/duplicate component claims, zero/wrapper/payment IDs inserted into a region, V3/unknown owner, overlapping auxiliary IDs, unselected metadata member, missing page/header/member, changed source/metadata, wrong literal check/reference/cashier, duplicate representative and numeric IDs above the safe Number integer boundary. Preserve old seven-profile tests.

Reader tests prove metadata begins before and finishes after the **same** financial fence in every supported SourceClaims strategy, no calls for unsupported/no-POS profiles, and no provider/financial error fallback.

Use the actual existing and newly captured CSH context corpus. Preserve all previously qualified native POS groups when proof kinds migrate. For every newly rendered source-claims group compare native description, reference, date, representative ordering and independent debit/credit columns, then reopen generated PDFs. Footer equality is separately mandatory and does not imply body parity. Missing contexts or source groups remain visible gaps; do not hide them by reducing the target cohort.
