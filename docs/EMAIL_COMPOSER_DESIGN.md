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

This document records the implemented Email Composer within the incumbent [Luminous AR interface](../DESIGN.md). It is a surface supplement, not a replacement for other pages or their design authority. Source evidence is [EmailComposer.tsx](../src/EmailComposer.tsx), [email-composer.css](../src/email-composer.css), and inherited [styles.css](../src/styles.css).

The [approved email reference](../references/design/email-composer-v1.png) supplies the white workspace, cool blue surround, context/editor/attachments composition, and five-step progress strip. This increment provides an editable plain-text message, a new email thread, workspace saving, and human-triggered Gmail draft creation. Existing-thread selection, supplemental uploads, rich-text formatting, and Send Now are not enabled. These are scoped capability differences, not replacements for the approved visual world.

Reviewed synthetic captures: [1440 desktop](../evidence/email-composer-1440.png), [1280 laptop](../evidence/email-composer-1280.png), [390 mobile top](../evidence/email-composer-390.png), and [390 mobile handoff](../evidence/email-composer-390-handoff.png). These show UI rendering, not proof of live Gmail delivery or production enablement.

## Colors

White surfaces and navy text carry the working content. Pale blue fields distinguish the editor surround and quieter status areas. Blue identifies the active workflow step and actions; mint identifies reviewed or selected states. Thin cool dividers separate field rows and context groups.

**The State Color Rule.** Preserve the meaning of blue action and mint readiness; do not use readiness styling to imply that a draft has been sent.

## Typography

The surface inherits self-hosted Plus Jakarta Sans with a sans-serif fallback. The compact hierarchy uses an 18px page title, 14px panel headings, 12px subsection headings and editable message text, and smaller supporting labels. At the mobile breakpoint the page title becomes 16px. Message body line-height is 1.9. The original font was not supplied; this retains the established application choice.

These observations describe this increment. Small muted support text is not a universal accessibility target for future screens.

## Layout

The workspace is a fixed application surface inset 18px from the viewport, with a nonshrinking header and progress strip. Desktop content uses a 230px context column, flexible editor of at least 360px, and 310px attachments column. Each desktop column can scroll without losing the workflow header.

At 1200px and below, the columns reduce to 190px, at least 320px, and 265px. At 960px and below, attachments move beneath the context/editor pair and the content region scrolls. At 640px and below, the three areas stack in their existing reading order, the outer inset becomes 8px, and progress labels stack beneath their numbered or checked markers.

**The Reachable Feedback Rule.** The editor footer and feedback do not shrink away when space is constrained. Keep the save action and its result reachable on narrow screens. Capture after the browser has painted scrolled content; the reviewed mobile handoff capture includes the visible save label.

## Elevation & Depth

The outer workspace uses a soft ambient shadow. Inside it, depth comes from pale tonal separation and fine borders; attachment rows and context notes do not need independent elevation. The editor surround frames the message as the main working surface.

## Shapes

The enclosing workspace has rounded corners, reduced on mobile. Compact controls use gently curved corners; attachment rows and small summary panels share a slightly larger curve. Readiness and purpose badges are compact pills. Lucide line icons identify mail, reviewed documents, progress completion, and navigation.

## Components

- **Progress strip:** five ordered stages, with the first three checked and Email current. Gmail handoff is explicitly labeled Draft only. These indicators describe sequence rather than clickable navigation.
- **Context:** Billing/Collection toggle, recipient-profile explanation, plain-text format, and a selected new-email treatment. The current message can be edited without changing account recipient defaults.
- **Message fields:** labeled To, CC, BCC, Subject, and Message fields. A single editable plain-text body occupies the central space. Loading, service errors, changed-package errors, and unsaved state have explicit copy.
- **Workspace save:** a named button in the editor footer. It is disabled when unchanged or blocked. Successful save feedback explicitly distinguishes a workspace draft from a Gmail draft.
- **Attachments:** exact reviewed-package filenames are private download controls with document icons and file sizes. Supplemental attachments have an explanatory unavailable state.
- **Gmail handoff:** connection status, authorization when needed, and a separately named Create Gmail draft action. Unsaved edits and unavailable readiness disable handoff. A confirmed or uncertain outcome has explicit feedback, with a Gmail drafts link after handoff.
- **Interaction states:** disabled controls reduce opacity; keyboard focus has a visible blue outline. Leaving with unsaved edits requires confirmation.

## Do's and Don'ts

- Do retain the context/editor/attachments hierarchy and the original reference file.
- Do distinguish saved message state, reviewed PDF state, Gmail draft creation, and actual sending in visible language.
- Do verify both desktop composition and scrolled mobile actions with synthetic evidence.
- Don't add controls that imply supplemental upload, existing-thread selection, rich text, or sending already works.
- Don't promote increment-specific omissions or screenshot timing artifacts into global design rules.

This surface-only documentation pass does not regenerate the global design file or its sidecar.
