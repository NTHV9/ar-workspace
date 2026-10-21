# Current Invoice PDF corpus audit — 21 October 2026

## Scope and source identity

Snapshot captured at 2026-10-21T13:48:14.574Z. It contains 2387 nonzero AR rows
across six active hotels. TSUN has no current AR rows in this snapshot. The audit
covers current records, not every closed historical ledger entry. All stored
source-file references returned by the database were also checked.

Of the current rows, 1720 have positive selectable balances and all
required Folio/reservation selectors. The other 667 rows are separately classified:
617 missing selectors (616 CCR and one BTA), 38 credits and 12 positive rows not
independently selectable. These are not counted as successful PDF generation or
editor tests. A missing selector is not proof of a corrupt PDF.

| Hotel | Current nonzero rows | Generation candidates | Generated | Generation failures |
|---|---:|---:|---:|---:|
| KAT | 902 | 615 | 599 | 16 |
| TSK | 263 | 214 | 212 | 2 |
| TLKL | 167 | 95 | 88 | 7 |
| WAKL | 282 | 233 | 229 | 4 |
| TLFO | 147 | 112 | 112 | 0 |
| TSAN | 626 | 451 | 384 | 67 |

Runtime under test: deployed source `1d050776db722a73796ceeeb396c7de726d0e96b`.
All six active invoice templates were verified as `invoice-rtf-20260921-v2`.
Production code was not changed by this audit. Source reading/rendering used the
same application Invoice functions in an authenticated, temporary diagnostic
session; no document preparation, Gmail draft/send, billing date or Sheet change
was created. Normal OPERA tax-evidence/report reads can retain provider-side print
metadata; no accounting ledger write was requested.

## Results

- Generation attempts: 1720/1720; 1624 PDFs obtained.
  The initial pass obtained 1,623 PDFs and 97 failures. Three generic read failures
  were rechecked using the production subrequest allowance: one succeeded, two
  still failed validation after reservationFolios. Final outcomes use the latest
  result while retaining all first-attempt and recheck evidence.
- Stored references: 683 checked; 356 readable, 327 rejected as expired by the
  existing retention policy. Expiry was not bypassed and is not an editor defect.
- Unique readable source byte sets: 1980. Exact SHA-256 duplicates
  reuse the same test result; identity-to-file mapping remains in private evidence.
- Native inspection/edit qualification: 1980 files, 12452
  accepted shorten/clear edits on REFERENCE, Total amount and date fields where
  present. Native refusals on older source pages remain distinct from complete
  Workspace failure; the application fallback path was tested separately.
- Independent PDFium verification: 1980 files,
  2389 original pages rendered and
  12452 edited-page comparisons.
  0 visual/render failures outside
  target rectangles (four-pixel antialias margin).
- Browser application-engine checks: 1980 files,
  2389 pages and
  5752 exports; 0 editing/export errors.
  This runs the deployed editor's loading, render, source detection and export
  functions in the browser; it is not a claim of manual clicking on every invoice.
- Independent copies resolved 375 browser page-level pixel-difference alerts across 184 files;
  0 copies differ under PDFium.
  The browser comparisons remain in evidence rather than being redefined to pass.
- Visible generated-document checks: 1624 files checked for Folio
  presence, printed outstanding balance against the snapshot, and text outside
  page bounds; 0 files need follow-up.

## Generation failures requiring follow-up

| Result code | Count |
|---|---:|
| document_invoice_tax_rate_unsupported | 57 |
| document_invoice_character_unsupported | 3 |
| document_invoice_data_invalid | 30 |
| read_failed | 2 |
| document_invoice_tax_code_unsupported | 1 |
| document_invoice_ar_tax_unverified | 3 |

Representative failures were reproduced with private source packets. All three
character failures contain a Tab in the cashier display name. Data-invalid examples include
selected Payment rows without postingBreakdown, which the current model treats
as revenue tax components. Rate-check failures include generated VAT/service
combinations and separately posted VAT groups that do not satisfy the current
blanket ratio check. Preserve OPERA's actual amounts and obtain appropriate
source controls before changing these rules; never silently invent zero VAT.
Generic read failures are not evidence of successful tax validation.

These failures occur before PDF Workspace editing. They remain unresolved in this
audit and must not be presented as passing invoices. Exact Hotel/Invoice/Folio
identities and reproduction packets are private, outside Git.

## Uploaded PDFs

The owner wants externally uploaded PDFs preserved by default, without automatic
text rewriting, resizing or repair. Existing untouched-page copying already does
this for the tested documents; no new editing restriction or UI step was added.
Three actual uploaded PDFs (eight pages) were appended to a Statement/Invoice pair
in all three delivery modes. Five files downloaded, 30 total page comparisons
(24 external-page comparisons), all pixel-identical under PDFium. This establishes
page/content preservation; merged-container bytes are naturally not the original
standalone file bytes. No universal claim is made for encrypted/signed/forms PDFs.

## Evidence and limits

Inputs, SHA mappings, generation results, native edits, visual results, browser
results, displayed-value checks, diagnostics and downloads remain in ignored
private audit storage. Customer JSON/PDFs and temporary credentials are not in Git.
The earlier real employee UI click tests remain separately documented in
PDF_NATIVE_REFERENCE_20261021.md and PDF_STABILITY_AUDIT_20261021.md.

This is a fixed-snapshot audit. It does not certify future invoices with new source
formats, every possible user edit, or end-to-end email delivery for each bill.
No runtime fixes or deployments are included in this inspection.
