# PDF Workspace stability audit — 21 October 2026

## Outcome

The audit found a further real-source regression when shrinking an edited Invoice header back to its original height. This has a small geometric repair and a failing-then-passing regression test. A separate dense-heading mask repair did not meet the artwork-preservation requirement and was quarantined, not released. **The Workspace is not declared universally defect-free.**

No new editor capability was added. No production preparation, OPERA ledger, Sheet date or email history was changed by testing; no real email was sent.

## Scope and sources

Reviewed editor changes from `b0b1fb2` (before the October repair implementation) through the current source, covering source extraction/style, native qualification, mask verification, layout movement, page order, attachments and batch sessions. This was a source-history comparison, not a complete browser replay of the old release.

Private tests used all six installed hotel templates with synthetic invoice data, a two-page KAT invoice with a long Voucher, and an actual Invoice plus linked Statement previously downloaded through the authenticated PDF Workspace source Preview. The real pair was edited through the actual PdfWorkspace component locally; its cloud preparation and original bytes were untouched. Other hotels' actual customer invoices were not all sampled.

## Field qualification

Every detected nonrotated source text target in these inputs was shortened and cleared independently. Relevant header/Voucher/financial fields also exercised export. Counts are browser edit attempts, not independent unit tests or an assertion of arbitrary PDF coverage.

| Source | Attempts | Refusals |
| --- | ---: | ---: |
| KAT template | 238 | 2 |
| TSK template | 230 | 2 |
| TSAN template | 230 | 0 |
| TLKL template | 230 | 2 |
| WAKL template | 230 | 2 |
| TLFO template | 230 | 2 |
| KAT two-page invoice | 406 | 4 |
| Actual Invoice | 181 | 2 |
| Actual Statement | 116 | 0 |
| **Total** | **2,091** | **16** |

There were 2,075 successful attempts and 88 export checks. All 16 refusals concern shortening/clearing the dense **REFERENCE** heading (eight occurrences, including repeated pages). The full pipeline report is private at `.tmp/pdf-stability/before.private.json`. An experimental all-green report under `after.private.json` does **not** qualify the rejected implementation for release.

## Real-source header regression and repair

Actual UI steps: edit Voucher on the real Statement to two lines; linked Invoice labels/values move down together; remove the second line. The last step incorrectly reported `The right header would cover artwork`.

`verifyInk` intersected the destination strip with each source fragment, then rounded fractional bounds to pixels without first excluding empty intersections. A shared edge with zero geometric area could become one pixel after floor/ceil, reading ink from a neighboring fragment. Added `right <= x || bottom <= y` rejection before raster iteration. Positive-area intersections retain all existing checks. A fractional 144.75pt boundary at scale1.5 reproduced the exact error before the repair and passed afterward.

Rechecked the real UI with the repair: adding and removing the Voucher line succeeds, and Preview/export succeeds. The linked fields stay identical, Room label/value return together, and left-header comparison reports zero changed pixels. Actual downloaded files are independently rendered for visual checking. Release evidence is recorded in PROJECT_STATUS.

## Dense-heading fix withheld

The current mask cannot prove a flat interior for some closely packed REFERENCE headings when the outer ring intersects a table rule. This remains an unresolved editing limitation.

An attempted fallback inferred the surface from side strips and compared glyph mass/topology. Independent review demonstrated solid/connecting artwork and then faint connecting marks which could still be erased. Further threshold relaxation was rejected. Experimental code and test harnesses are isolated in ignored `.tmp/pdf-stability/quarantine`; no side-strip/topology code remains in production source. A regression now keeps dense masks unqualified across 10 no-mark/black/gray/light/solid permutations, with and without shared faint bridges.

**Next qualification needed:** reliable original-text/background separation rather than another permissive raster heuristic. Do not count the temporary candidate's successful ordinary-file tests as proof of artwork safety.

## Staff workflow checks

- Actual source pair: edit linked Voucher, add/remove a line, Preview, local export and downloaded-PDF rendering. The final geometric fix is verified against the reported class of real documents.
- Synthetic batch: select two accounts across hotels; edit a two-line address; Undo/Redo; rename output; add a scanned PDF; rename it and reassign it to the other Invoice in the same account; switch accounts and return. Edits, filename, attachment identity and page order persisted.
- Go to email prepares both accounts. A simulated lost PDF-review response was recovered through retry using the committed reviewed package. Both accounts entered email mode; no real send occurred.
- Downloaded batch files had four pages for the edited account and two for the untouched account. Independent rendering found the attached scan pixel-identical to its source and an untouched Invoice page pixel-identical across the downloads. The edited address, subsequent address line, table and total were visually inspected.
- Delivery modes were clicked in the UI with a Statement and two Invoices (one multipage): Statement plus combined Invoices produced two files with 1/3 pages; separate Invoices produced three files with 1/2/1 pages. Combined delivery was exercised in the real-pair and batch download flows.
- Table UI: adding a newline expanded the row and Preview succeeded; adding a row exposed all five column cells, including blank fields. A full table-drag matrix was not repeated in this pass.
- Separate native qualification: PdfCraft actually applied a supported single-line blue/white-header edit; pixels outside the word were unchanged. Unsupported graphics-state input used fallback successfully. Native vector artwork was preserved; the corresponding raster-artwork case was refused. The real/template Invoice probes all reported page-level native refusal, so those tests exercised our raster path, not PdfCraft rewriting.

## Evidence and limitations

Private original/template PDFs, downloads, rendered images and harnesses are under `.tmp/pdf-stability`, `.tmp/voucher-mask` and the named test Downloads. No customer PDF/JSON was committed. The browser control session required recovery during testing; some early download clicks occurred before the local test callback completed and are not accepted as proof. Final files are checked after save completion.

Final unit suite: 2,106 tests / 215 files passed; TypeScript and production build passed. Independent review approved the empty-intersection fix and separately verified that the dense-mask experiments were removed from runtime. Mock handoff does not prove provider delivery. OCR/editing text embedded in scans, arbitrary third-party fonts/forms, every hotel's customer PDF, all editing sequences and every browser were not exhaustively verified. The unresolved dense heading must remain visible in the findings, even when the regression suite passes.
