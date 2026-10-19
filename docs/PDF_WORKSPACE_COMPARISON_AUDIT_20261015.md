# PDF Workspace employee-workflow comparison audit — 15 October 2026

**Read-only assessment. No product fixes, production deployment or new feature enablement.**
The owner's final instruction is to inspect only and present findings/repair
options before changing anything. All edits below were to disposable synthetic
documents in isolated local test pages. No OPERA/Google Sheets/database changes,
real preparation mutations, customer mail or new paid services were involved.

## Decision

Keep the existing PDF Workspace and its employee workflow. Improve its layout
and collision handling independently of PdfCraft. Consider the PdfCraft native
single-line engine as a selectively qualified enhancement for text fidelity;
do not replace the Workspace or enable the current prototype wholesale.

There is now a direct same-input benefit: changing white INVOICE to BILL on a
blue table header produces a white patch with the existing exporter, while
the native PdfCraft line operation preserves readable white text and the blue
background. Conversely, the new engine's **block** rewrite silently changes
stroked/translucent text in three tested cases, and lacks the existing editor's
complete row, page, attachment and review workflow.

## Environments and evidence

- Existing component: actual `src/pdf/PdfWorkspace.tsx`, compiled with the
  existing browser build configuration into a scratch directory. CUA drove
  its real controls at loopback port 5286, including text entry, Tab, Escape, Undo,
  page selection, file picker, preview and downloads. The fixture contained
  Statement (1 page), Invoice-A (2 pages) and Scan-B (1 page); later tests attached PDFs.
- New component: isolated Rust/WASM bridge from pinned PdfCraft v0.8.0, as in
  [the initial trial](PDFCRAFT_WASM_TRIAL_20261015.md), at loopback port 5281. Real
  browser actions supplemented a 41-case executable engine matrix and one
  additional same-input colored-header comparison.
- Existing focused unit checks: **65 tests / 11 files** passed. The independent
  reviewer also ran17 tests / 5 files, which overlap those 65; they are not an
  additional 82 unique tests.
- New matrix: 28 accepted edit commands and 18 refused edit commands across 41 cases.
  All 18 refusals retained exact serialized bytes and revision. Of 24 saved outputs,
  20 qualified and 4 exposed exclusions/correctness problems. Some cases contain
  several commands, so these are not additive pass/fail case totals.
- Independent pypdf/Poppler at 300 dpi verification examined real saved files, not
  just API success.27 page pairs from the new matrix retained pixels outside
  the requested region; three target-style errors still occurred **inside**
  that region. Thus outside-region comparison alone is insufficient.
- Existing UI produced 11 distinct inspected PDF exports totalling 40 pages. The
  verification evidence includes full renders, text/image structure, page
  membership and comparisons to the appropriate original or previously
  qualified page. Original source files were not overwritten.

All fixtures, browser screenshots and detailed machine evidence remain under
`.tmp/pdfcraft-wasm-20261015/`, ignored by Git. The main evidence indexes are
`expanded-engine/REPORT.md`, `expanded-engine/comparison-color/REPORT.md`,
`current-baseline/verification/REPORT.md`, `comparison-review.md` and
`employee-ui/`. Test exports were generated in Downloads with Employee-prefixed
names and are individually identified by those reports.

## Confirmed issues in the existing Workspace

| Priority | Reproduction and observed consequence | Proposed repair — not implemented |
|---|---|---|
| High | Edit an address line to two lines. The right reference/date stay in position, but the inserted Building A line overlaps the existing Suite 2 line. Overlap survives PDF export. VAT remains present in this fixture. | Treat the address as a bounded left-column block. Insert space within that block or stop on collision, preserving the right column. Test VAT and downstream field placement; do not revert to page-wide row flow for addresses. |
| High | Select the whole table and nudge it 60 points downward. Grid and text move together, but Balance Due and its amount are overwritten without a warning; both disappear from the exported page. Undo restores them. | Detect destination occupancy before committing a move. Default to refusing a collision or require an explicit preview of the replacement. Keep source/destination geometry and hit testing consistent. |
| High | Edit white INVOICE to BILL on a blue header. The saved PDF contains a solid white rectangle and no readable new word. | Prefer a verified native single-line replacement where eligible. For the current overlay route, handle underlying background explicitly rather than painting an unconditional white rectangle. Do not guess one background color for nonuniform artwork. |
| Medium | Insert a portrait PNG through Add image. Source aspect 1240×1754 is forced into the generic 210×65 box, visibly flattening it; the distortion survives export. | Read intrinsic image dimensions and fit with aspect ratio preserved. Make independent stretching deliberate rather than the insertion default. |
| Medium | Attach a scan before another invoice. A Differences entry says Page 4, but clicking it correctly opens displayed Source page 5. | Use one visible/export ordering map for page labels, or explicitly distinguish original/source numbering. The tested file identity is correct; this is not an invoice mix-up. |

The current raster export is a separate **design limitation**: pages with actual
edits lose native searchable/selectable text. The tested edited first pages have
zero extracted characters and one page image. Unchanged/restored-equivalent
invoice pages retain native text. This does not mean all pages are flattened
regardless of whether they changed.

## What worked in the existing employee workflow

The following records group related clicks; they are a coverage inventory, not
a claim that every possible PDF or combination was tested.

| Record | Actual employee actions | Result |
|---|---|---|
| O01 | Rename output; attempt Preview before Apply name; apply name | Pending filename blocks Preview with a visible instruction; applied name reaches export. |
| O02 | Preview and download original combined package | Four-page original output reopens. |
| O03 | Click address; type newline; Escape; Preview/download | Right column remains fixed; left overlap issue confirmed above. |
| O04 | Undo text edits; edit a table description to two lines | Entire logical row expands across three columns; next rows/totals remain visible in export. |
| O05 | Add row below; type date, description and amount using Tab | Three cells populate as one row. PDF editing does not recalculate source financial totals. |
| O06 | Select inserted row; Delete row; Undo; Redo | All three inserted cells remove/return together. |
| O07 | Select table bounds including grid/header; use Shift+ArrowDown | Whole area moves; occupied-destination loss confirmed above. |
| O08 | Undo six table nudges | Table and overwritten total return in the UI. |
| O09 | Replace Latin-source text with Thai while retaining Helvetica | Explicit font warning appears; final Preview does not open for that unsupported source-font edit. |
| O10 | Choose Tahoma; set bold, italic and 11 pt; export | Thai is visibly readable in the saved page; untouched pages remain unchanged. This is the tested Windows/font route, not universal Thai shaping certification. |
| O11 | Restore original formatting, then original text | Font warning returns while Thai remains; restoring original text clears the incompatibility. Later Invoice-A outputs retain their original native pages. |
| O12 | Open image-only scan page | Scan is visible and UI correctly reports no detected source text, offering text boxes/whiteout. |
| O13 | Add bilingual text; choose Tahoma; set position | Visible in final scan export. |
| O14 | Whiteout the scan reference at a defined rectangle | Independent 300 dpi rectangle is entirely white; surrounding scan remains visible. This is not a general PDF redaction audit. |
| O15 | Add/edit Note, Stamp and Shape | All appear in saved scan output. |
| O16 | Add portrait PNG; set position/size controls | Image inserts, but initial aspect distortion confirmed above. |
| O17 | Preview pages; use previous/next and 50%/150% zoom | Correct pages render; the settled scan preview is not blank. |
| O18 | Attach a scan to Invoice-A; rename it | File appears in attachment controls, adds one page, and the new name persists. |
| O19 | Reassign attachment to Scan-B, then back to Invoice-A | Final binding is Invoice-A; saved combined and individual outputs verify membership. |
| O20 | Attach an invalid PDF | Visible invalid-PDF error; existing package and edits remain. |
| O21 | Reorder an Invoice page within its source; Undo | Selection follows the moved source page; Undo returns the order. |
| O22 | Delete a page; Undo | Page count decreases and restores. |
| O23 | Add blank page; Undo | Page count increases and restores. |
| O24 | Statement only | Preview contains 1 page. |
| O25 | Invoices only with attached scan | Preview contains 4 pages. |
| O26 | Statement + combined Invoices | Preview shows two files containing 1 + 4 pages. Separate-download limitation below applies. |
| O27 | Statement + each Invoice | Preview shows three files containing 1 + 3 + 1 pages. |
| O28 | Download all 5 pages as one combined file | Verified order: Statement; Invoice-A pages 1/2; its added scan; original Scan-B with edits. |
| O29 | Invoices-only separate mode; download Invoice-A | Independently verified 3 pages, pixel-identical to combined pages 2/3/4; no Scan-B content substituted. |
| O30 | Remove attached scan; Undo | Package decreases from 5 to 4 pages and restores to 5; subsequent preview/export works. |
| O31 | Click a Differences entry after attachment reordering | Correct file/page opens; displayed page-number discrepancy confirmed. |
| O32 | Edit white text on colored header; export | White-mask defect confirmed; same-input native comparison succeeds. |
| O33 | Attach encrypted PDF and await result | Explicit damaged/password-protected error; five-page package remains. |
| O34 | Close with unfinished work; Keep editing | Confirmation appears and Keep editing retains work. |
| O35 | Continue to email; review final files; Continue again | Actual component calls the test handoff with 3 reviewed files. Visible receipt confirms the simulated handoff; no Gmail call or real email occurred. |

Additional boundaries:

- A pointer drag partly moved an image, then the browser-control tool reported
  an interaction error. Position changed from 320/500 to 330/506 and Undo restored
  it. This does **not** qualify full pointer-drag/resize reliability or establish
  an application drag bug. Keyboard area movement and numeric positioning
  were exercised successfully.
- The harness exposed a legacy Save draft callback even in transient mode.
  Saving after the long sequence reported invalid saved edits. Production
  `DocumentRoute.tsx` passes no SaveDraft callback for transient preparations,
  so this mixed-prop harness observation is **not** a confirmed failure of the
  current production employee flow. The ordinary transient review/handoff
  completed afterward.
- Clicking Download reviewed PDFs for several files yielded only the first
  artifact in this local harness/in-app-browser context. Missing files were
  not counted as verified downloads. Combined output and an individually
  targeted Invoice-A export verified contents independently. Whether the
  multi-download limitation is browser policy, harness behavior or production
  behavior still needs a separate employee-browser check; no settings changed.
- The initial development server hung during dependency scanning, including
  plain HTML requests. Static build avoided it. This was not recorded as a
  production Workspace rendering defect.

## New PdfCraft findings

**Strengths demonstrated:** native same-line Latin edits; repeated-label/page
identity; selected bold/italic/subset/accented text; full rewritten output;
unchanged pages and graphics in qualified fixtures; atomic refusal; and the
same blue-header test where only one of 199 decoded operations changes. New text
remains searchable; blue background and Helvetica-Bold 10 pt white text remain.

**Confirmed blockers/limitations:**

1. Block rewrite changes stroked text to filled text, removes fill+stroke, or
   loses opacity 0.2 in three accepted fixtures. Correct-style reference renders
   differ by 5,120, 5,104 and 3,915 pixels respectively despite outside-region checks
   passing. Do not infer whole-edit correctness from those external pixels.
2. Line editing accepts invisible OCR text despite the prototype's stated
   exclusion; it changes searchable text without changing the visible image.
3. The allowed box shrinks after a shorter edit, so restoring a longer value
   may be refused even after save/reopen. Address-block editing can also be
   conservatively refused by neighbour/operator-position comparison.
4. General mixed-font Thai block editing, shared nested Forms, reflow and
   complete native table movement remain unqualified/unsupported.
5. In the new prototype UI, typing a replacement and pressing Export before
   Apply silently exports the prior text. Changing selection then returning
   loses the typed draft. Both were reproduced through actual browser controls.
6. Source review additionally identifies mutable command input during font
   loading, open-before-inventory commit, and missing target-style validation.
   These are review findings; not all were reproduced through an employee UI.

Native three-page UI test additionally edited pages 1 and 2 with different values,
returned to page 1, downloaded, and independently confirmed page 3 remained
unchanged. The matrix includes 50 pages, but its single Node timing is not a
browser-performance benchmark against the current Workspace.

## Proposed order of work, requiring the owner's next instruction

1. Repair the existing address-block spacing, occupied-destination handling,
   image aspect ratio and visible page-number mapping. These are primarily
   our editor/layout logic; replacing its PDF library does not solve them.
2. Preserve current row tools, Undo/Redo, scan editing, page/attachment grouping,
   filenames and review-to-email contract.
3. Qualify a native single-line operation behind the existing UI. Require
   visible simple-fill text, supported graphics state/font/transform, verified
   source/page/target identity, immutable permitted bounds and exact expected
   replacement text. Exclude block rewrite and implicit font substitution until
   independently repaired/qualified.
4. Compare final native candidates against correct target appearance as well
   as unchanged surroundings. Keep a deliberate current-renderer path for
   scans, row/area changes and unsupported content. Never switch output bytes
   after final review without a new review.
5. Only then benchmark matching documents/device across open, edit, preview,
   export and memory. This audit establishes fidelity differences, not that
   Rust necessarily makes the complete employee workflow faster.

No item in this proposed sequence has been implemented or enabled in production.
Digital signatures, arbitrary forms/annotations, every OPERA template, all
font/language combinations, mobile browsers and employee-browser multi-download
policy are not certified by these tests.
