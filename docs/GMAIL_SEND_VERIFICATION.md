# Direct send and sent-evidence verification — 10 September 2026

## Delivered

Email preparation now supports **Review & send now**, with recipients, subject/body, selected Invoice/Folio references and final attachment names shown before a separate acknowledgment and Confirm send now action. Background composer controls are inert during confirmation. Collection requires an explicit stage; normal Billing sends require configured Billing Required and Credit Term on the selected invoices. No scheduled sender was added.

One durable delivery claim binds an immutable reviewed document/message revision, purpose, collection stage, invoice manifest and workflow revisions. Unresolved deliveries block conflicting saves and overlapping handoffs. Successful sends record invoice history only after verified Gmail Sent evidence. Test messages never create business events.

- Billing uses Gmail's actual internal timestamp converted to an Asia/Bangkok calendar date; the first actual billing date starts the assigned term.
- Collection records the explicitly selected stage and actual sent date per selected invoice. Existing Final/positive-open UI shows Urgent.
- Confirmation locks and checks all workflow revisions before applying any event. Changed history requires review; there are no partial multi-invoice updates.
- Repeated confirmation returns the existing result without another business event. An ambiguous remote response is reconciled by read-only checks, never by automatic resend.
- Reply/payment interpretation, automated polling and Collection Queue are outside this increment.

## Gmail identity and content evidence

OAuth now requests compose plus readonly on the dedicated new-app client. Consent and actual Worker mailbox access passed. Tokens remain encrypted in the private schema and credentials in Worker Secrets.

Real Gmail testing proved that Gmail can rewrite the RFC Message-ID. Direct sends therefore use the immutable Gmail ID returned by the send API. Its provenance is stored separately as `provider_receipt_id`; an observed reconciliation candidate cannot become a trusted send receipt. Where no send receipt exists, a new message carries an X-AR-Delivery-ID correlation header. Candidate discovery is paginated and bounded, and only an exact correlation plus complete content verification can confirm a message. No matching evidence means unresolved, not a retry.

Checks include SENT, absence of contradictory DRAFT status, matching sender and recipients, exact subject/plain-text body, expected file count/names/sizes/SHA-256, identity and Gmail timestamp. Unsupported body representations require review. A sent message moved to Trash can still prove sending if all evidence remains available; a missing/deleted draft alone never proves sending. Permanently unavailable evidence remains unresolved.

Older Gmail drafts created before immutable delivery snapshots/correlation are not auto-imported as billing events. Gmail-side changes that invalidate the reviewed content require review. Existing-thread selection and rich-text equivalence are not implemented.

## Applied migrations

Supabase `ar-workspace`, project ref `jmyvpurzmoiecpydjrci`:

1. `20260909173500_ar_mail_delivery.sql`: private delivery claims, service-only evidence/confirmation RPCs, owner-RLS `ar_sent_events`, atomic invoice history update.
2. `20260909174500_ar_mail_revision_guard.sql`: unresolved-delivery save/overlap guard.
3. `20260909180000_ar_mail_receipt_provenance.sql`: immutable provider receipt separate from observed message ID. Backfill limited to prior provider-response states with no failure reason.

No ledger balances, legacy resources or account recipient defaults changed. No paid services added.

## Tests and real results

- Production Build and Typecheck passed; **189 unit tests passed**.
- **7 browser tests passed**, including confirmation and explicit send at 1440×900, 1280×800, 390×844, dirty message blocking, conflict preservation and no automatic Gmail request. Cloudflare browser regression used synthetic intercepted APIs; it is not presented as a real send test.
- `tests/sql/mail-delivery-rollback.sql` passed on the real new database and rolled back: first billing/due, explicit Final, idempotent claim/confirmation, cross-owner read rejection, concurrent workflow edit refusal, test exclusion. These rollback proofs are separate from actual customer billing.
- One explicitly authorized diagnostic email was sent **directly by the Cloudflare Worker** with one synthetic PDF and no customer data. No Gmail UI send was used this round.
- Gmail accepted it at **10 September 2026 00:39:54 ICT**. After the user moved it to Trash, the Worker verified that same existing message's SENT evidence, timestamp, recipient digest, plain-text content and attached PDF SHA-256. No second email was sent during diagnosis/reconciliation.
- Final database checks: 1 delivery, 1 verified test, 0 business events, 0 changed billing/reminder histories, 0 plaintext delivery-recipient records, 0 workspace recipient records. The one-time recipient was not put in source, settings or documentation. Its digest is retained only to check this test; Gmail retains its own message record.
- Final anonymous direct-send/test-send/check endpoints returned 401. Health returned the deployed source SHA and live Supabase/OPERA status.
- Review fixes: unresolved revision recovery, unsupported MIME content, provider receipt provenance and exact receipt matching. Sent+Trash handling was corrected based on the user's confirmed deletion and actual SENT evidence, without weakening identity/content checks.

## Deployment

- Branch: `codex/opera-refresh`, repository `NTHV9/ar-workspace` (public).
- Runtime source: `c2ea6516fa3e668a401c7cdad42c9b4f249aa5d7`.
- Worker: `ar-workspace`; deployment `be002e58e51c491e9100a29e06a126f0`.
- Workflow version: `61528f8c-7353-4140-9a86-3cb23042dd00`.
- URL: https://ar-workspace.ar-c82.workers.dev/

## Practical limits

Business sends/history are implemented and rollback-tested, but no customer email or actual customer billing event was intentionally produced. Account rules and recipients still need the owner's real configuration before normal sending. Gmail reconciliation is manual through Check sent status in this increment. New Gmail-side draft-send correlation discovery has unit/implementation coverage but has not yet been proven with a separate newly created live draft; direct send receipt reconciliation is live-tested. Do not claim every mail workflow is production-complete.

## Sources

- [Gmail messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail messages.get and readonly permission](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Gmail message search and pagination](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
