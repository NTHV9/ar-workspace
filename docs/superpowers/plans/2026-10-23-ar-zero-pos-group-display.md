# Complete cancelling POS group display policy

Parent approved this separate display task after mixed-membership integration. Financial source, claims, amounts and `model.lines` remain unchanged. This is an empirically qualified TSAN current-AR printing policy, not a general rule to omit zero-valued rows.

## Eligibility

Start with a successful SourceClaims V1/V2 financial invoice and its genuine verified POS region. Require a complete, paired, closed CSH CheckNo group under the existing metadata proof. Initially every group member must belong to the original POS region; do not suppress a mixed embedded/manual group, wrapper, payment, direct-zero or auxiliary row.

The complete source group must contain at least two nonzero atoms. Partition its actual members by exact transaction code. Every code partition must contain exactly two distinct IDs whose literal debit columns are exact opposites and whose literal credit columns are exact opposites, with the same independently verified financial role. Each atom remains individually nonzero. Therefore both complete-group column totals are exactly zero, without cross-code, cross-column, cross-check or cross-date cancellation. No nominal tax rate, description, invoice/code allowlist or native PDF input participates.

The observed native report omits one complete eight-atom group satisfying this condition. The previously qualified signed groups that have nonzero columns must remain visible. Qualify every further eligible group in the full recorded corpus before enabling this property policy; do not silently broaden it to another property.

## Derivation and renderer boundary

Return a distinct verified suppression descriptor from the display proof; do not silently remove a group from the normal grouping result. Keep explicit source IDs and source-bound evidence. A caller-controlled `hidden` flag or arbitrary ID list is not authority.

The derived model preserves the original financial `lines` array, adds an explicit suppression catalog, and omits only the verified group's rendered row. The catalog must survive JSON serialization and be independently revalidated at the renderer boundary, following the existing auxiliary-catalog pattern. Retain the exact original financial packet with only known orthogonal display fields removed if necessary to re-run existing financial/POS verifiers; do not invent missing source fields or splice independently captured records. Include the paired CSH evidence and regenerate eligible suppression IDs rather than trusting serialized IDs.

Renderer coverage is the disjoint union of rendered financial source IDs and verified suppressed source IDs, plus separately verified City Ledger auxiliary IDs. Each original selected ID occurs exactly once in that union. Suppressed literal debit and credit totals must each be zero; all original footer fields and displayed column totals remain identical. Reject overlap with another group, auxiliary rows, unknown IDs, modified catalog evidence or nonzero column totals. Do not add a fictitious monetary row to satisfy coverage.

## Tests and qualification

RED positive: exact four-code/eight-ID cancellation in one complete source group, omission of only its derived row, all original financial IDs retained in the catalog, serialized renderer revalidation and unchanged seven financial fields.

Reject cross-code cancellation, unequal code-pair amounts, debit/credit netting, missing/extra member, unequal roles, nonzero literal columns, stale source/pages, another hotel, mixed embedded/manual membership, fabricated IDs, duplicate coverage and a changed serialized suppression. Preserve all known nonzero signed groups. Test invalid financial source cannot gain admission via suppression.

Parent compares actual native body row count, sequence and columns for the eligible case and reruns prior signed controls plus the full corpus. This task closes a visible-body gap only and authorizes no deployment.
