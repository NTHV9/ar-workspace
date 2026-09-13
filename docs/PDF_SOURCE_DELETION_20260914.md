# Native PDF text deletion and empty row lines

## Reproduction

The last Voucher cell of a synthetic KAT/TSK Statement wraps into four native PDF text runs. Clearing those runs previously left editable empty targets. Adding a row still measured all four original lines, producing a 42.747 pt row instead of the 12.747 pt single-line control, with a 30 pt excess gap.

The old Delete layer action removed the replacement layer, exposing the original source text again. It did not delete a native text box.

## Implementation

- Delete text box keeps an explicit, validated native deletion mask while hiding its editor targets. Added text boxes are removed normally. Restore original text restores the original source font, size, position and text. Undo/Redo retain the full previous project state.
- Add row below compacts explicitly cleared native continuation lines before calculating the new row. Remove empty lines performs that compaction separately. The first source baseline remains the column template; intentional blank fields in a newly added row are retained.
- Compaction removes whole physical line pitches only where all native text on that continuation was explicitly cleared. Surviving text, other edits, paths, images and moved areas protect their space. Compaction plus insertion commits as one undoable change, after a rendering check.
- Deletion keeps source identity validation but does not require a font to draw absent text. Edited output remains opaque raster PDF pages without searchable source text, native font objects, annotations or attachments. Deleted text does not create a trailing blank output page.
- This changes browser PDF preparation only. Source PDFs and OPERA balances are unchanged. Existing transient preparation, review, email handoff and file retention rules remain in force.

## Verification

Original four-line reproduction was confirmed before the fix for both hotels. Evidence and test fixtures contain synthetic data only; no customer PDF or source extract is checked in.

Release verification and deployment identifiers are recorded in `PROJECT_STATUS.md`.
