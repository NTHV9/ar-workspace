# PDF Workspace: filenames, scanned images and address lines

Status: implemented and tested locally; production deployment pending.

## Owner scope

- Rename the output PDFs used for Download and Email, and the imported scan display names within the preparation.
- Repair scanned PDFs appearing as white pages.
- Adding a line in a non-table address must not shift the opposite column. Statement/Invoice item rows must retain whole-row insertion.
- Original files, financial records, recipients, actual sends and retention remain unchanged.

## Diagnosis and repair

The supplied three-page rotated monochrome scan uses CCITT image compression and renders correctly in Poppler. The installed PDF.js version uses a WASM decoder for these images; the application omitted its asset base URL. The original engine and native-copy output both resolved rendering with zero dark pixels. Changing only the decoder asset URL restored all three pages with identical original/native-copy render counts.

A shared loader now uses same-origin assets emitted from the exact installed pdfjs-dist version, including decoder fallbacks and licenses. Production readers share that configuration. Rendering checks failed image objects rather than assuming an all-white page is invalid. Image XObject dimensions are preflighted before a successful load, with an explicit 32-million-pixel bound; errors are visible rather than silently treating removed/failed images as a successful page. This is tested for normal image XObjects and the provided scan, not a claim of exhaustive support for every malformed or exotic encoding.

The standalone native Add row action previously always inserted a full-width flow band and invented a table-row identity. It now grows only the selected text block outside a recognized table. Source masking/whiteout stays intact; table items keep their existing whole-row flow.

Output names are keyed by stable delivery identity. Scan display names are keyed by source identity and never rename the Downloads original or change bytes/Invoice assignment. Enter or Apply name commits, Escape cancels. Names support Unicode, add an omitted .pdf extension and reject unsafe/reserved/oversized names and case-insensitive output collisions. Preview/review is invalidated while a name is pending or changes. Safe automatic defaults are separate from strict user-name validation; unexpected punctuation must not crash the workspace. Undo/Redo clears pending name state when the parent value changes.

## Verification

- Full unit suite: **1,706 tests / 178 files pass**; TypeScript and production build pass.
- Consolidated PDF browser suite: **39 cases pass**, covering all three delivery layouts, assignment/order/removal/Undo, renamed Download/Email reviewed handoffs, pending-name Undo/Redo, safe generated defaults/collision rejection, native/table row behavior, deleted text and Voucher regressions.
- Synthetic valid CCITT images render and survive native copying. Missing decoder resources and oversized image XObjects produce errors. Ordinary blank pages are not rejected through an ink heuristic.
- The actual supplied scan is read locally only: all three original/native-copy pages have matching nonzero rendered pixels; all three edited exports remain nonblank. Root visually inspects all edited-export pages, including their rotation and page contents. Customer bytes and rendered images stay in ignored private scratch space.
- Standalone address insertion leaves the opposite-column pixels and existing whiteout layer identical, adds no full-width row edit or false table identity and supports Undo. Separate Statement and Invoice item tests preserve full-row movement.
- Astra independently reproduces and verifies both corrected filename regressions and returns GO. Impeccable's remaining font warning concerns the owner-pinned Plus Jakarta Sans identity; no global font change is made. Other detector findings are existing surface advisories.
- Generated synthetic evidence is preserved privately; previously tracked reference/evidence PNGs are restored byte-for-byte. No customer PDF, image, credential or one-off recipient is added to Git.

## Boundaries

No database migration, storage deletion/retention change, OPERA action, Google Sheet update or email send is needed. Local Download/Email callbacks test filename/byte handoff without sending mail. Actual deployed decoder URLs, MIME types and source health must be checked separately before reporting production completion.
