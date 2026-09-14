# Period analysis source audit — 13 September 2026


Update14September: the owner subsequently required New Invoices to use the saved invoice ledger behind Portfolio, filtered solely by OPERA Bill Date and including retained zero-balance invoices. That reader replaces the financial-history source described below for this one KPI. See [the current source audit](PORTFOLIO_INVOICE_DATE_AUDIT_20260914.md). The earlier observations below are retained as dated audit evidence, not proof that a later current-ledger cohort is empty.

The owner reported identical Today/Yesterday outstanding balances and zero New invoices, and asked to verify the entire page against actual sources. The audit used the authenticated UI, service-only reporting RPCs, saved source records and daily snapshots. Customer rows and monetary extracts were not added to the repository.

## Findings

| Page section | Source | Result |
|---|---|---|
| Outstanding at period end | `ar_dashboard_balances`: current invoice view for today, private daily capture for yesterday | Correct date paths. The two verified snapshots had the same 761 positive invoice identities and no changed open balances. Many ages changed, confirming a later source refresh rather than reuse of the previous date. |
| Billing and latest stage | Recorded workflow and actual business SENT evidence | Zero billed/sent values match the saved business history. Diagnostic test emails do not count as billing or collection activity. |
| Past Due date | Recorded Billing rules, first actual billing date, credit term and due date | Unavailable totals reflect missing setup/due evidence. Awaiting first billing is distinct from a known Past Due date; do not invent a date. |
| New invoices | Dated OPERA invoice history, signed original amounts, standalone/parent identities | Bug: all `invoiceType=Credit` rows were classified as monetary credits and excluded. The inspected previous-day cohort contains 112 such invoice entities in CCR accounts, including positive, negative and zero originals. |
| Recorded payment credits | OPERA payment transaction date and signed posting | Actual source records are used. Gross credit postings and debit corrections remain separate. |
| Currently allocated / unallocated | OPERA `amountUsed` / balance and payment direction | Bug: positive `amountUsed` was negated again. Source component magnitudes reconcile; the display must derive direction from the posting rather than assume the raw component sign. |
| Invoices with OPERA payments | Exact observed invoice/payment application links | Remains unavailable for the audited previous-day cohort: 30 payment records have no saved application links. A known payment amount alone does not establish the invoice count. |
| External billing and send occurrences | Staff-recorded actual dates / verified SENT events | Queried from the live business tables with the selected scope and dates. No replacement fixture data is used in production. |

## Corrections

- New normalization treats known `Normal`, `Credit` and `PasserBy` source invoice codes as invoice entities, preserves signed original/current/open amounts and retains `OldBalance` separately. This preserves the existing invoice-entry counting basis, including negative and zero original values; it does not turn the KPI into a positive-only balance count.
- An immutable effective-read helper corrects existing `Credit/credit` derived classifications without rewriting stored source rows or immutable history. Mapping coverage remains independent and is never manufactured. The ingestion validator accepts both old and corrected payloads during rollout; future corrected Credit rows enter the existing mapping workflow.
- Allocation summaries and the application reconciliation comparator use posting direction only after all component magnitudes reconcile. Credit postings contribute positive allocations; debit corrections subtract allocations. Missing, non-finite or inconsistent components remain unknown. Raw observations and independent posted-payment totals remain unchanged.

## Oracle evidence and limits

- The [pinned OHIP AR specification](https://github.com/oracle/hospitality-api-docs/blob/d72ff8572ec2a4816a52938a52d306fd863acfd9/rest-api-specs/property/v1/ars.json) describes the field as an invoice code and supplies the enum values; it does not give each value a monetary sign or equate `Credit` with a credit note.
- [Managing AR Credit Card Transfer](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_accounts_receivable_managing_ar_credit_cards.htm) describes transferred card transactions becoming merchant AR invoices.
- [OPERA Controls — Accounts Receivables](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/c_opera_controls_accounts_receivables.htm) describes negative-amount invoices as credit notes separately from credit-card consolidation.

The association of the inspected Credit-coded rows with card receivables is supported by the live CCR membership and documented workflow. Do not claim Oracle provides an explicit per-enum definition. Invoice/payment application dates remain unavailable from the existing API contract; current allocations are not historical allocation-event dates.

## Verification

- The Credit-code regression failed on the old implementation for positive, negative and zero amounts, then passed after correction.
- The allocation SQL regression failed on positive `amountUsed` under the old reader, then passed with the directional helper.
- Combined isolated replay: 69 migrations and 26 SQL suites passed; no provider requests or live data export, local PostgreSQL stopped.
- Typecheck and build passed; all 901 unit tests passed.
- Both additive migrations were applied and the same dated live report was compared again. New invoice classification and allocation signs changed as intended; outstanding snapshots and posted-payment totals did not change. Missing application links remain explicitly unverified.
- Production deployment verified by exact source SHA/health; 31 Cloudflare browser cases passed. Signed-in UI confirmed the corrected Yesterday values and correct Today date source. PR #22 merged after CI; see PROJECT_STATUS for source/version details. The 30 missing payment mappings remain an explicit data gap.
