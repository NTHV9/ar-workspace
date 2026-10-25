# Combined Account Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Independent SQL core, Worker and frontend scopes may use parallel agents with the interfaces below; parent owns consumer integration and final qualification.

**Goal:** Add an optional one-email delivery for arbitrary selected Account work groups with complete per-Invoice history.

**Architecture:** One normal real provider delivery references immutable per-member jobs/drafts and produces additive confirmed scope facts. Existing separate sending remains; current business readers, Sheet outbox and retention consume both kinds of facts.

**Tech Stack:** Existing React/TypeScript/Vite, Cloudflare Worker, Supabase/PostgreSQL, existing Gmail/MIME/PDF primitives; no new dependency or paid resource.

**Spec:** docs/superpowers/specs/2026-10-25-combined-account-email-design.md

## Global Constraints

- One combined command produces one Gmail message; no automatic resend after unknown outcome.
- Any Agent names may combine, within one authorized existing regional mailbox.
- Each Account's PDF layout/edited reviewed bytes stay independent; no PDF engine/tax changes.
- Common recipients are manual, with existing explicit self-CC preference; no Account/OPERA recipient union.
- Preserve Sheet authority including cleared dates, current-only Dashboard, normal separate sending, provider Draft restrictions, holds and all-member access.
- Preserve F5/open-batch recovery and exact Exit; unresolved shared attempts protect all referenced bytes.
- All source/derived customer data and ephemeral real-mail destination stay outside Git; remove disposable local test clusters after qualification.

## Shared interfaces

Create src/email/combined.ts exporting:

`CombinedMemberInput={memberId,documentJobId,documentRevision,draftId,draftRevision,stage:string|null,policyVersion:number|null}`.

`CombinedContent={recipients:{to:string[],cc:string[],bcc:string[]},subject,body,richBody:RichMessage|null,signatureHotel:HotelId}`.

`CombinedEmail={id,revision,members:(CombinedMemberInput & {hotel,accountId,accountName,invoiceIds,purpose,layout,stageLabel,files:{fileId,name,byteCount,sha256}[]})[],content,mailbox,totals:{accounts,invoices,files,bytes},delivery:EmailDeliveryView|null}`.

API POST /api/email/combined accepts `{id,revision,commandId,members,content}`; GET /api/email/combined/:id reads it. POST /api/email/combined/:id/send accepts `{revision,commandId,confirmed:true}`. Check uses existing /api/email/deliveries/:id/check. File preview GET /api/email/combined/:id/files/:memberId/:ordinal?revision=N reads only that member's verified draft package. Frontend opens missing member drafts using existing /api/email/open; common recipients never copy those drafts.

SQL RPCs: `ar_combined_email_save(p_actor uuid,p_id uuid,p_revision integer,p_command uuid,p_members jsonb,p_content jsonb)`, `ar_combined_email_get(p_actor uuid,p_id uuid)`, `ar_combined_mail_claim(p_actor uuid,p_id uuid,p_preparation uuid,p_revision integer,p_message_id text,p_expected jsonb)` return jsonb. New preparation expects revision0; successful create/save returns revision1/increment. Stable command/request digest makes replay idempotent. SQL derives scopes, purpose, files and workflow, not browser fields.

Keep one mail_deliveries row mode=send/draft_id=NULL with additive combined_preparation_id. Add private combined_email_preparations, combined_email_commands, combined_delivery_members, combined_sent_scopes. Combined facts key `(delivery_id,member_id)`; unique exact Invoice membership per root. Normal ar_sent_events remains unchanged. Expose canonical private sent_scope_facts with normalized scope, manifest/workflow/policy/staff/mailbox/root-delivery data.

Access admission: creation/save advertises its same mailbox region through a validated body and normal region/mail gateway intent; SQL validates every actual member and effective human before save/claim. Existing combined GET/file/send routes use new kind=combined with preparation UUID and all-member lookup in ar_access_authorize. Existing delivery kind also resolves combined membership. No global grant is used for creation.

## Review Focus

1. Duplicate invoice identifiers across Hotels must produce distinct correct Sheet intents and histories.
2. A normal send racing the combined claim must admit at most one provider request for a member preparation.
3. Accepted Gmail with a lost history response must recover all targets without resend or partial workflow history.
4. Mixed PDF layouts, edits, Account switches and F5 must preserve reviewed files and independent layout choices.
5. A removed regional grant or changed/shared member must deny the whole shared message and protect its files.

## Task 1: SQL preparation/delivery core — SQL implementer

**Files:** one new CLI-generated forward migration ar_combined_email_core; tests/sql/tracker-combined-email-core-rollback.sql.
**Consumes:** existing owned jobs, app drafts, policy/hold/source checks and actor identity.
**Produces:** exact RPCs/DTO above, four private tables, canonical sent_scope_facts, combined-aware ar_mail_get/record/confirm dispatch and single-send claim fences.

- [ ] Add synthetic fixtures: arbitrary Agents and mixed member layouts; assert initial save/replay/revision and rejection of scope/duplicate/missing/unreviewed/held/provider-attempt targets.
- [ ] Run fixture before migration; require missing-function/behavior RED.
- [ ] Implement additive tables/RLS/ACL, immutable attempts, stable command digest, complete member/workflow claim snapshots and all-target atomic confirmation. Preserve successful Gmail proof independently, with no fake child deliveries or diagnostic mode for real sends.
- [ ] Share the ordinary admission locks and fence ordinary Gmail/normal claims and referenced draft/document changes while a combined attempt is unresolved.
- [ ] Cover one receipt/many scopes, mixed purposes/stages, late invalid member/all-or-none, exact replay, conflicting content, ordinary-vs-combined race contracts and prior separate cases.
- [ ] Replay migrations and focused fixture, then report GREEN and exact helpers/fields. No hosted changes or broad test run while other scopes edit.

## Task 2: Worker boundaries — Worker implementer

**Files:** src/email/combined.ts; worker/email/combined.ts; worker/email/combined-files.ts; worker/email/api.ts; delivery.ts; worker/access/scope.ts; necessary env fields; tests/combined-email-api.test.ts and combined-email-delivery.test.ts.
**Consumes:** Task1 RPC/DTO. **Produces:** exact HTTP/MIME boundary and combined-safe receipt/reconciliation dispatch.

- [ ] Write RED tests for route/body bounds and malformed/foreign/cross-mailbox members, common signature, duplicate names and complete package budgets.
- [ ] Implement validated shared types and API handlers, read every file through its own draft/job receipt, freeze disambiguated names, one inline logo and one MIME/provider send. Preserve normal signature/body rules and effective human signature ownership.
- [ ] Route normal all-member authorization via the contract; no client-supplied authority/path. Add explicit access-intent allowlist and keep request body limits/CSRF checks.
- [ ] Reuse ordinary delivery/get/record/check behavior for combined roots, with independent accepted provider receipt and history-only recovery. No Gmail Draft/old-thread combination.
- [ ] Cover double-click, unknown send, accepted-but-history-unavailable, member revision change and zero duplicate POSTs; run focused tests/typecheck. No real mail/hosted calls.

## Task 3: Staff UI and independent layouts — frontend implementer

**Files:** src/batch/BatchRoute.tsx/state.ts/phase.ts; src/batch/CombinedEmailComposer.tsx; batch CSS; minimal DocumentRoute/PdfWorkspace delivery-metadata callback if required; tests/combined-email-state.test.ts; tests/browser/combined-email.spec.ts.
**Consumes:** shared DTO/HTTP; owned child drafts from existing open API.
**Produces:** explicit separate/combined mode, one common message/review/status, preserved batch state and scoped layout metadata.

- [ ] Add RED state/browser cases: missing stored recipients, arbitrary Agents, KAT3-invoice combined PDF plus TSK2 separate PDFs => one email/three attachments; verify common fields survive Account/mode switches and F5.
- [ ] Add Email-phase mode choice with separate default, manual To/CC/BCC plus existing self-CC, reusable RichMessageEditor and one selected-Hotel staff signature. Show grouped files and early whole-package budget.
- [ ] One human review/send, one delivery/checking display; no redundant per-Account Confirm. Keep Account tabs as document context in combined Email phase and preserve unsent separate/common edits.
- [ ] Persist only scalar delivery-layout choices needed for F5, retaining existing reviewed bytes. Do not modify the PDF editing/rendering/tax engine or force global layout changes.
- [ ] Test exact Exit/F5/shared attempt behavior, mode-change fences after attempt, selected scope and no recipient-setting writes. Run focused browser tests with unique/configured local ports sequentially; no baseline overwrites.

## Task 4: Canonical consumer/lifecycle integration — parent

**Files:** CLI-generated ar_combined_email_consumers migration; tests/sql/tracker-combined-email-consumers-rollback.sql; existing account history/thread Worker helpers; acceptance routing/fixtures as needed.
**Consumes:** combined tables and sent_scope_facts from Task1. **Produces:** current history/Sheet/retention/permissions coverage.

- [ ] Add RED fixtures for repeated Invoice IDs across Hotels, cleared Sheet authority, missing-row insertion, per-target collection stages, Account history and all-member grants.
- [ ] Retarget tracker_outbox delivery FK to real mail_deliveries with exact confirmed-scope validation; widen uniqueness to delivery+hotel+account+invoice+field. Reuse latest tracker_sent_enqueue captured-intent/suppression semantics.
- [ ] Update current fact consumers, billing floors, append admissions/source, collection projection, report_sent_invoices and Account email/history, avoiding duplicate membership counts and preserving NULL actual_date authority.
- [ ] Integrate combined references into pending-mail/admission/closure/retention and unused-disposition guards, protecting all shared attempt bytes and closing all target transient jobs only after complete confirmation. Preserve legacy/Drive/month policies and retired capture no-ops.
- [ ] Add all-member combined/delivery regional authorization while preserving current mailbox enablement/ACL/owner/security metadata. Keep single-draft history/thread behavior and return combined-safe account history links.
- [ ] Run full SQL replay and concurrency after SQL scopes freeze; independently review combined changes and fix material findings with RED/GREEN.

## Task 5: Qualification and release — parent

- [ ] Integrate every scope and run typecheck/unit/SQL/browser PDF+Sheet+combined flows, budget/security/negative tests and meaningful concurrency. Verify existing separate mode and current financial/Sheet behavior.
- [ ] Use synthetic/disposable service acceptance for true combined delivery/history, with no real billing changes. Real mail only within the previously authorized ephemeral destination policy, never to actual customers as a test.
- [ ] Create/attach draft PR against the actual current baseline, push only own changes, require same-source hosted checks. Apply reviewed additive migrations only after proof; verify old facts/dates and old runtime compatibility.
- [ ] Deploy qualified latest Worker, verify health/assets and actual signed-in UI; no old branch rollback. Update PROJECT_STATUS with implemented/tested/deployed/enabled distinctions and remove exact disposable test artifacts after verification.

## Execution ruling

The owner has approved the written design and mixed layouts and already supplied
the standing Astra planning/review + Sol implementation method. This technical
plan introduces no new product decision; execute that authorized scope without
requesting a second product confirmation. Preserve the unrelated project-audit
entry/file and all pre-existing user changes in this shared linked worktree.
