# PDF Workspace: longer text and row insertion

## Implemented, locally tested; deployment pending

The actual application reproduced two defects with private generated Invoice PDFs:
longer REFERENCE text failed Preview, and adding one row to a one-page Invoice
created a second page containing only the stationery footer.

The native replacement engine now accepts an explicit, bounded right edge for
single-line growth. It still preserves font, baseline, vertical position, all
other text, non-text operators and resources. The actual painted extent must fit
the page and the permitted source fragment. Overlapping source text, later artwork
and earlier editor overlays remain protected, including square-capped diagonal
strokes. Four-argument callers retain the original-bound behavior. The verified
WASM hash is recorded in `native/README.md`.

Row insertion can consume a downstream full-width source gap when every rendered
pixel is opaque white and mapped text, artwork, layers and fragment boundaries
prove it empty. This is only used to avoid otherwise unnecessary overflow; it
does not identify a footer by template coordinates. The paired edit records exact
ownership, and deleting that inserted row restores the consumed space. Uncertain
later edits retain their space rather than erase unrelated content. Existing
preparations and reviewed bytes are not silently rewritten.

## Evidence

- Native tests: 45 passed, including red/green cases for longer text, page bounds,
  later text/artwork and stroke-cap geometry. Independent review found no remaining
  concrete P0–P2 finding in this change.
- All 87 repaired real-source PDFs / 241 pages: 328 longer REFERENCE/Total edits
  succeeded. Independent PDFium rendering found zero changed pixels outside the
  target union. This extends the prior shorten/clear corpus; it does not assert
  arbitrary PDF or formatting support.
- Independent row review: 50 tests across whitespace, inserted rows, flow,
  restoration and compaction passed; TypeScript passed. Private actual-source
  geometry replay remained one page, with zero nonwhite source pixels lost or
  duplicated and unchanged pixels below the consumed gap.
- Actual application UI with three private real Invoice sources: longer text
  survives account switching and exports; an inserted five-cell row previews and
  downloads as one page; delete, Undo and Redo work. The inserted/deleted exports
  have identical header and footer pixels. A generated-source fragment comparison
  separately proves content preservation.
- An actual Total amount edit survives transition to email, appears in the
  downloaded attachment, preserves the two other occurrences of the old amount,
  and changes zero pixels outside its field. All three Account tabs open in email
  mode after the batch transition.
- A multiline Voucher edit exports on one page; table/footer pixels are identical.
  The left header has no geometric change, with 64 pixels differing by only one
  grayscale level in the renderer comparison. This is not recorded as pixel-zero.

UI tests use the actual React application and PDF engines with private source
bytes and a local isolated API fixture. Provider access is blocked, so these tests
do not prove live Gmail delivery. No actual email, Sheet dates, business history,
OPERA accounting or externally uploaded originals were changed. Source PDFs,
screenshots, raw output and identifiers remain ignored private evidence.

## Separate unresolved source work

The new Non-VAT classification investigation is not part of this qualified UI
change. It fixes two remaining source cases locally but currently refuses five
previously generated cases because exact native Folio evidence is ambiguous.
It must not be deployed as a regression-free replacement of the 87-case release.
See `OPERA_DIRECT_AR_TOTALS_20261022.md` for the source investigation.
