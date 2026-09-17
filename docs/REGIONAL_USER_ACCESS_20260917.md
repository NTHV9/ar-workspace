# Regional user access — 17 September 2026

## Owner-confirmed scope

- `ar@katathani.com` is the administrator, with Phuket and Khao Lak access. Prepare administration now; no additional real email/user has been supplied or authorized yet.
- Approved users have full normal AR operations in Phuket (KAT/TSK), Khao Lak (TLKL/WAKL/TLFO/TSAN), or both. No viewer/operator role split. Identity remains Hotel + Account.
- Add Settings / Users & Access: approved email, permitted regions, active/suspended state, revision-aware saves. Protect the administrator from removal, suspension or loss of either region. No automatic invitations or customer email.
- Phuket email delivery uses the existing `ar@katathani.com` mailbox. Khao Lak Send Now and Gmail Draft creation remain disabled until its separately purchased Workspace/mailbox is explicitly connected in a later task. Khao Lak document preparation/download and external billing remain available.

## Implementation contract

- Verified Supabase login identifies the real actor. Allowlist membership is checked against the current confirmed email and active database grant, never client metadata. Google and password sessions use the same grant. Unknown/unconfirmed/anonymous/suspended users fail closed.
- Keep the existing shared AR workspace/business owner and provider connection identity separate from the real actor. Regional users act in the shared business workspace only after an explicit route authorization. Record the real actor for delegated write requests in private access audit records; these are authorization records, not actual-send events or staff performance statistics.
- A finite Worker route classifier and a service-only SQL authorizer validate the requested region/hotel or resolve a document, draft, delivery, remittance or command to its authoritative stored hotel. Unknown/global administrative routes deny ordinary users. Existing object-parent, revision, idempotency, source and send-confirmation checks stay in place.
- Ordinary users receive no direct PostgREST table/RPC or Storage read grants. Existing direct access stays restricted to the administrator. Scoped server-only SQL row readers cover the legacy session-based read paths. File bytes pass the authorized parent-record check before service storage access. Regional response checks provide an additional containment boundary.
- Grant changes affect subsequent API requests, including sessions already signed in. In-flight accepted background refresh/document jobs may complete; there is no automatic email sending. Recheck membership and the draft hotel before a delegated email handoff.
- Global collection policy/template editing, connections, storage administration, diagnostics, recovery and user management remain administrator operations. Ordinary users can use the current shared policy/templates in their permitted AR work.
- The new user screen inherits the existing Luminous Operate UI: a labelled email/region form and a paginated user table, with explicit edit, save, cancel and suspension states. Preserve existing reference images and layouts.

## Verification required

Synthetic SQL replay tests for allowlisting, administrator protection, revision/idempotency, grant revocation, direct-access denial and all stored-resource lookups. Worker tests for region/query/body/path tampering, default-deny routes, cross-region files/commands, missing resources, response containment and Khao Lak delivery denial before provider writes. Browser tests and inspected desktop/mobile captures for administration and region restrictions. Existing business tests/build/assets plus production health and signed-in administrator checks. No new real account, actual email, paid service or provider credential change for testing.

## Implemented and tested

- Implemented the approved-user registry, immutable administrator grant, protected administrator identity, revision/idempotency guards, current membership checks, canonical resource authorization, scoped row reads and private real-actor authorization audit. Ordinary users retain no direct table/RPC/Storage membership. Unknown administrative routes and administrator acceptance cookies are rejected for ordinary users.
- Added Settings → Users & Access with email/region/status controls, protected administrator row, pagination, explicit suspension and conflict handling. Added explicit password enrollment alongside Google sign-in. No invitation is sent when access is approved. Regional users do not poll or see global mailbox administration.
- Phuket email uses the existing mailbox; Khao Lak provider handoff and durable claims are denied, including attempts to use its documents as diagnostic-mail supplementals. Khao Lak reviewed files remain downloadable. No new real identity, provider credential or mailbox was created.
- Full unit suite passed 1,265 tests. Subsequent focused access/delivery tests and TypeScript passed. Build and public assets passed; dry run passed before the final admission refinements. SQL replay passed all 79 migrations and 34 rollback suites, including the final guard changes. No provider calls or live exports were used for the SQL tests.
- Browser verification passed 49 unique cases: administration, password-enrollment initiation, suspension, region restrictions/revocation, mailbox-admin visibility, document flow, and existing refresh behavior. Desktop 1440 and mobile 390 captures were inspected. A mobile overflow caused by an absolutely positioned table label was contained within its scroll wrapper; the table remains horizontally scrollable. Existing tracked evidence PNGs were restored after tests regenerated them.
- Live preflight confirmed the existing production source `12078d5964e6be3c2c5090788ce314e44b6efe10` and verified database health. Supabase currently reports signup disabled, Google/email providers enabled and email autoconfirm disabled. First-time approved users will require signup to be enabled after the allowlist trigger is installed; unapproved emails must remain rejected by that trigger and by request authorization.

Status: implemented/tested; production migration, controlled enrollment and deployment pending. Apply the migration before enabling signup or deploying the new client. Seed only the existing administrator. Preserve existing secrets, scopes, schedules, resources, budgets and file retention. Do not add users or send any real email for rollout verification.
