# Mixed POS and selected embedded Revenue display membership

Parent approved implementation by Display Sol; Main Sol retains financial registry ownership. This is display-only. Do not alter financial claims, residual validation, VAT, line columns or provider scopes.

## Authority seam

Add a display-owned module exposing `verifySourceClaimsDisplayMembership(packet, posRegion)` and an opaque `VerifiedSourceClaimsDisplayMembership` accessor. The input POS region must be the existing genuine source/proof-bound WeakMap token. The new token has its own WeakMap, binds the same complete source and financial-proof fingerprints, and stores detached immutable membership records. It accepts no caller ID list, roles, exclusions or replacement money.

The new certificate independently derives a union of the POS token's exact IDs and eligible **selected embedded-Revenue root IDs** from the unchanged full source. It certifies display membership only; additional roots receive provenance `selected-embedded-revenue`, never a fabricated POS/base/tax role. It must never be accepted by a financial claim verifier or alter the original POS region.

Both consuming call sites are already after successful whole-invoice financial qualification: common reader finish and the final model display block. Keep them there. The original strict residual validation must reject any invalid embedded root before a grouped body can be produced. A pure membership certificate alone is not a financial admission.

Authenticate the genuine original token and independently revalidate the unchanged financial packet outside any optional-display unsupported boundary. Those failures propagate. A financially valid but unsupported union may return a dedicated display-membership unsupported result/error, handled only by the optional reader as a diagnostic gap with raw rows retained. Never catch a financial, token-authentication or source-change failure as that gap. An attached invalid display proof still refuses in the model; there is no model-level catch/fallback.

## Eligible additional members

Derive only roots that are selected exactly once, exist exactly once in the reservation source, have transactionType=Revenue and an actual nonempty embedded-tax breakdown, and share an exact hotel/reservation/folio/known window/date/nonempty literal check with a genuine POS region group. Do not include wrappers, payments, direct-zero claims, tax children, unselected money or City Ledger auxiliary rows.

Check selected/source ID, code, date, supplied scope, reference, cashier and signed amounts consistently. Require the original selected debit/credit columns to equal this source Revenue root's columns, gross to equal the signed amount, and supplied posted/transaction amounts to agree. Retain explicit child/parent/package/member ambiguity checks; embedded taxes remain owned children of the financial root, not additional display IDs. No financial predicate is weakened to make this union eligible.

## CSH membership and display

Use the existing paired complete CheckNo pages around the same financial fresh fence. The complete CSH member-ID set and declared count must equal the derived union for each participating group. All existing alias, duplicate, scope, source-field and page-completeness checks remain. Header transactionNo is a representative alias of an actual member, not extra money.

For this mixed display domain, each CSH child cashier must match **its own** selected/posted source cashier. The header cashier must match the unique cashier of the original verified POS subgroup, not the representative's potentially manual cashier. The actual header aliases a manual member ID while retaining the POS cashier and synthetic group code; neither header field is a financial identity of that representative. Require that original POS subgroup's cashier to be known and unanimous. Distinct proven additional-member cashiers do not invalidate a provider-declared display group. Keep the original financial POS cashier validation and all legacy financial profiles unchanged.

Descriptions come from the exact CSH group header. Ordering remains date plus header representative ID. References use the already-qualified codepoint minimum of all trimmed explicit selected AR references, with every member's posted reference agreeing. Apply the existing strict Room#/CHECK# immediate-marker projection when recognized. In a mixed group only, a nonempty ordinary literal reference may instead be whitespace-folded and retained in full; do not extract names, decode opaque check keys, strip routing/split text or substitute another member. Malformed Room#/CHECK# marker forms remain unsupported.

The existing derive adapter sums each original model column literally, preserves `model.lines`, retains every selected ID exactly once and conserves all seven financial fields. No suppression is introduced; the separate zero-column group remains a different policy task.

## Tests and acceptance

RED positives: five verified POS members plus one already-qualified embedded Revenue root with a different cashier and provider representative; exact six-member closure; plain routing reference selected by lexical minimum; unchanged source/financial lines and all footer fields; other groups in the same invoice remain qualified.

Reject fabricated or stale tokens, unrelated selected roots, nonselected members, duplicate/cross-group aliases, child IDs offered as roots, wrong date/window/check/code/reference/cashier/columns, unsupported parent/member declarations, incomplete metadata, changed paired pages and provider failures. An invalid financial residual must fail before display despite otherwise valid membership. Preserve old pure-POS behavior and City Ledger composition. No extra provider reads, arbitrary source sets or financial registry changes.

Parent qualifies the actual mixed group against native membership/description/reference/order and literal columns, renders the whole invoice, and compares all seven native footer fields. Full prior display controls must retain their results. No deployment is implied.
