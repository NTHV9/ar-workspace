# Multi-account preparation verification — 20 October 2026

## Implemented

Collections retains invoice selection across accounts, hotels, stages and display filters within the selected region. Each Hotel + Account + stage creates a separate existing document job. Accounts without configured recipients can prepare and edit PDFs; sending remains blocked until their email is complete.

The batch shell embeds the existing PDF Workspace and email composer. In-memory editor sessions retain edits, original/attached source bytes, filenames, page assignments and Undo/Redo. Source text is rebound to fresh PDF font resources after switching. Email edits are saved before switching. Sessions have a 192 MiB aggregate budget and are not saved editor projects; closing the browser can lose unreviewed edits.

Final review sends separate reviewed email revisions only after an explicit click, with at most two requests in flight. It reuses existing server delivery claims and outcome checks. Uncertain results never automatically resend. Existing Draft/uncertain-file retention, authorization, policy validation and actual-Sent recording remain authoritative.

## Verified locally

- Full unit suite: **2,079 tests, 209 files passed**. TypeScript, production Vite build and `git diff --check` passed.
- Used the actual App, Collections, DocumentRoute, PDF editor and email composer through the browser, with synthetic PDFs/accounts and a provider-isolated API harness at `tests/browser/batch-workspace/harness.html`.
- Selected three work groups, including identical account and invoice identifiers in different hotels. All selections survived account switching; three separate jobs were created.
- Edited source text in Account A, added a scanned PDF, renamed the scan and output PDF, then switched A → B → A. Edits, scan assignment, names and Undo/Redo survived; B retained its own originals.
- Downloaded A's reviewed three-page result. Independent PDF extraction confirmed edited first-page text remained searchable, the second original page was unchanged, and the third page contained the scan image. Rendered scan was legible rather than blank.
- Reviewed PDFs for an account without an email. Final review prevented sending only that account; entering its recipient made it ready.
- Edited A's recipient and subject, switched accounts, returned and reloaded after reviewed files had been saved. Saved email identity and filenames remained separate; no send occurred on reload.
- Explicitly sent three messages through the real frontend against simulated provider responses. Audit showed exactly three distinct sends with the expected hotel, account, recipient and attachment names.
- Created another two-account batch. Left an unreviewed edit in A, switched to clean B and invoked main navigation. The leave warning appeared; cancelling preserved the batch and A's edit, with no abandon request.
- Simulated a lost send response for A while B succeeded. A became “Check outcome”; B stayed “Sent and verified”. Checking A's existing delivery resolved it without another send request. Total simulated sends remained five across both batches.
- Independent whole-change review found and closed three issues: paused-account dirty detection, identity verification before job display/abandonment, and restoring an initial PDF session more than once after returning from email. Focused regressions passed after repair; reviewer reported no remaining P0–P2 findings in that recheck.
- Visual review at 1280 × 720 confirmed the embedded editor, composer and results fit the desktop workspace. Impeccable detector reported the established Plus Jakarta Sans font and token-scale advisories; this extension deliberately retains current product styling.

## Boundaries

No real customer or test email was sent during this verification. No OPERA account data, Google Sheet cell, business history or cloud schema was changed by the harness. Its synthetic data and provider interception are not included in the production bundle.

Existing backend send/policy tests passed, but live Gmail batch delivery, every reminder-stage combination and phone-size PDF editing were not independently exercised in this round. This report does not claim those as live tests. Deployment and public health verification are recorded separately in PROJECT_STATUS.


## Owner-approved simplification — horizontal accounts and one batch mode

The owner replaced the sidebar/Next flow with a horizontally scrolling account strip and one PDF/email mode shared by the entire batch. Ready source PDFs open directly in the editor. Each account confirms its final PDFs; Go to email changes the whole batch, while unfinished PDF confirmation keeps the whole batch in PDF mode. No Next-account control remains. The email toolbar exposes one Review & send action.

Returning to PDFs retains tab-only editing state. Reconfirming edited PDFs now explicitly rebinds the same never-handed-off private email draft to the authoritative new document revision, preserving recipients, subject/body/rich content, supplemental attachments and thread choice. It invalidates the old batch mail approval. The opt-in rebind checks shared owner/staff scope, exact job/account/invoices, revisions, closure/discard, handoff/upload conflicts and file budgets; direct clients cannot execute the RPC. Draft-before-job lock order matches existing message operations. A same-binding repeat only reads the current draft. Migration `20261020091943_ar_batch_email_rebind` was applied and tested with synthetic rollback fixtures on the actual database; no fixture rows or business events persist.

Also repaired the distinction between the staff viewer who owns tab metadata and the authorized shared workspace owner of document jobs. The existing access response now preserves its workspaceOwnerId through parsing; server access checks remain unchanged.

Validation: 2,084 tests / 211 files passed, TypeScript and production build passed. Actual browser interactions verified the global PDF-to-email transition; editing/reconfirming PDFs after custom email recipients/subjects; retained per-account mail; and partial sending followed by navigation through a closed/sent account and back to the remaining account's PDF/email mode. The simulated provider saw explicit send only. The harness now keys email drafts by document revision and models rebind; an earlier stale harness tab was discarded before the final pass. Independent review rechecked fixes and reported no remaining P0–P2 findings. Desktop screenshot is private synthetic evidence. Small-screen PDF editing and live Gmail delivery were not exercised in this revision.


## Owner-approved removal of per-account PDF confirmation

The owner considers the working editor sufficient for reviewing PDFs and explicitly removed the Confirm PDFs step. Go to email now captures the active editor and prepares all current account packages sequentially, including accounts not yet opened. It reuses the same exporter, source identity/byte checks, private upload receipts and document-version handoff, then switches the whole batch to email. Preview is optional and returns to editing; no separate confirmation counter or Confirm button remains in batch mode. Sending still requires the existing explicit send action.

The coordinator keeps exact files/receipts for an interrupted handoff. A lost review response after the server advances its revision can be retried before a stale editor restoration blocks recapture. Later edits are only prepared after the prior attempt is resolved. Cached originals must match every current source ID/kind/invoice/size/hash; completion of another source without a revision increment cannot silently turn an edited subset into a complete package. PDF resources are disposed between background preparations; editor sessions and the aggregate memory budget remain intact.

Verification: 2,089 tests / 213 files, TypeScript/build and independent focused review passed. Actual browser trial selected two accounts, edited source text, added a scan and renamed A's file, never opened Preview or Confirm, simulated a committed review with lost response, retried Go to email successfully, and opened email for A plus previously unvisited B. Returning to B's PDFs remained editable. Downloaded A had three pages: edited text visibly intact, original second-page text retained, and a legible scan image. This edit used the existing raster fallback on page one; searchable edited text is not claimed for this sample. Returning to email again reused the completed packages. No Gmail send or business event was generated by the fixture. Independent reviewer rechecked both retry and source-membership fixes with no remaining P0–P2 findings.
