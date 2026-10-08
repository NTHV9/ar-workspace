# Source-reconciled Aging membership

Status: implemented and tested; migration 107 applied; application deployment pending.

The owner wants Current Aging totals and both Invoice drill paths to agree with OPERA Detailed Aging, excluding Accruals. The prior invoice-derived projection kept internal totals consistent but disagreed with native range allocations at boundary ages. The supplied KAT report confirms the discrepancy for twelve boundary invoices; its A/R Ledger total agrees with the saved account net. Its additional Accruals are outside this scope.

## Evidence and limits

Authenticated diagnostics confirm KAT Date for Aging is COD. Native range dates align with numeric day boundaries; scoped checkout, posting and raw invoice ages match in the checked boundary examples. Those fields alone do not explain the report allocation. We do not assert a universal OPERA one-day rule or prove an End-of-Day cause.

The new read-only projection evaluates the existing numeric-age convention and a one-day reporting-boundary convention against each complete, same-publication account. It requires every native bucket and account total to reconcile, and rejects candidates with differing invoice memberships when both balance. No closest-match adjustment or arbitrary offset is allowed.

OPERA's native debit component is the signed invoice ledger balance, including negative invoices. Native credit represents separate account credit; it is not the negative-invoice facet. The projection reconciles these components separately, preserves the existing conservative overlap guard, and never creates invoice identities for account credits.

## Contract

- Account metadata exposes `membership` with contract `opera_reconciled_v1`, state and qualified offset. Status-detail rows carry an explicit `bucketKey`.
- The initial status read materializes one mapping per account. Count/status and amount-click drills use the same qualified membership; amount drills additionally verify header and every nonzero root's publication stamp and complete inventory.
- Independently valid native bucket amounts remain visible when membership cannot be qualified. Bucket counts/details remain unavailable rather than inventing membership; verified all-ages balances/counts remain separate.
- Stored invoice ages, dates, ledger amounts and source buckets are not updated. Collections rules, due dates, Dashboard raw-age thresholds and Accrual exclusion remain unchanged.

## Verification

- Local SQL tests cover direct/shifted boundaries, signed negatives, zero/child exclusion, explicit account credits, cancellation ambiguity, malformed/unknown ages, stale publications, unchanged raw rows and protected account-publication access. Original Aging SQL tests also run; full rollback preserves tables/catalog.
- Actual PostgreSQL rollback qualification resolves all 412 accounts across six hotels. A report-boundary scoped read returns twelve boundary invoices with zero mismatched report ranges; invoice-row fingerprints remain unchanged. Synthetic behavior also passes on actual PostgreSQL under rollback.
- Private customer PDF, extracts and provider values remain outside tracked evidence. Diagnostic additions expose only scoped configuration enums, validated dates and aggregate numeric patterns; no customer identifiers or amounts are added to diagnostic output.
- Final verification: 33 backend API/access cases, 62 frontend unit cases, 13 desktop/mobile browser cases, TypeScript and production build pass. Both detail paths, filters, publication races, signed credit semantics, independently verified native-summary fallback and explicit unknown membership are covered. Parent inspected new synthetic captures; originals remain unchanged. Impeccable reports no findings for the changed component.
