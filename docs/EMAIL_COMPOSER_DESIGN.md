---
name: Katathani AR Email Composer
description: Surface notes for the implemented email preparation increment
colors:
  surface: "#ffffff"
  quiet-surface: "#f7fafc"
  editor-surround: "#e3ebf2"
  ink: "#102c4b"
  divider: "#dce6ef"
  selection-mint: "#e0f7f1"
  focus-blue: "#3966f5"
rounded:
  control: "9px"
  attachment: "10px"
spacing:
  compact: "12px"
  standard: "16px"
  section: "20px"
---

# Email Composer surface design

## Overview

This document records the implemented Email Composer within the incumbent [Luminous AR interface](../DESIGN.md). It is a surface supplement, not a replacement for other pages or their design authority. Source evidence is [EmailComposer.tsx](../src/EmailComposer.tsx), [SupplementalPreview.tsx](../src/SupplementalPreview.tsx), [email-composer.css](../src/email-composer.css), and inherited [styles.css](../src/styles.css).

The [approved email reference](../references/design/email-composer-v1.png) supplies the white workspace, cool blue surround, context/editor/attachments composition, and five-step progress strip. The current surface provides an editable plain-text message, a new email thread, workspace saving, supplemental attachment upload and preview, human-triggered Gmail draft creation, and direct sending after explicit review. Existing-thread selection and rich-text formatting remain unavailable. Supplemental support is limited to static PDF, PNG, and JPEG; XLSX remains unsupported. These are scoped capability differences, not replacements for the approved visual world. The send confirmation notes originated with source `c2ea651`; supplemental notes describe the subsequent implementation.

Reviewed synthetic captures: [1440 desktop](../evidence/email-composer-1440.png), [1280 laptop](../evidence/email-composer-1280.png), [390 mobile top](../evidence/email-composer-390.png), and [390 mobile handoff](../evidence/email-composer-390-handoff.png). These show UI rendering, not proof of live Gmail delivery or production enablement.

The send confirmation is captured at [1440](../evidence/email-send-confirmation-1440.png), [1280](../evidence/email-send-confirmation-1280.png), and [390](../evidence/email-send-confirmation-390.png). The latest desktop composer captures visibly label Gmail handoff as Draft or send.

Supplemental controls are captured at [1440](../evidence/supplemental-composer-1440.png), [1280](../evidence/supplemental-composer-1280.png), and [390](../evidence/supplemental-composer-390.png). Read-only paginated preview is captured at [1440](../evidence/supplemental-preview-1440.png), [1280](../evidence/supplemental-preview-1280.png), and [390](../evidence/supplemental-preview-390.png). These use synthetic files and establish visual behavior rather than production upload validation.

## Colors

White surfaces and navy text carry the working content. Pale blue fields distinguish the editor surround and quieter status areas. Blue identifies the active workflow step and actions; mint identifies reviewed or selected states. Thin cool dividers separate field rows and context groups.

**The State Color Rule.** Preserve the meaning of blue action and mint readiness; do not use readiness styling to imply that a draft has been sent.

## Typography

The surface inherits self-hosted Plus Jakarta Sans with a sans-serif fallback. The compact hierarchy uses an 18px page title, 14px panel headings, 12px subsection headings and editable message text, and smaller supporting labels. At the mobile breakpoint the page title becomes 16px. Message body line-height is 1.9. The original font was not supplied; this retains the established application choice.

These observations describe this increment. Small muted support text is not a universal accessibility target for future screens.

## Layout

The workspace is a native modal dialog styled as a fixed application surface inset 18px from the viewport, with a nonshrinking header and progress strip. Native modal behavior confines focus to the preparation task. Desktop content uses a 230px context column, flexible editor of at least 360px, and 310px attachments column. Each desktop column can scroll without losing the workflow header.

At 1200px and below, the columns reduce to 190px, at least 320px, and 265px. At 960px and below, attachments move beneath the context/editor pair and the content region scrolls. At 640px and below, the three areas stack in their existing reading order, the outer inset becomes 8px, and progress labels stack beneath their numbered or checked markers.

**The Reachable Feedback Rule.** The editor footer and feedback do not shrink away when space is constrained. Keep the save action and its result reachable on narrow screens. Capture after the browser has painted scrolled content; use the appropriate scroll position to verify each action rather than expecting the whole stacked workspace in one mobile capture.

Send review occupies the dialog's white working area as a single readable column. Recipient rows, subject, a pale message block, invoice scope, attachment names, acknowledgment, and actions retain that reading order on desktop and mobile. The underlying header, progress strip, and editor controls are inert during confirmation.

Supplemental preview occupies the dialog with a cool pale field and a centered white document page or image. Its header identifies the filename, size, and read-only mode. At mobile width, the close action moves beneath the file information; document content fits the available width. PDF page controls remain above the canvas, with scrolling available for taller pages.

## Elevation & Depth

The outer workspace uses a soft ambient shadow. Inside it, depth comes from pale tonal separation and fine borders; attachment rows and context notes do not need independent elevation. The editor surround frames the message as the main working surface.

## Shapes

The enclosing workspace has rounded corners, reduced on mobile. Compact controls use gently curved corners; attachment rows and small summary panels share a slightly larger curve. Readiness and purpose badges are compact pills. Lucide line icons identify mail, reviewed documents, progress completion, and navigation.

## Components

- **Progress strip:** five ordered stages, with the first three checked and Email current. Gmail handoff is explicitly labeled Draft or send. These indicators describe sequence rather than clickable navigation.
- **Context:** Billing/Collection toggle, recipient-profile explanation, plain-text format, and a selected new-email treatment. Collection exposes a stage picker with Friendly, Follow 1, Follow 2, Follow 3, and Final; a stage is required before its handoff actions become available. The current message can be edited without changing account recipient defaults.
- **Message fields:** labeled To, CC, BCC, Subject, and Message fields. A single editable plain-text body occupies the central space. Loading, service errors, changed-package errors, and unsaved state have explicit copy.
- **Workspace save:** a named button in the editor footer. It is disabled when unchanged or blocked. Successful save feedback says, “Workspace draft saved. This save did not create or send a Gmail message.” This describes the current save without claiming that no previous Gmail draft exists.
- **Attachments:** generated package and supplemental files retain separate headings and rows. The summary combines their file counts and bytes; supplemental files are not merged into the generated PDF. Generated filenames remain private download controls. Supplemental filenames open read-only preview, use teal document/image icons, show Format checked and file size, and have an explicitly labeled remove control.
- **Supplemental upload:** a full-width dashed Add supplemental file action names the supported static PDF, PNG, and JPEG formats beneath it. Unsaved message edits require saving first. An empty list says no supplemental files are attached. Successful upload feedback explicitly states that the upload did not send email. Unsupported formats, including XLSX, are not offered as functioning controls.
- **Failed-file recovery:** the selected filename, error, and Not attached state remain visible in an amber recovery area. Retry this upload and Remove failed selection are distinct actions. A pending or failed selection blocks Gmail draft and send handoff until it is resolved; it is not silently omitted from the intended package. Leaving with an unresolved selected file requires confirmation.
- **Supplemental preview:** PDF Previous page and Next page controls accompany the current page count, disabling the unavailable direction at the first or last page. PNG and JPEG render as still images. Loading and rendering failures have explicit status/error copy, and Close attachment preview returns to the composer. The preview supplies no editing tools.
- **Gmail handoff:** connection status, authorization when needed, a primary Create Gmail draft action, and a separate Review & send now action. Unsaved edits and unavailable readiness disable handoff. A confirmed or uncertain outcome has explicit feedback, with a Gmail drafts link after handoff.
- **Send confirmation:** Review before sending displays recipients, subject, plain-text message, selected invoice scope, and attachment filenames. An initially unchecked acknowledgment enables Confirm send now. Back to editing remains a separate secondary action. During the request the action indicates sending and verification, and repeated clicks are disabled.
- **Sent verification:** delivery status and Check sent status distinguish verified sending from pending or uncertain outcomes. Draft saving does not record billing or collection activity; only verified Sent evidence does. A missing draft is not presented as proof of sending, and uncertain send feedback directs the user to verification rather than another send.
- **Connection test:** an expandable section requests a one-time recipient and clearly names Send one test email. Its explanation identifies one generic message with a synthetic PDF and no business-history or KPI changes. The recipient is not saved as an account default. Result copy and Check test status make unresolved outcomes visible; documentation and captured examples must not persist the real one-time recipient.
- **Interaction states:** disabled controls reduce opacity; keyboard focus has a visible blue outline and remains within the open native dialog. Leaving with unsaved edits requires confirmation. Escape follows that same close protection and does not close while an operation is busy.

## Do's and Don'ts

- Do retain the context/editor/attachments hierarchy and the original reference file.
- Do distinguish saved message state, reviewed PDF state, Gmail draft creation, and actual sending in visible language.
- Do verify both desktop composition and scrolled mobile actions with synthetic evidence.
- Don't add controls that imply XLSX support, existing-thread selection, or rich text already works.
- Don't merge supplemental files into the generated package or silently discard a failed selection to enable handoff.
- Don't describe Gmail handoff as draft-only now that explicit send confirmation is implemented, or present uncertain outcomes as verified sends.
- Don't promote increment-specific omissions or screenshot timing artifacts into global design rules.

This surface-only documentation pass does not regenerate the global design file or its sidecar.

Connection diagnostics can explicitly include the current supplemental file set through a default-off checkbox. Generated customer PDFs are excluded. The one-time recipient is not saved as a profile, and test sends do not update business history.
