# Dashboard hotel comparison and Aging redesign

Owner asks for a more engaging, easier Aging view and KAT/TSK counts and amounts alongside combined Invoice metrics. This replaces the prior Dashboard presentation while preserving product truth and the app brand. Use subagent-driven-development for independent backend/Aging tasks and review. Work in the named workspace on codex/dashboard-hotel-comparison from a2c30de; root owns Git, hosted writes and deployment.

## Decisions
- Current Aging is current only. Keep all buckets, account types and matched accounts; Hotel+Account identity, credits, root/child and exact source-schema safeguards remain. Column controls remain; no silent Top N.
- Aging redesign: a stronger age-distribution overview with chronological bucket emphasis and a readable comparison layout. Allow switching to full financial columns; use property labels consistently and useful selected-range interaction. No decorative fake trends.
- Period metrics use Total/KAT/TSK together when All Hotels without a single-account filter. Counts and exact amounts for every closing status, latest stage, period invoice/billing/sends, external billing and payments. A single hotel/account remains explicitly scoped.
- Add one protected summary bundle reader so all combined and property summary values share one database snapshot; no new stored business data, historical backfill, provider calls or paid resources. Reuse existing authoritative readers, trim detail arrays. Individual source failures remain visible; never replace missing values with zero.
- Preserve date semantics, first-billing vs rebilling, actual sends, distinct payment-linked invoices, unknown due/source/mapping, historical gaps and reload retention. Retired report pages stay removed; PDF and other pages unchanged.
- Existing specific authorization covers NTHV9/ar-workspace (Public), Cloudflare ar-workspace and Supabase jmyvpurzmoiecpydjrci. Keep secrets/customer files/test recipients out of Git; --keep-vars on deployment. No OPERA writes or email sends.

## Work
- [x] Backend implementer: new bundle model/API and additive service-only RPC using existing readers in one snapshot; meaningful SQL/API tests; no hosted writes.
- [x] Aging implementer: redesign overview/table interactions and responsive style, preserve context/columns and behavioral regression tests; synthetic screenshots.
- [x] Root: integrate bundle, redesign closing/activity presentation with all hotel breakdowns and drill navigation; source/date/actor isolation, error and unavailable tests.
- [x] Scoped and final review, build/typecheck/tests/SQL replay, synthetic desktop/laptop/narrow visual inspection.
- [ ] Hosted preflight/apply/read and budget/ACL checks, public audit, push/CI/deploy/live verification/merge and update PROJECT_STATUS.
