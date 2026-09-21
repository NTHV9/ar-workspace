# PDF source-font recovery — 21 September 2026

## Reproduction and cause

A synthetic PDF with an embedded subset containing `D12345 - 1` reproduced the owner's exact source-font warning when the value was edited to `abcdefgh`. After the text was deselected, mandatory Preview displayed only a banner: the affected text/Font control was not selected or visible. The regression was run twice before the fix; the minimized run failed on the missing Layer text control in about six seconds.

Reproduction command: `node node_modules/@playwright/test/cli.js test tests/browser/font-recovery/pdf-editor.spec.ts --project=editor-harness --workers=1`.

The ranked possibilities were limited source glyph coverage, incorrect font/glyph extraction, and lost context in error recovery. Selecting Arial through the existing font control made the same edited characters render successfully; edits containing available subset characters retained the original font. The verified UX defect was that strict layer validation discarded page/layer context when throwing, so Preview could not return the user to the offending edit. This fixture establishes the reported failure path without copying the customer's PDF or asserting that every font has the same limitation.

## Change

- Keep strict source-font validation. Unsupported glyphs never render silently or permit an unverified export.
- Preserve the error's source-font classification, page ID and layer ID. A failed Preview selects the relevant source page and text, reopens formatting and focuses the editor while keeping all edits.
- Offer an explicit **Use Arial for this text** action near the selected text, using the same existing font-change path. Font size, color, weight, original masking, fit/flow, Undo/Redo and mandatory output review remain in force. The user may instead select another allowlisted font.
- Retain original glyph rendering when supported. There is no automatic substitution, arbitrary font download, OPERA write, file-retention change or customer artifact in the repository.

## Evidence and limits

The five focused browser cases passed: desktop/laptop recovery, explicit replacement control, cross-page error location, Undo/Redo, available-glyph preservation and acknowledged output. Saved output retained both pages; the untouched page kept native text, the edited page was flattened without hidden original text, and the original source-byte hash stayed identical. Inspected synthetic warning screens and output rendering showed the new text completely. Full regression and deployment results are recorded in PROJECT_STATUS.

An already open editor keeps its existing code and tab-local edits. Do not reload or replace that session to demonstrate the fix. Its existing Font → Arial control remains a verified immediate workaround; the new recovery interface is available after the application is loaded with the new release.

Deployed source `a72c2c0231dd1a4e4c3ed8b8abb55f8841a219d2`, Worker `e906bdb7-bc28-4158-babe-97af75b92e5e`; [PR53](https://github.com/NTHV9/ar-workspace/pull/53) merged. Final-source CI, 1,292 unit tests, 70 editor cases, two additional deployed-bundle PDF cases, build/assets/dry run and public health/authentication boundaries passed. Deployed-bundle tests used synthetic PDFs and intercepted all application API traffic; the customer's active edit session and source PDF were not accessed or changed.
