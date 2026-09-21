# Workspace-generated Invoice — 21 September 2026

The owner explicitly chose the Statement approach for Invoice: generate PDFs in AR Workspace from the six privately supplied hotel RTFs, while retaining OPERA as the financial source. New preparations use this source; existing jobs, reviewed bytes, Drafts and uncertain deliveries retain their original source.

## Verified financial mapping

- AR account/detail reads verify Hotel + Account + transaction + invoice + folio and the current balance. The balance is checked again after the slower charge/tax reads.
- AR `invoicePostings` requires the verified internal Folio window and `AccountId` context. It returns the invoice's charge rows without the reservation's City Ledger settlement credit.
- The printed Reference is `checkNo`, not the posting transaction identity. Hash comparison with the two supplied native references matched all 27 rows (14 KAT, 13 WAKL).
- Cashiering `financialPostingsNetVat` has a verified **50-row limit** and returns the requested offset, unlike the separate invoicePayments next-offset contract. Complete pagination, stable totals and unique transaction identities are required.
- Package wrappers and their underlying charges share `referencePackageTransactionNo`. The original package reference is distinct from the visible wrapper posting identity. Only the selected package's components are counted, with gross reconciliation for every selected line.
- Actual generated tax postings identify VAT (`TAX` group + VAT description) separately from Service Charge (`SVC`). Fractional tax amounts are accumulated before rounding once to satang. Missing/unknown/non-reconciling breakdowns are rejected, not estimated. The supplied templates' 7% caption is enforced against the verified rate.
- Outstanding is the fresh AR balance, independent of gross/partial payment. Service Charge remains in the taxable pre-VAT amount. Explicit non-taxable breakdowns remain separate. No accounting, settlement, print or email operation is used.
- Optional payer tax number is used only when the selected internal window and AR profile identity agree.

Both exact live comparison selections passed model verification: charge totals, VAT, pre-VAT totals, non-taxable totals, AR outstanding and every printed Reference match the supplied native Invoice pages. This is real data model verification; PDF/live UI verification is tracked separately below. Real values and identifiers remain outside Git.

## Template and document integration

`scripts/invoice-template-assets.py` prepares private, versioned assets from KAT, TSK, TLKL, WAKL, TLFO and TSAN RTFs. The existing local LibreOffice conversion is only a preparation tool; production rendering uses the already-installed pdf-lib/fontkit/Thai font on Workers. No paid dependency or new service.

Title, all five table headings, row values and total captions/amounts remain real PDF text. This preserves source editing and lets Add row below create Reference, Debit and Credit cells even when the selected row has no credit. Logo/banking/footer artwork stays private. A clipped hard break in KAT's bank-name cell is rendered as the complete fitted source text. Multi-page output repeats identity/header/columns and groups the closing totals and signature.

`ar_document_create_v5` snapshots Invoice source + template version into new jobs and fingerprints. It delegates through the existing actor/hotel, selection, atomic refresh, transient lifecycle and execution-queue checks. Replays of older commands join the older job. Existing source/version fields cannot change, and an existing command retains its original version after a new template becomes active.

Invoice templates live in `ar_private.invoice_templates`, with RLS and no anon/authenticated table grants. Only the service role can call the exact hotel/version getter. No customer PDF/JSON, banking asset or credential is stored in Git or a public browser bundle. The six initial assets occupy approximately 1 MB in the existing database; the database was about 124.5 MB before this increment.

## Verification and status

- Implemented: renderer/model/read adapter, private template catalog, source/version migration and new-job integration. No automatic native fallback when the new renderer rejects data.
- Tested: **1,338 unit tests**, TypeScript/build/assets/dry run. New model/read tests cover partial payment, fractional VAT, unrelated components, source and payer-tax identity, missing/duplicate pages/rows, changed balances and unsupported taxes.
- SQL: replayed **81 migrations and 36 rollback fixtures** successfully in an isolated local PostgreSQL; zero provider calls, and the temporary server was stopped. The new fixture covers old/new replay, active deduplication, template version changes, ACLs, source immutability and unchanged ledger balances.
- PDFs: all six private templates generated one-page and 45-row/two-page synthetic outputs. Every Reference appeared once; repeated headings and closing labels were extracted and rendered. All six layouts and the KAT continuation were inspected; TLKL currency placement was corrected and re-inspected.
- Browser: generated Invoice source passed five-cell insertion, typed Reference, deletion and actual mandatory Preview at 1440 and 1280 using synthetic data and deployed editor assets. No outbound email request.
- Database schema and six templates are installed; normal production Invoice generation has not yet been switched in the currently deployed Worker. Final deployed source, actual PDFs and UI checks will be recorded in PROJECT_STATUS.

Private working evidence is under ignored `.tmp/private-invoice-comparison/`. The supplied originals were not modified; existing document jobs were not overwritten or deleted.
