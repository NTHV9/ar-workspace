# Current warnings and retained history

Owner approved fixing zero-balance and removed-Sheet-row warnings on 25 October.
Build on the deployed bca1209 source and retained 2cbd7ea history, without undoing
credit authority, self CC, activity refresh, date protections or admin visibility.

1. RED SQL behavior fixtures for durable exact-zero evidence with absent Folio,
   current changed identity, missing/unknown source, active/partial transfer debt,
   completed Sheet membership removal, row reappearance and preserved dates/Sent.
2. Add an archived warning state/reason, separate current warning view, one shared
   source-zero predicate and lifecycle reconciliation at the existing completed
   membership hook. Source absence archives warnings, never clears financial debt.
   Counts and paginated rows must use the same current view, even between refreshes.
3. Clarify the administrator review copy; keep member timestamp-only presentation.
4. Run full disposable SQL replay, unit/type/build and relevant browser checks;
   obtain a fresh focused review, then migrate/deploy and verify actual counts,
   exact date/Sent preservation and retained audit. No email or Sheet date writes.

Only the current provider identity and exact internal financial ledger IDs may
establish closure. Missing Folio alone is not a contradiction; conflicting known
identifiers, active or unresolved compatible debt, or missing source still hold.
Do not change the stricter positive-debt matching/publication rules.

Progress: implemented, qualified and deployed. Full unit4623, browser41 and
disposable SQL133/22 passed; production build and fresh review passed. Live current
warnings3723→140; no removed or confirmed-closed rows remain in current review.
Source dates2016 and actual Sent143 fingerprints are unchanged. Final source5d15bc7
and Worker e797df77-dc51-4c2d-a910-4a76903696d3 verified; live assets55 match and
status/page counts agree. A complete post-guard repeat synchronization of both
original bindings preserves archive count3900 without making new closed warnings.
All implementation, testing, deployment and verification tasks are complete.

Ruling: an unresolved snapshot retains its prior mapped ledger, so separately
record current observed identity on every row, including failed matches. Historical
warning hints cannot authorize closure. Nonempty Account contradictions require
the established complete transfer corroboration. Archived state is separate from
resolved acknowledgements so return-to-Sheet can raise a new warning.

Ruling: current-zero evidence gates warning creation as well as display/archive.
Unchanged closed rows must not manufacture another archived warning each poll.
The repeated-observation regression exercises three complete snapshots/membership
rounds while still requiring later open/unknown/changed rows to raise warnings.
