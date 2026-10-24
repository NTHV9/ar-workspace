# AR-owned payment offset display

Status: source-backed implementation contract, awaiting parent dispatch and independent code review. No financial policy change or deployment.

## Evidence and boundary

The complete recorded cohort contains 74 same-reference, zero-sum groups of unselected Payment rows. Exact paired transaction-detail reads cover all 164 candidate IDs. The typed `aRInfo.invoiceNo` discriminator retains 69 two-row pairs and excludes five groups owned by another invoice. All 138 retained rows have unique exact native AR date/reference/debit/credit and returned transaction-code description matches. Larger pre-ownership groups of four or six reduce to exact pairs after ownership selection. No native amount or label is a runtime input.

The payment account is an earlier account in the observed pairs. Do not require it to equal the current invoice account, and do not use this display proof to authorize a financial account mismatch. Both members must share the same explicit account identity. The current invoice link comes from typed invoice ownership plus the complete hotel/reservation/folio/window source scope.

All detail pairs are stable. All corresponding selected-posting pairs are identical after the existing unique-ID ordering normalization; no other field was discarded. These scoped probes are not a replacement for a fresh complete financial source fence.

## Pure proof and scope

Create a separate optional display proof, for example:

```ts
interface ArPaymentOffsetDisplayProof {
  version: 1;
  kind: 'ar-owned-payment-offset-display';
  sourceBefore: CurrentArTaxSource;
  sourceAfter: CurrentArTaxSource;
  details: Array<{
    ids: string[];
    before: unknown;
    after: unknown;
  }>;
}
```

`verifyArPaymentOffsetDisplayProof(packet, proof)` returns verified actual-source display atoms/pairs. Evidence accepts no caller-supplied labels, amounts, selected IDs, ownership booleans or native controls. Reject unknown envelope keys. This function grants no financial proof.

1. Discover candidates from the complete original `packet.taxRows`, after collecting all selected IDs and checking duplicates. Only unselected `Payment` rows qualify for discovery. Group by exact hotel/reservation/folio/positive known window/date/transaction code and nonempty literal source reference. The initial read domain consists of groups with at least two nonzero rows whose exact signed columns sum to zero. Do not pick a convenient pair out of a larger group before reading ownership.
2. Require exact hotel, reservation and folio agreement with the current financial packet. Preserve the actual window; do not merge windows. Check cashier consistency across candidate members, without using cashier to manufacture a smaller group. No check decoding or text-based account/ownership inference.
3. Read every candidate ID exactly once through bounded existing `invoiceTransactionDetails` requests. Verify request/response identity sets exactly, including no extra generated rows or missing members, and identical complete before/after responses. Keep separately captured response blocks intact; never splice a synthetic response.
4. Each detail must match its original source ID, code, date, literal reference, hotel/reservation/folio/window when supplied, signed debit/credit, posted amount and transaction amount. Omitted detail scope is bound by the exact request and full source row. Supplied scope must not contradict it. Require Payment type, paidOut false, no active deferred tax, children, parent/package links or explicit unresolved member/group metadata. Reject aliases with any selected financial or embedded tax/component ID.
5. Require a valid explicit `aRInfo.invoiceNo` and account identity on every candidate detail. A different explicit invoice number is an ownership exclusion, not a missing response or zero. Missing/invalid ownership refuses the candidate proof. For the current invoice retain only exact invoice-number matches, within the already verified property/reservation/folio/window scope.
6. After ownership filtering, each original group must contain either zero current-owned members or exactly two. The two must have one positive and one negative **credit-column** amount of exactly equal magnitude, no debit amount, matching actual code/date/reference/window/cashier and one nonempty account identity. Preserve both literal credit values; do not transform a negative credit to a debit or net the pair into one row. No generic multi-pair allocation is permitted.
7. Resolve the description from the exact returned `trxCodesInfo` definition for the same hotel/code, with exact single definition coverage and stable response. The observed payment groups are PAY/PAYM; these labels do not create a code allowlist or confer invoice ownership. Preserve the complete explicit source reference with existing whitespace rendering only.
8. Preserve all original selected financial IDs, lines and seven footer fields byte-for-byte. A source-qualified offset pair is display-only and contributes zero independently to both debit and credit column totals. It must never enter taxable, VAT, NonVAT, gross, payment subtraction, outstanding or financial claim registries.

## Reader and model integration

- Initialize the optional read only when candidates exist, before the selected financial strategy's existing fresh source read. No-candidate invoices make no additional detail requests.
- Collect paired detail blocks across that same whole-source interval. Compare full `arOnlyTaxSource` snapshots using the established unique selected-ID ordering rule. No second financial read, report call, receipt, calculator, accounting write or native PDF lookup.
- Financial qualification runs first. Display evidence cannot rescue a refused financial packet. Provider/missing/unsupported optional display evidence may preserve the original body with a specific internal display gap; source mutation must retain the existing fail-closed behavior. Never report such a gap as visible parity.
- Keep `model.lines` unchanged. Add these pairs through a distinct verified auxiliary display-source catalog, then merge into `displayLines` with the existing grouped/ungrouped financial display rows. The caller cannot authorize auxiliary lines merely by setting a display flag.
- Extend renderer validation to require exact union coverage of original selected line IDs and independently verified auxiliary IDs, no overlaps/reuse, exact source fields/amounts, and separately zero auxiliary debit/credit sums. It must not silently accept arbitrary extra display rows. Preserve existing POS group `sourceIds` ownership and representative ordering.
- Order auxiliary rows by actual transaction date and numeric source ID, consistent with ungrouped source rows. Confirm actual pair placement against native controls; never sort by a native label or amount to force parity.
- No financial proof version or rule restriction changes. This is not the current-rule transfer component and does not authorize account or tax changes.

## Tests and acceptance

Write RED tests for a valid unselected pair with exact current invoice ownership, a four/six-row source group reduced by explicit foreign ownership, and an entirely foreign pair excluded. Preserve financial model bytes and literal positive/negative credit columns.

Reject missing/duplicate/extra detail IDs; invalid or missing invoice ownership; one current plus one foreign member; two accounts; unmatched/nonzero/more-than-two current members; selected or embedded aliases; wrong code/date/folio/window/reservation/hotel; mismatched amounts/reference; source/header/detail mutations; descendants or unresolved membership; caller-injected labels/amounts; and stale pair evidence. Assert no auxiliary financial contribution, native calls, receipt calls or fallback.

Renderer tests must reject invented extra rows, missing auxiliary coverage, reused source IDs, reordered representatives, modified literal columns and zero-net cross-column substitutions. Keep original lines and footer values unchanged.

Revalidate all 65 candidate cases against the paired detail corpus: exactly 69 retained pairs/138 native rows, five explicit exclusions, all returned descriptions/references/columns and placement correct. Preserve the entire 1,402 financial baseline. Parent then performs fresh complete source-plus-display reads and generated PDF body/footer checks for newly changed cases. No deployment is implied.
