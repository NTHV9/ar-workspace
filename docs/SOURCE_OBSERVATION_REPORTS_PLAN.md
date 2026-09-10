# Source observation and timing report design

Complete C6 with explicit source semantics. Do not infer payment dates or money from clearing observations, replies or remittances.

1. After a successful full-Hotel current snapshot publication, capture the latest available Account AR/aging per Thai calendar day. Store exact source/capture timestamps and verification coverage. A day without a capture is unavailable, not zero; a morning capture is not an end-of-day balance. Keep one latest row per Hotel/Account/day to bound growth.
2. Record transitions in the retained verified Invoice balance state: positive→zero (cleared observation) and zero→positive (reopened observation). Store the last positive-check timestamp and new zero-check timestamp. A first observation already at zero is distinct from an observed clearing transition. No amount from this table is called receipts.
3. Provide scoped current timing rows: OPERA invoice age, unbilled age, first-billing delay, days overdue and days since the recorded reminder. Over60-unbilled uses OPERA age, not days overdue. Unknown dates/age remain null; child invoices remain separate/excluded from collectible totals.
4. Actor-checked report API supports Hotel, Account Type, Account and date filters plus complete pagination. Daily rows retain captured labels and timestamps; current duration rows link back to exact accounts/invoices. Do not sum AR balances across days into a money-received metric.
5. Use additive private RLS tables and atomic source-publication hooks. No initial fabricated history. Test missing/failed refresh, duplicate publication, zero/error/reopen sequences and filtered count/amount parity with synthetic SQL rollback and browser fixtures.

C5 supplies source-date invoice entries and signed payment postings/current applications separately. Its initial historical import is not recorded as new invoices today. C4 supplies explicit external billing activity; Gmail SENT remains a separate evidence stream.

Applied `20260910200737_ar_source_observation_reports`; local PostgreSQL replay and hosted rollback fixtures passed. Browser6 scenarios passed at1440/1280/390, including exact Invoice focus/return context, unknown ages, uncaptured dates and service failures. Tracking begins at actual installation; payment transaction dates remain OPERA dates and balance checks are audit observations. Production UI deployment and first actual daily capture are pending.
