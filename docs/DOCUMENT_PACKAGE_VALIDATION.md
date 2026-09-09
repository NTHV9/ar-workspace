# Document package validation — 9 September 2026

## Scope and authorization

Owner approved real multipage Statements, all three Statement/Invoice delivery forms, editing/save/reopen/download, duplicate commands and error handling. No emails were sent. Statements used the explicit Generate in AR Workspace option; Invoice/Folio PDFs came from the existing OPERA native route. Native generation can record OPERA print history; it did not modify AR accounting balances. All real documents/downloads remain private.

## Real package results

| Hotel | Delivery | Downloaded files | Pages per file | Result |
|---|---|---:|---|---|
| KAT | Combined | 1 | 3 | Statement followed by both selected Folios |
| KAT | Statement + Invoice bundle | 2 | 1 / 2 | Correct grouping and order |
| KAT | Statement + each Invoice | 3 | 1 / 1 / 1 | Each selected Invoice in its own file |
| TSK | Combined | 1 | 4 | Two-page Invoice remains consecutive |
| TSK | Statement + Invoice bundle | 2 | 1 / 3 | Both Invoice PDFs in one bundle |
| TSK | Statement + each Invoice | 3 | 1 / 2 / 1 | Two-page Invoice stays in one file |

Source jobs: KAT `6afcab18-8c1e-49b6-b09f-05db7feeeee6`, TSK `a3ace7b5-d7d8-4690-a2e9-21b173e43884`. Each has one generated Statement and two selected native Invoice sources. The same sources were reused when changing delivery form, without reprinting Invoice PDFs for each form. Preview was required before each private save; every file had to render before acknowledgement became available.

All 12 downloaded PDFs were reopened with pypdf; page counts, selected Folio identifiers and document order were checked. SHA-256 and byte count of all 12 files matched server-registered private upload receipts (12/12), including earlier saved revisions. Browser-tool download events timed out, but the browser had actually written the files to Downloads. Filesystem reads and matching server receipts establish download success, rather than treating a button click as proof. Working copies and hash reports are under ignored `private/document-validation-20260909`.

Some native printed Invoice pages do not show the internal AR Invoice number. Verification used the printed Folio, expected source-page grouping and the backend's Hotel/Reservation/Invoice/Folio selector; it did not assert that an absent internal number was visible on the PDF.

## Editing, persistence and safeguards

- In the live KAT job, added a clearly temporary internal QA note, saved Draft, closed/reopened, and verified the exact note through the editor UI. Removed it before final review. Final separate downloads were checked to contain no QA note. Final KAT state is revision 4 (combined, split, draft, separate); TSK is revision 3 (combined, split, separate).
- Both jobs preserved the saved split delivery setting on reopen, overriding the initial combined job preference.
- Replayed the KAT job's original creation command in a database transaction: same job returned, total job count unchanged. Rolled back the test transaction. A stale revision was rejected with `document_revision_conflict`, also in a rolled-back transaction.
- Added a unit test for private-storage HTTP 503: API returns `document_file_unavailable`, with no substitute PDF. Failure cases were simulated; production services were not deliberately disabled.
- Existing tests exercised wrong-owner/file rejection, malformed PDF uploads, interrupted generation without automatic repeat, failed final preview preventing acknowledgement, stale save/export results, unsaved edits during auth refresh, opaque edited-page export and source grouping.

## Multipage checks

Initial live selections of 20 invoices each produced two-page KAT and TSK Statements. Extracted the displayed Folio IDs and amount rows from the PDF editor's actual text-detection DOM. Compared with each immutable manifest in Supabase: 20 rows, zero missing and zero extras for both hotels. Sum of displayed row balances equaled displayed Balance Due. Inspected both pages, repeated account header and the complete closing section.

Jobs: KAT `5261b501-0406-4825-ab85-29dd7e7a404a`, TSK `1881b350-c286-4182-9dee-de78bfc443ac`. Expanded coverage to 40 KAT and 27 TSK invoices. The first KAT 40-row PDF demonstrated table continuation and repeated column headings on page 2, with closing section intact.

Final post-fix downloads were verified against their immutable manifests and private upload receipts:

| Hotel | Selected rows | Pages | Invoice rows per page | Missing / extra | Amount and hash checks |
|---|---:|---:|---|---|---|
| KAT | 40 | 2 | 34 / 6 | 0 / 0 | Passed |
| TSK | 27 | 2 | 27 / 0 | 0 / 0 | Passed |

KAT explicitly exercises continued invoice rows and repeated table headings. TSK's second page holds the closing section with the repeated account header; it does not establish a live TSK invoice-table continuation. Both final PDFs pass numeric-header and Voucher-center geometry checks. Together with the package downloads, 14 final downloaded files matched saved byte counts and SHA-256 receipts. The earlier KAT 40-row PDF that exposed boundary whitespace is retained privately as failing regression evidence.

Review: [KAT 40-row Statement](https://ar-workspace.ar-c82.workers.dev/?documentJob=5631fb2c-b95b-4e55-95ac-8d8597d2b189), [TSK 27-row Statement](https://ar-workspace.ar-c82.workers.dev/?documentJob=9618dc9a-4ef8-4fe4-b99e-8db86055cb28), [KAT document package](https://ar-workspace.ar-c82.workers.dev/?documentJob=6afcab18-8c1e-49b6-b09f-05db7feeeee6), [TSK document package](https://ar-workspace.ar-c82.workers.dev/?documentJob=a3ace7b5-d7d8-4690-a2e9-21b173e43884). Authentication is required.

## Bugs found and fixed

1. **Initial delivery preference ignored:** new jobs opened as combined even when the requested layout was split/separate. Added `initialDelivery` to the editor and mapped job layout values. Restored projects retain their saved delivery choice. Two browser regressions reproduced the old bug and passed after correction, including on deployed assets.
2. **Voucher boundary whitespace:** detailed PDF geometry checks found a small offset on real KAT values carrying trailing spaces (29 of the 40 selected references). Trimmed only presentation boundary whitespace before wrapping/centering; source values, digits and punctuation are unchanged. Synthetic long/two-line whitespace cases failed before the fix and passed afterwards for both hotels. Numeric-column alignment and original OPERA headings/whole-account Aging remain unchanged.

## Test execution and deployment

- Final implementation: 156 unit tests, Typecheck, Vite build and connector bundle passed.
- Seven browser tests against deployed frontend assets passed with synthetic/intercepted business API responses. Thirteen local Editor harness tests passed in a separate run with the development server already started. They include viewport checks at 1440×900 and 1280×800. These synthetic tests do not substitute for the real-data checks above.
- Mixed cold-start browser runs encountered localhost navigation timeouts before the harness loaded; repeated runs failed two or three early harness cases while the remaining cases passed. Standalone/prestarted harness run passed all 13. Root cause of the startup behavior is not established. An experimental Vite entry-list change did not resolve it and was reverted. No timeout/assertion was weakened to obtain a pass; the cold-start runner limitation remains.
- Source `9767738294fc49839ebf40b99a99ca37c8f3d9af` delivered the delivery-preference fix. Final source `51226191d0cb412e39786eeb2ce6b27d8d940126` additionally fixes Voucher boundary whitespace; deployment `6ce77294f884449fada551f15b405797`, workflow version `b7a187cc-5dec-4b44-bedb-13f69348d532` on existing `ar-workspace` / `ar-workspace-refresh`. No new migration, paid service, email integration or legacy-system modification in this increment.
