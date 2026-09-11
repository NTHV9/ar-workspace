# Financial history foundation implementation plan

> For agentic workers: execute the bounded implementation in the existing subagent-driven development workflow. The root task owns integration, live verification, persistence and deployment.

**Goal:** Provide privacy-minimal, exact-money, fixed-path read-only OPERA history and payment-mapping readers without claiming unverified financial dates or changing current refresh behavior.

**Architecture:** Add three GET methods to the existing `OperaReader`; implement parsing and collection in `worker/opera/financial-history.ts`. Return source facts plus explicit coverage/uncertainty metadata. A separately authorized isolated diagnostic uses a service-only candidate-selection function; there is no new business data table, scheduler, API route or UI in this increment.

**Tech stack:** TypeScript, existing Worker fetch transport and pagination guards, bigint satang, Vitest synthetic transports.

**Spec:** [Completion data audit](COMPLETION_DATA_AUDIT.md), PRODUCT_SPEC §§6/8/11/13, and Oracle ARS 26.3 pinned at `d72ff8572ec2a4816a52938a52d306fd863acfd9`.

## Constraints and interfaces

- Owner confirmed separate OPERA receipt and invoice-applied figures. This increment supplies source rows, not a cash classifier or dated application ledger.
- Scope is exactly KAT or TSK plus an Account ID. Invoice/payment identity is kind + Hotel + Account + source transaction ID; invoice and payment rows may share a numeric ID.
- Monetary results are signed decimal THB strings or null. Accept safely representable source numbers and exact decimal strings; reject fractional satang, nonfinite/lossy numbers, foreign currency and malformed values. Currency omission needs explicit enclosing THB evidence. Missing amounts remain unknown.
- Do not return card/cashier/contact/guest data, reference/remark text, raw payloads, upstream error bodies or credentials.
- `readFinancialHistory(reader, query, options?)` accepts `{hotel,accountId,start,end,kinds?}` and returns minimal invoices/payments plus coverage. Default kinds are invoice and payment. Date range is mandatory; maximum span is 366 days, an explicit per-request operational guard. A longer job must request explicit contiguous windows.
- Read options: `pageSize` 10 or 20 (default 20); `maxPages` default 1,000; `maxRows` default 100,000; optional ISO `observedAt`. A breached resource guard throws with no partial result or successful coverage.
- `readFinancialTransactionDetail(reader, {hotel,accountId,kind,transactionId}, options?)` returns a matching minimal source row or an explicit missing result; related rows are validated but not interpreted as payments on the requested invoice.
- `readAppliedPaymentMapping(reader, {hotel,accountId,invoiceTransactionId,invoiceNo?}, options?)` returns exact invoice/payment links, source applied amounts and `applicationDate:null`. This endpoint is unpaginated and cannot independently prove full history.
- History coverage distinguishes completed transport pagination from unverified date-filter semantics, interval completeness and financial classification. Output includes requested range, root/member counts, missing/out-of-range transaction-date counts and observation time. No normal balance reduction becomes a receipt, reversal or dated application.

## Task 1 — Contract and parser tests

- [x] Write synthetic transport tests for the exact three GET routes, date/kind parameters, configured-Hotel matching, no deprecated endpoint, no caller URLs and no token lookup on invalid input.
- [x] Write pure/reader tests for exact satang beyond safe numeric values when supplied as strings, null versus zero, explicit THB context, wrong currencies, missing dates, invalid IDs/dates, private-field stripping and opening-balance representations.
- [x] Run `pnpm exec vitest run tests/financial-history.test.ts`; confirm the missing-feature failure before implementation.

## Task 2 — Implement additive readers and trustworthy coverage

- [x] Add `financialHistoryPage`, `financialTransactionDetail` and `appliedInvoicePayments` to `worker/opera/client.ts`, using the existing private GET transport and fixed Oracle paths.
- [x] Implement exported types, exact-money/date/identity parsing, transfer evidence with unknown receipt/reversal classification, and minimal source projections in `worker/opera/financial-history.ts`.
- [x] Implement full-page collection using the verified next-offset convention and compressed-parent root counts. Reject changing totals, duplicate same-kind identities, cross-scope rows, empty intermediate pages, unrecognized warnings, later-page errors and explicit resource-budget exhaustion. Preserve unknowns and zero rows.
- [x] Parse detail identity without treating absent/error responses as zero. Parse applied links with `paymentTrxNo`, `appliedAmount`, original invoice identity and date fields named as invoice dates; never synthesize application dates or event IDs.

## Task 3 — Verification and handoff

- [x] Test rows created and cleared within the requested window, mixed invoice/payment IDs, child expansion, opening balances, transfer flags, unknown reversals, empty/missing data, unpaginated mapping uncertainty and privacy rejection.
- [x] Run focused financial/client/snapshot/history-count tests and `pnpm typecheck`; fix regressions only within assigned files. Initial verification: 110 tests across four files and TypeScript passed. Added regressions confirmed and fixed impossible observation timestamps, numeric amounts whose binary spacing loses satang, and child detail reads without paging-root expansion.
- [x] Report final exported interfaces and the exact remaining live evidence gates to root. No live provider calls, migration application, commits or deployment from this subtask.

## Task 4 — Isolated live-read diagnostic (additional root authorization)

Files: create `worker/opera/financial-diagnostic.ts`, `tests/financial-diagnostic.test.ts`, and CLI-generated `ar_financial_diagnostic_candidates` migration. Root owns applying SQL, Worker/Workflow flags and the actual live run.

- [x] Write tests for at most two backend-selected accounts, exact seven-day Business Date window, page-size 20/10 comparison, adjacent single-day queries, missing dates and changed source membership, strict candidate validation, mapping/detail failures, and no IDs/customer strings/amounts in returned diagnostics.
- [x] Add service-only `ar_financial_diagnostic_candidates(p_hotel text,p_limit integer default 2)` returning `{hotel,accounts:[{accountId,invoiceTransactionId,invoiceNo}]}`. CLI draft: `20260910135644_ar_financial_diagnostic_candidates.sql`; root applies it. Select verified/cleared Accounts, prefer observed applied amounts and positive/zero invoice mixes, and never write source or business tables.
- [x] Implement `runFinancialDiagnostic(env:RefreshEnv,hotel:FinancialHotel,options?:{maxAccounts?:1|2,maxPages?:number,maxRows?:number})`. Use `makeReader` and the foundation; return only static categories, counts, booleans and date-presence checks. The adjacent single-day scans are Business Date minus one and Business Date, both inside the seven-day window.
- [x] Compare exact normalized member identities and values internally. Do not emit IDs, monetary values, hashes of identifiable rows, text fields, raw payloads or upstream errors. An endpoint that succeeds does not promote unverified date or receipt semantics to complete financial coverage. Empty history alone cannot pass the observed date-read checks.
- [x] Test, typecheck and hand off the draft migration/module. No persistence is necessary beyond the root Workflow's categorical diagnostic result.
