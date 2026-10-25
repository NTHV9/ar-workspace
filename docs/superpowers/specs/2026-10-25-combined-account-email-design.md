# Several Accounts, one human-sent email

Status: approved by the owner in this conversation, including independent mixed
PDF layouts. Implementation/release receipts are separate.

## Confirmed intent and approach

The owner confirms that staff may select any Accounts, including different
Agents, select their Invoices and send the reviewed documents in one email with
manually specified recipients. Company-name equality is not a restriction and
Account ledgers remain separate by Hotel and internal identity.

Keep the present separate-email mode as the default and add an explicit
“รวมเป็นเมลเดียว / One combined email” option in the Email phase. This is the
owner-selected optional approach. Always combining would remove an existing
choice; automatically grouping by names or stored recipients would not implement
the requested manual selection. No new mail provider or paid service is needed.

This is a coordinated frontend/backend change: the present draft, attachment
ownership and Sent-event schema each assume one Hotel/Account per message.

## Staff workflow

1. Select Accounts/Invoices in Collections as today, including Accounts with no
   saved email address. Prepare/edit PDFs using the existing Account tabs and
   existing three document layouts. Do not change financial calculations.
2. Go to Email through the existing preparation/save process. Choose separate
   emails or one combined email. The combined option covers the selected batch
   members; it does not silently select other outstanding Invoices.
3. Combined mode shows one To/CC/BCC set, subject, rich/plain message and signature.
   To initially remains blank: no union, first-Account copy, OPERA fallback or
   implicit sharing of stored recipient lists. Preserve the existing explicit
   regional self-CC preference independently. Staff can type any valid set.
4. Keep Account tabs as document/attachment context. Changing the active tab in
   combined Email mode must retain the same common message and recipients, not
   create another account-specific email. Display the complete attachment list
   grouped by Hotel/Account and the total Accounts/Invoices/files/bytes.
5. Review & send now uses the existing human confirmation pattern once, with an
   explicit “Send 1 email” summary. Do not add a separate Confirm step for each
   Account/PDF. One confirmed send creates exactly one Gmail message.
6. Show one shared outcome: sending, Gmail accepted/history pending, Sent/history
   recorded, or result unknown/checking. Account history links back to the same
   real message and the relevant Account/Invoice membership.

Separate mode retains its existing behavior. Never propagate common-message
edits into stored Account recipient settings or the separate drafts. Switching
between modes preserves unsent edits within this open batch. After a provider
attempt begins, its membership/message cannot be repackaged into another send.

## Engineering defaults to review

- Use the existing regional batch boundary: all members use the same Gmail
  sender/mailbox. No new cross-region picker or sender impersonation. Any Agent
  is permitted within that existing authorized scope; names are not identities.
- Start a new Gmail conversation for a combined message. Do not combine different
  existing threads or change the separate-mode reply/thread feature.
- For different selected Hotels, let staff choose one signature Hotel from this
  selection, initially the first selected Hotel. Use the sender's existing name,
  position and signature format; do not silently rename their stored profile.
- Keep each reviewed Account package and its chosen PDF layout as attachments.
  One email does not mean forcibly merging all Accounts into one PDF. Preserve
  file contents; disambiguate equal attachment filenames with Hotel/Account labels
  without changing the printed Invoice/Folio identity.
- Owner clarification: PDF Workspace keeps the separate Hotel/Account tabs shown
  in the current UI. Each Account may independently choose One combined PDF,
  Statement + invoice bundle or Statement + each invoice. Batch-wide initial
  options are defaults only. For example, one Account's three Invoices can become
  one PDF and another Account's two Invoices can remain two PDFs, all attached to
  one email. Account/mode/phase switching must preserve each editor project's
  delivery selection; never coerce all Accounts to a shared PDF layout.
- Keep current sender/file budget and 50-file limit across the complete message,
  including inline assets. Show total size early. If it exceeds the limit, require
  a smaller selection or a combined-PDF layout; do not silently split into emails.
- Carry each selected work group's billing/collection purpose and exact stage.
  A common message must not mark all targets with the first group's stage. Existing
  By System, hold, source, credit-rule and policy-version checks still apply.

## Delivery and business-history boundary

Represent one combined preparation/revision and one provider delivery, with
explicit immutable membership in each owned document job, exact reviewed
revision/export receipts and selected Hotel/Account/Invoice/work-group identity.
The server derives and validates scope, staff access and sender from these jobs.
It does not accept browser-supplied ownership, file paths or financial values.

Use an additive combined-delivery membership/business-fact representation. Retain
existing single-Account deliveries and their constraints. In particular,
ar_sent_events currently has a delivery-id primary key and unique Gmail ID:
do not fake one provider send per Account, reuse test-send semantics for real
billing, attach every document to the first Account or weaken ownership checks.

Before calling Gmail, atomically claim the exact immutable set, including ordinary
single-Account pending/draft/uncertain-send fences. Prevent any individual send
from racing a combined send for the same preparation. Save retries and double
clicks reuse a stable command/revision and cannot create another Gmail request.

After Gmail success, durably retain its real receipt independently of business
history recording. In one database transaction, record all selected per-Account
Sent facts and selected Invoice workflow events with their own purpose/stage.
If any member cannot commit, retain the provider acceptance and retry history
for this same message; never resend. Unknown provider outcomes use read-only
reconciliation. Do not report a failed/unrecorded send merely because a later
database/Sheet request failed.

Audit all current consumers of confirmed Sent facts: Collections, current
Dashboard billing/stages, first actual billing/due computation, Account email
history, documents/mail admission, regional access, retention and Sheet outbox.
Extend their canonical fact projections to include combined membership. Count
one provider message and one current stage per Invoice, with no duplicate totals.
Do not restore retired daily/historical report capture for this feature.

Each Invoice keeps its Hotel/Account identity and selected history. Sheet R/U/V/W
remains authoritative, including staff edits/deletions. Existing safe missing-row
insertion and durable writeback retries apply to each confirmed target; never
overwrite a later manual date or resend mail because Sheet writeback is delayed.

## Preparation lifecycle and access

F5 keeps this open batch, its mode/common message and exact memberships. Explicit
Exit/Cancel discards only never-attempted temporary work through existing scoped
cleanup. A shared combined provider attempt protects every referenced reviewed
file until its outcome/history is resolved. Confirmed Sent closes the relevant
transient preparations only after the complete history transaction. Never infer
financial zero, close OPERA debt or erase business history from email outcomes.

All APIs and file reads require the existing actor/workspace/regional rights.
Validate every member before exposing the shared message or package. Ordinary
staff retain direct human Send Now; provider Gmail Draft remains Admin-only on
the existing separate-message path. Combined Gmail Draft is outside this change.

## Validation and release

- Different Agents, different Hotels in one mailbox, repeated Account/Invoice
  numbers in different Hotels, missing saved email, user-entered To/CC/BCC and
  signature selection; unchanged separate mode and each PDF delivery layout.
- Edited PDFs, duplicate filenames, large/over-budget packages, changed revisions,
  new holds or collection-policy changes and independently invalid one member.
- Mixed per-Account PDF layouts in the same batch/email, including changing a
  layout, switching Accounts, F5 and PDF-to-Email handoff without layout resets.
- Exactly one MIME/provider send; every intended target recorded atomically;
  mixed purposes/stages, first-billing preservation, current counts and due dates.
- Double-click/concurrent individual+combined requests, lost send response,
  accepted send with failed/lost history response and idempotent history recovery.
- Sheet updates, delayed writes, missing-row insertion, edited/deleted dates and
  no replacement of staff authority; no duplicate mail from a Sheet failure.
- F5, Account switching, mode switching, explicit Exit, shared-file protection,
  regional/owner tampering and any pre-existing provider attempts.
- Keep customer PDFs/JSON/secrets and one-time test recipients outside Git and
  permanent settings. Synthetic isolated tests first. Any authorized real-mail
  smoke uses its ephemeral approved destination and does not record real billing.
- Test/review forward migrations and current code, then same-source CI/deployment
  and live health/assets/UI checks. Remove this task's disposable local test data
  after verification so the disk does not accumulate another set of clusters.

The implementer chooses exact table/function/component names, the normalization
adapter and migration sequencing after auditing the current consumer contracts.
The one-provider-message/all-target-history and no-resend invariants above are
requirements, not optional implementation choices.
