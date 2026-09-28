---
version: 1
slug: "src-remittance-remittances-tsx"
primary_target: "src/remittance/Remittances.tsx"
related_targets: ["src/remittance/workspace.css", "src/remittance/RemittanceEvidence.tsx"]
---

# Remittances — audit refinement, 28 September 2026

U12 retains the existing work views, filters and notices table. One compact flat divided summary strip replaces elevated summary cards. Values use 22px tabular type, reducing to 19px at 600px and below; labels use 11px. This is a Remittance exception to shared summary-card elevation, not a global flattening rule.

Reported notice amount and unique OPERA open amount remain distinctly labelled. About these amounts and evidence-limit disclosures hold longer explanations on demand. Unknown balances and incomplete coverage retain their explicit notices. A remittance is evidence of a reported payment, never confirmation that an Invoice is settled.

Inspected source and `.tmp/impeccable-fixes/remittances.png` show the first notice at 1280×720. No source data, allocation semantics, retention eligibility or provider behavior changes are inferred from this visual documentation. Delivery evidence belongs to docs/PROJECT_STATUS.md.
