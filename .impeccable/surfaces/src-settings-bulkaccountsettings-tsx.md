# Bulk Account Settings

Mode: Operate. Extend the existing navy, cool-white, blue/teal workspace and self-hosted Plus Jakarta Sans. The owner needs to configure many accounts across authorized hotels without opening each ledger, including persistent defaults for new accounts of selected types. All settings fields may be changed selectively.

## Direction contract

THESIS: A selection ledger followed by a shared edit form and a concrete review step. Selection identity is Hotel + Account, never account name alone.

OWN-WORLD: Existing restrained app colors, flat tables, compact text, explicit selected state and native controls; no decorative cards inside cards.

STORY: Choose individual accounts or hotel/type groups, choose only fields to replace, review affected accounts/invoices and new-account defaults, then save once. Unchecked fields keep their current values.

FIRST VIEWPORT: Settings navigation above a full-width Account settings workspace, scope controls and searchable selection table, with a clear selected count. The edit/review action follows the selection; compact screens retain readable controls and a deliberate table scroll.

FORM: Selection ledger and grouped form within the incumbent Operate world; no replacement visual world or randomized layout.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Boundaries

Backend validates regional membership, exact identities and revisions. Explicit Account settings take precedence. Type defaults apply only to current/new Accounts without explicit settings, and those Accounts remain in Setup Needed until confirmed at Account level; it does not send mail, read OPERA recipients or modify accounting amounts. Required/term changes propagate to existing invoices through the existing guarded writer. Preserve pending-delivery guards, history, stale-edit checks, idempotence and dirty navigation. No defaults are enabled with real values until an authorized user chooses them.

## Implemented surface — 30 September 2026

Settings exposes Account settings alongside the existing access and signature destinations, with unsaved-work protection. The selection mode offers explicit Accounts or Hotel / Account Type fallback defaults. Hotel and Type filters narrow the ledger; search matches account identity, number, name, Hotel and Type. Select all shown adds visible matches to the selection. The selected count represents exact Hotel + Account identities. Type mode selects the matching scope and can save defaults even when that scope has no current Accounts. Existing defaults are available in a collapsed disclosure with an edit action.

The ledger identifies inherited settings as “Type default · Setup needed” and absent settings as “Setup needed.” Eight independently enabled fields cover billing requirement, credit term, billing type, billing portal, billing and collection instructions, and separate billing and collection recipients. Unchecked fields remain unchanged. Enabled empty values deliberately clear their field. Inline validation retains values, associates recovery text with the control, marks it invalid and focuses the first invalid field.

Review replaces the editor in flow. It shows the selected patch, affected Account and invoice counts, any Hotel / Type defaults, and a before/after ledger with protected explicit settings labelled “Keeps Account settings.” Apply is a separate human action. An uncertain save preserves the review and command identity for Retry save; edit/reload controls remain disabled until that outcome is resolved. Successful saving clears selection and enabled fields, reloads the catalog and notifies the register. This surface neither sends email nor changes OPERA accounting amounts.

Desktop uses a flat full-width ledger with fine horizontal rules, pale blue-gray sticky table headings and pale blue selected rows. Scope and field editors use two columns; the selection ledger has a bounded vertical scroll area. At 700px and below, controls and fields stack, table content retains deliberate horizontal scrolling, review definition rows stack, inputs use 16px text and the primary footer action spans the available width. Search and primary footer controls have a 44px minimum height on compact screens. Shared Plus Jakarta Sans, navy text, action blue, existing control elevation and visible focus outlines remain intact. These are local surface details, not changes to DESIGN.md or its sidecar.

## Verification and release boundary

Implemented locally; final deployment remains pending. The documenter inspected `src/settings/BulkAccountSettings.tsx`, `src/settings/bulk-settings.css`, `src/access/Settings.tsx`, the existing product/design records, and six synthetic browser screenshots: `evidence/bulk-account-editor-1440.png`, `evidence/bulk-account-editor-390.png`, `evidence/bulk-account-review-1440.png`, `evidence/bulk-account-review-390.png`, `evidence/bulk-account-error-1440.png`, and `evidence/bulk-account-error-390.png`. They show the editor, review and field-error layouts at desktop and compact widths; they are local rendered evidence, not production or provider verification. Original design references are unchanged.

The implementation session reports 1,508 passing unit tests and seven passing focused browser cases. A fresh SQL run passed 92 migrations and 45 fixtures before the latest queue-projection adjustment; that adjustment has a passing focused SQL regression. This record does not claim the full SQL suite was rerun after that adjustment or that production defaults have been enabled. No global design change is approved or recorded by this pass.
