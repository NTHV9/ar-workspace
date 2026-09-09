# AR Workspace Statement integration — 9 September 2026

## Follow-up: numeric-column alignment

Owner reported a selected-total versus Aging difference and header/data alignment in both hotels. Read-only verification showed one additional open invoice outside the displayed selection, explaining the account-wide Aging difference. Owner explicitly retained account-wide Aging and, in the latest correction, retained the original OPERA headings (no Entire Account/Selected Invoices suffixes).

Aligned Debit/Credit/Balance headers to the same right edges as their values (460/515/576 pt). A PDF-extraction regression failed on the old output and passed on regenerated KAT/TSK multipage output; both single-page layouts were visually inspected. Source 376bd2c68d8c6ad240240df9a71bc0c6340be5e0, deployment 7c75a52eb2bf48a7b195cd0b4e0a45bf, workflow version 5e08ea9b-bc08-44fd-ad34-529fc38b57b3. Original stored PDFs remain unchanged; new jobs are used for review rather than rewriting saved documents.

Corrected live jobs: KAT `771b3f90-1a35-498f-b343-00f0e0ff0a82` (220,963 bytes), TSK `75323183-f623-46d5-b406-82f0c0194547` (252,378 bytes). Both reached ready without an error. These are new source PDFs for review; previous reviewed exports are not retroactively changed.

## Implemented and deployed

The owner approved integration and specified English wording. The document dialog now offers **Statement source → Generate in AR Workspace** alongside **Original from OPERA**. Original from OPERA remains the default; an unsupported native request is not automatically replaced. No generated-by-AR label is placed on the PDF.

The new path creates a normal private document job with `statement_source=workspace` and a pinned `template_version`. It verifies the current OPERA account with the existing pagination, history and collection-relationship guards; compares selected identities/balances to the immutable job manifest; rejects child/non-collectible/missing/changed rows; then renders only the selected rows, in their selected order. Totals use integer satang. Aging is the separately verified account-wide OPERA aging, not a selected-row recomputation. Statement rows preserve Folio, guest, reference, transaction date and source amounts; missing source metadata is not invented.

Live testing found that this OPERA environment's Payments are signed negative for settlements. The first KAT trial was blocked before any PDF was produced. Corrected and tested **Debit + signed Credit = Balance**, retaining the provider's sign rather than guessing it. No accounting balances were changed. The failed job remains as evidence.

Account invoice responses omitted stay dates in the tested cases. Added read-only Folio History lookups using the existing Hotel/Reservation/Invoice/Folio identity selector. Arrival/Departure now appear in the final KAT/TSK examples. This does not print a native report. Ambiguous historical folio selectors can reject generation rather than borrowing unrelated dates.

## Private templates and storage

Applied local migration `supabase/migrations/20260909135000_ar_workspace_statement.sql` to Supabase project `jmyvpurzmoiecpydjrci` (migration name `ar_workspace_statement`). Added two provenance columns on new-project document jobs, private versioned template storage, a service-only getter and source-aware job creation RPC. Existing jobs remain native; no ledger table, existing file or legacy system was reset or dropped.

KAT/TSK assets at version `rtf-20260909-v3` were prepared from blank copies of the owner's RTFs, with no customer/account/Invoice/amount values. Header, bank/terms/signature and footer regions are rendered at 288 dpi into private image assets; dynamic rows and Aging remain PDF text. This removes unused/hidden source-PDF operators from composed documents. Asset hashes are checked before rendering. Static regions are images, so their words are not individually detected by Edit source text; image/whiteout/overlay editing remains available. This is a material difference from a fully vector or Word document and is not claimed as 100% OPERA fidelity.

Private assets were inserted through the authorized connector and are not present in migration SQL, Git or public frontend assets. Verified: anon/authenticated cannot execute the asset getter or read its table; service_role can execute the getter. Output PDFs and editor projects use the existing owner-restricted `ar-working-files` storage and document receipts/revision checks.

## Verification

- 155 tests, Typecheck, Vite build and connector bundle passed for final source `0305d9b91889b374657d0632ec84b04e124c9709` on `codex/opera-refresh`.
- Worker `ar-workspace`, deployment `eaeed98ff8c846be8f7ded41c095a140`; workflow `ar-workspace-refresh`, version `db991258-4151-4e8e-ae66-fd315b97e2ba`, concurrency retained at 2. No new service or paid add-on.
- Database transaction test proved same-command replay returns the same job and changing source with the same command raises a conflict; transaction rolled back. Initial test harness had an ambiguous local SQL variable, corrected before the passing test.
- Four private synthetic PDFs (KAT/TSK, 1 and 45 rows) passed unique Voucher membership/count, selected total, deliberately different account Aging and partial-payment checks. Rendered and inspected all eight pages. Both 45-row cases used three pages; no claim of matching OPERA page count for different fixtures.
- Final live KAT job `acf45772-12ff-4c11-855b-eded1c4f71c9`: two deliberately non-adjacent selected invoices, ready PDF 220,960 bytes, visible signed credit, selected total and populated stay dates.
- Final live TSK job `2e5127f9-948d-4bc9-bd1e-4fe56ed21673`: one selected invoice, ready PDF 252,373 bytes, visible Voucher/stay dates and account-wide Aging differing from selected total.
- Both final jobs opened in the deployed PDF Workspace and were sent through its mandatory Preview/private-save flow. Earlier KAT job `d1cde070-ea6a-40ed-99c9-39b584febd03` additionally demonstrated closing and reopening its saved project (revision 1). The first signed-payment guard failure is job `d72e20ea-c8ce-432a-a1f0-acc672f43ae9`; pre-stay-date artifacts were preserved, not overwritten.
- Database verification confirmed both final jobs at revision 1, with a project key, one export and acknowledged=true. Closed and reopened the final KAT saved project as well. The final deployed health response reported the exact source SHA above and database_verified.
- Live unauthenticated `/api/documents` returned 401. The existing PDF-private-route and non-allowlisted-user tests remain in the suite. No real-customer screenshots/PDFs were committed; no email was sent and PDF creation did not record billing or advance collection stages.

## Limits and remaining checks

This is enabled as an explicit source option, not a claim that all AR workflows are finished. Up to 500 selected rows / 50 output pages; oversized layout, unsupported characters and ambiguous metadata fail rather than truncate. Address fields absent from the source remain absent (the TSK example has the account name only). Native Statement PDF transport remains unverified. Same-input pixel equivalence, live large multipage Statements and a new combined Statement-plus-native-Invoice run were not tested in this increment. Existing document layout/editor features remain available; the new live verification exercised Statement-only, combined delivery, preview and private persistence.
