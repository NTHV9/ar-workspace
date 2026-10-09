# Regional Gmail senders

The owner confirmed Gmail / Google Workspace for the Khao Lak mailbox on 9 October 2026. Implementation and focused verification are complete; migration 108 is applied. Worker deployment and real mailbox authorization are recorded separately in PROJECT_STATUS.

| Hotels | Region | Sender |
| --- | --- | --- |
| KAT, TSK | Phuket | ar@katathani.com |
| TLKL, WAKL, TLFO, TSAN | Khao Lak | ar@thesandskhaolak.com |

The server selects the sender from the document's hotel. The business owner remains the existing AR administrator; staff permissions and signature identity remain separate. Adding a provider mailbox does not add a workspace user. Drive and tracker connections retain their existing identity.

## Implementation contract

- Each owner/region has an independent encrypted connection. New credentials bind both identities; existing Phuket ciphertext has an explicit Phuket-only legacy format. Versioned updates reject stale refreshes and reconnect callbacks.
- OAuth state freezes the expected mailbox and connection revision. The callback verifies Google's actual profile before storing credentials. An incorrect Google account cannot replace either connection. Administrators can authorize a mailbox from Settings without creating a customer document.
- Every new delivery freezes its mailbox and sender. Historical receipts are explicitly classified as Phuket only after verifying their prior scope. Replies, Sent verification, reconciliation and recovery use that frozen identity.
- Google message identifiers are scoped to a mailbox. Identical identifiers in different mailboxes must not cross-match. Historical sealed test receipts remain Phuket-only.
- Khao Lak staff can prepare messages within their assigned region. Provider handoff requires the Khao Lak connection; there is no fallback to Phuket. Credential connection/reconnection remains an administrator action.
- Preserve explicit human sending, duplicate-command claims, reviewed attachment bytes, uncertain-delivery retention and actual-Sent-only business records. Do not reintroduce an OPERA request before sending.

## Verification and activation

Focused provider tests use synthetic tokens and messages. SQL fixtures run in transactions and roll back; they must preserve legacy credential bytes, receipt fields and unrelated data. UI checks cover regional status, sender review, restricted users, Settings callbacks and recovery routing. Real Google consent is a separate activation step. No real test email is authorized by this mailbox configuration request.

Provider flow reference: [Google OAuth web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server). Privileged database API reference: [Supabase database functions](https://supabase.com/docs/guides/database/functions).

Verified implementation: TypeScript; 188 unit files / 1,806 tests; six regional browser cases and 22 existing composer cases; desktop/mobile Settings and final sender review inspected. Astra reviewed the implementation and fixes for revoked-token status and regional SQL thread participants, with no remaining blocking findings in scope. Status checks validate Google's profile; ordinary sends do not add that check for an unexpired, previously validated encrypted token.

Migration 108 SHA-256 `c28eb2afc7fe77e23e5503476a88fd73d2f9e17d22dee8991823fed9b4670d1a` passed local rollback with 110 table/auth fingerprints and full function catalog restored, and actual Supabase candidate rollback. Existing credential ciphertext and historical receipt fields were unchanged except added mailbox identity. Historical six-hotel signature diagnostics remain Phuket because their original sender was Phuket. The Sent-manifest guard is suspended only during the additive backfill under the transaction's exclusive table lock and restored immediately; actual readback confirms it enabled. Applied schema retains one Phuket connection, zero Khao Lak connections and all 23 old receipts classified as Phuket. Credential RPCs remain service-only. No customer mail or test email sent for this task.
