---
name: Katathani AR Collection Queue
description: Surface notes for the implemented billing and collection work queue
colors:
  surface: "#ffffff"
  ink: "#102c4b"
  billing: "#1bac9f"
  selected-row: "#ecf4ff"
  urgent: "#c42e4a"
  quiet-field: "#edf3ff"
  divider: "#e0e8f1"
rounded:
  metric: "14px"
  action: "10px"
spacing:
  compact: "10px"
  standard: "12px"
  section: "18px"
---

# Collection Queue surface design

## Overview

This supplement records the built Collection Queue within the existing [Luminous AR interface](../DESIGN.md). Its visual authority is the [Collection Queue reference](../references/design/collection-queue-v2.png). Implementation evidence is [CollectionQueue.tsx](../src/CollectionQueue.tsx), [collection-queue.css](../src/collection-queue.css), and inherited [application styles](../src/styles.css).

The reference's overview tiles, purpose explanation, filter row, broad work table, and narrow selected-work panel remain the composition. Current business requirements justify six actual categories: Billing due, Collection due, Urgent, Upcoming, Setup needed, and Needs review. Prototype Reply review, Payment unmatched, Escalated, and On hold tiles are not represented as working capabilities. The prototype round timeline is replaced by actionable invoice selection and each invoice's latest verified sent stage.

Reviewed synthetic evidence: [1440 desktop](../evidence/collection-queue-1440.png), [1280 laptop](../evidence/collection-queue-1280.png), [390 mobile queue](../evidence/collection-queue-390.png), and [390 selected-work drawer](../evidence/collection-queue-390-drawer.png). These captures establish rendered composition; they do not establish live business totals or service enablement.

## Colors

White panels and navy content sit within the incumbent pale application canvas. Billing uses the reference's teal emphasis. The selected table row has a light blue field; property chips retain distinct KAT blue and TSK teal. Urgent action text is red. Setup and review purpose chips use amber to distinguish attention work from preparation.

**The State Separation Rule.** Next action and latest sent stage remain distinct in both wording and placement. A selected or highlighted row does not imply an email has been sent.

## Typography

The queue inherits Plus Jakarta Sans. Its page title steps from 27px to 24px at the laptop breakpoint and 21px on mobile. The working table uses 11px text, with smaller column labels and supporting metadata. Metric values and monetary amounts use tabular numerals. Display labels use the confirmed full forms Follow-up 1, Follow-up 2, and Follow-up 3 rather than abbreviating them to internal stage names.

Small supporting text describes the present implementation rather than setting an accessibility target for future surfaces.

## Layout

Six metric tiles span the desktop width above the purpose strip and filters. The main grid places a flexible table beside a 316px detail panel; the detail width reduces to 285px at 1280px. Table and detail overflow are independently scrollable. The lower Sent status checks panel remains separate from queued invoice work.

At 1000px and below, metrics become a three-column grid and selected work becomes a right-side overlay drawer with a dimmed backdrop and visible close button. On small screens filters wrap into two columns, search remains available, and the table preserves its 760px minimum width through horizontal scrolling. The drawer holds invoice selection, account navigation, preparation, and the no-send explanation in one scrollable surface.

**The Scope Rule.** A work row groups Hotel + Account + next action. Selecting another group clears invoice selection. The right panel identifies the hotel, account type, action balance, ready/upcoming counts, selected invoice count, and individual invoice context.

## Elevation & Depth

Fine borders and pale tonal fields separate panels and table rows. The mobile drawer uses a translucent backdrop for separation; its content retains the same white surface and restrained rounded shape as desktop detail. No new decorative material or imagery is introduced.

## Shapes

Overview tiles use gently rounded corners. Filter controls are compact rounded fields. Property and purpose chips are smaller rounded rectangles. Priority markers are circular counters. Actions retain the application's blue primary and outlined secondary treatments. Lucide icons provide reload, sorting, account navigation, and drawer closing.

## Components

- **Summary tiles:** each shows an invoice count, distinct account count, and THB total. They filter queue work. Collection due excludes Urgent in both counting and its explicit Next action filter; Urgent remains separately accessible.
- **Filters:** Purpose, Account type, Account, Next action, Latest sent, When, and search remain separately labeled. Latest sent describes completed sending evidence; Next action describes the work to perform. Clear filters resets these controls.
- **Prioritized table:** columns expose priority, hotel, purpose, account, next action, open invoice count, open amount, and action date. Column headings support sorting. Account buttons and row selection open the corresponding detail. Child invoice handling is explained beneath the table instead of implying separate collection work.
- **Selected work:** invoice checkboxes show invoice/folio identity, guest context, latest sent stage, and open balance. Unverified or nonselectable rows cannot be selected. Setup needed and Needs review omit the preparation action; actionable groups require invoice selection before preparation.
- **Preparation:** a blue button names billing or collection document preparation explicitly. The accompanying copy states that this action does not create a Gmail draft or send email.
- **Sent status checks:** scheduling and latest-run information come from service status. A manual Check sent status now action is visually separate from document preparation and does not act as a send button.
- **States:** loading, unavailable source data, retained previously loaded data, empty filtered results, disabled actions, and keyboard focus have explicit treatments. No replacement business data is invented after a service failure.

## Do's and Don'ts

- Do preserve the overview/filter/table/detail reading order and original reference.
- Do keep summary counts and their drilldown population aligned.
- Do keep Hotel + Account boundaries and next-action/latest-sent distinctions visible.
- Do verify a selected mobile drawer as well as the initial mobile queue.
- Don't substitute prototype reply, payment, or hold categories for implemented business state.
- Don't present document preparation or read-only sent checks as sending email.
- Don't promote screenshot timing artifacts or one-off compact labels into global design rules.

This is a surface-only record; it does not replace the global design file or regenerate a global sidecar.
