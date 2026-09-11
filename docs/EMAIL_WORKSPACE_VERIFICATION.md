# Email workspace verification — 10 September 2026

Historical first increment. Direct send and sent-evidence follow-up are recorded in [GMAIL_SEND_VERIFICATION.md](GMAIL_SEND_VERIFICATION.md) and the latest PROJECT_STATUS checkpoint.

## Implemented

- Protected email workspace opened from an acknowledged, ready PDF job. Draft identity binds owner, document job and exact reviewed revision. Export receipts are copied into the draft; changed packages cannot be handed off silently.
- Billing/Collection purpose, initial account recipient profile, editable To/CC/BCC, subject and plain-text body. Incomplete drafts may be saved. No OPERA recipient fallback and no automatic changes to account defaults.
- Optimistic revisions, no-op save preservation, audit-safe pending handoff lock. Service-only mutations with owner RLS for reads.
- Dedicated OAuth client `ar-workspace-gmail` in Google project `ar-project-506410`; confirmed project by existing new-app Supabase callback before adding client. Legacy clients unchanged.
- Gmail compose scope, server callback, PKCE, secure same-site cookie and single-use expiring hashed state. Provider refresh/access tokens encrypted with AES-GCM and owner context in private schema; encryption key and OAuth client secret reside in Worker Secret bindings. Browser receives connection status only.
- Explicit Create Gmail draft checks fresh OPERA selected balances/relationships, reviewed document revision, attachment byte counts and SHA-256, then claims a unique draft revision before one provider POST. Pending/uncertain claims never auto-retry. Generated attachments remain complete; active input budget defaults to 10 MiB (bounded maximum 12 MiB).
- Existing handoff state restored when reopening the same draft revision. Native dialog confines keyboard focus; desktop columns stack on narrow screens.

## Applied to Supabase project ar-workspace

Project ref: `jmyvpurzmoiecpydjrci`.

- `20260909164000_ar_email_workspace.sql`: private owner-scoped workspace drafts and supplemental metadata tables, reviewed-job opening/saving RPCs. Supplemental upload API/UI is not enabled yet.
- `20260909165000_ar_gmail_connection.sql`: private encrypted connection/state/attempt records and service-only RPCs.
- `20260909170000_ar_email_save_guard.sql`: no-op saves retain revision; pending/uncertain Gmail handoff prevents changing message revision.
- `20260909170500_ar_gmail_claim_guard.sql`: blocks new-revision handoff while an earlier result remains unresolved.

No legacy schema, ledger amount, account recipient default or invoice billing/reminder history was changed.

## Tested

- Typecheck and production Build passed. 179 unit tests passed, including Unicode MIME, header-injection rejection, encrypted owner-bound credentials, exact OAuth cookie handling, protected routes, replay behavior and full mocked claim → Gmail POST → finish for success and ambiguous failure.
- SQL rollback checks passed: idempotent open, cross-owner rejection, no-op save, stale revision, single claim and pending-edit rejection. Test data rolled back.
- Browser tests passed for 1440×900, 1280×800 and 390×844: explicit save, no automatic Gmail call, dirty-message handoff blocking, retained edits on conflict, reachable mobile controls and no horizontal overflow. Cloudflare run used synthetic API interception, clearly separate from actual integration checks.
- Synthetic images in `evidence/email-composer-*.png`; visual review matched approved three-column hierarchy and mobile adaptation. One mobile capture needed compositor settling; confirmed visible save label after recapture. No prototype reference was changed.
- Actual Cloudflare OAuth consent completed; Worker getProfile returned the allowlisted Gmail identity. Private database inspection confirmed one connection stored as encrypted IV/data and one consumed OAuth state, without displaying token values.
- Actual Worker Gmail Draft creation succeeded with one Statement and two Invoice PDFs from an already-reviewed package. Gmail UI independently showed all three expected attachment names and sizes. No recipient was assigned during this creation test.
- Owner subsequently authorized a one-time send recipient. In Gmail, removed all customer attachments from that test draft, replaced its content with a generic test, verified one recipient and no attachments, then clicked Send once. Gmail displayed **Message sent**. Recipient was not stored in app defaults, source, tests or this document. Gmail's own sent record is separate from application configuration.
- This validates Worker draft creation and Gmail UI send, **not** a Send Now endpoint in AR Workspace or recipient delivery/read confirmation. No AR billing/reminder event was recorded for the test.

## Remaining

- Direct Send Now, actual-send reconciliation back to invoice stages and billing history, existing-thread selection and rich-text/versioned templates.
- Supplemental file upload/inspection and explicit recipient-default saving from the composer; account defaults remain managed in Account Settings.
- Gmail refresh-token rotation/expiry recovery and ambiguous-attempt reconciliation need additional live validation. No fake connected state or automatic retry is used.
- OPERA native Statement PDF transport remains unverified; approved system-generated Statement behavior is unchanged.

## Deployment

First source commit `c00227b17b960c936ad736fe14e985bdc1b0da1f`, branch `codex/opera-refresh`, deployed to Worker `ar-workspace` as `efb6b52479ce4b5aa49765bfda38153a`; workflow version `346195d9-fcf8-486d-ae57-c28b871648d9`. Health returned matching SHA; anonymous Gmail/email routes returned 401. Final follow-up deployment is recorded in PROJECT_STATUS.

## Primary references

- [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail profile scopes, including compose](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
- [Gmail drafts.create](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/drafts/create)
