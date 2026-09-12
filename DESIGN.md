---
name: Luminous AR interface
description: A calm comparative workspace for hotel receivables and collection work.
colors:
  primary: "#3d65ff"
  primary-hover: "#3157df"
  canvas: "#eaf2f7"
  surface: "#f7fafc"
  white: "#ffffff"
  ink: "#10253f"
  muted: "#657b96"
  dashboard-muted: "#51677e"
  line: "#dce5ef"
  dashboard-link: "#2852c8"
  dashboard-kat: "#5584ed"
  dashboard-tsk: "#20a798"
  urgent: "#b33755"
  review: "#95650b"
typography:
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.3
  dashboard-title:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  dashboard-label:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  dashboard-measure:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
rounded:
  control: "9px"
  navigation: "12px"
  dashboard-surface: "16px"
  panel: "17px"
  frame: "29px"
spacing:
  compact: "12px"
  grid: "18px"
  surface: "20px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-default:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  dashboard-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "38px"
  dashboard-surface:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dashboard-surface}"
    padding: "{spacing.surface}"
---

# Design System: Luminous AR interface

## Overview

**Creative North Star: "Luminous AR"**

Visual authority remains `references/design/luminous-v4.png` and `account-detail-v2.png`; supporting reference pages remain unchanged. Mode: Operate. Preserve the light blue-gray canvas, white surfaces, navy text, blue and teal property indicators, fine borders, restrained shadows and rounded application frame.

Tables are the main workspace. Dashboard extends this existing world with a legible distinction between dated activity and current work; it does not replace the Portfolio comparison matrix. This document records implemented source patterns from `src/styles.css`, `src/dashboard/dashboard.css` and `src/dashboard/Dashboard.tsx`. It is not evidence of deployment or live-source validation.

**Key Characteristics:**

- Calm white surfaces on a cool canvas, bounded by fine lines.
- Compact self-hosted sans typography and aligned tabular amounts.
- Hotel identity remains visible in comparisons and source navigation.
- Date context, current-state context and unavailable evidence remain explicit.

## Colors

The palette uses blue for interaction, blue and teal for hotel comparison, and restrained semantic colors for work that needs attention.

### Primary

- **Interaction blue:** the shared primary action and link family; Dashboard uses its darker link token for source links.

### Secondary

- **KAT blue / TSK teal:** hotel dots and proportional tracks in Dashboard. Portfolio retains its incumbent property fills and indicator shades; the Dashboard variants do not recolor it.
- **Urgent rose:** overdue emphasis and urgent counts; **review amber:** review and setup counts. Labels always carry the meaning alongside color.

### Neutral

- **Cool canvas / pale surface / white:** outside canvas, application interior and content surfaces.
- **Navy ink:** headings, amounts and primary reading text.
- **Muted slate:** shared secondary text; Dashboard's darker muted variant carries explanatory copy and source notes.
- **Fine blue-gray line:** surface boundaries, control strokes and divided measurement cells.

**The Hotel Identity Rule.** Preserve distinct hotel labels and blue/teal indicators. A shared Account ID does not erase its Hotel context.

## Typography

**Display and Body Font:** self-hosted Plus Jakarta Sans, with sans-serif fallback. The exact original reference font was not supplied; the implemented close match remains subject to visual review against the originals.

The hierarchy is compact and numerical. Shared page titles lead with a bold headline; Dashboard section titles are larger than table headings, while measurement counts are the main visual anchors. Use tabular numerals in financial tables, totals and work counts.

### Hierarchy

- **Headline:** page identity, using the frontmatter headline role. Dashboard tightens its tracking to (-0.03em).
- **Dashboard title:** section headings that separate daily activity from current balances and actions.
- **Body:** shared application text; Dashboard explanatory rows generally use the label role with generous line-height (1.6–1.7).
- **Measurement:** large daily counts. Monetary measures use a smaller size to accommodate long THB values; on the smallest layout the count role reduces to (29px).
- **Source note:** Dashboard uses compact supporting text (10px), kept subordinate to the metric and its meaning. This density is descriptive of the current surface, not a universal minimum for new interfaces.

**The Aligned Amount Rule.** Right-align financial columns and use tabular numerals; keep descriptive row labels left-aligned.

## Layout

The application has a centered frame with maximum width (1800px), a top navigation shell and a desktop page gutter (24px). Larger screens expand the gutter; small screens reduce it. Preserve the incumbent Portfolio composition at 1440×900: three overview panels and two full-width comparative tables. Account retains five summary panels, an aging band, tabs, a wide ledger and a narrower right detail panel. Account Detail keeps the ledger and right panel side by side above 1000 CSS pixels, including 1024/1100/1200 laptop widths. At 1000px and below, use the right modal drawer. Keep horizontal table scrolling and preserve selection when changing between these layouts.

Dashboard places a compact date/account filter row above a four-measure divided white strip. A wider current-AR comparison sits beside a narrower current-action list, followed by evidence sections. This arrangement is a Dashboard pattern, not a requirement to turn every page into summary tiles.

At widths up to (800px), the daily strip becomes a two-by-two grid and comparison/evidence columns stack. At (600px), Account type, Account, clear and reload controls sit inside an initially collapsed native disclosure with the active-filter count visible. Activity date remains outside it. Desktop keeps those controls expanded. At (480px), totals stack and tables retain controlled horizontal scrolling instead of clipping their columns.

**The Two Time Contexts Rule.** Place the selected Thailand calendar day in the activity heading. Label current balances and current queue separately so changing the activity day cannot imply a historical balance snapshot.

## Elevation & Depth

Depth is restrained: the outer frame has an ambient shadow, shared panels have a barely visible lift, and the selected navigation item gains a shallow shadow. Dashboard surfaces use fine borders and white fills without new shadows. The existing Portfolio decorative orb remains local to that surface; it is not a required Dashboard motif. Exact shadow and motion values are recorded in the sidecar.

Page arrival uses a short opacity transition only when reduced motion is not requested. Focus is a visible blue outline, not a shadow substitute.

## Shapes

Gently rounded controls sit inside broader rounded content surfaces and the soft application frame. The divided measurement strip shares one enclosing border and radius; internal cells meet at fine dividers rather than becoming nested cards. Small hotel dots and slim tracks support comparisons. Native disclosure preserves a compact rectangular control silhouette on mobile.

## Components

### Buttons and source links

Default buttons are white with a fine border, rounded control corners and a subtle blue-tinted hover. Shared primary buttons use interaction blue and white text. Keyboard focus uses a visible outline (3px) with offset (3px). Disabled buttons reduce opacity and retain their disabled state.

Keep primary foreground and background colors paired in every state. Contextual footer or generic button rules must not replace a primary background with white while retaining white text. Primary PDF hover states use the darker interaction blue; disabled buttons do not gain an enabled hover appearance. Check button labels before hover, while hovered, and with keyboard focus.

Dashboard source links are descriptive text with a small inline arrow icon. Link each measure or row to its matching evidence; preserve date, hotel, account type and Hotel + Account identity where applicable, plus the Dashboard return path. In-page links connect First billed to billing channels and Follow-up sends to sent-stage evidence.

### Inputs and account-filter disclosure

Dashboard fields are white, finely stroked and consistently rounded, with visible labels. The mobile disclosure exposes its current active-filter count even while closed, supports native keyboard activation and a visible focus ring, and reveals full-width controls when expanded. Account-option failures retain saved selections and show an inline status message.

### Navigation and status chips

Navigation uses a pale inset track and a white selected item. Narrow viewports allow navigation scrolling rather than truncating destinations. Hotel selection stays separate from page navigation. Existing freshness and count chips remain compact supporting indicators, not headings.

### Divided daily measurement strip

Four related measures share one white container: Invoice entries, First billed, Follow-up sends and OPERA payment credits. Each cell orders label, dominant value, explanatory amount or channel split, source note and matching evidence link. The repeated source-note area and bottom-aligned link keep the strip scannable. Desktop separators run vertically; mobile adds horizontal separation between the two rows.

### Current hotel comparison and actions

Current AR places the net total and overdue amount above hotel rows with source timestamps, labelled dots, aligned financial columns and small proportional tracks. Adjacent action rows place a label and supporting amount opposite the count and source arrow. Urgent and review colors are limited to meaning-bearing values. Overlapping action views are explained and are not presented as an additive total.

### Evidence and unavailable states

Supporting tables, definition lists and remittance totals use the same white surface, fine divider and aligned-number language. Unknown values display an em dash with a source-specific explanation. A failed source shows its notice in the affected section; other available sections remain readable. Empty confirmed activity uses an explicit empty-state sentence.

**The Evidence Boundary Rule.** Keep unavailable evidence visually distinct from a verified zero. Explain coverage and source failures beside the affected data, and preserve the path to its source.

### Portfolio and Account continuity

TSK, KAT and Total columns remain distinct. Default Total Open descending; every supported column sorts. Guest Name, Invoice No. and Folio No. remain separate. Selection never crosses Hotel + Account. These incumbent decisions remain in force alongside the new Dashboard patterns.

The selected-invoice count, amount and actions sit above the Account Detail ledger. Keep this single action bar sticky while the page scrolls, with responsive wrapping on small screens. Preparing documents and recording external billing must remain reachable with a long invoice list.

## Do's and Don'ts

### Do:

- **Do** preserve original reference files and record approved business changes separately from visual mismatches.
- **Do** retain the Portfolio matrix and Account ledger compositions when extending the application.
- **Do** label selected-day activity and current work independently.
- **Do** keep amounts aligned, hotels identifiable and source links matched to their evidence.
- **Do** preserve unavailable states per source and keyboard-visible focus.
- **Do** use compact mobile disclosure for optional Account filters while keeping the activity date visible.

### Don't:

- **Don't** replace the comparative workspace with a new visual identity.
- **Don't** present unknown source values as zero or sum overlapping action counts into debt.
- **Don't** merge Hotel + Account identity through filters, selections or source links.
- **Don't** hide financial columns automatically to fit a narrow viewport. Aging may use explicit user-selected visibility; keep All aging and controlled scrolling available.
- **Don't** treat synthetic review captures as live-service validation.

Not canonized: the test-only synthetic-capture badge is evidence scaffolding, not production interface design. Incumbent uppercase metric kickers and the miniature text brand mark are carried by the build but are not reusable typography or identity rules for new surfaces.


## Modern Dashboard update — 12 September 2026

The owner replaced the table-led Dashboard presentation with an at-a-glance operational design. This overrides earlier Dashboard-specific compositions above; Portfolio, Account Detail and PDF retain their approved visual structure.

The period surface starts with compact date/scope controls and four closing-balance measures. A navy total panel anchors blue unbilled, rose Past Due date and amber invoice-age panels; every panel includes the invoice count, exact THB amount, scope and a matching detail action. The required-billing completion ring uses billed / (billed + unbilled) invoice counts, never Not Required or overlapping review groups. Latest-stage bars encode share of the closing open amount. All counts, amounts and percentages remain available in an expandable breakdown. Period activity is a separate section with new invoices, first billing and payment-linked invoices emphasized, plus exact send and payment details.

Current Aging adds a net-open hotel comparison and all source ranges on a shared hotel-amount scale. TSK teal #16897d and KAT blue #426cd0 remain consistent across overview and matrix. The full matrix is the default; Columns offers Summary, All aging and individual range/net/percentage choices. User choices persist through drill/back; no bucket or matched account is silently removed. Negative credits extend left of the chart zero line when present.

Dashboard-specific type steps: 30px page title, 34px principal count, 28–32px aging net, 20px aging bucket amounts, 18px exact KPI amounts, 16–17px section titles, 11–13px controls and comparison labels. Cool navy #172e51, blue #4169dd, teal #087f80, rose #ad3e61 and amber #986914 carry meaning. Surfaces use 12–14px corners. Retained app typography is Plus Jakarta Sans. Color/type detector differences are intentional extensions for this approved Dashboard scope, not a global style replacement.

Availability is separate from freshness: a verified publication remains visible during a new attempt, with source timestamps and an explicit refreshing/failed note. Same-scope browser reloads retain prior loaded data with a notice; changing date, hotel, account or authenticated session clears it. Unverified data and uncaptured historical dates stay unavailable.


## Hotel comparison and focused Aging — 12 September 2026

The owner requested a more engaging comparison surface and property counts/amounts beside combined Invoice metrics. Dashboard view controls now sit alongside the page heading on desktop. Four tinted closing-status panels keep totals dominant and use KAT blue / TSK teal splits with a true proportional amount track. Each property row exposes its count and exact amount and opens that property's details. Single-hotel/account cards occupy the full available card width.

Billing, latest Follow-Up, period activity and payment measures retain Total with both hotel breakdowns. The numeric basis stays visible: invoice counts, send occurrences and current allocations are not interchangeable. A single protected database snapshot supplies all three scopes. When a later group read fails, the entire prior Total/KAT/TSK source group stays together with an explicit notice; fresh totals are never paired with old property values.

Current Aging replaces the six small chart grid with a chronological selectable distribution on one shared signed THB scale. Selecting a range focuses the comparison on TSK / KAT / Total; Full matrix and Columns retain all ranges and user visibility choices. A compact all-age net header remains distinct from the selected-range table. Bars, labels and exact amounts explain the selection without invented trends. Current Aging page, filters, visible sort and range survive invoice drill and return.

The palette remains the approved light navy/blue/teal family. Blue, pale blue, rose and amber status surfaces add semantic contrast; source money uses tabular numerals, 21px primary amounts and 12–13px property values. Lower activity tables retain controlled horizontal scrolling on narrow screens. Existing reference PNGs, Portfolio, Account Detail and PDF design are not replaced.
