# Workspace copy cleanup

The owner asks to remove explanatory clutter across the whole workspace, starting with two repeated paragraphs in Invoice notes/holds/review. Impeccable distill guidance is applied to the incumbent interface; this is not a layout redesign or a change to business behavior.

All 78 TSX components were audited. Copy/helper markup changed in 39 UI files across Account details/history, Collections, Portfolio, Settings, tracking/Register, reports, document preparation/PDF editing, email/templates/signatures/Gmail, Remittances, Storage/retention, Operations, sign-in and loading recovery. Controls-only components and purpose-specific diagnostic evidence remain where their content is necessary.

Removed repeated tutorials, introductory filler, generic accounting reassurance and implementation explanations. Both owner-quoted Invoice Exceptions paragraphs are removed. Long necessary instructions are shorter. The stale `Type default · Setup needed` badge is now `Type default`, consistent with complete inherited rules being usable.

Kept field labels, accessibility associations, controls, financial units/bases/dates/source coverage, incomplete/unknown states, actual status and history, errors/recovery, explicit sending and consequence-bearing deletion/discard confirmations. No API, backend, accounting calculation, database, PDF byte generation, provider permission or event-handler changes. Original visual baselines are preserved.

Verification: TypeScript; 102 existing behavioral unit tests across 13 files; two synthetic desktop/mobile Account/settings browser cases; Email/PDF desktop/mobile static captures with no page errors. Root inspected representative Account/settings and Email/PDF images. Final three remaining generic notes were removed in one bounded follow-up with typecheck. Initial Vite navigation failures were addressed by using compiled static assets, not product or global configuration changes. Astra reviewed the copy diff and reported no material findings.

Detailed file-by-file edited/retained audit and private synthetic screenshots are under `.tmp/declutter-owned/` and `.tmp/declutter-workflow-20261009/`. Deployment and live verification are recorded in PROJECT_STATUS. No real email or cloud data mutation is part of this copy cleanup.
