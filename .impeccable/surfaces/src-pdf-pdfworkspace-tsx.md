---
version: 1
slug: "src-pdf-pdfworkspace-tsx"
primary_target: "src/pdf/PdfWorkspace.tsx"
related_targets: ["src/pdf/pdf-workspace.css", "src/pdf/use-native-editing.tsx", "src/EmailComposer.tsx", "src/email-composer.css", "src/email/signature.css", "src/email/TemplateLibrary.tsx"]
---

# PDF and email preparation — audit refinement, 28 September 2026

## Filenames and independent address lines — 7 October 2026

Package adds labeled output filename fields and editable imported-scan display names. Enter/Apply name commits; Escape cancels. Pending/invalid names keep Preview unavailable with local feedback, and reviewed filenames match Download/Email. Preserve the existing three-pane layout, font and tools rather than adding another dialog. Names are preparation metadata, not filesystem renames or financial identifiers.

Outside recognized item tables, the row-insertion action grows only the selected address/text block and preserves the opposite column. Item-table insertion keeps full-row behavior. Scan rendering depends on shipped version-matched decoders and surfaces failures rather than silently displaying successful white pages. Validation/evidence and deployment state live in `docs/PDF_WORKSPACE_REPAIRS_20261007.md` and PROJECT_STATUS.

Existing-world remediation U02/U05/U08/U09/U11. Preserve the established Package / PDF canvas / Edit & Review layout and the email context / message / attachments layout. Shared typography and depth style chrome only; PDF paper, native text, authored email and output bytes keep their own styling.

PDF source-text editing, added text and selection remain direct tools. Add objects and Move tools use native disclosures with SVG chevrons; the active move tool remains named. Native text lines support keyboard activation, selection focus, arrow and Shift-arrow movement, Escape restoring line focus and Undo. Numeric area bounds provide a keyboard alternative to drawing a selection; invalid bounds show located feedback. Content, delivery, page and tool choices expose their selected state. Preview PDFs remains available without an all-pages or checkbox acknowledgment gate. Free editing and reviewed-byte/revision protections remain.

Email address rows, message body and signature are nonshrinking content in the same scrollable fieldset; the save footer stays reachable at short laptop heights. Save message names persistence of workspace edits. Attachment context and the current specific Gmail blocker sit beside their actions; longer recipient explanations are disclosed on demand. Create Gmail draft and Review & send now remain human actions with their existing confirmation and duplicate-command protections. No automatic send or preview-completion action is introduced.

Template heading and footer reflect the same busy/dirty/saved state. Editing a saved subject immediately reports Unsaved changes; saving is distinct from sending. Recipients remain Account/purpose-specific without OPERA fallback.

Source and synthetic captures inspected: email-720, email-800, pdf-tools and template-unsaved under `.tmp/impeccable-fixes/`. These captures establish local composition, not actual Gmail delivery or every PDF format. Delivery evidence belongs to docs/PROJECT_STATUS.md.
