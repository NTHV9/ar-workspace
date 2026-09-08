# First increment implementation plan — 2026-09-08

Goal: Deliver two reviewable pages on a real Cloudflare Worker, GitHub source, and Supabase-backed authenticated data access where authorized connectivity is available.

Authority: PRODUCT_SPEC.md, DECISIONS_AND_OPEN_ITEMS.md, the seven reference PNGs, and the owner's implementation authorization on 2026-09-08. The owner approved execution in the named workspace; no additional design approval or legacy worktree is required.

## Confirmed changes
- React/Vite/TypeScript; one primary Workers backend; Supabase database/Auth/private Storage.
- GitHub NTHV9/ar-workspace only; public visibility verified. No force push or legacy changes.
- On-open stale threshold 30 minutes, configurable; shared refresh at 07:00 and 19:00 Asia/Bangkok.
- Calendar days; Follow 1 starts the day after Due; Urgent immediately after Final while open; no auto-send.

## Work sequence
- [ ] Inspect available service accounts and empty GitHub repository; confirm cloud targets before mutation.
- [ ] Create feature branch and clean build/test configuration. Audit all staged files before public push.
- [ ] Write failing tests for backend authentication, unavailable service responses and comparative filtering/sorting/identity; implement the smallest passing modules.
- [ ] Implement Portfolio and Account Detail from the approved comps. Add explicit synthetic review mode; never fall back to it on live failures.
- [ ] Inspect confirmed database schemas, migrations and collision risk. Apply only additive new migrations, RLS and private bucket configuration for this app.
- [ ] Deploy Worker with source commit metadata; verify real Worker-to-Supabase requests, unauthorized access and supported login paths. Record missing OAuth configuration without claiming login success.
- [ ] Verify browser navigation, filters, sorting, aging and selection; capture synthetic-only Cloudflare screenshots at 1440x900 and smaller laptop size.
- [ ] Review visual differences and security, fix defects, run build/typecheck/tests, push reviewed commit and update PROJECT_STATUS with exact evidence.

## File boundaries
- src/domain/: account/invoice types, hotel grouping, sorting and filtering (unit tests alongside domain behavior).
- src/Portfolio.tsx and src/AccountDetail.tsx: two first-increment surfaces; src/styles.css: shared visual system.
- src/App.tsx: session, routing and explicit review/live mode; src/demo.ts: synthetic data only.
- worker/index.ts: authenticated API, sanitized errors and backend Supabase access. No provider secrets in client code.
- supabase/migrations/: additive app tables/policies only after inspecting the confirmed target.
- tests/: behavior and deployed browser verification; evidence/: synthetic-only images and categorical results.
- .github/workflows/: build/typecheck/tests; deployment only against this app's confirmed Worker.

## Acceptance examples
An unauthenticated GET /api/portfolio returns 401. A valid but unapproved identity returns 403. An unavailable Supabase endpoint returns an explicit unavailable result, never synthetic balances. Same account identifiers in KAT/TSK remain separate operational identities. Returning from Account Detail restores the Portfolio query/sort/filter. Selecting invoices affects only that account and correctly totals selected open balances.

## External prerequisites
Cloudflare account/Worker target confirmation requested. Supabase connector currently lists organization ar-katathani but zero projects. OPERA and Google credential setup must use secret storage, never chat or committed files. Missing integration does not block UI or GitHub work.
