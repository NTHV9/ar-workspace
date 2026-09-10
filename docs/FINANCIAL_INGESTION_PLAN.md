# Durable financial history ingestion plan

**Goal:** Atomically retain minimal source-date invoice entries, signed OPERA payment postings and current application observations across every discovered Account, without treating missing data or balance movement as money received.

**Execution:** Root-authorized bounded subagent implementation. Root owns shared Workflow/API/UI wiring, migration application, live proof, activation and deployment. This subtask does not call live OPERA or commit changes.

**Spec:** [Completion data audit](COMPLETION_DATA_AUDIT.md), [financial reader plan](FINANCIAL_HISTORY_PLAN.md), PRODUCT_SPEC §§6/8/11/13 and owner confirmation to separate receipts from applications.

## Architecture and activation

- The existing current-debt refresh stays unchanged. `worker/financial/refresh.ts` exports request/run functions; `worker/financial/model.ts` defines report contracts.
- `FINANCIAL_HISTORY_ENABLED` defaults off. A nonempty `FINANCIAL_HISTORY_DATE_FILTER_PROOF` reference is also required; root configures it only after live proof. Default rolling range is 31 source Business Dates, configurable through `FINANCIAL_HISTORY_WINDOW_DAYS` (1–366). Explicit from/to backfill windows are supported.
- Every request has an actor and stable command UUID. Exact retries return the recorded run even after the calendar/configuration changes; changed requests conflict. Matching active runs share work. A hotel lease serializes overlapping windows; an expired run is fenced and cannot publish.
- Discovery uses the existing fully paginated `balance=All` reader. Save the complete exact Account manifest privately, process every Account, then rediscover and compare the full identity set before publication. Workflow step outputs contain counts/status only.
- Each Account read captures source labels, complete zero-inclusive history and current mappings for eligible returned invoices. Existing application observations are rechecked when their invoices are returned; no new claim is made about mappings of invoices outside the scanned population. Mapping completeness is corroborated per invoice against independently read invoice totals and payment detail. A mapping endpoint without pagination fields is accepted only when those totals reconcile; no application event date is invented.
- Stage immutable chunks of at most 500 minimal rows. Exact batch retries are no-ops; conflicting content rejects the run. Mark an Account staged only after all expected invoice/payment/application batches exist and its transport coverage is complete.
- One database transaction publishes all staged Accounts, source rows, changes and coverage for the Hotel/range. Any failure leaves the previous successful publication intact. A new absence is `not_observed`; retained amounts are never changed to zero by absence.
- Source transaction dates remain source dates. First/last observation times and change records are separate. Initial import never uses observation time as a daily-entry date. Application rows always have `applicationDate:null` and no fabricated application event ID.
- Private invoice, payment and application tables are separate. Payments keep signed amounts, transfer flags and unknown receipt/reversal classification. Report totals must not label those raw signed postings as cash collected.

## Interfaces for root wiring

`requestFinancialHistory(env, actor, {commandId,hotel,reason,from?,to?})` returns `{id?,status,created,hotel?,from?,to?}`; reasons are manual, scheduled, backfill and open. On-open requests reuse a verified matching range younger than 30 minutes. It does not dispatch a Workflow. Root dispatches the returned run ID once and passes `{actor,runId}` to `runFinancialHistory(env,payload,step)`.

`runFinancialHistory` returns aggregate status/counts. It reads canonical Hotel/range/owner from the private run, uses durable discovery/account/publication steps, and never returns Account IDs, source rows or amounts through Workflow outputs.

Report RPC: `ar_financial_report(p_actor,p_view,p_hotel,p_account,p_type,p_from,p_to,p_offset,p_limit)`, service-only with independent approved-actor validation. Views: invoice_entries, payments, applications, coverage, options. Hotel/Account Type/Account and source-date filters apply before pagination and totals.

- Invoice dates: source `transactionDate`; entry amount: original source amount for standalone/parent ordinary invoices, with child/opening-balance/credit row counts separately visible.
- Payment dates: payment `transactionDate`; amount: signed source payment posting amount, explicitly unclassified as cash.
- Application date filtering: the independently verified Invoice `transactionDate` defines an invoice-date cohort of current applications. Never application-day activity. Linked payment dates may be absent when outside the imported date range.
- Report rows retain first/last observation/check timestamps and source status. Totals include known sums, unknown amount/status/date counts and coverage completeness. A missing successful coverage interval yields an unavailable total, even when there are no stored rows.

## Implementation tasks

- [x] Define report/run models and synthetic run-driver tests before implementation: disabled guard, exact command replay, all-account discovery, unseen zero rows, chunk replay, late failure, changed discovery, unknown/zero amounts, application dates, and no source data in step output.
- [x] Implement immutable private run/stage/publication/source/change tables and service-only actor/lease/command validation. Add a rolled-back SQL fixture that checks atomic publication, idempotency, source-date import, missing versus zero, unknown totals, permissions and filtered pagination.
- [x] Implement the Worker entry functions using existing source parsers, fixed GET methods, complete Account discovery and explicit row/page budgets. Persist only minimal source fields, never card/contact/cashier payloads.
- [x] Implement actor-checked reports and interval coverage. Test source-date filters and count/sum parity with synthetic data; current applications must stay observations.
- [x] Run focused tests/typecheck and review all mutation paths for atomicity and stale-worker fencing. Hand the migration and wiring contract to root; activation remains off until root confirms live evidence.

## Verification before activation

- Typecheck and 717 unit tests passed; five local browser tests passed at 1440/1280/390, including incomplete coverage and API failures. Screenshots use synthetic data only.
- Local PostgreSQL replay: 44 migrations, ten SQL fixtures passed, source migration SHA-256 `0f287c44e2a02267134484e2114f750034d96ac026653fd9888b200aa4fe866a`. Server stopped afterward; no provider requests.
- Hosted migration applied as `20260910173527_ar_financial_history_ingestion`; ten private tables have RLS, no anon/authenticated table grants or report RPC execution. No existing ledger/workflow tables changed.
- Actual mapping diagnostic on source `153c3e9`: KAT run `7eb42e91-0f76-470d-95c5-41621e56d322` corroborated both sample invoices; TSK run `d35a8917-3841-4439-9ddf-46f41f605fdb` corroborated two payment links for one sample invoice. The separate invoice/payment checks and totals reconciled.
- Ingestion deployment and a full live publication are still pending at this checkpoint.
