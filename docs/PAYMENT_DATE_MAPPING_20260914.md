# Payment-date invoice allocations — 14 September 2026

## Problem and contract

The Period analysis payment-invoice metric selects OPERA Payment.transactionDate. The previous refresh discovered allocation links only through invoices whose Bill Date was in the requested period. A new payment can settle an older invoice; refreshing the payment then made the older links stale or left them undiscovered.

New Invoices remains the Portfolio Bill Date cohort, including zero balances. This change does not alter that metric, OPERA balances, document preparation, or credit-history UI text.

## Implementation

- Version 3 retains complete dated history reads and adds durable batches of five payments. Payment-side Pay History discovers linked invoice transaction identities without a Bill Date restriction.
- Independently corroborate the Payment, each invoice, reciprocal Pay History, THB, directed allocation totals, source roles and stable rereads. No payment date is inferred from a zero balance and no application event date is invented.
- Publish invoice context, payment verification and current links atomically. Extra invoice context does not claim complete coverage for its older Bill Date. Conflicting observations abort publication.
- A verified current payment snapshot may retire its superseded links. Errors and incomplete source evidence preserve unknown status, including failed zero-allocation reads. Existing v1/v2 jobs keep their prior contract.
- Private work is write-once, service-only, subject to the database budget guard and cleared after terminal publication/failure. Durable Workflow step outputs contain counts only.

## Verification and rollout

- Synthetic SQL replay: 72 migrations / 29 suites passed, including older Bill Dates, partial/repeated payments, debit signs, verified zero, failed zero, reallocation, duplicate observations, rollback, role/Hotel isolation and v2 revival.
- Initial full unit suite: 998 tests / 107 files; typecheck and production build passed.
- Bounded production GET probes confirmed payment-side invoice discovery, exact allocated totals and reciprocal sign semantics. History and detail supply complementary optional descriptors; the reader is being validated against that provider shape before enabling new runs.
- Deploy v3-aware Worker before applying the migration that defaults new runs to v3. Backfill bounded affected payment periods and verify live KPI totals, drilldown and Hotel splits before closeout.

Status: implemented and locally tested; production validation in progress. No migration applied at this checkpoint.
