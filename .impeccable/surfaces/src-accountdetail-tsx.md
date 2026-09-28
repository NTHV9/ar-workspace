---
version: 1
slug: "src-accountdetail-tsx"
primary_target: "src/AccountDetail.tsx"
related_targets: ["src/account-workspace.css", "src/styles.css", "src/settings/AccountSettings.tsx", "src/settings/HistoryEditor.tsx", "src/settings/field-feedback.tsx", "src/settings/field-feedback.css"]
---

# Account workspace — audit refinement, 28 September 2026

Existing-world remediation U03/U06/U07/U08. Keep the shared navy, cool white, blue/teal and Plus Jakarta Sans identity. Hotel + Account, freshness and full Invoice identifiers remain explicit.

The exact open total remains visible in one initially collapsed Account summary disclosure; five metrics and Aging are inside it. Source status describes verification, not a generic next action. Account settings names the destination that contains rules and purpose-specific recipients. The selected count, exact open balance and document/external-billing actions share the existing sticky action bar above the ledger.

Above 1000px, ledger and details stay side by side. Desktop ledger rows remain single-line and fit without horizontal scrolling. Compact Original/Open values are real buttons with exact THB accessible labels plus Invoice number, exact-value titles, and the same detail action as Guest. Selection and detail balances, Original amount and the collapsed summary total show two decimals. At 1000px and below, details use a native modal dialog; narrow ledger horizontal scrolling remains available. Detail access must work by keyboard and tap, not only by hover. Preserve selection while switching layouts.

Account sections expose selected state with aria-pressed. Settings/history field failures keep entered values, associate local recovery text through aria-describedby, set aria-invalid and focus the first invalid control; Account settings opens the relevant subsection. Invalid saved portal data remains discoverable. Backend validation, revision checks, dirty-work protection and OPERA accounting authority remain separate constraints.

Source and synthetic captures inspected: account-1440, account-1280, account-390 and settings-invalid under `.tmp/impeccable-fixes/`. This is documentation of the implemented UI, not a claim of live financial-data or screen-reader certification. Delivery evidence belongs to docs/PROJECT_STATUS.md.
