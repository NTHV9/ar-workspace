# Closed preparation attachments and approved old-PDF byte release

Proposed, 27 October 2026. Separate owner-authorized operation; implement only after exit-cleanup A and its fixes are frozen. Source inspected: deployed95fd6b4 feasibility review and A commit fb56ed3. Re-read the final frozen baseline before coding. Existing migration147 (20261026184003_ar_document_command_abandon.sql) is not applied yet and must not be edited; create the next migration with the CLI.

## Objective and non-goals

The exact old-work cohort is **20 explicitly approved preparations**: four zero-attempt jobs already discarded, plus sixteen protected jobs. Parent's fresh metadata shows normal maintenance deleted10/12 objects of the four; the remaining two are temporary jobs/{approvedJob}/email/* objects blocked by retention_source_open, not active mail. Keep actual IDs private and reverify at operation time. Release only remaining approved objects, retaining mail attempts, expected MIME evidence, verified proofs and all business/Sheet/history. The sixteen's aggregate3 draft/created +4 draft/review_required +9 send/review_required remains context, not an admission test.

The same bounded B migration also fixes the demonstrated systemic gap for **already-closed transient preparation email/supplemental attachments** after confirmed Sent or explicit Exit. No employee UI, generic pending/unknown-mail exception, customer PDF backup/local copies, Gmail send/delete, account-wide purge or extra resource. The operator exception stays exact to the old sixteen; ordinary safe closed-preparation cleanup remains separate.

Billing and Follow1–3 remain Sheet-authoritative. A Sheet date neither proves Gmail Sent nor changes the release predicate. Do not synthesize Sent, reset mail to unsent, update Sheet dates, resend or recreate a preparation to facilitate cleanup. A future actual Gmail Sent confirmation must still pass existing evidence, uniqueness, workflow and Sheet integration checks.

## Why a distinct byte-release receipt is necessary

worker/email/delivery.ts checkDelivery and worker/email/sent-review.ts compare Gmail content/attachments with retained snapshot.expected; they do not need local PDF bytes. ar_mail_confirm_sent uses retained workflow/manifest evidence, not Storage content. Conversely sendExistingDraft calls prepareMail/readMailFile to rebuild MIME: further app sending/editing of a released package must be denied, while reconciliation remains allowed.

Do **not** use unused_preparation_dispositions or weaken its guards. Its blanket mutation trigger includes mail_deliveries and would prevent future proof/state/history reconciliation; its never-attempted text scrub is also inappropriate. Do not globally change document_pending_mail or A's Exit/command-admission logic. Full feasibility/source references are in the ignored sixteen-pdf-release-review.md.

## Demonstrated normal-retention defect and narrow repair

In20260911104715_ar_transient_documents.sql, retention_transient_eligibility recognizes only originals|exports, and its comment deliberately retains supplemental files under the old month policy. In20261008110000_ar_document_abandon.sql, ar_document_cleanup_job_candidates uses that same two-directory filter; inspect/update the installed global candidate path too. Thus a closed preparation's email attachment falls back to financial-balance/month rules and can remain despite successful Exit/Sent. The owner's latest instruction supersedes that old supplemental policy only for app-owned temporary preparation attachments, not primary remittance/Drive/legacy/business files.

Extend the **normal closed-transient** eligibility and both exact-job/global candidate enumerations to include receipt-verified email/supplemental objects belonging to those preparations. Closure is the completion basis; never force AR balance to zero or require financial closure for these temporary files. Preserve current owner, immutable object/version/SHA, pending-mail, upload, source and shared-reference guards. Resolve every reference before admitting deletion, not just its path.

The reference mapping is important: retention_storage_receipts in20260910213928_ar_file_retention.sql records kind=email_attachment with reference_id equal to **ar_email_drafts.id**, not attachment ID. Resolve that draft then its document_job_id, as for email_draft; require matching owner, closed transient job and existing pending/upload protections. Unknown, outside-owner, genuinely live/shared, remittance, Drive or legacy references remain protected. A file copied/shared into a real business record does not gain temporary status from an email path. Preserve existing combined-delivery reference checks. No retroactive discard of an open job and no generic future unknown-send override.

## Minimal operator contract

One approved cohort, exactly20 distinct job IDs, supplied privately after fresh inventory; no IDs/payloads in migration/source/logs/Git. Pin two membership classes: four ordinary already-discarded/no-attempt jobs and sixteen authorized pending-mail byte releases. The former use the repaired normal closed-transient rules, not an invented expected MIME record; zero remaining objects is valid and already-deleted objects are not recreated. Only the latter receive the special evidence-pinned retention exception. Persist immutable cohort ID/member-set digest; no substitution or scope expansion if a member/object is blocked.

Provide service-only RPCs:

- ar_pdf_byte_release_preview(p_actor, p_cohort_id): no mutation. Return safe counts/blocker codes, current inventoryDigest and the exact bounded private object manifest to the operator. No PDF download or original mail text in the response.
- ar_pdf_byte_release_commit(p_actor, p_cohort_id, p_command_id, p_inventory_digest): atomic admission and immutable release receipts. Identical command/digest replays return the same result; changed input or fresh evidence/object differences conflict. It does not delete bytes inside SQL.
- ar_pdf_byte_release_status(p_actor, p_cohort_id): counts and exact-object state/acknowledgment for private verification; no broader search.

Use the existing operator/Worker authentication path to establish the **real confirmed ar@katathani.com administrator**, not mapped workspace-owner identity or a caller-supplied email. Only the trusted service role executes RPCs; SQL independently verifies the administrator and exact cohort owner. No anon/authenticated grants. If an HTTP bridge is needed, add only admin POST preview/commit and GET status under existing /api/operations, retaining Origin/auth/bounded-body checks; no frontend page. The trusted operator privately installs the one approved member list; never add an unrestricted employee endpoint accepting arbitrary jobs.

## Receipt, fences and cleanup

Use small private cohort/member/object receipt tables with RLS/revokes. Pin job revision/fingerprint, exact delivery IDs and admission snapshot/identity hashes (including non-Sent rows), existing verified proof, and exact Storage object ID/key/bucket/size/SHA/version/reference fingerprint. Retain original metadata rows; do not duplicate whole MIME/customer payload into new logs or returned reports. Keep per-object requested/claimed/uncertain/acknowledged/deleted evidence through the existing retention ledger.

Commit takes established global61704/1439 then actor735 and exact row locks. Under those locks recheck:

- Each member is in the approved cohort, belongs to the administrator workspace, and matches preview identity/revision/digest.
- Every affected delivery in the protected-sixteen class has complete admitted expected identity/message fields and per-attachment name/size/SHA, plus workflow/business snapshots. Compare original admission metadata; never reconstruct it from composer/Sheet. For the four normal-closed members prove the zero-attempt/closed status and exact receipts instead; do not fabricate a delivery.
- No active create/generation/new send/draft-send claim, outstanding file intent or unresolved upload that still requires the bytes. Recheck actual per-job activity and admission markers; old review_required is neither active work proof nor safe-release proof. Preserve unknown mail outcomes as metadata; do not require claiming they were sent.
- Every selected object is a temporary PDF, exactly pinned and referenced only by jobs/deliveries in the authorized cohort. Any outside-cohort, remittance, Drive, unrelated business or unknown reference protects that object. No directory/prefix deletion.

Record release intent and permanently fence **new local work on those packages**: document review/edit/upload/rebind, draft/combined changes, new ordinary/combined provider claims and app sendExistingDraft. Old requests that prepared MIME before commit must fail their later admission under the same locks. Existing already-admitted completions and Gmail proof/state/history recording remain permitted. Do not change real job closed_reason/mail status merely to acquire retention eligibility; expose a separate bytes_released/retired-package marker in existing projections/file APIs and return a clear unavailable response for local file/edit operations. No resume or new-send capability returns after release.

Freeze admitted snapshot/expected/identity fields for released non-Sent deliveries without freezing legitimate state, provider receipt, verified proof or history progression. Keep existing immutable-Sent and combined-evidence guards. Release protection must not block ar_mail_record, ar_mail_record_verified_sent/review, ar_mail_reviewed_sent, ar_mail_confirm_sent or legitimate document_close_sent completion. Do not blank draft text/recipients, remove mail rows/references or delete historical reports.

Separately from the repaired normal closed-transient supplemental path, add an exact-object eligibility branch for committed **sixteen-class** release receipts. Only those authorized objects may waive pending-mail/local-open/age policy; all target/version/SHA/reference/current-upload/admission checks remain. The four ordinary-closed members need no pending-mail waiver. Extend exact-job/global candidate queries with both correctly mapped normal email objects and pinned exceptional release objects. Reuse retentionProviders/runRetentionItem/maintenance; no new Workflow/cron or storage.objects deletion. Worker bounded-memory hash inspection creates no local PDF copies/backups. Ambiguous deletion remains uncertain with existing acknowledgment retry.

## Qualification and operator execution

One bounded implementation, one fresh review, existing CI. Synthetic real SQL plus fake-Gmail/Storage tests must prove:

1. Exact20 cohort membership distinguishes four zero-attempt closed jobs from all three observed protected mail-state classes. Already-deleted objects replay safely; the four's remaining email objects use normal closure eligibility. Protected mail evidence/status stays unchanged; incomplete evidence/live claim/upload/outside-cohort references block the exception.
2. With local Storage PDF reads unavailable after deletion, accepted-send, full Gmail attachment and manual rewritten-ID verification still work; wrong hashes/recipients/body, absent Gmail message and workflow-changed cases retain their existing outcomes. Ordinary/combined confirmation preserves duplicate and Sheet/history checks.
3. No app draft-send/new claim/edit/upload/rebind after release; concurrent claim-first blocks commit, release-first blocks claim. Existing result/proof updates still succeed.
4. Preview/commit drift, actor spoofing/staff calls, changed replay and exact object replacement are rejected; repeated identical commit is safe; lost delete acknowledgment never becomes presumed deletion. Existing retention regressions pass.
5. No-attempt explicit-discard and confirmed-Sent transient email attachments are promptly eligible/candidates even with nonzero AR balance; email_attachment reference_id maps through the draft. Pending mail/upload and an actual remittance/Drive/legacy/unrelated live shared reference reject normal deletion. Generic future review_required/unknown jobs remain protected without a sixteen-class operator receipt.

After reviewed deployment, operator previews only the approved20 and remaining objects, commits unchanged verified inventory and invokes bounded cleanup. Report the four's normal-closed cleanup separately from the sixteen's exceptional byte release, with already-deleted/newly-deleted/blocked/uncertain counts, bytes and acknowledgment proof. Preserve all mail/Sheet/business records and private IDs. Systemic change is limited to normal already-closed transient preparation attachments; the pending-mail exception does not generalize beyond the approved sixteen.
