# System audit and repair plan

**Goal:** Test the current system, reproduce defects, repair confirmed problems and measure meaningful performance improvements.

**Architecture:** Retain the existing application and business contracts. Establish unit/browser and live read-only baselines first; isolate synthetic write/send tests from business records. Repair each demonstrated defect at its owning module and rerun its regression before release.

**Tech stack:** React/Vite/TypeScript, Cloudflare Workers/Workflows, Supabase/PostgreSQL, OPERA, Gmail and Drive.

**Spec:** `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/DECISIONS_AND_OPEN_ITEMS.md`, latest `docs/PROJECT_STATUS.md`, and owner's 11 October audit-and-fix instruction.

## Constraints

- Six operational hotels. TSUN remains display-only pre-opening.
- No edits to OPERA accounting, original tracking sheets or real billing/reminder history for tests.
- Use synthetic PDFs and the recipient authorized in the current conversation only; never save that recipient in tracked files/configuration. Keep minimal private technical intent to prevent duplicate sends.
- Preserve reviewed bytes, human sending, regional authorization, Account overrides, DRF balance-only policy and protected Draft/uncertain files.
- No paid services, credential changes or unrelated redesign. Preserve the unrelated untracked design-reference document.

## Coverage and execution

- [x] Baseline: full unit suite and broad browser attempts; classified outdated fixtures and validated the maintained smoke scope. Archived/retired browser cases are not certified green.
- [x] Live read-only: login, both regions, Dashboard/Aging/Collections, Reports/Register, Settings, Templates, Remittances and Storage; capture safe timings and provider/backend errors.
- [x] Database/integration: refresh freshness, failed jobs, query statistics/plans, reporting reconciliation and authorization boundaries.
- [x] Synthetic workflow: PDF creation/edit/scan attachment/rename/preview, email preparation/region sender/retry and discard protections; optional actual synthetic test mail with no business event.
- [x] For confirmed defects: record reproduction, implement minimal repair, prove original case and relevant regression tests pass.
- [x] Verify integrated build, review changes, deploy tested normal artifacts, check live behavior and publish a report separating tested/fixed/deployed and remaining limits.

## Review focus

1. Missing/failed source reads must not become zero balances or misleading completed states.
2. Async requests must not mix regions/Accounts or overwrite fresh edits.
3. Preview and email must use the same reviewed bytes and current filenames without duplicate send.
4. Inherited settings and report classifications must match current business rules.
5. Performance changes must preserve totals, permissions, pagination and recoverability.
