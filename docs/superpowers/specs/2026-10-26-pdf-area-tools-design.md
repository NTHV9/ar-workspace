# PDF area selection and drawn whiteout

Status: implemented, tested, deployed and enabled on 26 October 2026. Application source `b4921fcd359ac3db6a827f6d1e527c0de86206eb`; see `docs/evidence/pdf-area-tools-release-20261026.json` for qualification and the live Worker receipt.

## Intent and scope

The owner wants to drag around several PDF text boxes, such as eleven Invoice References, and delete them together. Whiteout should be drawn directly over the desired area and must remain movable and resizable afterward. All new interface text is English.

This changes PDF preparation only. It does not change OPERA, ledger amounts, VAT, backend resources, retention, emails or reviewed-file handoff. Preserve the English one-click send/results release at `a13d1b55d15cdac56319177549b3c6d0d164cc1c` and blank-paper deselection from `f866a7c46c75041933a13736ce889375cf6fa69f`. Planning checkout: `codex/pdf-area-tools-20261026`, baseline `86d6c6a`.

## Behavior

- In Select, dragging from blank paper creates a marquee. Fully enclosed visible text boxes are individually highlighted live while dragging, and remain highlighted after release; partial intersections are excluded. Existing clicks, object movement and resize controls retain their behavior. A single click on blank paper or gray surround clears every selection highlight without editing the PDF. Clicking editable text still opens its normal editing box.
- Selection includes untouched detected source text, edited replacements and added text/note/stamp boxes on the active logical page. Source rectangles follow existing row edits. A hidden original and its visible replacement count once. Repeated text at different positions remains distinct. Graphics, lines, whiteouts, deleted masks, empty text and currently unsupported rotated source targets are excluded.
- Show `N text boxes selected` and `Delete selected text`. Delete/Backspace performs the same action when focus is outside an input, textarea or editable content. Escape clears selection. Selecting alone creates no layer, dirty state, history entry or Preview invalidation.
- One delete is one project commit and one Undo step. Source text uses the established explicit deletion-mask representation; added text is removed. Preserve row edits, allocated spacing, neighboring coordinates and all unrelated layer values. Never call row deletion, `releaseTextSpace`, stationery reflow or table/area movement for this action.
- Builder ruling: linked Voucher fields are excluded from marquee deletion because their existing edit command synchronizes fields across pages and can reflow the header. Only when the marquee touches an excluded bound field, explain in English: `Linked Voucher fields are edited individually to keep matching pages in sync.` The existing single-field editing/deletion path remains intact. Determine binding from existing field identity and metadata, never text/column names. This exception concerns bound Voucher fields, not ordinary Invoice Reference or header text.
- Whiteout arms a draw tool with `Drag on the page to draw a whiteout. Press Esc to cancel.` Draw in any direction, including over existing objects. Show a temporary rectangle; on valid release create one standard whiteout with white fill at that exact clipped page rectangle, select it and return to Select. Arming, clicks and cancelled gestures create no object or history.
- The drawn whiteout moves and resizes through the existing layer controls, including numeric geometry. Whiteout-specific minimum width/height is 0.1 logical PDF unit; other object minima remain unchanged. Moving or resizing must not expand a small whiteout to the old 15-unit minimum.

## Gesture rules

Both features share a rectangle gesture lifecycle. Capture the pointer and freeze the initial paper client rectangle, logical page width and canvas height. Map coordinates through that frame and clip at page edges. A valid draw needs at least 3 CSS pixels of travel on either axis and both resulting logical dimensions at least 0.1; a click or degenerate line does nothing. No fixed Invoice coordinates are permitted.

Escape, pointer cancellation/lost capture, tool/page/source/session/zoom/revision changes and unmount abandon the pending gesture. Scrolling before a gesture works normally; scrolling or paper-frame changes during a gesture cancel it. A late pointerup cannot apply stale geometry. Gesture state is transient and never captured in an Account editor session.

Account switching, Preview and Exit must not capture or act on an unfinished gesture; use a dedicated active-gesture fence in the existing control/busy checks, without marking the project dirty. Escape cancellation must run before generic busy handling. Selection is invalidated on project revision/page/source changes. The scroll-surface blank-click handler must not erase a completed marquee or consume toolbar/property controls.

## Approach and boundaries

Reuse the existing rendering/export/mask engine. Add pure geometry, displayed-target and batch-deletion helpers, then one UI owner integrates a small area gesture hook with `PdfWorkspace.tsx`. Fully contained hit testing is a deliberate builder choice to protect adjacent Date, Description and amount columns; use only 0.01 logical-unit numerical tolerance, not the broader row-layout intersection/snapping behavior.

Alternative considered: extend the native Move table / area picker. Its outward expansion includes touched text and its commit moves pixels/row bands, conflicting with selective deletion. Alternative considered: use a whole-row or column rewrite; this risks neighboring content and is outside the owner's request. No new background-proof gate or renderer rewrite is needed.

## Acceptance evidence

Use synthetic AR Invoice rows and inspect the actual browser plus reopened exported PDF pixels. Prove eleven source References, added-only and mixed selections, repeated values, prior row edits, partial edge exclusion, one Undo/Redo, unchanged neighboring text/amounts/lines, and no cross-page mutation. Prove zoom 60/90/150, scrolling, clipping, all drag directions, cancellation/no-op/history behavior, drawn whiteout movement/resize below 15 units, Preview and export. Preserve existing click-away, native move/row/font tools and linked Voucher tests. Customer payloads and PDFs must not enter Git; do not replace existing visual baselines merely to pass tests.

Global/parent instructions still apply: scoped worktree edits, no external resource mutation or mail, no secrets/customer data in tracked artifacts, and separate implemented/tested/deployed/enabled reporting. The owner has already supplied scope and execution method, so this focused plan adds no product-question or permission gate. The unrelated project-audit status block and audit file remain untouched.
