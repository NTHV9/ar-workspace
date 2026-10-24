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

Progress: implemented and qualified. Full unit4623, browser41 and disposable
SQL132/22 passed; production build passed and fresh focused review is clear.
Database migration applied; final Worker deployment and live readback pending.

Ruling: an unresolved snapshot retains its prior mapped ledger, so separately
record current observed identity on every row, including failed matches. Historical
warning hints cannot authorize closure. Nonempty Account contradictions require
the established complete transfer corroboration. Archived state is separate from
resolved acknowledgements so return-to-Sheet can raise a new warning.
