---
version: 1
slug: "src-register-invoiceregister-tsx"
primary_target: "src/register/InvoiceRegister.tsx"
related_targets: ["src/register/workspace.css","src/register/excel-workbook.css","src/reports/ExternalBillingReports.tsx"]
---

# Invoice Register — open sheet

Mode: Operate. AR staff enter manual invoice tracking data continuously, like Excel. Existing row autosave, atomic/idempotent writes, paste review, pinned identifiers, resizing, full screen, search/filter/sort/hide and bidirectional workflow updates are constraints. Guest stays adjacent to Account. All columns remain in one horizontally scrollable sheet; OPERA values remain read-only.

## Direction contract

THESIS: The sheet occupies the page itself. Remove surrounding cards, rounded application frame and nested padding on this route, while preserving the actual cell grid needed for entry.

OWN-WORLD: Retain the application's logo, self-hosted Plus Jakarta Sans, navy data and blue actions. Source and manual-work columns retain their navy/gold workbook cues, with lighter column-label bands and a green active-cell outline. Other routes keep their existing shell.

STORY: Find invoices, choose a column group, edit a cell, then move to the next row to save. Source fields and editable fields must be distinguishable without an explanation banner.

FIRST VIEWPORT: Flat application navigation; compact report view switch; one Invoice Register title with row count/open total and reload/full-screen actions. A single search/filter/row-visibility strip precedes column jumps, cell-value bar, and the full-width continuous grid. No separate rounded panel encloses the data.

FORM: Owner-assigned spreadsheet composition, code-led; no image comp or random alternative is needed for this explicit layout. This is a route-local composition in the established brand. The exact received-amount explanatory sentence was explicitly removed everywhere in the register, including help.

FINISH: Verify real rendered desktop/short/mobile/full-screen states and existing editing safeguards; independent finish review and scoped documentation complete the change. Captures contain synthetic data only. Original workbook/image references remain unchanged; no generated raster assets ship.

## Implemented composition — 28 September 2026

The register fills the browser width. Its route condition removes the body's outer padding and background treatment, the application's maximum width, rounded frame and shadow, and the report area's nested gutters. Application navigation and the report switch use flat underlined selection on this route. The continuous cell grid reaches both edges; the heading and command strips retain readable side padding (20px desktop, 12px at 800px and below). This is an explicit Invoice Register exception to the shared shell, not a replacement for the global identity or other routes' elevation rules.

The register owns the single page title. Count and open balance sit beside it, followed by Reload register and native Full screen. Search, Filters with active count, and row visibility share the next strip. Five filters expand in place. Invoice details, Billing, Follow-up and Notes & receipts are jumps within the same table, with an underline tracking the current group; they do not hide other columns. The Keyboard help disclosure was subsequently removed at the owner’s request; existing keyboard behavior remains. The removed received-amount explanation is absent from the register and its help.

One selected-cell bar exposes the coordinate, column label and full read-only value. A source cell displays a lock and Read only; a manual cell displays a pencil and Editable. Row editing adds Cancel and Save row, Saving or Retry save as appropriate. A synchronized horizontal scrollbar, sticky headers, selection, column resizing, row loading progress and edit history remain available. Full screen expands the workbook itself and removes application navigation from that view.

## Route-local visual rules

- **Palette:** white work surface; navy data text (#17314f) and blue selection/actions (#315bd6); source group navy (#1f3b57) and work group gold (#806018). Column labels lighten to blue (#e4edf7) and gold (#f5ead0). Editable cells are subtly warm (#fffdf7); source zebra rows are pale blue-gray (#f3f6fa). Active cells retain the workbook green outline (#217346). These are observed local roles, not new global tokens.
- **Typography:** inherit the established self-hosted Plus Jakarta Sans. The page title is 24px, or 22px at 800px and below; the open total is 20px, or 16px narrow. Working cells, cell values and invoice links use 13px; ordinary controls and labels use 11–12px. Row numbers and narrow selected-column labels use 10px. Financial values retain tabular numerals.
- **Geometry:** actual rows and virtualization agree at 36px; the two header rows total 76px. Cells and the table enclosure are square and flat. The heading, search strip, column navigation, value bar and grid are continuous page regions rather than nested cards. Search and visibility controls retain small rounded corners (7px). Paste overlays keep their existing floating treatment.
- **Responsive context:** above 800px, Hotel, Invoice, Account and Guest remain frozen beside row selection; Guest stays immediately after Account. At 800px and below, only the invoice identifier and row selection remain frozen, leaving room for editable columns to scroll into view. Search fills its own line, heading actions wrap, filters use two columns, and explicit sort controls remain available. Every data column stays in the one horizontal sheet.

## Preserved interaction and data boundaries

Find → jump → edit → leave the row to save remains the working sequence. Enter saves and moves down, Tab advances through editable fields, arrow keys navigate selected cells, and Escape cancels unfinished edits. Changing rows waits for the current save; a failed or uncertain save retains its retry state. Dirty/busy safeguards continue to protect search, filters, sort, row visibility and reload. Multi-cell paste keeps its review step, and row writes retain their existing atomic/idempotent contract. This composition does not redefine financial values, manual tracking semantics or workflow synchronization.

Source monetary values remain read-only. The absence of the removed explanation does not turn manually reported receipts into OPERA-confirmed settlement. Account identity stays scoped to Hotel + Account. Existing register history, visibility and invoice-detail access remain part of the surface.

## Verification and delivery state

**Implemented and locally tested; not deployed in this pass.** The parent implementation run reports passing TypeScript validation, production build, 35 register unit cases and 27 browser cases. This documentation pass inspected source and supplied evidence; it did not rerun those checks or access live services.

The independent finish review at `.tmp/register-workspace/finish-review.md` returned `ship` with no material fixes. It checked source and the supplied rendered states, including open width, retained identity, source/manual distinction, row geometry, narrow invoice pinning, full screen and removal of the explanation. That reviewer explicitly did not run behavioral tests; test results above belong to the parent run.

Synthetic captures retained for review:

- `evidence/register-open-sheet-1440.png`: desktop open sheet.
- `evidence/register-open-sheet-1280.png`: short desktop working area.
- `evidence/register-open-sheet-390.png`: narrow sheet with invoice context.
- `evidence/register-open-sheet-fullscreen.png`: native workbook full screen.

`.tmp/register-workspace/layout-scan.json` contains no findings. `.tmp/register-workspace/type-scan.json` contains ten advisory size findings against the global recorded ramp. The local title, amount, data and compact-coordinate roles above describe the implemented sheet; the global ramp has not been rewritten to suppress these advisories.

Original workbook/image references and prior baselines remain retained. No raster assets, customer payloads, provider changes or deployment evidence are introduced by this documentation pass. `DESIGN.md`, `.impeccable/design.json` and `PRODUCT.md` remain unchanged: this is an ordinary composition within their confirmed family, logo and palette. Pre-existing global token drift and incumbent identity/type defects are not canonized or repaired here.

## Deployment verification — 28 September 2026

After documentation, the parent verified deployed runtime `bf892a9733c8e3e0801e92011a731a883b846c5d`, Worker `2d6440d7-2da4-4d84-a19a-916f599af84f`. Health/source and six anonymous access boundaries passed. All 27 register browser cases passed on deployed assets with synthetic APIs. No customer records or emails were changed.