# Direct REFERENCE editing — 21 October 2026

## Scope and implementation

Owner approved a bounded direct-text repair for the remaining dense REFERENCE
heading refusal. The installed PdfCraft adapter now admits isolated, balanced
image-painting blocks and exact empty-text deletion. It preserves every page's
resolved resources, non-text operators and all other text/style/geometry, including
after serialization. Unsupported Forms, signatures, annotations, text transforms,
ambiguous targets and unsupported fonts remain refused. Raster background
heuristics were not relaxed; rejected artwork heuristics remain outside runtime.

The editor accepts qualified edits after row movement only if the whole source
text rectangle survives in one intact fragment at the expected position. Earlier
overlapping overlays exclude native replacement to preserve paint order. Workers
are bounded to two running and eight waiting pages, latest queued state per page;
temporary worker misses are evicted from the cache. No new employee UI steps.

## Evidence

- Real rebuilt WASM: 16 direct REFERENCE shorten/clear cases across six installed
  hotel templates (synthetic data), an actual Workspace Invoice and a multipage
  Invoice. Independent PDFium rendering at 2x found zero changed pixels outside
  the target rectangle plus a four-pixel margin; unaffected pages matched.
- Actual Workspace component loaded the private original Invoice/Statement pair.
  Clicked the REFERENCE field, replaced text, Undo/Redo, Preview, saved and
  downloaded. Repeated with Delete text box, Undo/Redo and downloaded again.
  Output retained native text; independent rendering found zero changed pixels
  outside the edited field and a pixel-identical untouched Statement.
- Combined UI scenario: add a linked Voucher line in Statement, switch to Invoice,
  rapidly type a shorter REFERENCE, Preview both pages, save and download. Passed.
  Left-header comparison found zero changed pixels; Room label/value Y positions
  matched. Downloaded output visually retained the table, totals, VAT and bank
  information. This mixed layout route retains the existing raster composition;
  it does not promise selectable native text on transformed pages.
- Independent review found a split-row mapping defect during development. The
  intact-fragment check and regression test close it. Final reviewer reran all
  28 native worker/WASM tests and found no additional P0–P2 issues.
- Bounded browser engine matrix: 74 shorten/clear edits and 74 exports across
  REFERENCE, Total, amount and date fields where present, across all six templates,
  a multipage template and the actual Invoice/Statement pair. All passed; native
  probe accepted each source page. This is separate from the manual UI cases.
- Full suite: 2,120 tests / 215 files passed, TypeScript passed. An initial run
  alongside heavy browser work hit one unrelated 5-second test timeout; the full
  rerun with two test workers passed without increasing timeout limits.

Private inputs, render comparisons and downloaded files remain outside Git.
No real email, OPERA/Sheet write, ledger change or stored preparation mutation.

## Qualification limits

The earlier 2,091-field audit is separate evidence for the previous runtime.
A new exhaustive run was stopped after it overloaded the concurrent browser
test; its incomplete result is not counted as a pass. A bounded cross-template
field/export matrix is recorded with the release status. A test-only save callback
initially failed because it restored a second rendering session without rebinding
its font identities; corrected test code then verified the actual saved bytes.

No universal claim covers arbitrary uploaded PDFs, every font or every layout.
Original-source matching and conservative fallback checks remain active. The
adapter modifies PDF presentation only, never the underlying accounting records.

## Release

Deployed/enabled source `1d050776db722a73796ceeeb396c7de726d0e96b`, Worker
`ada34fb0-5ce2-49bc-89c6-eaf67ee17568`. Build, public health/database and six
unauthenticated email boundary checks passed. All 42 runtime bindings match the
previous release except COMMIT_SHA; tracker push/writeback remain enabled.
Hosted native worker and WASM bytes match the locally tested production build.
