# Shared invoice-generation repairs

> Use superpowers:executing-plans inline and an independent final code review.

**Goal:** Repair the shared generation paths behind the 96 corpus failures, not individual PDFs or invoice-number exceptions.

**Spec:** PDF_CURRENT_CORPUS_AUDIT_20261021.md and the owner's approval to fix the system, including future invoices with the same patterns.

**Architecture:** Keep identity, complete pagination, monetary reconciliation and source-change fences. Normalize presentation whitespace only. Extend financial classification only with direct ledger evidence or uniquely identified native OPERA controls; never replace uncertain tax with zero or remove checks merely to obtain a PDF. Keep externally uploaded originals unchanged.

- [x] Reproduce Tab failures in real rendering with synthetic inputs; normalize display whitespace consistently with Voucher metadata. Preserve source values and reject other control characters.
- [x] Capture native OPERA evidence for VAT/service bases, selected Payments and standalone VAT/check groups. A true AR print validates Payment totals. Reproduce qualified shared failures with synthetic regressions. Nine cases lack sufficient exact evidence and remain refused; see the repair report.
- [x] Update model/read/control helpers for verified patterns. Test ambiguous identity, changed balances/postings, duplicate tax attribution, partial payment and report mismatch as rejection cases.
- [x] Re-run all 96 affected invoices: 87 generate, nine remain refused. Verify 87 files/241 pages and 1,138 actual-byte editor operations. New browser click-flow audit could not attach; not claimed passed. Earlier successful corpus is not claimed wholly regenerated.
- [ ] Full tests, TypeScript/build, independent review, private evidence and PROJECT_STATUS. Deploy only the qualified change; report any unresolved source cases explicitly.

No per-invoice overrides, customer data in Git, accounting/Sheet edits, actual emails or weakening of authentication/retention safeguards. Existing print/read authorization applies only to scoped source evidence.
