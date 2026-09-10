# External billing execution design

Implement an explicit staff record after billing through an Account portal or email outside the app. It is distinct from preparing PDFs, opening a portal, Gmail SENT evidence, and historical correction of invoice dates.

- Exact Hotel/Account and selected invoices, actual Thai date, channel, reference and optional billed amount. Current AR balance is never used as the historical billed amount.
- Server preview shows first-billing and due-date effects; revision-bound confirm writes one command receipt. Initial billing sets only missing first dates using pinned terms; later billing preserves dates and reminder history.
- Corrections/void/restore retain immutable event revisions and require a reason. They change external activity facts only; the UI states that invoice billing/due/reminder history is unchanged and directs explicit historical corrections to the existing editor.
- Claims share the Gmail actor lock and lock source/workflow rows in order. Pending/uncertain Gmail handoffs prevent a new external billing record. Ledger balances and OPERA are untouched.
- Account history and a filtered external activity view expose the source, revisions and unknown amounts. No record or correction creates a Gmail SENT event.
- Validate with synthetic SQL rollback, worker validation tests and browser preview/correction/void cases. No real customer billing is entered for testing.

Applied additive migration: `20260910182335_ar_external_billing`. Two private RLS tables, service-only preview/confirm/read/history RPCs; source labels captured at the recorded event. Hosted synthetic rollback passed with no customer records, Gmail sends or OPERA changes.

Verification: local PostgreSQL replay46 migrations/11 fixtures passed with the server stopped afterward; SHA-256 `d97ffee0dc8d25b7ead18f6cad1ab22d4204c586ae50ffaa0913e5caeb8c1c63`. Build/Typecheck and725 unit tests passed. Six browser cases passed locally at1440/1280/390, including selected-only preview, exact uncertain-command retry correction history and reviewed void/restore. Ten combined Account History + external billing regression cases also passed. Production deployment and authenticated read-back remain pending.
