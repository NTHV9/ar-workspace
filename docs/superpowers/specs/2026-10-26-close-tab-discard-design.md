# Exit cleans preparation; reload and tab switching keep work

Minimal revision v2, 27 October 2026. Owner confirms exit means discard/cleanup and confirmed Sent should release temporary PDFs while important history/evidence remains. Existing F5 same-job resume is unchanged. No new editor persistence, session/claim/epoch registry, resource or retention rewrite. One exact create-command tombstone seam is necessary for close before a job response, as demonstrated below.

## Evidence and scope

Case pageswap-reload-close27 in the private qualification workspace now records actual Edge156 CUA reload: outgoing document e8ea2f68… pageswap(reload, activation=true) seq3, then pagehide(false) seq4; successor 972eb577… arrives as reload. Its later CUA close records pagehide seq2 without pageswap. These are non-destructive browser observations, not production cleanup proof. Native human F5 was not confirmed; do not claim it. No more human F5 tests are required for this scope.

Use PageSwap, not absence of NavigationAPI.navigate. Browser-UI reload intentionally lacks navigate; pageswap follows a different outgoing navigation path before pagehide. Any pageswap, including activation=null, suppresses close handling for that departure; null can be cross-origin navigation and is not close. Reset document-local state on pageshow/bfcache restoration, not a timeout. [HTML pageswap path](https://html.spec.whatwg.org/multipage/browsing-the-web.html#fire-the-pageswap-event).

For the qualified supported path, pagehide persisted=false without a preceding pageswap requests the same whole-preparation Exit semantics already used by the app. Cancelled beforeunload does nothing. Tab visibility/blur/minimize/app switching, idle/heartbeat, React unmount and Account/stage switching do nothing. Unsupported/ambiguous/no-event cases retain protected work; there is no crash/network-delivery guarantee or timeout deletion. Outgoing classification must not use current arrival performance.navigation type.

## Reuse the actual contract

Intentional Back to Collections/menu Exit itself authorizes preparation discard: remove only the preparation-edit confirmation in App's documentDirty-only navigation branches and BatchRoute.backToCollections. Continue awaiting actual abandon acknowledgment and existing unsafe-operation fences before navigating. Preserve unrelated settings/template/account/policy/remittance/provider-setting dirty confirmations and existing beforeunload/F5 behavior; no save-on-exit or extra workflow.

POST /api/documents/{exactJobId}/abandon already checks current actor/scope and exact job. SQL ar_document_abandon takes existing locks, returns closed jobs idempotently, checks protected mail before marking, durably sets discard_requested_at for pending admitted work, then calls ar_document_discard when safe. Combined-mail migrations extend these locks. Existing finalize/retention performs exact-object deletion and preserves shared/provider/history evidence. Reuse it for known jobs; do not replace it with a session/claim/epoch system. Only unreturned create commands need the narrow additional route below.

One small app-level coordinator receives verified currently active transient job IDs plus exact already-dispatched create command references: current single job, verified replacement, and every batch child/create. Reuse existing assertBatchJob/single-job identity checks while alive; compute/freeze each create reference before its POST. No fetch/create/save at unload. Stable real actor plus current authentication-session identity fences the snapshot; token rotation only updates its token ref. Identity/route changes fence stale responses.

This is whole-preparation Exit, not different per-tab ownership. Closing an actual tab can close the same preparation viewed elsewhere just as explicit Exit already does; existing shared-reference/file/provider guards still decide deletion. Do not invent tab claims. A genuine reload has no close outbox, so it follows existing resume. If a previous real close command exists, copied/restored resume must reconcile that exact job before resuming; accepted closed/discard-requested server state stays authoritative.

## Delivery and recovery

On qualified close, synchronously store bounded localStorage metadata per real actor and exact verified job ID or dispatched commandKey (version, owner/session identity, pending state/time; command references also carry hotel and canonical payload digest). Call existing fixed same-origin job abandon URLs bodylessly, or the exact command-abandon route below with a small body, using current Bearer token, POST, keepalive=true and redirect=error. No credentials/text/PDF/customer fields/arbitrary URLs/object keys enter metadata. Dedupe resolved job/command references and bound to20 batch children plus replacement. No unload-aborted signal; retain authorization/Origin safeguards.

Outbox persists before dispatch; no shared active-tab pointer or unresolved-entry eviction. Reconcile after same-actor authentication using current authorization and verified exact job reads. Retry only idempotent abandon, not create/save/send/print/upload. Match response job identity and outcome:
- discarded: terminal; existing endpoint starts bounded cleanup.
- pending: durable discard request accepted; existing finalize/maintenance owns later cleanup. Job stays unavailable for resume until safely closed.
- protected: terminal for this close request, no automatic future discard retry. Keep provider evidence and history; remove the exited active-preparation pointer, not its business record.
- transport/auth/invalid receipt: retain unresolved metadata, show recovery state on return and do not silently resume that exact job.

Outbox/accepted-close reconciliation gates only those exact jobs; unrelated work continues. Do not clear existing resume metadata merely because fetch was invoked. PageSwap reload must produce no outbox and no POST, including slow bootstrap. Other-session/actor responses cannot clear pending state or resume another actor's job.

## Necessary small seam: close before create response

Concrete gap: BatchRoute.leave refuses requested&&!jobId, while CreateDocumentDialog/BatchRoute already retain a commandKey before POST. worker/documents/jobs.ts calls ar_document_create_v5 then dispatches; a lost response can leave a created job without a browser-known ID. Leaving this indefinitely without a cleanup request does not meet the owner's latest instruction.

Add POST /api/documents/commands/{commandKey}/abandon, body {hotel,payloadDigest}, with current real actor and regional authorization. Compute the digest before dispatch from a versioned canonical tuple of the existing create request fields (hotel, accountId, ordered ids, content, layout, purpose, statementSource), excluding server-selected template versions. Persist only commandKey/hotel/digest in the close outbox, never full customer payload. Existing create requests carry/derive the identical tuple; the server recomputes rather than trusting a supplied hash.

One small forward migration adds a private exact-command close tombstone and service-only RPC. Reuse the existing owner+commandKey advisory lock (hash seed61705), document_commands lookup and existing abandon/combined admission locks in a reviewed consistent order. Bind tombstone to real actor, authorized workspace owner/hotel and digest; a different payload/actor must not hijack the command. SQL repeats current membership/region authorization, not just browser claims. No bulk lookup or arbitrary command cancellation.

If the command already resolves to a job, verify its stored payload scope and call existing ar_document_abandon for that exact job. If close arrives first, record the tombstone; ar_document_create_v5 checks it atomically under the same command lock before new admission and refuses that canceled create without dispatch. If create wins first, close resolves it even before the browser response and durably requests existing pending/finalize cleanup. Already-admitted generation/upload may settle normally; do not suppress its completion into a forever-pending state. No repeated print/create/send, new Workflow, claims, epochs, or account-wide scan. Same-command retry reconciles the tombstone/result. Synthetic concurrency tests must prove both orderings and altered-payload rejection.

## Sent behavior and the one demonstrated timing gap

Existing document_close_sent (latest definition in 20261025190057_ar_combined_email_consumers.sql) closes single and combined transient jobs after confirmed non-test Sent when pending-mail guards permit. retention_transient_eligibility makes eligible originals/exports due immediately, preserving exact shared references. sweepTransientDocuments currently runs in the existing15-minute maintenance path. Thus closure/eligibility already exist; physical deletion is not guaranteed immediately on Sent.

The narrow missing behavior is immediate cleanup initiation from confirmed Sent UI: when a result is actually state=sent and recorded=true, verify the exact known job is already closed_reason=sent, then call the existing abandon endpoint for that already-closed job. Its idempotent closed receipt starts cleanupTransientDocument via waitUntil. Do not call discard on an open protected job, treat gmailAccepted alone as Sent, or change financial/history results on cleanup failure. For combined mail use its verified child IDs. Existing scheduled reconciliation/maintenance remains the durable fallback when browser closes, requests fail or more objects remain than the bounded pass. No schema or retention-policy change is justified.

“Immediate” means request/start safe cleanup now, not proof every provider byte disappeared synchronously. Retain actual Sent/business history, unknown/Draft evidence, shared references and legacy/Drive/remittance policies.

## Acceptance

One bounded implementation, one fresh review, existing CI. Automated real browser tests must observe PageSwap reload suppression versus close with an independent living server, plus existing same-job reload, tab switching, bfcache return, cancelled beforeunload, dirty/no-warning paths and unsupported fallback. No human F5 repetition and no CUA bypass.

Test exact single/replacement/all-batch IDs and command keys, actor/session races, lost response/retry, close-before-create and create-before-close, pending upload/generation/save and protected mail. Test confirmed single/combined Sent starts existing exact cleanup; gmailAccepted/unknown/test mode does not. Assert no additional sends/prints/uploads, no history mutation, no broad deletion. Keep existing SQL abandon/combined/retention tests and normal CI; no editor-persistence tests.
