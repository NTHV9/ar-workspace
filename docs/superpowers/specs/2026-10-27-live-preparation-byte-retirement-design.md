# C — Retire temporary preparation bytes after fresh Exit or verified delivery

Proposed27 October2026. Source baseline **ea9f48d**, frozen B awaiting fresh review; inspect its final reviewed successor before implementation. C is a separate bounded follow-on, not an expansion of B's private20 operator operation. No implementation/DDL/deployment is claimed here.

## Required result

Fresh authenticated Exit permanently retires local work. Redundant temporary PDFs are released when complete frozen evidence and exact dependency/reference checks permit; necessary unresolved bytes remain protected. A trusted completed Gmail submission/verified Sent proof can retire local work even when business-history recording is pending. Keep all actual mail states/proofs/history/Sheet authority and duplicate protections. No false Sent, reset, resend, age purge, new UI, session/claim framework, editor persistence or new provider resource. F5/tab switching creates no intent.

B already supplies proof validation, reference resolution, metadata/admission fences, exact object receipts and retention cleanup. Its public singleton20 register/preview/commit APIs and current operation remain unchanged. C reuses private helpers with exact fresh authority; it must not manufacture another20-member cohort or relax B's historical approval constraints.

## Evidence from the actual source

At ea9f48d, worker/email/delivery.ts deliverMessage calls prepareMail before ar_mail_claim, then submit. sendExistingDraft also prepares/verifies raw MIME before ar_mail_claim_draft_send; its subsequent draft/send POST uses that in-memory raw string. worker/email/combined.ts prepares combined raw/expected before ar_combined_mail_claim. The functions are not named ar_mail_begin in this source. After these modern admissions, submit/checkDelivery/manual matching use the admitted evidence and Gmail responses, not local PDF reads. Qualification must exercise these actual paths rather than infer safety solely from a timestamp/state label.

B's pdf_release_problem currently accepts only created/review_required and rejects every non-null draft_send_claimed_at. That conservative operator filter must stay valid for B, but it is not a general proof of byte dependence. A provider POST still completing from already-built MIME is not by itself a local-file dependency. Conversely source generation/unregistered upload or incomplete/legacy expected evidence can still need bytes. C must distinguish these cases without relaxing evidence checks.

## Fresh authority and replay contract

Known-job POST /api/documents/{id}/abandon is currently bodyless. Add optional fixed **X-AR-Exit-Command: UUID** for newly created C intents; retain existing route, Bearer auth, Origin/scope checks and response outcome. The header is an authenticated command identifier, never a secret or proof of Sent. Validate syntax/bounds and bind it to real REQUEST_ACTOR, workspace owner, exact target job (or create command/hotel/digest) and current preparation identity. Same marker/body replays its immutable result; reuse for another actor/target conflicts.

Actual A outbox at ea9f48d has a stable composite storage identity, **not a separate UUID command field**. Introduce version2 only for newly authorized Exit, generating exitCommandId once before synchronous persistence. All retries reuse it. Do not upgrade persisted v1 entries or legacy bodyless calls into fresh authority. Direct menu Exit and qualified tab close use the same marked path; reconciliation only transports an existing marker. No marker is minted on load, F5, tab switch, old protected callback or automatic outbox replay.

For create-command tombstones, capture retirement authority only when the first fresh authenticated command-abandon request creates its exact tombstone. Replaying an existing unmarked or settled protected tombstone cannot add authority, even with a new header. Preserve A's separate61705 command transaction and global/actor abandonment transaction; no lock inversion. When an originally marked tombstone resolves a job, consume its retained authority once through the same private helper; do not repeat create/print.

Add a small private original-intent receipt with immutable authority/identity and immutable original A response. Internal retirement progress is separate from that response. A protected outcome remains terminal, unchanged on every replay. Physical cleanup can later complete **only** because the original request already recorded a retirement intent, not by calling abandon again after protected. No backfill of historical protected receipts. Old bodyless known-job requests lack command identity and cannot be retroactively reclassified.

## Two distinct decisions inside that receipt

1. **Local admission retired:** commit irreversible no-new-edit/upload/rebind/new-send status under existing global61704/1439→actor735→ordered-row locks. Prevent a request that prepared MIME but has not yet claimed from claiming after retirement. Allow only exact operations already admitted before retirement to finish/register/provide results. Preserve snapshot/expected identity; no late response may recreate local working pointers or reopen admission.
2. **Bytes eligible:** privately reuse B's complete-evidence validation, object/reference mapping, SHA/version pinning and retention checks. An object can be dropped only when no actual admitted operation still needs its local bytes. Waiting source/upload results must be matched to the exact preaccepted file/intent identifiers; once they settle, pin resulting objects through those identifiers, not an Account/prefix scan. Missing/legacy/inconsistent evidence remains blocked, never guessed. Maintenance processes only accepted intents and does not generate authority.

Extract narrowly shared predicates from B rather than copying its schema/policy. Keep B's operator class/cardinality check around its existing entrypoints. C's internal receipts feed the same released/read/admission/metadata predicates and candidate/eligibility path, while local-retired-but-not-released needs a small separate predicate. Pending local-retirement fences must allow existing generation completion/upload registration; do not apply B's final bytes-released blanket local-write fence prematurely.

Unknown modern mail can become byte-eligible on explicit Exit when frozen evidence is complete and the actual admitted path has no further local reads, even if provider outcome is unknown. Preserve the unknown state and all reconciliation evidence. Actual retained source/upload dependencies remain protected. Shared/combined objects require each referenced preparation to be independently exited/retired/released/closed under valid authority before physical deletion; one child Exit does not authorize siblings. Preserve B's normal closed-email attachment rule and real remittance/Drive/legacy/business reference protections.

## Trusted completion without fabricated Sent

Use an internal server-only receipt source keyed by exact delivery/job and accepted-evidence identity for:

- Persisted successful **send** provider receipt from the existing submission path, including a claimed draft-send whose provider submission completed; or
- Existing validated verified_sent_evidence from full Gmail verification/manual matching, even if history confirmation remains pending.

Validate frozen sender/mailbox/identity/time and complete admission evidence; do not accept browser gmailAccepted, a loose sent_at field, Sheet date or arbitrary client delivery ID as authority. A Gmail **draft creation ACK is not a successful-send completion** and must not auto-retire merely on creation; it may retire through a fresh explicit Exit. Existing state/recorded flags remain truthful. No requirement for state=sent/recorded=true solely to release proven redundant bytes.

Request the same private retirement helper after durable trusted completion evidence is saved, including existing reconciliation recovery paths. Cleanup failures must not change send/history results or permit resend. Return a safe optional retirement receipt/projection in existing responses; existing completion callbacks may clear active work pointers once durable retirement is accepted, before Storage delete ACK. Physical pending/blocked/uncertain remains inspectable in existing operations/history. This is not a new user workflow or automatic save.

## Bounded qualification

One C implementation, one fresh review, existing CI after B review freezes. Minimum tests:

- Fresh marked Exit versus v1/bodyless/settled-protected replay; changed marker scope; exact immutable outcomes. Marked command-tombstone first request versus unmarked/terminal replay; no61705 lock inversion.
- Retirement-before-claim rejects a new send; claim-before-retirement lets its exact completion finish. Fail all local Storage reads after modern ordinary/combined/draft-send admission, stall/release the provider response, and prove bytes can retire without breaking the accepted result or triggering another POST.
- Real source/unregistered upload retains bytes until exact completion; completed timestamp alone/timeout cannot grant eligibility. Missing/legacy expectations remain blocked. Shared combined child needs independent sibling authority.
- Server provider-send ACK/history-pending and verified external Sent retire without recorded=true; draft-create ACK/client flag/Sheet date do not. Full Gmail/manual matching and all ordinary/combined/Sheet/history duplicate checks still work after deletion.
- Accepted original retirement intent advances through existing maintenance while A protected replay stays protected; no fresh abandon or backfill. Local pointers clear on accepted retirement, never reopen from late responses; F5/switch emits no intent.

No new tests of latest unsaved-edit persistence, human F5 repetition or universal crash guarantee. Objects without safe evidence remain protected with a precise reason. Existing post-deletion reconciliation cannot reconstruct missing/changed Gmail content and must retain its current honest error/review outcome.
