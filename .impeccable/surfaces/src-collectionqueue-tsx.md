---
version: 1
slug: "src-collectionqueue-tsx"
primary_target: "src/CollectionQueue.tsx"
related_targets: ["src/collection/QueueWorkPanel.tsx","src/collection/account-work.ts","src/collection-queue.css"]
---

# Collections workbench

Owner requested a modern, easier redesign on 27 September 2026 and confirmed equal priority for finding/prioritizing Accounts and selecting Invoices/preparing documents. The prior account-first side-panel workflow remains the operating constraint. This is authorized implementation within the existing AR brand; no new business policy or data-writing route.

## Direction contract
THESIS: A compact account navigator gives most workspace width to the invoices staff act on. One account entry contains its distinct work stages rather than repeating the account in the left list.
OWN-WORLD: Existing navy ink, cool white surfaces, restrained blue actions and teal readiness, Plus Jakarta Sans, thin boundaries and soft downward shadows. No decorative imagery or metrics cards.
STORY: Choose a work view or search; choose an Account; choose its stage; select exact invoice rows; review the selected total; prepare documents.
FIRST VIEWPORT: A compact title/work-view/search band, a roughly 29% account navigator on the left, and a large invoice workbench on the right. The ledger aligns Invoice/Folio, Guest, action date, latest sent and precise open amount. The selection footer owns the document action.
FORM: Code-led account search navigator and invoice ledger, structural candidate 4 under surface seed c58238ec, honoring the already-selected Account/side-panel workflow. Responsive narrow screens open a native invoice dialog. No image comp is used as layout authority.
FINISH: Inspect complete desktop/mobile captures, run the mechanical detector once, receive an independent finish review, then document the verified result. Preserve rules, Hotel/Account/stage boundaries, original reference assets and safeguards.

## Implemented surface — 27 September 2026

The desktop workspace uses a 29% Account navigator (minimum 285px), an 18px gap and the remaining width for invoice work. Each navigator entry represents one Hotel + Account and gathers that account's visible work stages, invoice count, readiness, earliest action date and open amount. The highest-priority work leads by default; search, work views, sorting and optional filters remain available above both columns. All work, Billing due, Collection due and Urgent are direct choices; More work contains Upcoming, Setup needed, On hold and Needs review.

The workbench names its Hotel, Account type and Account before the ledger. An account with several work stages exposes separate stage buttons with counts; a single stage uses a compact badge. The amount is labelled This stage when several stages exist. Account details remain one explicit action away. Invoice search, Select all shown, Clear selection and Selected-only review sit immediately above the ledger. Invoice/Folio, Guest, Action date, Latest sent and exact Open · THB remain distinct; amounts are right-aligned with tabular numerals and two decimal places.

The selection footer pairs the selected count and exact THB total with Prepare documents. It remains outside the internally scrolling invoice rows. Desktop list height is measured against the actual workspace position and surrounding panel content, with a 260px minimum and 520px maximum; the sticky panel offset also responds to its measured height. This replaces the earlier estimate that put the action below the first viewport. Short desktop viewports retain usable invoice space and allow page scrolling to the action.

Following the owner's independent-scroll request on 27 September, desktop Accounts have their own bounded scrolling region. Its panel height follows the smaller of the invoice panel height and remaining viewport space (240px minimum); the Accounts heading remains outside it. Wheel scrolling at the top or bottom does not chain to the page. This supersedes the earlier naturally expanding desktop navigator. Eighteen focused browser cases passed, including actual wheel/keyboard navigation, stable page/header/invoice positions, both boundaries and last-account selection across both regions and short desktops. New captures are `evidence/collections-accounts-scroll-1440.png` and `evidence/collections-accounts-scroll-1280.png`; original captures remain unchanged.

At 1100px and below, Accounts occupy the page and invoice work opens in a native modal dialog. The Account list uses two columns until 650px, then one. At 650px and below, each invoice becomes a compact labelled row layout retaining its checkbox, Invoice/Folio, Guest, action date/readiness, latest-sent text and amount; the document action takes the full footer width. Search and filter controls wrap. The dialog keeps an explicit close action and native Escape handling.

Selection belongs to the focused Hotel + Account + work stage. Changing that scope clears it; refreshing data removes items no longer verified and selectable. Select all shown operates only on eligible rows in the current search. Needs review and On hold prevent document selection/preparation and offer Review account. The handoff uses the selected stable invoice IDs, Hotel, Account and existing billing/collection purpose. These presentation changes do not redefine due dates, sent evidence, short-credit rules or document policy.

## Relationship to the incumbent design system

This is a Collections composition within the existing Luminous AR world. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` retain their authority. Navy reading text, white/cool surfaces, restrained interaction blue, teal readiness, fine separators, rounded containers and soft downward elevation match the incumbent system. The shared `src/ui-typography.css` and `src/ui-depth.css` continue to govern their mapped elements; route-local declarations alone are not the computed design system.

The inherited Plus Jakarta Sans hierarchy resolves to a 30px page title (26px at 600px and below), 18px workbench Account heading, 14px navigator heading, 12px primary table/control text, and 10–11px supporting labels. The selected total is a local 20px emphasis (18px at 650px and below). Containers use local 12px corners, while finer local control/chip corners support density. These are descriptions of this surface, not new global tokens or permissions to replace existing components elsewhere.

The Hotel Identity Rule, Aligned Amount Rule and Evidence Boundary Rule still apply. The account navigator and invoice workbench express equal task priority through fast account scanning and more working room for invoice review. They do not replace Portfolio, Account Detail or other page compositions. Original logo/reference assets remain unchanged. This was a code-first semantic implementation: no image comp, comp approval or new visual world was used. The captures below are verification artifacts, not shipped raster assets or replacement references.

No changes were made to global `DESIGN.md` or `.impeccable/design.json` in this documentation pass. A local composition does not authorize a global identity/token refresh. The existing sidecar retains older Dashboard narrative, a 1200px Account drawer entry and shadow descriptions predating later prose updates; that pre-existing drift is outside this surface's scope and has not been repaired or made normative for Collections.

## Verification and review disposition

**Implemented:** the account navigator, wider invoice workbench, responsive dialog/rows and measured footer sizing are present in the related source files above. **Tested locally:** the implementation run reported 1,469 passing unit tests and 90 passing browser smoke cases before the footer sizing refinement; all 17 focused Collections/short-credit browser cases passed after that refinement. The documenter inspected source, test definitions and the five final captures, but did not rerun those suites. **Deployed:** production deployment of this redesign was pending at this documentation checkpoint. **Enabled:** no new business automation, sending route or cloud configuration was enabled by this surface work.

Behavioral coverage includes exact Hotel/Account/ID document selection, same-ID isolation, stage switches, holds, filters, short-credit rules, live workflow notifications, precise selected totals, Selected-only review and short viewport reachability. `tests/browser/collections-workspace.spec.ts` also asserts that the footer is fully inside the initial viewport at 1440×1000 and 1280×900 and in the selected-only desktop state, without first scrolling it into view. These are synthetic API fixtures, not live OPERA, Gmail or document-generation validation.

| Final artifact under `.tmp/collections-redesign/` | Browser viewport | Inspected state |
| --- | --- | --- |
| `collections-phuket-1440.png` | 1440×1000, full-page capture | Phuket navigator and long invoice list; two selected; footer inside initial viewport |
| `collections-khao-lak-1280.png` | 1280×900, full-page capture | Khao Lak navigator and workbench; two selected; footer inside initial viewport |
| `collections-phuket-390.png` | 390×844, viewport capture | Native invoice dialog; complete selected total and document action |
| `accounts-mobile.png` | 390×844, full-page capture | Single-column Account navigator after closing the dialog |
| `selected-invoices.png` | 1440×900, viewport capture | Selected-only ledger; exact THB 300.50 total and complete footer |

The independent finish review initially found one material first-viewport action-reachability issue. After the sizing correction it inspected the five recaptures and marked that finding **resolved**, with `disposition: ship` and no remaining finding in that review. Its final verdict covers the scored footer fix and absence of a visible regression in those recaptures; it is not a fresh whole-surface audit or a new browser execution. The reviewer observed footer bottoms at approximately y=984 for 1440×1000 and y=884 for 1280×900 and selected-only 1440×900. Evidence: `.tmp/collections-redesign/finish-review.md`.

The one mechanical detector report contains only design-system advisories: 35 color, 15 font-size and 8 radius findings. Some literal route sizes are superseded by the incumbent shared typography selectors. The findings are retained as scoped differences, not cleared by widening global tokens. No new decorative image, kicker, glyph icon or brand device has been canonized; pre-existing global drift and these local detector advisories remain outside any claim of a global design-system refresh.

## Deployment verification

Deployed on 27 September 2026 as runtime `0c58f4845075625ceeeb55c4c1f2628c8fda3070`, Worker `8a8fcd7a-eb2b-4f4c-b93a-a36874e053bb`. Health/source and anonymous access boundaries passed. Twelve focused scenarios passed on deployed assets using synthetic APIs, including both regions, exact selections, stage isolation, selected-only review, initial action reachability and short-credit rules. No live customer data or email was changed.
