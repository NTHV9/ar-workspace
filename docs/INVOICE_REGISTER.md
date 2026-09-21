# Invoice Register

Owner request, 22 September 2026: add an editable spreadsheet-style invoice view to Reports, using current application data rather than importing the supplied Phuket/Khaolak workbook entries. The reference workbooks were inspected privately; their customer rows are not repository fixtures.

## Linked data

- Billing requirement, credit term, first actual billing date, latest reminder and actual reminder date read/write the existing invoice workflow. Due date uses its existing generated formula. A deliberate per-invoice rule override is retained during OPERA refresh and later account-default initialization.
- Invoice note uses the existing invoice-exception note and command history; note edits from either page appear in the other. Holds/disputes and reopening controls remain in their existing workflow.
- Promised date, tracking status, owner and reported received are shared metadata, editable in both the register and Account Detail → Tracking & payment notes.
- OPERA invoice identity, dates, original/open amounts and aging are read-only. Reported received is a team-entered fact, not an accounting adjustment or proof that OPERA cleared an invoice. Manual workflow edits do not create Gmail SENT events.
- Same-browser changes notify open application tabs; returning focus/reloading reads fresh server data. Dirty rows retain their edits and fail on revision conflict instead of overwriting a newer value.

## Table behavior

Reports defaults to Invoice Register; External billing activity remains a separate tab. Column sets are Billing, Follow-up, Notes & receipts and Invoice details. Invoice numbers remain complete; long names/notes have full native titles. Desktop fits the working panel; phone rows become cards with an explicit sort selector.

Search includes invoice/folio, account, guest, owner and note. Filters cover region/hotel, account type/account, balance, billing state, tracking state and hidden/visible rows. Each data column sorts on the server, with stable identity tie-breaks and 50-row pages. Hidden rows are personal to the actual signed-in staff member and can be restored; hiding never changes receivables, collection eligibility or another staff member's view.

## Write and access boundary

All endpoints authenticate through the Worker and service-only SQL functions, which independently verify the real actor's regional membership. Reads and writes key by hotel + account + invoice. Additive tables remain private. Unsupported isolated-acceptance calls fail closed.

One row save is atomic across workflow, shared note and tracking metadata. It checks all three revisions, validates dates/terms/amounts, captures before/after history and stores a command receipt. A retry reuses the same command and cannot create a second event. Existing workflow and exception audits remain; register edits retain the real staff actor separately from the shared mailbox owner. No Excel import, OPERA write, email command, new paid dependency or file-retention change is part of this feature.

## Verification

Synthetic SQL rollback coverage exercises both directions of workflow/note updates, later OPERA refresh, account-default separation, due-date calculation, command replay/conflicts, numeric sorting, pagination, note search, hide/restore, hotel isolation, regional authorization and private ACLs. Browser coverage includes inline editing across column sets, account-side tracking edits, search/sort, hide/restore, preserved edits on conflict, ambiguous-save receipt reuse and desktop/phone layouts.
