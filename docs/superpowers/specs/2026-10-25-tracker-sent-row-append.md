# Add missing tracker rows after confirmed Sent

Owner approval on 25 October: add the ten previously quarantined billing invoices
with their actual confirmed Sent dates. Automatically insert future successfully
sent invoices when the original tracker lacks their exact identity. Retain queued
work on transient failure, never resend mail, never overwrite staff-edited/deleted
dates, and keep Aging Master unchanged on all PCs. This does not resume the paused
full financial publisher or LFS-only updater experiment.

## Behavior

- Existing exact Hotel/Account/Invoice/Folio/post-date row: preserve every cell,
  including blank dates; use the existing Sheet authority rules. No backfill.
- Missing row never previously observed/mapped: qualify the current OPERA AR root,
  match its observed Sheet property/account alias, and create one new row with
  actual billing/follow-up dates proved by immutable Sent receipts.
- Old other-account rows remain untouched. Duplicate or ambiguous identity/key,
  missing account alias, historical Sheet authority or user-cleared date holds.
- Use the exact legacy Property|normalized Agent|I:Invoice|1 key so ordinary Aging
  Master imports retain tracking. Qualify that compatibility on synthetic workbooks
  with the actual existing parser/merge functions, without changing that project.
- No existing R:AC writes by the append feature. Initial values go only into a
  freshly inserted row. Account moves create a distinct key with no copied dates.
- Native append is one atomic fresh-row insertion/value/unique metadata batch.
  A stable metadata ID and immutable plan survive timeouts and worker restarts.
  Check the same ID and exact identity before any recovery; never invent another
  ID to evade a collision. XRP/unknown results retain visible uncertainty.
- Phuket append patches only a new source row into the original XLSX and uses
  the existing qualified Drive v2 If-Match path. Retain all existing cell/ZIP data.
- Journal before mutation, share the regional tracker lease, fence actual source
  and permissions, and re-read source after creation before importing Sheet facts.
- Direct Friendly/Final/custom Sent jobs start at the explicit policy enablement
  cutoff; old suppressed queue jobs are not globally revived. The exact ten are
  separately owner-authorized with preview/hash/idempotent authorization.
- Show pending additions, uncertainty and review holds separately from mail send
  success. A failed append never causes another Gmail send.

## Evidence and rollout

Use owned synthetic provider copies first. Cover retries/readback, duplicate IDs,
old/new account keys, same-key collisions, source drift, edits/clears/formulas,
blank existing rows, split/partial payments, signed membership, lease loss, and
the next unchanged Aging Master import. No real test email is necessary.
Before the ten-row operation, capture original current cells/formulas and Sent
history fingerprints. Verify ten receipts/dates and that every preexisting row
remains unchanged. Preserve original IDs/formats, LFS, all report tabs and other
runtime bindings. No paid resources or credential/permission expansion.
