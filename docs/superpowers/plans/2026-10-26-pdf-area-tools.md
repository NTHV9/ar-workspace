# PDF Area Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select and delete enclosed PDF text boxes in one operation, and draw whiteouts that remain movable and resizable.

**Architecture:** Pure helpers resolve visible text targets and produce an immutable page deletion without reflow. One UI implementer owns both tools' shared gesture hook and all `PdfWorkspace` integration. Existing source masks, standard whiteout layers, Undo and rendering/export remain authoritative.

**Tech Stack:** Existing React, TypeScript, PDF.js/pdf-lib, Vitest and Playwright; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-26-pdf-area-tools-design.md`

## Global Constraints

- All new interface text is English.
- This changes PDF preparation only. It does not change OPERA, ledger amounts, VAT, backend resources, retention, emails or reviewed-file handoff.
- One delete is one project commit and one Undo step.
- Never call row deletion, `releaseTextSpace`, stationery reflow or table/area movement for this action.
- Whiteout-specific minimum width/height is 0.1 logical PDF unit; other object minima remain unchanged.
- Customer payloads and PDFs must not enter Git; do not replace existing visual baselines merely to pass tests.
- Preserve a13d1b5 English send/results and f866a7c blank-click behavior; leave unrelated audit changes untouched. Parent coordinates commits and release; this plan does not authorize extra hosted operations.

## Review Focus

- Duplicate Reference strings and replacement originals must not collapse distinct boxes or delete a hidden original twice (Task 1).
- Text moved by earlier row/area edits must be selected at displayed coordinates without moving neighbors (Tasks 1 and 3).
- Linked Voucher exclusion must preserve matching fields on every other page, including font-changed replacements (Tasks 1 and 3).
- Lost capture or a page/source/zoom/revision switch must not commit stale geometry; Account capture and Preview/Exit must reject an active gesture (Tasks 2 and 3).
- An incidental pointer click after drawing/selection must not clear the selection or turn a small whiteout into a 15-unit rectangle (Tasks 2 and 3).

## Task 1: Pure area geometry, target resolution and batch deletion

**Files:** Create `src/pdf/area-tools.ts`, `tests/pdf-area-tools.test.ts`. Reuse `source-edits.ts`, `source-text.ts`, `row-layout.ts`, `linked-vouchers.ts`, `flow.ts`; do not modify the render engine.

**Interfaces:** Export these types/functions from `area-tools.ts`:

```ts
type AreaRect = { x: number; y: number; width: number; height: number };
type AreaPoint = { x: number; y: number };
type AreaTextTarget =
  | { kind: 'source'; key: string; rect: AreaRect; run: DetectedText }
  | { kind: 'layer'; key: string; rect: AreaRect; layerId: string };
function rectFromPoints(start: AreaPoint, end: AreaPoint,
  bounds: { width: number; height: number }): AreaRect | null;
function displayedAreaTextTargets(page: PdfProjectPage, runs: DetectedText[],
  bindings: VoucherBindings): AreaTextTarget[];
function excludedAreaVoucherRects(page: PdfProjectPage, runs: DetectedText[],
  bindings: VoucherBindings): AreaRect[];
function containedAreaTextTargets(targets: AreaTextTarget[], area: AreaRect): AreaTextTarget[];
function deleteAreaTextTargets(page: PdfProjectPage, targets: AreaTextTarget[],
  newId: () => string): PdfProjectPage;
```

- [ ] Write focused failing unit tests: eleven same-value References remain eleven targets; a replacement hides its original; added `maskOriginal:false` text remains independent; partial overlap by 0.1 unit is excluded; selected bounds allow only 0.01 numerical tolerance; hidden/deleted/empty/graphics/rotated-source targets are excluded; linked Voucher originals and replacements are excluded even after font change. Include prior insert/delete/move row edits and continuation-page bounds.
- [ ] Run `pnpm exec vitest run tests/pdf-area-tools.test.ts`; confirm failures concern missing new behavior.
- [ ] Implement rectangle normalization/clipping with finite positive bounds. Return null for invalid or zero-area rectangles. Resolve originals through `replacementForRun` and `mapSourceTextRect(run, rowEdits, run.fontSize * .72)`. Use actual layer coordinates for visible edited/added text; stable keys distinguish repeated source strings using source identity/run index or run-list position fallback. Do not use `includeTouchedText`.
- [ ] Exclude only candidates matching `linkedVoucher(page, candidate, bindings)`; construct a temporary source replacement solely for identity matching when needed. Return their currently displayed rectangles through `excludedAreaVoucherRects`, deduplicating hidden originals and replacements identically. This explicit source-and-layer binding check excludes untouched source Voucher fields without excluding ordinary Reference/header text or relying on names. No transient layer enters the project while selecting.
- [ ] Batch-delete only the supplied current-page targets. Resolve existing layer IDs; for untouched source runs, append `createReplacementLayer(run,newId())` then pass that layer to `deleteTextLayer`. Deduplicate target keys and recheck existing replacements; empty/invalid selections return the identical page object. Preserve `rowEdits`, page geometry, unrelated layer identities/values and allocated space.
- [ ] Add assertions that original deletion creates an empty `deleted:true` mask, added deletion removes only its layer, mixed deletion changes only selected targets, and no input objects are mutated. Run `pnpm exec vitest run tests/pdf-area-tools.test.ts tests/pdf-source-deletion.test.ts tests/pdf-page-bounds.test.ts`; all pass. Hand the exact interfaces to the UI owner before further work.

## Task 2: One shared gesture owner and workspace integration

**Files:** Create `src/pdf/use-area-tools.tsx`; modify `src/pdf/PdfWorkspace.tsx`, `src/pdf/pdf-workspace.css`. The same implementer owns these files for both features. Keep `use-native-editing.tsx` behavior intact; do not share its movement/snapping state.

**Interfaces:** Consume Task 1 exports. Export `useAreaTools` with props `page?:PdfProjectPage`, `tool:string`, `zoom:number`, `revision:number`, `sourceSession:unknown`, `disabled:boolean`, `targets:AreaTextTarget[]`, `excludedVoucherRects:AreaRect[]`, `onWhiteout:(rect:AreaRect)=>void`. Return `overlay:ReactNode`, `selection:AreaTextTarget[]`, `excludedVoucherTouched:boolean`, `active:boolean`, `isActive:()=>boolean`, `clear:()=>void`, `cancel:()=>void`, and `onPaperPointerDown:(event:React.PointerEvent<HTMLDivElement>)=>void`. The synchronous `isActive` fence reads a ref; render state alone is insufficient for same-tick capture.

- [ ] First add failing browser cases in Task 3's harness for eleven References and a drawn small whiteout, then run only those cases to demonstrate the missing behavior.
- [ ] Implement the hook's transient rectangle state and pointer capture. Freeze paper frame at pointerdown; normalize via Task 1; distinguish click from drag with 3 CSS pixel travel and 0.1 logical dimensions. Use initial and final pointer coordinates, not only the last pointermove. Cancel on Escape, pointercancel, lost capture, tool/page/source/zoom/revision changes, changed frame/scroll and unmount. Release capture and remove listeners on every exit; own pointer ID so a second pointer cannot finish the gesture.
- [ ] In Select, start from blank paper and preserve the existing layer/button drag priority. Render noninteractive highlights for each enclosed target and the marquee. In Whiteout mode, use a topmost draw surface so dragging across existing objects draws rather than moves them. Do not intercept toolbar/property controls. A completed valid marquee retains its selection after pointerup; a blank click clears single/multi-selection.
- [ ] Wire English selection count, `Delete selected text`, keyboard Delete/Backspace outside editable fields and Escape cancellation. Show the linked Voucher explanation only when the marquee intersects an `excludedVoucherRects` entry; unrelated selections get no notice. One delete resolves current targets against current page/revision then calls `commit` exactly once. Clear pending inline refocus on marquee selection. No mutations on selecting, drawing preview, cancellation or empty deletion.
- [ ] Change Whiteout toolbar action to arm `draw-whiteout`. On valid finish create a standard `PdfLayer` with `kind:'whiteout'`, clipped rectangle, white fill and existing harmless defaults; commit once, select its ID and return to Select. Adapt existing resize and numeric geometry minima only for whiteouts to 0.1. Preserve movement, deletion, normal object minima and image aspect-ratio handling.
- [ ] Add the active ref fence to `onRegisterControl.busy/capture`, Preview, close/Exit, save and any session handoff. Cancel gesture before generic Escape/busy handling. Disable conflicting actions while drawing or cancel before an explicit state change; direct externally forced changes still cancel safely. A fence is not a document dirty flag. Preserve the existing f866 blank-paper handler's control exclusions.
- [ ] Run `pnpm exec tsc -b` and the two focused browser cases from the first step; require successful typecheck and both cases passing before expanding coverage.

## Task 3: Focused behavioral and pixel qualification

**Files:** Create `tests/browser/area-tools/harness.html`, `tests/browser/area-tools/pdf-editor.spec.ts`; optionally add a focused synthetic fixture `tests/browser/fixtures/area-tools-pdf.ts`. Update the existing browser-suite inventory only if required to include this new suite. Parent updates `docs/PROJECT_STATUS.md` after verified implementation, retaining the unrelated audit block.

**Interfaces:** Harness renders real `PdfWorkspace`; exposes synthetic `sources`, captured saved project/bytes, reopen and registered editor control, following `source-deletion/harness.html`. Tests consume public controls, layer geometry and independently loaded exports rather than implementation state.

- [ ] Generate synthetic Invoice rows with Date, Description, eleven repeated References, amounts and separator lines, plus another page/source and linked Voucher controls. Include edited and added text and prior row/move edits. Never import real customer bytes.
- [ ] Test source-only, added-only and mixed marquee deletion; assert count, partial-edge exclusion, unchanged neighbors/rowEdits/page count and exactly one Undo/Redo operation. Select alone and empty/cancelled drag keep draft/dirty/history unchanged. Include linked Voucher exclusion and unchanged cross-page values.
- [ ] Test zoom 60/90/150, scroll before gesture, reverse directions, page-edge clipping, tiny click/degenerate line, Escape, pointercancel/lost capture, source/page/zoom/revision change and scroll during gesture. Test registered Account capture and Preview/Exit protection during a live pointer gesture; a late release cannot change the new page or session. Keyboard deletion inside a text editor edits text only.
- [ ] Test Whiteout button creates no immediate layer; draw commits one exact rectangle; move it; resize below 15 units by handle and numeric controls; assert no adjacent layer movement. Undo each real mutation separately, redo, Preview, export and reload. Keep existing select/move/resize and blank-paper deselection functional.
- [ ] Compare original and edited browser render pixels outside intended deletion/whiteout regions, including adjacent Date/Description/amounts and separator lines. Reopen exported bytes with the existing engine/PDF.js and check removed Reference ink, preserved neighboring ink/positions and whiteout bounds. Inspect synthetic browser screenshots at 1440×900 and 1280×800; keep existing baselines unchanged.
- [ ] Run `pnpm exec playwright test --project=editor-harness tests/browser/area-tools/pdf-editor.spec.ts tests/browser/click-away/pdf-editor.spec.ts tests/browser/source-deletion/pdf-editor.spec.ts tests/browser/native-movement/pdf-editor.spec.ts tests/browser/voucher-field/pdf-editor.spec.ts tests/browser/row-actions/pdf-editor.spec.ts tests/browser/font-recovery/pdf-editor.spec.ts` and record actual results. Then run `pnpm test` and `pnpm build` sequentially to avoid known CPU contention. Any additional repository-required checks remain required.
- [ ] Parent obtains the standing Astra High review against the approved scope and verified evidence; Sol 6.1 Medium owns implementation as already chosen by the owner. Resolve actionable findings and rerun affected checks. Report implementation/tests separately from any later deployment/enabling, with exact evidence and no live-provider claims from fixtures.

## Self-review and handoff

The plan covers both approved tools, immutable source/edited target resolution, no row reflow, one-commit Undo, linked-field exclusion, gesture/session fences, small whiteout geometry and browser/export evidence. Helper contracts above are fixed between workers. A single UI owner prevents overlapping gesture/tool-state implementations. No extra product question, new renderer qualification project or unrelated audit is needed.
