# Impeccable audit — implementation record

Owner authorization: **ให้ทำครบตามรายงาน**. This record closes the recommendations in [the original audit](2026-09-28-impeccable.md); the original report remains the before-change assessment.

## Implementation matrix

| Group | Result | Verification |
|---|---|---|
| U01 | Same-tab app links preserve session, destination and Hotel/region; native downloads, external links and auth callbacks remain separate. Dirty-work confirmation remains. | Browser recovery-link → Operations → reload, fresh-tab login, unit coverage for scoped/historic/rejected links. |
| U02 | Plain message body has a nonshrinking minimum inside a scrollable message area; signature follows the body. | Plain/rich geometry at 1280×720 and 1280×800, captures inspected. |
| U03 | Exact two-decimal selected and detail amounts, including Original. Compact desktop ledger amounts expose exact accessible labels and open full details on focus/activation or tap. | Desktop 1440/1280 no horizontal overflow; mobile native invoice details and exact amounts. |
| U04 | Darker shared muted functional text and targeted email captions. | Computed contrast assertion ≥4.5 for audited navigation, screenshot review. Not a whole-app contrast certification. |
| U05 | Move lines supports keyboard selection, arrow/Shift-arrow movement, Escape and focus return; numeric bounds support area selection. | Synthetic PDF keyboard movement, bounds errors, Undo availability and existing PDF regression cases. |
| U06 | Account summary/aging uses one expandable disclosure; exact total remains visible. Account settings and Source status replace misleading labels. | Desktop/mobile captures and account interaction tests. |
| U07 | Account settings, collection policy and actual-history inputs show field-linked validation and focus the affected field/subsection before writes. | Invalid term/portal/recipient/date/policy cases; browser assertions that invalid submissions make no write. Backend validation retained. |
| U08 | Navigation and selected Hotel, Account sections, templates and PDF choices expose current/pressed state; grouped tool menus use native disclosures. | Semantic-state assertions; PDF menu Escape/focus behavior. |
| U09 | Template header uses the same dirty/saving/saved state as the form. | Edit → Unsaved changes → save → Saved browser case. |
| U10 | Storage separates temporary packages from retained evidence and older archives; healthy Drive setup is collapsible. | Scoped lifecycle-copy and disclosure browser case. Retention implementation unchanged. |
| U11 | PDF tools grouped into direct text tools, Add objects and Move; Preview PDFs is clearly named. Email puts the current handoff blocker beside its actions and names local persistence Save message. | Existing PDF/email scenarios updated to use real menus and labels; no added all-page preview or acknowledgment gate. |
| U12 | Remittance totals form a compact strip; explanations and evidence limits are optional disclosures. | 1280×720 capture and browser case, distinct reported/OPERA amounts preserved. |
| U13 | Remove identified obsolete Register summary/caption/font overrides; reconcile PRODUCT, DESIGN and sidecar with implemented shared tokens and local patterns. | Independent finish review plus shipped Impeccable documenter. Existing brand and frameless Register retained. |

## Verification scope

- TypeScript, production build and connector packaging passed. Existing large-chunk build advisory remains; no new dependency was added.
- Full local unit suite passed: **1,475 cases / 155 files** before the final navigation refinement. **19 focused navigation/form cases** passed afterward (including the additional explicit-Hotel navigation case).
- Full local browser smoke passed: **109 cases**. After the Preview label/tool menu refinement, **23 focused audit/PDF source-deletion cases** passed; after the final menu-Escape and destination-Hotel changes, **2 focused keyboard/navigation cases** passed. Final committed CI is recorded in PROJECT_STATUS.
- Synthetic captures are separate `evidence/impeccable-fixes-*.png` files. Existing screenshot/reference files were restored, not replaced as new acceptance baselines.
- The detector ran once after source implementation: **1,160 records**, primarily literal-value advisories. This is not a defect count or a requirement to normalize every local value. Known font/stroke-width/inherited warnings retain the original audit's context.
- Independent finish review inspected captures and sampled source/tests. It initially requested U13 persistence only. After the documenter reconciled the persisted rules, the targeted re-review returned **ship** with no remaining material documentation fix.

No real email was sent and no financial/customer record, provider permission, schema or file-retention behavior was changed. Synthetic browser checks do not establish real OPERA, Gmail or Drive correctness. Full screen-reader, every mobile/zoom combination and every financial-data shape remain outside this evidence.

Deployment SHA, Worker version, deployed checks and PR outcome are recorded in [PROJECT_STATUS](../PROJECT_STATUS.md), separately from implementation and local verification.
