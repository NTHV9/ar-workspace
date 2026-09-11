# Account settings and historical defaults — 9 September 2026

## Implemented

- Account Detail → Overview now provides Billing Required / Not Required / Not configured, nullable Credit Term and separate Billing/Collection To/CC/BCC profiles. No recipient is imported from OPERA. Empty term and zero-day term remain distinct.
- Owner explicitly approved applying initial Billing Required/Not Required and Credit Term to existing open invoices as well as subsequent arrivals. Complete rules are assigned to currently collectible invoices without an existing assignment. Assigned invoice terms are retained when later Account defaults change.
- Existing and incoming invoice workflow rows start with no first billing date and no reminder stage/date: the owner's chosen **Not billed / No reminders sent** defaults. This is initialization policy, not evidence obtained from OPERA. No actual-send events or dates were fabricated.
- Invoice detail includes an editable Billing & reminder history panel for first actual billing date, latest reminder stage and actual reminder date. Historical corrections have an audit trail; they do not send emails or create current-day actual-send activity.
- Required Due Date remains null until an actual first billing date exists. Not Required Due Date is the pinned OPERA base date plus assigned calendar-day term. A terms default alone never manufactures a first billing date.
- Settings and history updates check revisions. A stale save cannot overwrite newer saved state. Missing workflow metadata no longer prevents otherwise available OPERA ledger data from being read; the history fields remain unavailable in that case rather than being replaced with fake defaults.

## Database and security

Applied `ar_account_workflow` on project `jmyvpurzmoiecpydjrci`, corresponding to `supabase/migrations/20260909160000_ar_account_workflow.sql`. Added settings revision/audit data, invoice workflow records with derived due dates, initialization/assignment trigger and service-only configuration/history RPCs. Workflow reads use the existing member RLS policy; direct client writes are revoked. No OPERA accounting values, legacy services or existing source PDFs were changed.

Database checks verified that authenticated clients cannot execute settings writes directly and anon cannot read workflow records. Settings/history writes also verify the actor against the confirmed allowlisted user. Worker routes retain verified Auth, same-origin mutation checks, bounded request bodies and private no-store responses.

## Tested

- 162 unit tests passed, including null versus zero, malformed recipient/header injection, duplicate recipients, protected settings/history routes and isolation of workflow-read failure from ledger visibility.
- Transaction/rollback tests on the real database: initial existing-invoice assignment, calendar-day due dates for Not Required, missing billing dates remaining null for Required, pinned terms surviving a later default change, cross-Hotel isolation, stale settings/history rejection, historical due calculation and rejection of future actual dates. Synthetic settings and dates were rolled back.
- Live read/UI check on Cloudflare confirmed existing invoices show Not billed / No reminders sent and the historical edit form opens. Account settings load as unconfigured with empty recipients. No real per-Account term or recipient was supplied by the agent, and no real historical date was entered. Post-test counts remained zero for configured Accounts, billing dates and reminder stages.
- Three synthetic settings browser cases cover 1440×900, 1280×800, explicit recipients/zero terms and conflict retention. Deployed browser run initially passed six of seven selected settings/document cases; one document-open timeout passed on a focused unchanged rerun. No timeout/assertion was weakened and no cause is claimed for that transient failure.
- Typecheck, Vite build and connector bundle passed. Visual references `email-composer-v1.png` and `supporting-surfaces-v1.png` were opened; the existing visual system was preserved. Impeccable mechanical check returned no findings. Checked-in settings screenshots use synthetic data only.

## Deployment and remaining work

App source `c2252400d0188cb6f73bbed5ace384d5e3a16874`, deployment `d8be2ee9a6484402a06308050a73eba6`, workflow version `fab67490-0eb2-4749-945d-8a9280ce6e5b` on existing `ar-workspace`. Health returned database_verified and the exact source SHA. Unauthenticated settings GET returned 401.

This increment delivers Account Settings and editable history. Email Composer, Gmail OAuth/handoff and the Billing/Collection queue remain subsequent work; they are not claimed implemented here. Worker currently has no Gmail backend credentials/bindings. Existing Google login and the Codex Gmail connector do not establish a deployed Gmail connection. Actual email sending still needs an explicitly designated test recipient and confirmed provider setup.
