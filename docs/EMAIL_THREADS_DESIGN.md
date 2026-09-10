# Existing Gmail threads and conversation review

Owner approved continuing the next implementation step after real Drive validation. This is a bounded extension of the approved Email Composer, not a new mailbox product. PRODUCT_SPEC sections 17/20 and the Email Composer reference are authoritative. Continue in the owner-designated workspace and existing codex branch; no legacy resource changes.

## Chosen behavior

- Default is a new email. Staff can search existing conversations using the saved current draft's explicit To/CC recipients (exclude own address, BCC never broadens search). Search is manual, paginated and never scans the whole inbox on a timer. No OPERA email fallback.
- Preview subject, participants, dates and plain-text snippets before explicitly choosing the exact thread/parent message for this Hotel/Account draft. A matching address is a search aid, not automatic proof of account/invoice identity. Staff must confirm the displayed account context. No automatic thread selection from a similar subject.
- Thread metadata is obtained and validated in the Worker from Gmail. The browser supplies only provider IDs and the expected draft revision. The Worker requires overlap with the draft's explicit external To/CC recipients and rejects unknown/missing/ambiguous headers or unrelated threads.
- Choosing a thread saves a revision-bound selection and adopts its exact subject, preserving body/attachments/recipients. The UI disables subject editing while selected and offers Start a new email. The backend also rejects a changed subject or removed participant overlap before handoff. BCC is never added from thread participants; recipients remain manually controlled and visible in the send review.
- Existing-thread sends include provider threadId and validated In-Reply-To/References. Re-read the selected parent before handoff. Sent verification must prove the expected thread and reply header, as well as all existing recipient/body/file checks. Unknown outcomes keep the original command and never resend automatically.
- Read conversations on explicit preview/refresh. Show incoming/outgoing/unknown and whether a message explicitly references the selected parent. Thread membership alone is not proof that a reply covers every invoice. Read bounded metadata, not HTML, remote images or attachments. Report unavailable/oversize honestly; never silently truncate a conversation and call it complete.
- No reply changes billing dates, stage, balance, holds, KPI or remittance. The separate remittance record/allocation workflow is a later increment; no automatic classification from message text.
- Live diagnostic may continue only the app's own previously verified synthetic test delivery and must use the one-time recipient authorized in chat. Never persist that address in code/defaults. Diagnostic does not link a real account or create business events.

## Alternatives considered

Automatically pick the most recent matching subject was rejected because shared recipients and similar subjects can cross account/property scopes. A full inbox import with periodic polling was rejected for this increment because it adds storage and background work before explicit thread linking is established. The chosen manual search/preview keeps scope visible and uses existing Gmail permissions.

## Interface

Shared models: src/email/threads.ts. EmailDraft gains optional thread: ThreadChoice|null.

- GET /api/email/:draftId/threads?revision=N&pageToken=... -> ThreadList.
- GET /api/email/:draftId/threads/:threadId?revision=N&offset=N&historyId=H -> ThreadPreview. The first page returns Gmail historyId; subsequent pages require it unchanged or ask for a fresh preview. Gmail threads.get is not provider-paginated: these are bounded display slices of a complete metadata response.
- POST /api/email/:draftId/thread {revision,threadId,parentMessageId,confirmed:true} -> updated EmailDraft.
- POST same with threadId:null -> clear selection, retain current text/recipients, increment revision.
- Provider metadata and selection writers are service-only with owner, revision, reviewed package and pending-handoff checks. Client roles cannot write thread metadata. All routes use existing Worker authentication.

Public Google sources inspected: https://developers.google.com/workspace/gmail/api/guides/threads ; https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list ; https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get .

Review rulings: Participant overlap is checked on the exact chosen parent message, not the union of a conversation. A paginated preview is fenced by historyId so it cannot combine different thread snapshots. Oversized metadata/headers/references fail explicitly. A diagnostic reply has no supplemental files and must bind to the owned verified test delivery, its unchanged recipient hash and source identity, including in retry conflict checks.
