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
