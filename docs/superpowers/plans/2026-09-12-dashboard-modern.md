# Modern Dashboard and publication availability

Goal: finish, test and deploy the owner's requested modern Dashboard. Existing approval covers this project's Git, migrations and deployment. User subsequently requested an explicit Goal and selectable Aging columns rather than mandatory table reduction.

## Scope and rulings
- Preserve all financial definitions from the period-analysis plan. Current Aging stays current; closing balances use the period end; payment dates come from OPERA. Missing evidence is never zero.
- Ruling: replace the Dashboard's table-led appearance with clear KPI panels and real-data visual comparisons. Keep the approved app typography and navy/blue/teal family; other pages and PDF editor are out of scope.
- Aging keeps its full comparison capability. Add column visibility controls and useful presets; do not remove buckets or silently limit Account Types/Accounts. Keep TSK/KAT/Total identities, drilldown and back context.
- Verified published balances remain usable while a new refresh runs or fails, with separate freshness information. No last publication or unverified invoice evidence remains unavailable. Same-scope browser reload may retain its previous response, never another date/hotel/account/user response.
- Public repo NTHV9/ar-workspace only; branch codex/dashboard-modern from e5c360e. Worker ar-workspace, Supabase jmyvpurzmoiecpydjrci. No secrets, customer files or one-off test recipient in Git. No accounting writes or paid additions.
- Use subagent-driven-development for independent backend and Aging tasks and scoped/final review; root owns shared integration, hosted writes and Git.

## Tasks
- [x] Backend: reproduce running-refresh invalidation; additive migration separates publication validity from latest attempt; test running/failed/no-publication/unknown/historical cases against local PostgreSQL. Own worker/dashboard/model.ts, new migration and focused SQL fixture only.
- [x] Aging: modern current overview plus hide/show columns, presets, retained context and accessible responsive comparisons. Own CurrentAging.tsx, aging-model.ts, aging.css and related unit/browser fixtures/tests.
- [x] Root: modern period summaries, status charts, date filters, current-scope response retention and regression tests. Preserve counts/amounts/details and source semantics.
- [x] Review: scoped implementation and integrated final review; meaningful behavioral tests and synthetic screenshots at desktop/laptop/narrow widths.
- [ ] Delivery: hosted metadata preflight, reviewed migration, actual data/auth checks, public-file audit, push, CI, deploy exact source SHA with --keep-vars, verify production, expected-head merge and PROJECT_STATUS.
