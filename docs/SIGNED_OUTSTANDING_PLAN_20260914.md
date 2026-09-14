# Non-child invoices and signed outstanding balances

The owner requested that child invoices disappear from Invoice / Folio, their amounts/counts not be added into totals, and Period analysis include negative non-child balances.

## Scope

- Use one protected Portfolio projection with nonzero non-child item counts. Retain native OPERA Account net/aging values, which already exclude child duplication; never subtract child balances again.
- Filter child rows at the Account API and defensively in AccountDetail so old responses or a stale deep link cannot reveal/focus/select a child. Retain unknown relationships for verification and retain negative root rows.
- All outstanding counts nonzero signed root identities and sums signed open values. Positive-balance collection work remains its existing separate cohort; credits do not create billing/follow-up work.
- New Invoices keeps inclusive Bill Date and zero/cleared rules. Its detail rows also exclude children, matching its existing nonduplicated summary.
- New daily captures contain signed inventory and record its version. Old positive-only captures never receive today's credit data. Unknown signed totals remain null, while supported positive work remains available. The owner explicitly requested no credit-history-gap messages in the UI.

## Validation

Synthetic behavior/SQL coverage includes parent and child rows, credits, net-zero/negative totals, unchanged native Account money, source/date/filter/pagination consistency, closure, stale child deep links, signed capture and legacy partial history, and permissions. Live read verification and deployment identifiers are recorded in PROJECT_STATUS.md. No customer extracts are committed.
