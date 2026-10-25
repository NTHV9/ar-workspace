# Current work, simpler preparation, and core repairs

Owner-approved scope, 25 October 2026. This records intended behavior, not a
deployment claim. The latest PROJECT_STATUS checkpoint supplies release evidence.

## Approved design

Keep Dashboard current outstanding/billing/reminder/aging cards and Invoice
drilldowns. Retire unused daily/period history and First billing/Rebilling
reporting, together with work performed only for those reports. Preserve current
OPERA publications, invoice-generation source readers, actual Sent evidence,
Sheet-authoritative billing/Follow1–3 dates, due dates and retention maintenance.

Staff send through Review & send now. Provider Gmail Draft creation is Admin-only
in both UI and backend. Existing provider Drafts and uncertain sends remain
recoverable without a second send or replacement of reviewed bytes.

Unsent preparations are not a work backlog. Explicit Exit/Cancel discards that
exact transient preparation; pending admitted generation/uploads settle before
cleanup. PDF-to-email handoff and switching accounts within the same open batch
continue work. The owner explicitly keeps F5/reload recovery: no discard on
unmount, visibility change or reload. Browser disappearance alone is not evidence
of explicit cancellation. Admin provider Draft and unresolved send proof remain
protected. Verified Sent business history remains; legacy/Drive/remittance rules
are unchanged. No retrospective bulk purge is authorized.

## Interfaces and ownership

- Reports: Dashboard + management current cards, history policy/router/workflow
  guards and post-publication maintenance. Current refresh/retention independent.
- Email: provider-Draft gate and durable verified external-Sent evidence, before
  history confirmation. No provider Send calls in qualification.
- Preparation: create-dialog admission/exit, exact-job abandonment, batch local
  state clearing after accepted exit, Account email evidence without a resume
  backlog. No unknown send or F5 deletion.
- PDF: shared page-geometry validation at editor, restore and export boundaries;
  invalid replacement cannot erase its original in tolerant rendering.
- Current refresh: remove repeated retention-query work, preserve exact output
  and source validation; capture bounded safe failure diagnostics.

## Implementation plan

> For agentic workers: execute using superpowers:executing-plans. Independent
> report/email/refresh scopes use superpowers:dispatching-parallel-agents; shared
> lifecycle/PDF and integration remain with the parent.

1. [x] Add RED→GREEN tests for current-only legacy routes, dashboard cards and
   report-only job retirement; remove unused report UI/cohort reads.
2. [x] Add staff/Admin provider-Draft boundary tests, preserve ordinary send and
   old Draft recovery; implement backend and UI restrictions.
3. [x] Reproduce external Sent/history failure across reopen; persist verified
   immutable proof, test idempotent recovery and zero duplicate send commands.
4. [x] Pin Escape during admitted creation, explicit departure, batch departure,
   F5 and internal transitions. Remove resume backlog without deleting evidence.
5. [x] Reproduce off-page PDF edits; clamp normal editing and reject corrupt geometry before
   masking or strict export, test original preservation and valid flow pages.
6. [x] Compare old/new current refresh query outputs and plans; retain validation
   and improve precise safe diagnostic evidence instead of weakening checks.
7. [x] Replay all migrations/SQL fixtures, typecheck/unit/browser tests, review
   combined changes, preserve unrelated audit notes and generated baselines.
8. [ ] Apply reviewed migrations, verify live source/Sent/Sheet preservation,
   commit/push, confirm same-head GitHub checks, deploy latest qualified source,
   verify health/assets/current UI and update PROJECT_STATUS with evidence.

## Review focus

- A delayed Create response must not create an invisible resumable preparation.
- F5 and switching batch accounts must never invoke abandonment.
- Pending cleanup does not imply failure or permit a second provider send.
- A source replacement moved outside the page must not erase original ink.
- A true live legacy history flag must not restart retired work or hide current
  billing/aging cards, while retention and current OPERA refresh still run.

Invoice Register remains parked as an unused Admin surface; this task does not
weaken Sheet authority to make its old success feedback appear correct.

## Qualification checkpoint

Database migrations were enabled as `20261025091430`, `20261025091449` and
`20261025091458`. Readback retains the exact Sent-event and Sheet-date hashes;
no older text-cleanup request or external-Sent proof was backfilled. Local
qualification covers4,674unit tests,528distinct browser cases,137migrations/
31SQLfixtures plus actual concurrent Save/Exit and locked cleanup retry,
3performance/15publication cases, typecheck and build. Runtime release, hosted
checks and final asset/UI receipts remain part of step8.
