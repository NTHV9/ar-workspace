# Workflow completion audit — 10 September 2026

The application has working receivables, document, email, template, remittance and Drive workflows. The remaining required work is concentrated in collection policy/exception handling, complete source-backed daily reporting, account-level history/recovery access, retention, and release evidence. Rebuilding the already shipped thread reader or remittance module would duplicate completed work.

## Scope and evidence standard

- Read-only source/workflow audit at local HEAD `d526733c37be1a98ea4c4bf482fcbe666691706d`. This document is the only file written by this audit. No application changes, provider requests, customer actions, screenshots or tests were performed during the audit.
- The latest recorded deployed application source is `0eb387d5651d0d134d4df1681a8d02f0677cb9f4`, in [PROJECT_STATUS](PROJECT_STATUS.md), checkpoint 20:08 ICT. Deployment/provider outcomes below are attributed to the existing verification records, not a fresh live inspection.
- Authority: [PRODUCT_SPEC](PRODUCT_SPEC.md), [DECISIONS_AND_OPEN_ITEMS](DECISIONS_AND_OPEN_ITEMS.md), current owner instructions and the latest checkpoint. The old handoff checklist and old “remaining work” paragraphs are evidence to reconcile, not proof that a feature is absent.
- Latest owner decisions supplied for this audit: reopened invoices retain their first billing/reminder history and enter **Needs Review**; receipt money and invoice-applied money must be shown separately; **Statements use only the system renderer, while Invoices remain from OPERA**; files in **Supabase and Drive are retained for one calendar month after work is completed, with no quota overage or additional cost**. The owner subsequently confirmed completion eligibility: all linked invoices verified zero, no pending email/document work, then one calendar month before deleting app-owned bytes while preserving history. Destructive cleanup remains disabled until the confirmed policy is implemented and tested. These decisions supersede older native-Statement and retention-OFF requirements; do not ask those settled choices again.
- “Implemented” means a source path exists. “Tested” names its recorded synthetic/database/provider proof. “Complete” here does not mean that customer mail or customer remittances were used as test data: the owner explicitly required isolated/synthetic tests.

## Completed increments that must be retained

| Workflow | Current implementation | Recorded acceptance and limits |
|---|---|---|
| Portfolio and Account | Hotel-separated comparison, Account Type filters, separate Guest/Invoice/Folio columns, source freshness, scoped selection and account return context. | [PROJECT_STATUS](PROJECT_STATUS.md), first-increment/refresh checkpoints; [responsive browser cases](../tests/browser/responsive-operations.spec.ts). Do not reintroduce demo data as an error fallback. |
| Billing rules and recipients | Account Overview provides nullable requirement/term, separate Billing/Collection To/CC/BCC, By Email/By System, portal and instructions. Initial settings are applied to unassigned old/new invoices; assigned terms stay pinned. | [ACCOUNT_SETTINGS_VERIFICATION](ACCOUNT_SETTINGS_VERIFICATION.md), [BILLING_CHANNEL_IMPORT](BILLING_CHANNEL_IMPORT.md). The later import configured 104 matching Hotel/Account identities; earlier “settings all empty” statements are historical. Remaining missing source recipients are data completion, not missing recipient-editor functionality. |
| Default collection queue | Billing, collection, urgent, upcoming, setup and review views; exact invoice drill-down; latest sent versus next action; fixed default calendar progression; no automatic sender. | [COLLECTION_QUEUE_VERIFICATION](COLLECTION_QUEUE_VERIFICATION.md); [collection tests](../tests/collection-queue.test.ts). Current cron is 15-minute sent reconciliation, not the old five-minute value in its original test narrative. |
| PDF preparation/editing | Native Invoice/Folio source, selected manifest, three content/layout choices, explicit workspace Statement generation, editable fixed pages, draft/reopen, actual export preview and acknowledgement, private downloads. | [DOCUMENT_PACKAGE_VALIDATION](DOCUMENT_PACKAGE_VALIDATION.md), [WORKSPACE_STATEMENT_INTEGRATION](WORKSPACE_STATEMENT_INTEGRATION.md), PDF checkpoints in PROJECT_STATUS. Native Statement transport was unverified, but the owner has now removed it from the required path; the remaining task is to align the selector/backend with system-only Statements. Fixed-page editing is not automatic Word paragraph/page reflow. |
| Email and templates | Explicit Create Gmail draft/Review & Send Now; recipient/body/file review; durable claims; SENT verification; supplemental files; versioned, editable rich-text templates. | [GMAIL_SEND_VERIFICATION](GMAIL_SEND_VERIFICATION.md), [SUPPLEMENTAL_ATTACHMENTS_VERIFICATION](SUPPLEMENTAL_ATTACHMENTS_VERIFICATION.md), [UNATTENDED_COMPLETION](UNATTENDED_COMPLETION.md). The rich-text and existing-thread gaps in the older send report have since been closed. |
| Gmail threads and incoming replies | Explicit saved-recipient search, exact parent confirmation, subject lock, metadata/snippet pages, incoming/outgoing labels, explicit reply-reference evidence. No HTML or inferred settlement. | [EMAIL_THREADS_VERIFICATION](EMAIL_THREADS_VERIFICATION.md): actual outgoing reply and incoming owner reply were verified. Normal customer-account threading was covered with fixtures/rollback data, not customer sends. |
| Remittances | Global/account entry, pending/activity/all, exact invoice links, optional amounts, deduplicated summaries, correction/history, void/restore and private PDF/PNG/JPEG evidence. | [REMITTANCE_VERIFICATION](REMITTANCE_VERIFICATION.md): 21 browser cases, real rollback routines and isolated live storage proof. One notice/three invoices/30,000 and overlapping links were tested. Entry remains explicit; no OCR, inferred cash or auto-hold. |
| Drive | Separate OAuth, confirmed folder/visibility check, complete reviewed-export archive, exact-ID retry and synthetic upload/read-back/trash proof. | PROJECT_STATUS 17:46 checkpoint and [DRIVE_ARCHIVE_PLAN](DRIVE_ARCHIVE_PLAN.md). Automatic archive/cleanup is currently OFF. Cleanup now needs implementation and testing of the confirmed one-calendar-month completion policy; automatic archive was not requested. |
| Reports currently available | Current positive receivables and verified Gmail sending activity, Thai dates, Hotel/Type/Account filters, exact invoice history, pagination and return context. | [UNATTENDED_COMPLETION](UNATTENDED_COMPLETION.md), [report browser cases](../tests/browser/reports.spec.ts). These are not complete arrival/payment/clearing reports. |

## Required completion gaps

### WF-1 — Configurable, versioned collection rounds

**Required by PRODUCT_SPEC §10 and acceptance E49–50.** Templates can change wording, but they cannot add/remove/reorder rounds or change their offsets. The fixed stages are encoded in [collection.ts](../src/domain/collection.ts), lines 3–4 and 20–28; [templates.ts](../src/email/templates.ts), lines 2–12; [HistoryEditor](../src/settings/HistoryEditor.tsx), line 9; [settings API](../worker/settings/api.ts), lines 13–16; [delivery](../worker/email/delivery.ts); and the `last_reminder_stage` constraint in [ar_account_workflow](../supabase/migrations/20260909160000_ar_account_workflow.sql), lines 6–12. Subject/body template versioning is already implemented and should be reused.

Complete with stable round identities, a versioned active sequence and configurable date offsets. Retire used rounds for future work without deleting old labels/dates/content. Queue progression, stage pickers, template association, send claims and reporting must consume the same policy. Time alone must not skip an unsent round. Keep Final→Urgent while an invoice remains open.

Acceptance: edit an interval; add a round; retire a previously sent round; retain the earlier sent version; ensure a pending delivery cannot change stage interpretation; verify current-stage count versus next-action count without duplication. No auto-draft or auto-send.

### WF-2 — Explicit invoice notes, disputes and holds

**Required by PRODUCT_SPEC §10 and acceptance E55.** [InvoiceWorkflow](../src/domain/portfolio.ts), line 27, has billing/reminder fields only. [AccountSettings](../src/settings/AccountSettings.tsx), lines 11–28, has account instructions; those are not per-invoice disputes/holds. [nextCollectionAction](../src/domain/collection.ts), lines 10–28, has no human hold. The queue design correctly discloses that its prototype “On hold” tile is not implemented.

Add exact Hotel/Account/Invoice notes and an explicit hold/release command with reason, optional review date and revision/history. Show held debt in balances and a discoverable held/review population; prevent it from silently becoming absent work. A Gmail reply or remittance must never create the hold automatically. Do not repurpose account billing instructions as invoice hold state.

Acceptance: hold one of several invoices, retain full financial totals, show the reason/date, release with history, reject stale writes, and prove that reading a reply/recording a remittance changes none of these states.

### WF-3 — Reopen preserves history and requires human review

**Required by the latest owner decision and PRODUCT_SPEC §11.** The existing workflow trigger uses `on conflict do nothing` for invoice history initialization and only assigns missing rules ([ar_account_workflow](../supabase/migrations/20260909160000_ar_account_workflow.sql), lines 20–28). This already preserves history. Refresh republishes a positive source invoice as verified; [nextCollectionAction](../src/domain/collection.ts), lines 10–28, then resumes its old progression or Urgent. There is no cleared→positive review flag or acknowledgement action.

Detect a verified zero/cleared→verified positive transition on the same stable identity during atomic publication. Preserve first billing date, pinned terms, due date and reminder evidence; set a durable Needs Review reason. Add an explicit reviewed resolution that determines when normal work can resume, without inventing a new arrival or sending anything. Missing/error→positive is not automatically the same evidence as cleared→positive.

Acceptance: zero→positive with prior Follow-up 2 and prior Final; unchanged old dates; one arrival identity; review remains after refresh; human acknowledgement is revision-bound; no automatic resend.

### WF-4 — Durable arrival, clearing, receipt and application history

**Required by PRODUCT_SPEC §§6, 11, 13, 19 and acceptance C33/F62–64/F67–68.** The current refresh validates invoice/payment history but persists a current account/invoice snapshot. [read-snapshot.ts](../worker/refresh/read-snapshot.ts), lines 33–102, reconciles current open membership and explicitly recovers zero rows for previously known nonzero invoices (lines 81–100). It does not store all invoice arrivals, receipt transactions or payment applications. [Reports](../src/reports/Reports.tsx), lines 14 and 53–64, and [reports API](../worker/reports/api.ts), lines 3–4, expose only current/activity/options, with activity sourced from verified mail events. [CONNECTION_RUNBOOK](CONNECTION_RUNBOOK.md) also states that validation history is not a durable history import.

Build a bounded, restartable source-history importer with stable Hotel/Account/transaction identities and explicit completeness intervals. Keep:

- Invoice entry on its OPERA transaction date, including an invoice created and cleared between refreshes; initial backfill is not “today’s arrivals.”
- Verified zero observations/cleared-invoice counts with their observation interval, separate from money.
- **Receipt money** on the verified receipt/payment date, including a visible treatment of unallocated amounts and reversals.
- **Applied money** on verified invoice applications, with distinct applied-invoice counts only where the mapping is proven.

The choice to display receipt and applied totals separately is now settled. Remaining work is source verification, reversal/unallocated semantics and implementation, not asking which of the two totals the owner wants. Do not derive either from cumulative invoice payments, AR decrease, remittance amounts or the face values of cleared invoices.

Acceptance: arrivals 20 / first-billed today 35 / current unbilled 80 remain independent; invoice 100,000 with earlier 90,000 and today 10,000 produces today receipt/application 10,000 and one cleared invoice when source evidence supports each; no guessed paid-invoice count without mapping; corrected/backdated facts update their source date without duplicate identities.

### WF-5 — Complete daily reporting and aging/drill-down measures

**Required by PRODUCT_SPEC §§13–14/19 and acceptance F61–64/F69–70.** Once WF-4 has reliable facts, add the missing reports instead of filling existing cards with proxy numbers. Current report summaries contain positive-open, unbilled count, urgent count, stage and sent-day data ([Reports](../src/reports/Reports.tsx), lines 53–64; [ar_activity_reports](../supabase/migrations/20260909205630_ar_activity_reports.sql)). Remittance received/pending views are already separate and complete for their scope.

Still needed: daily arrivals; daily verified clearing observations; separate receipts/applications; daily AR/aging snapshots for trends; over-60-day unbilled drill-down; unbilled age, first-billing delay, days overdue, days since last reminder. `overdueDays` is computed in [collection.ts](../src/domain/collection.ts), lines 13–14, but not rendered in the current queue. Account/Portfolio already expose OPERA over-90 totals; do not call that entire requirement missing. The collection read view currently omits numeric OPERA `age` ([ar_collection_queue](../supabase/migrations/20260909182000_ar_collection_queue.sql), lines 1–7), so over-60 filtering needs that source value rather than a replacement due-date calculation.

Use exact Hotel→Type→Account→Invoice drill-down and count/amount labels for every added metric. Persist the actual snapshot timestamp and Thai date; a morning snapshot must not be called an end-of-day balance. Keep staff SLA, document waiting and individual productivity metrics out of scope.

### WF-6 — Explicit external billing provenance and accessible history

**Required by PRODUCT_SPEC §9 and acceptance D44, plus the approved account history surface.** [HistoryEditor](../src/settings/HistoryEditor.tsx), lines 5–9, records first billing date and latest reminder/date, with no channel/reference/reason fields. It is valid for the owner’s historical backfill and already supports a By System date, but it does not yet distinguish a newly completed external billing action from correction of old history. Reports explicitly exclude manual corrections from current-day actual-send statistics ([Reports](../src/reports/Reports.tsx), lines 29 and 60).

Add a reviewed “Record actual external billing” fact with exact invoices, actual date, channel and human reference; keep correction reason/history separate. Include actual external first billing in billing activity using an explicit source label, while never fabricating a Gmail send. Preserve first billing on resend/correction. Expose billing/reminder corrections and actual sends in an account/invoice history reader rather than only current editable fields.

Acceptance: a By System invoice can be billed without Gmail; one of three invoices affects only itself; a later correction does not create a fake send or reset first billing; history shows its source and correction chain.

### WF-7 — Finish account navigation and conversation discoverability

**Required completion of the existing account surface; a full inbox product is not required.** [AccountDetail](../src/AccountDetail.tsx), line 36, renders **Collection History** and **Documents & Gmail** as noninteractive spans. The actual routes currently exist elsewhere: reports history, global paginated Documents, and thread review inside an opened Email Composer. [App](../src/App.tsx), lines 157–159, has no account history/inbox/operations route. Remittances already has a working account entry and return context.

Turn the two visible account labels into real scoped destinations. Collection History should show exact invoice history with source labels. Documents & Gmail should show the account’s saved document jobs, reviewed exports, draft/delivery status and linked conversations, retaining Hotel/Account context and pagination. Staff should be able to review an incoming reply against an existing invoice conversation without starting a new document-preparation action merely to find it. Unknown/unmatched references must remain reviewable, not treated as settlement.

The manual thread reader and actual incoming-reference proof are complete ([EMAIL_THREADS_VERIFICATION](EMAIL_THREADS_VERIFICATION.md)). Periodic scanning of the entire inbox, automatic reply classification, OCR allocation and automatic reply→hold are **optional/unapproved extensions**, not a reason to mark the existing reader incomplete. A unified reply review queue can be built from explicitly linked conversations if needed, preserving manual financial interpretation.

### WF-8 — Actionable exceptions and uncertain-handoff recovery

**Required operational completion of the no-duplicate workflow, not permission to add resend shortcuts.** Local retry/check paths already exist for refresh, document dispatch, Gmail, Drive and remittance. [CollectionQueue](../src/CollectionQueue.tsx), line 49, displays reconciliation status and counts; [ar_mail_reconcile_status](../supabase/migrations/20260909181500_ar_mail_reconcile_schedule.sql), lines 37–40, returns waiting/review counts, not a navigable list. The scheduler excludes review-required deliveries (same migration, line 17). [EmailComposer](../src/EmailComposer.tsx), lines 61–70, offers a status check and locks edits after handoff; [GMAIL_SEND_VERIFICATION](GMAIL_SEND_VERIFICATION.md) states that permanently unavailable evidence remains unresolved.

Provide a scoped exception list with links back to each command, reason, evidence, last check and permitted next action. In particular, define a reviewed outcome for changed Gmail content/workflow, deleted or abandoned drafts, and uncertain document generation. It must be possible to understand and resolve a blocked workspace without editing private tables. Never equate a missing draft with SENT, convert unverified attachments into a billing event, or reset an uncertain command to resend. Backend terminal outcomes and explicit human decisions are needed before presenting a recovery button.

A consolidated Operations page matches the supplied supporting-surface design, but its exact placement is flexible. The required result is reachable, truthful status and safe recovery; a decorative operations dashboard alone does not complete it.

### WF-9 — Close the mobile and unsaved-work gaps

**Required by acceptance A14 and the approved mobile companion boundary.** Current Portfolio/Account/Queue/Reports/Email/Threads/Remittance responsive work has substantial 1440/1280/390 fixture coverage. Do not describe mobile as entirely absent. [responsive-operations.spec.ts](../tests/browser/responsive-operations.spec.ts), lines 4–20 and 58 onward, checks page overflow, focus and touch targets; [REMITTANCE_VERIFICATION](REMITTANCE_VERIFICATION.md) records exact viewport captures.

Two remaining concrete issues:

1. The mobile reference notes explicitly place full PDF editing/email handoff on desktop ([CODEX_DESIGN_NOTES](../references/design/CODEX_DESIGN_NOTES.md), lines 277–281). The current PDF workspace still exposes its full editing tools, with a narrow breakpoint grid of `175px minmax(320px,1fr)` and small toolbar controls ([pdf-workspace.css](../src/pdf/pdf-workspace.css), `@media(max-width:900px)`; [PdfWorkspace](../src/pdf/PdfWorkspace.tsx), lines 156–167). No production PDF editor test at 390px was found. Implement the stated companion boundary—status, safe preview, save/resume-on-desktop—or explicitly validate an owner-approved mobile editing flow. Do not assume that horizontal compression of the editor satisfies it.
2. Account settings and invoice history edits do not participate in the App’s dirty-work guard. [App](../src/App.tsx), lines 78/152, guards Templates and Remittances only; lines 85/101/159 reload and replace Account content with the loading branch during same-user token refresh. [AccountSettings](../src/settings/AccountSettings.tsx) and [HistoryEditor](../src/settings/HistoryEditor.tsx) retain local form state only. Add navigation/token-refresh preservation for those forms, with explicit discard and recovery tests. This is a code-level risk identified by inspection, not a newly executed browser failure.

Mobile reply awareness, new hold/reopen review and recovery routes must join the same focus/overflow/return-context suite as they are added. This does not require a native mobile app or push notifications.

### WF-10 — Remaining provider/release proof

These are acceptance work or genuine external limits, not reasons to rebuild working UI:

- **Align the Statement path with the latest decision:** [DocumentRoute](../src/DocumentRoute.tsx), line 21, still offers an unavailable native Statement choice. Remove that choice for new requests and make the existing system renderer the explicit Statement path in both UI and backend validation/defaults. Keep Invoices/Folios on their verified OPERA path. Preserve the provenance of earlier jobs; do not relabel old native attempts as system-generated output. Native Statement API discovery is no longer a completion blocker or required research task. Non-reservation/ambiguous Invoice/Folio cases still need truthful supported/unsupported coverage.
- **Included backup/restore:** PRODUCT_SPEC §21 and acceptance H96–98 still require verified entitlement, a non-destructive restore rehearsal, documented DB versus object bytes/credentials/provider-action coverage, and post-restore Gmail reconciliation preventing duplicate sends. No completed restore proof was found in the current verification records. Do not buy PITR or a paid project as an implicit workaround.
- **Auth recovery:** Google/password same-user login is already proved. Password-reset/recovery configuration and UI are not visible in App; INTEGRATION_VALIDATION explicitly calls for checking the Supabase recovery-mail setup. Add/verify recovery as an operational login completion, distinct from AR Gmail sending; do not infer a paid mail provider requirement.
- **Provider evidence scope:** isolated Gmail/Drive/storage proof and real SQL rollback coverage are recorded. New workflow acceptance must preserve the owner’s no-customer-test constraint. Synthetic/source-backed tests and isolated diagnostics are legitimate evidence; they must not be described as customer production sends or reconciled customer remittances.

### WF-11 — One-month completion-based retention within existing quotas

**Required by the latest owner decision; not yet implemented/enabled.** Storage and Remittance currently retain removed bytes; [DriveStorage](../src/drive/DriveStorage.tsx), line 83, explicitly says automatic cleanup is disabled. [REMITTANCE_VERIFICATION](REMITTANCE_VERIFICATION.md) describes retained/reserved byte quota and no purge. Those accurately describe the shipped state, but no longer describe the final requested policy.

Implement one shared eligibility model for files in Supabase and Drive, using the owner’s confirmed one-calendar-month-after-completion rule: every linked invoice is verified zero and no email/document work is pending. Delete only this app’s bytes and preserve historical facts. Root’s safety design also protects held/disputed/review-required work until explicitly resolved. A verified reopen must invalidate the previous completion eligibility and cannot inherit an old deletion clock. No deletion may start until this policy, exact targets and race guards have passed validation.

The implementation must inventory exact owned file IDs/keys, show eligible and protected reasons, calculate existing-plan usage, keep command receipts and explicit deletion outcomes, and recheck eligibility before destructive execution. Preserve business event/history summaries and unresolved-send dedup evidence. A file link removal is not itself proof that the underlying work is complete. Reopen/hold/pending or uncertain provider states need explicit treatment under the confirmed policy. Restrict cleanup to this app’s authorized files; never sweep a Drive folder by similar names.

Acceptance: the same eligibility and one-month rule cover both stores; incomplete/unresolved work is protected; exact-ID retries cannot delete unrelated files; source scope and audit facts survive; quota forecasts block an upload/archive that would exceed the authorized budget; no overage, paid add-on or new paid project is enabled. Test reversible previews and isolated exact-ID lifecycle first, then enable only after the confirmed eligibility policy and exact targets are verified.

## Intentionally off or optional

| Item | Completion treatment |
|---|---|
| Destructive cleanup before implementation is verified | Temporarily OFF until the confirmed all-linked-zero/no-pending-work + one-calendar-month policy is implemented and tested. Retention is required work under WF-11. |
| Automatic email, draft generation, reply-based holds, inferred settlement | Prohibited or unsupported by the agreed business rules. Do not add them to “finish” the product. |
| Inbox-wide background scan, AI reply classification, OCR allocations | Optional future capabilities; not required for the approved explicit thread/remittance paths. |
| XLSX/DOCX/archive uploads, interactive PDFs, antivirus guarantees | Outside the verified static PDF/PNG/JPEG evidence/attachment scope. Do not silently expand. |
| Automatic Drive archive, archive of every unedited original, legacy Google cleanup | Not required to finish explicit archiving. One-month cleanup of this app’s eligible files is WF-11; deletion of legacy resources remains separate. |
| Native mobile application, push alerts, unrestricted mobile PDF editor | Not requested; complete the approved web companion first. |
| Reports exports | The supporting reference includes report exports, and PRODUCT_SPEC permits internal Excel/PDF reports. No export control exists in Reports. Treat as a bounded approved-reference enhancement after required source metrics are correct; do not make a new export framework a prerequisite for truthful on-screen reporting. |

## Acceptance checklist reconciliation

The line references below point to [ACCEPTANCE_CHECKLIST](ACCEPTANCE_CHECKLIST.md). They map actual implementation/evidence; they do not blindly mark its historic unchecked boxes complete.

| Checklist rows | Current disposition | Remaining acceptance |
|---|---|---|
| A9–12: clean root, seven references, visual comparison, scoped tables | Recorded in HANDOFF_VERIFICATION/PROJECT_STATUS and later synthetic visual suites. | Reuse existing evidence; new surfaces need their own screenshots without replacing references. |
| A13: Queue | Default queue implemented and tested. | WF-1/2/3 extend configurable policy and exception states. |
| A14: mobile companion | Substantially implemented; partial. | WF-9 PDF boundary and new workflow/mobile acceptance. |
| A15: error/empty/stale | Existing source-sensitive states are implemented/tested. | Preserve across every new report and recovery flow. |
| B19–24: login, allowlist, credentials, private files, scope/redirects | Recorded real Auth/integration proof plus boundary/RLS/redirect tests. | Repeat relevant security regression on new routes; do not reopen already settled login identity. |
| C28–32/C34–35: refresh, atomic membership, THB and bill dates | Existing refresh implementation and recorded provider/SQL/unit checks. | Continue bounded coverage for new history import; do not claim all daily arrivals from current-only proof. |
| C33: created-and-cleared between refreshes | Not complete as a daily-history feature. | WF-4. |
| D39–43/D45: due rules, null term, first date, exact invoice scope, pinned history | Implemented and tested in workflow/send guard suites. | Reopen/configurable-round changes must retain these invariants. |
| D44: external billing | First-date entry exists; full provenance/activity flow partial. | WF-6. |
| E49: editable rounds | Not complete; editable wording alone is insufficient. | WF-1. |
| E50–54/E56–57: default progression/current counts/urgent | Implemented for fixed defaults, tested with synthetic data and SQL send guards. | WF-1 compatibility plus WF-3 reopening review. |
| E55: replies/remittance versus holds | No automatic settlement/reset is implemented correctly; explicit hold is missing. | WF-2; retain completed thread/remittance behavior. |
| F61: consistent filters/drill-down | Existing reports/remittances/queue support their current metrics. | Extend to every WF-4/5 metric; preserve historical account-type semantics. |
| F62–64: arrivals, independent daily/backlog, backfill dedup | Not complete. | WF-4/5. |
| F65–66: remittance document/invoice/amount and OPERA separation | Completed in Remittance verification, including real rollback and isolated storage proof. | Do not redo the increment; retain regression coverage. |
| F67–68: receipt/application example and mapping | Not complete; separate receipt/applied presentation is now owner-confirmed. | WF-4, including reversal/unallocated source handling. |
| F69: over90/over60-unbilled | Over90 present; over60-unbilled absent. | WF-5, using OPERA age rather than due-date age. |
| F70: operational day measures without staff SLA | Dates exist but the full duration presentation is absent. | WF-5. |
| F71: historical sent evidence survives current clearing | Durable immutable send evidence implemented/tested. | WF-11 must retain required history/dedup facts while cleaning eligible file bytes; keep clearing/reopen tests. |
| G75: native document coverage | Latest owner decision supersedes native Statement coverage: Statement is system-only; Invoice/Folio remains OPERA. | WF-10 selector/backend alignment and preserved Invoice/Folio coverage; no native Statement API blocker. |
| G76–81: selected-only, real bytes, print scope, no automatic fallback, arrangement | Recorded document/package proof; system Statement is now the sole chosen Statement path. | Preserve membership/grouping safeguards; native Invoice failures cannot silently switch to generated invoice output. |
| G82: editing capability | Fixed-page text/object/page editing implemented and demonstrated. | Do not claim Word reflow; apply mobile boundary in WF-9. |
| G83–85: reviewed exports/redaction/resource limits | Recorded PDF/export/flatten and bounded-processing tests. | Recheck relevant limits with new surfaces; no unlimited claim. |
| H89–93: draft/SENT/dedup/test isolation/Gmail edits | Implemented; direct-send/thread/incoming real diagnostic proof and synthetic/SQL guards recorded. | WF-8 actionable review of unresolved evidence; distinguish actual proof from untested customer sending. |
| H94–95: Drive destination/exact test cleanup/edited archive policy | Explicit Drive flow and live synthetic exact-file proof complete. | WF-11 adds exact-owned-file one-month retention after confirmed completion; no broad or legacy cleanup. |
| H96–98: included backup, restore scope, post-restore mail reconciliation | No completed restore rehearsal evidence found. | WF-10. |

## Bounded implementation order

1. **Collection policy and exception state:** implement WF-1, WF-2 and WF-3 with one shared backend policy and immutable history. This resolves the newly confirmed reopen rule before it can resume collection unreviewed. Test default compatibility, retired stages, holds, reopen and pending-delivery races together.
2. **Account history and explicit external billing:** implement WF-6 and the Collection History part of WF-7. Give staff one exact-scope evidence reader and source-labelled actual billing commands before expanding daily billed reporting. Fix settings/history dirty-state preservation at the same seams.
3. **Source history and reporting:** implement WF-4, then WF-5. Start with source/identity/date/money proof and completeness windows; add reports only after the data model distinguishes receipts, applications, arrivals and observations. Add daily snapshots with their real capture time, not an invented closing balance label.
4. **Documents/Gmail/recovery access:** finish WF-7 and WF-8. Reuse document, delivery, thread and archive primitives; expose safe per-item checks and review outcomes. Avoid an inbox import or sender redesign.
5. **Mobile, source-choice alignment and release proof:** complete WF-9 across those new routes; align system-only Statements and perform the included-backup/recovery parts of WF-10. Do not spend this completion phase on native Statement API discovery.
6. **Retention:** implement WF-11 using the now-confirmed completion eligibility and calendar-month interval. Inventory/preview/quota controls can proceed alongside the earlier steps; destructive cleanup stays disabled until the implementation and exact targets are verified.

For each bounded increment: report proposed/implemented/tested/deployed/enabled separately; run behavior and exact-scope SQL cases; inspect 1440×900/1280×800/390×844 synthetic screenshots; prove anonymous/unapproved access rejection; preserve existing no-duplicate commands and no-customer-test boundaries. A green build alone does not close a workflow gap, and a historical unchecked handoff box alone does not reopen a shipped feature.

## Documentation cleanup after implementation

Update current decisions and the acceptance ledger without erasing historical checkpoints. Specifically supersede: old missing images/credentials/settings/Drive-folder statements; old claims that threads, rich text, attachments or remittances are unimplemented; the obsolete five-minute Gmail interval; and the now-settled reopen, receipt/application display, system-only Statement and one-month retention choices. Keep genuine remaining work—source-history coverage, safe completion-based retention and backup restore proof—visible until its evidence exists. Mark native Statement research as superseded by the owner’s chosen source policy, not an unresolved dependency.
