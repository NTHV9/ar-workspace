# Dashboard visual overview — 2 October 2026

Status: **implemented and tested locally; not yet deployed, merged or confirmed enabled**. The owner chose a billing/outstanding overview together with urgent Accounts. This change extends the existing Luminous AR Dashboard and preserves the original design references.

## Implemented

- A compact four-measure exposure strip precedes the billing progress ring and ranked Needs attention Accounts. The top three priority Accounts expand to the full list; the continuous searchable/sortable aged Account list remains below.
- Billing completion uses original billed value divided by original billed plus unbilled value for the selected period. Exact amounts and invoice counts remain visible. Not Required, Setup needed and credits remain separate; missing coverage is unavailable, while a verified zero denominator shows no billing due.
- Hotel aging compares all hotels on one signed amount scale. Credits extend left of zero. Pointer, keyboard and touch selection expose exact hotel/range amounts and counts. The detail action opens that hotel's open-invoice ledger; it does not claim a range-filtered invoice drill.
- A native Hotel & billing figures disclosure retains the exact hotel/billing tables. Account-type bars compare positive values against the largest absolute type amount, retaining the signed exact amounts. The existing period-activity disclosure remains.
- Compact spacing keeps all three priority rows and their metadata visible at the checked 1440px desktop viewport. Summary amounts at or above one million in absolute value retain compact primary figures with a visible exact THB caption, including mobile; exactness does not depend on hover.

Implementation files: `src/dashboard/ManagementDashboard.tsx`, `src/dashboard/ManagementVisuals.tsx`, `src/dashboard/management-visuals.ts` and `src/dashboard/management-visuals.css`. Behavioral coverage is in `tests/management-visuals.test.ts` and `tests/browser/cfo-dashboard.spec.ts`.

## Design scope and detector disposition

The inherited self-hosted Plus Jakarta Sans, cool white, navy text, meaningful accents and shared panel lighting remain. The local chart palette is teal `#298f91`, sky `#629ed1`, indigo `#6574ce`, lavender `#9473b8`, amber `#c28d27` and coral `#c56573`. Pale rose `#f5ebed` identifies the attention area; navy `#17364d` anchors Outstanding. These are scoped variations of the existing Dashboard world, not replacements for the global palette.

The global frontmatter specifies 16px Dashboard surfaces and a 34px Dashboard measure; this surface uses 14px panels, 4px chart tracks, a 38px ring percentage (27px narrow), 30px/25px/18px summary values and 18px/17px chart headings. Those observed local steps are documented in the [surface brief](../.impeccable/surfaces/src-dashboard-dashboard-tsx.md). Global `DESIGN.md` and `.impeccable/design.json` are intentionally unchanged. Pre-existing global drift, miniature brand lettering, uppercase metric kickers and synthetic-capture badges are not promoted into reusable system rules.

The design detector ran once and saved `.tmp/dashboard-design-detector.json`. Its width-animation warning was addressed by removing that transition; the remaining palette/type/radius advisories describe the scoped variants above. The saved detector output is the original run, not evidence of a clean rerun. Reduced-motion rules disable transitions, animations and smooth scrolling within the visual Dashboard.

## Validation and visual evidence

The implementation run reported **1,574 passing unit tests**, a passing forced TypeScript build and a passing production build. **14 focused CFO browser cases passed**, covering Phuket and Khao Lak at 1440, 1280 and 390px, exact billing figures, Account search/sort and Hotel + Account drill/return, unavailable coverage, keyboard hotel selection, mobile filters, million-scale exact captions and priority-row bounds.

The finish reviewer initially requested two fixes: the third priority Account extended below the 900px desktop viewport, and million-scale exact summary amounts depended on title text. The final scoped reviewer verdict was **SHIP**, with both scored issues resolved after compact spacing and visible exact captions. This verdict is a recheck of those fixes, not a renewed whole-surface audit.

All following PNGs are font-ready local browser captures using synthetic fixtures from the CFO browser suite, not customer or live provider data. They show the implemented React/CSS UI and were reviewed during the implementation/finish pass; they are not AI-generated artwork. Original reference PNGs were not edited or replaced.

| Capture set | Files under `.impeccable/review/` | Purpose |
| --- | --- | --- |
| Phuket | `dashboard-phuket-1440.png`, `dashboard-phuket-1280.png`, `dashboard-phuket-390.png` | Overview and responsive composition |
| Khao Lak | `dashboard-khao-lak-1440.png`, `dashboard-khao-lak-1280.png`, `dashboard-khao-lak-390.png` | Four-hotel comparison and responsive composition |
| Full pages | `dashboard-phuket-full-1440.png`, `dashboard-khao-lak-full-1440.png` | Lower comparison sections and continuous Account list |
| Million-scale | `dashboard-millions-1440.png`, `dashboard-millions-1280.png`, `dashboard-millions-390.png` | Visible exact summary amounts and usable priority rows |

## Financial and deployment boundaries

No backend, schema, authentication, email or financial-rule change. Closing outstanding balances remain separate from selected-period original invoice values. Actual first billing remains the evidence for Billed; Draft does not count. OPERA Invoice age >60 remains separate from days after Due date. Credits stay signed, unknown does not become zero, duplicate children do not increase totals, and every Account action retains Hotel + Account identity. Remittance does not settle OPERA debt.

The real signed-in browser verification is blocked by an expired Google session requiring the owner to sign in. This report claims no new live financial verification. At this documentation checkpoint the visual revision has not been deployed or merged, and production enablement is not verified. No cloud resources or global configuration were changed by the documentation pass.
