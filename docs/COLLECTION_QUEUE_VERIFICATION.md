# Collection Queue and scheduled reconciliation — 10 September 2026

## Implemented and deployed

- New Collections navigation opens the queue with Hotel, Account Type, Account, next-action stage, latest sent stage, ready/upcoming and text filters. All qualifying positive-open invoice rows are fetched across database pages; no Top N cutoff.
- Work groups remain Hotel + Account + next action. Counts and amounts drill down to the exact visible invoices. Selected document preparation stays in that account and uses the explicit Billing or Collection purpose. Opening Account Detail and returning preserves queue filters.
- Latest sent stage and next action are distinct. One invoice appears once in the next-action population; Urgent is not an extra invoice. Collection due excludes its separately shown Urgent population in both the card and drill-down.
- Friendly starts at due minus seven calendar days. Follow-up 1 becomes due the day after the due date. An already overdue invoice without a reminder may begin Follow-up 1; once Follow-up 1 is actually sent, time alone never skips the waiting Follow-up 2. Follow-up 2, Follow-up 3 and Final use seven calendar days after the prior actual sent date. Final with a positive open balance shows Urgent immediately.
- Missing rules or unverified invoice relationships remain visible as Setup needed / Needs review. Known child rows remain represented by their parent and cannot be separately selected for collection. Queue amounts are positive invoice balances; negative credit balances remain in Account Detail and are not netted into these work-item totals.
- Owner requested full display labels: **Follow-up 1 / Follow-up 2 / Follow-up 3** in Queue, Account Detail, history editing and email stage selection. Existing persisted stage keys/history were not rewritten.

## Scheduled checks

Cloudflare runs the read-only Gmail reconciliation cron every five minutes. Existing OPERA refresh at 07:00 and 19:00 ICT remains unchanged. The scheduler can inspect sent evidence and apply the already-authorized, verified history transition; it has no call path that creates drafts or sends emails.

Manual and scheduled checks share one database lease. Each actual delivery step checks/renews the current live lease under the same advisory lock immediately before verification. Expired leases cannot revive. A two-minute delivery step budget fits within the renewed 15-minute lease. Default batch is three eligible unresolved business deliveries, configurable from one to twenty. Diagnostic tests and review-required items are excluded from automatic processing.

Queue status refreshes while visible and reloads invoice work after a newly verified reconciliation result. The original delivery snapshot, recipient/attachment verification and idempotent event logic remain in force.

## Database changes

Applied to Supabase ar-workspace (`jmyvpurzmoiecpydjrci`):

- `20260909181500_ar_mail_reconcile_schedule.sql`: private run records, delivery checked timestamp, singleton request/status/result RPCs.
- `20260909182000_ar_collection_queue.sql`: authenticated read view with `security_invoker=true`, preserving underlying account/invoice/workflow RLS.
- `20260909183000_ar_mail_reconcile_fence.sql`: per-delivery live lease check and renewal.

No customer rules/history, ledger values, legacy resources or paid services were changed.

## Actual verification

- Typecheck / production Build passed; **200 unit tests passed**.
- **6 queue browser tests passed** on desktop 1440×900, laptop 1280×800 and mobile 390×844. Coverage: full labels, next/latest filters, scoped document selection, correct initial purpose, return context, failure state and Collection due count/drill-down equality. Mobile drawer capture confirms accessible selection and actions.
- Deployed Cloudflare assets passed the same browser suite with synthetic API interception. Those images are explicitly synthetic and are stored in `evidence/collection-queue-*.png`; original references are unchanged.
- Live Google Login succeeded. Browser → Worker → Supabase loaded **836 work invoices in 69 account/action groups**, excluding **12 child rows**. These counts match database totals. TSK filter showed **107 invoices / 23 groups** and only TSK rows.
- Actual live data currently has no assigned account rules, so work appears in Setup needed. No term or billing flag was fabricated to populate other queues. Other stage behavior is verified by synthetic unit/browser tests.
- Manual read-only check completed. Cloudflare then invoked actual scheduled runs at **01:25:50 and 01:30:50 ICT**, both complete. There were **zero eligible unresolved business messages**, so zero messages were inspected or business histories advanced by these runs. This proves schedule invocation and its database path; processing a pending real business message through that scheduled workflow has not yet been observed.
- SQL rollback tests passed for shared manual/scheduled lease, diagnostic exclusion, active renewal and expired-lease refusal. Unapproved authenticated identity could read no queue rows through the view. Anonymous Worker queue/reconciliation routes returned 401.
- Postchecks: existing delivery count remains 1 (earlier diagnostic); business sent events 0, assigned account settings 0, changed invoice billing/reminder histories 0. No new email/draft was created this increment.

## Deployment

- Repository: NTHV9/ar-workspace (public); branch `codex/opera-refresh`.
- Runtime source: `bcb78228eacf0c6bec60f952013fbb7f18dbb146`.
- Worker `ar-workspace`: deployment `f3f8a32e1f404234813de4b04160063d`.
- Workflow version `df6dbba1-e5b6-4ff1-a6bd-fd1900fb3c53`.
- URL: https://ar-workspace.ar-c82.workers.dev/?collections=1
- Health returned the same source SHA and verified live Supabase/OPERA status. Both cron definitions are present on Cloudflare.

## Remaining work

Real account Billing Required/Not Required and Credit Term values still need configuration by the owner. Versioned/custom stage configuration, rich-text templates, existing threads, supplemental uploads, reply/remittance workflows and related reports remain separate increments. This queue does not invent reply review, payment unmatched or hold counts from the prototype.

Sources: [Cloudflare cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workflow step retries and timeouts](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/).
