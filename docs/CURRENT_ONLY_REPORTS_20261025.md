# Current balances and retired historical reports — 25 October 2026

Implemented locally under the owner's current-only reporting instruction. The older day/range reporting requirements in the handoff are superseded for this scope. This is not deployment or live-provider evidence.

- Dashboard keeps its current outstanding, billing progress, unbilled, overdue, age, latest Follow-Up stage, hotel/type/account filters and exact account/invoice drills. Aging remains a separate current view. Dashboard queries use today's Thai date even when an old bookmark contains a historical date, sent activity or payment detail selection.
- Removed Dashboard date/range controls, period activity panels and the new-invoice cohort panel. Reports opens Google Sheets; the administrator Invoice Register remains parked behind its tab. The global External billing activity tab is retired; account-scoped billing evidence and its preview/confirm/history operations remain available.
- After authentication and regional authorization, retired financial/observation/activity/cohort/payment report URLs return `410 report_retired`. Historical dates on current Dashboard APIs are also retired. Current management, balances, balance-account, aging, options, Sheets and tracker access remain available.
- Scheduled current publication no longer queues financial-history imports or historical summary warming. Both registered financial Workflow entry paths return `retired` on the new source. Tracked `FINANCIAL_HISTORY_ENABLED=false` records the default; an old live `true` binding cannot override the code retirement. Workflow registrations and existing database data/migrations are retained.
- Retention still runs after successful scheduled publication and joined scheduled runs. Existing one-month cleanup, transient reviewed bytes, Draft/uncertain protections, actual Sent dates, first-actual-billing due-date logic, tracker Sheet authority and OPERA Invoice/Folio source readers were not changed by this scope.

Verification:

- Initial regressions failed against the previous behavior, then passed after implementation: legacy Dashboard UI, retired API dispatch, automatic history queue, warming and queued Workflow execution.
- Focused reporting/maintenance suite: 49 passing tests across seven files, including 22 current-only tests and two integration cases that execute real retention orchestration and the authenticated current management route. Existing Dashboard/API/financial source/retention coverage: 69 passing tests across six files.
- Three synthetic browser scenarios pass: current Dashboard at 1440 and 390 pixels, and current Aging/legacy bookmarks/Reports fallback. They verify billing and age cards, latest stage, exact invoice detail, absence of historical network requests, and no document-width overflow. Actual viewport and full-page screenshots were inspected under `.tmp/current-only-reports/`; original reference/baseline images were not rewritten. Impeccable detector returned `[]` for the four edited TSX targets.
- Separate browser build passed (`.tmp/current-only-site`). Vite emitted its existing large-chunk warning. The test server accepts optional root/port arguments so this verification uses isolated port 5196 without disturbing another session.
- An intermediate full unit run reported 4,653 passing / 11 failing tests. Three retirement-related assertions were then updated and passed in the focused rerun. The other eight failures were concurrent PDF page-boundary work (seven) and Gmail draft verification (one), outside this scope; integration owner must run final verification after those changes settle. Final scope typecheck passed after the concurrent page-bounds module became available.

Limitations and release follow-up:

- No commit, deployment, cloud mutation, email send or database cleanup was performed here. The production flag and old resources were not changed.
- A Workflow already pinned to an older deployed version may continue its old implementation; the release owner should inspect exact old financial Workflow instances before claiming all production historical jobs have stopped.
- The retained current management SQL RPC still computes its legacy cohort internally, although the UI no longer exposes it. Removing that internal read would require a separate forward migration; applied migrations were left intact.
- Older browser scenarios that explicitly assert date controls, period cohorts/activity/payment panels, external report tabs or the old Closing-date labels describe retired behavior. Replace those assertions with current-only contracts during the integration smoke pass; keep their still-current billing/age/sorting/drill coverage.

## Live validation follow-up

The first qualified release exposed an existing filter-options defect: the
options RPC combined current Accounts with immutable Sent labels and deduplicated
whole metadata tuples. A renamed Hotel/Account therefore appeared twice, and
the client correctly refused an incomplete/duplicate paged list. Forward
migration `20261025095512_ar_current_dashboard_options` replaces only that
projection with current `ar_accounts`, ordered by Hotel+ID. Historical metadata
and every other report branch are preserved; client identity checks are retained.

RED reproduced239tuples for238current ledgers. GREEN covers both regions,200-row
boundaries, current names/types, same IDs in separate hotel ledgers, filters,
actor/ACL/owner/search-path preservation and untouched legacy branches. Full
local replay passes138migrations/32fixtures plus Save/Exit concurrency. Live
Khao options now return238unique entries in200+38pages; actual Dashboard choices
load without warning in both regions. Main-nav Reports opens Google Sheets.
