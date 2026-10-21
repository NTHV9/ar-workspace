# Invoice Voucher overflow and right-column editing

## Cause and change

The Invoice renderer reduced Voucher text to 6pt but then rejected references that still exceeded the original one-line header width. The reported production reference lengths were 44 and 59 characters. Reference selection and financial data are unchanged.

Ordinary values retain their previous single-line sizing. Longer values wrap at readable size, retain every character and repeat on continuation pages. Right-hand labels/values move together. Left address, tax/company/guest identity fields keep their positions. Right rows avoid actual wide left-field extents; the table moves only when the right block needs its space. Signature/footer bounds still control pagination.

Workspace edits now update linked Voucher fields as one Undo operation across Statement and Invoice pages. Invoice headers use bounded right-column source moves, so labels and values keep their source typography. Statement fields retain their original full row-height floor and table-row flow. Only the edited field's owned spacing can be reclaimed. The header raster check prevents a moved block overwriting artwork; it uses the same sampling scale and exact measured source-mask footprint as the renderer. Mask verification uses actual observed glyph runs for centered/multiline fields and still checks the full original mask when drawing must be clipped beneath a reclaimed header area.

## Evidence

- Red reproduction: 44/59/120-character render cases failed with document_invoice_voucher_too_long before the fix, then passed without dropping text.
- Full release suite: 2,101 tests / 215 files passed; TypeScript and production build passed.
- Independently reviewed; latest focused recheck ran 28 tests and reported no remaining P0–P2 findings.
- Rendered all six actual hotel templates with synthetic financial data and long references. Both reported-length KAT references were used privately; generated documents and template banking assets remain outside Git. All cases produced two-page PDFs with exact repeated Voucher metadata. KAT output was visually inspected for wrapped reference, row placement, left identity and signature/footer layout.
- Actual browser trial combined one Statement and two Invoice pages. Added a Voucher line, removed it, used Undo and exported the package. Label and value of Room No. moved by the same 10pt and returned together; pixel comparison of the left header found zero changed pixels on both Invoice pages.
- A separate browser trial started with an already-wrapped long Voucher, shortened it, and downloaded the three-page combined PDF. The left-header comparison again found zero changed pixels; the exported Invoice visibly retained Room No., room number and subsequent fields.
- Regressions include sequential edits to a lower right-hand field, wide left guest text, reclaiming table space, tall Statement guest rows, artwork at a move destination and artwork in original textbox padding.

## Limits and release

No email, ledger entry, Google Sheet cell or cloud schema was changed. These tests establish renderer/editor behavior, not a fresh live OPERA generation of the user's failed preparation. That failed job must be prepared again after deployment; opening available files only still omits its unavailable source.

Arbitrary references exceeding the supported metadata/page layout budget remain rejected rather than truncated. Header movement fails closed when source artwork or geometry cannot be verified. Deployment is recorded separately in PROJECT_STATUS.
