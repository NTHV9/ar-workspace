# Phuket Sheet Writeback Recovery Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans and request an independent scoped code review before release.

**Goal:** Recover confirmed Sent dates that stalled behind a provider conflict, and acknowledge already-published dates without another Sheet write or email.

**Architecture:** Modify only the existing protected tracker SQL queue projection and receipt fence. Retry conflict rows through the existing fresh snapshot, identity, field, generation and conditional-upload checks. Admit stale-generation uncertain/conflict rows only for exact Sheet echoes; final receipt rechecks current source authority so a newer edit/deletion cannot be overwritten or falsely acknowledged.

**Tech stack:** PostgreSQL17, existing tracker RPCs and Worker sync adapter.

**Spec:** Latest owner request in this chat; Sheet billing and Follow-up1–3 dates remain authoritative, including edits/deletions. No mail resend or invented Sent evidence.

- [x] Add synthetic regression for unchanged conflicts, old-generation exact echoes, edited/deleted dates and a readback/receipt race. Baseline failed with unchanged confirmed-Sent conflict permanently excluded from retry.
- [x] Create a drift-checked migration for ar_tracker_outbox, ar_tracker_write_result and pending status accounting. Final local PostgreSQL17 passes 151 migrations / 49 rollback fixtures and registered real concurrency checks; 78 focused Worker tests and typecheck pass.
- [ ] Run registered SQL contracts and relevant Worker tests; obtain scoped review and CI qualification.
- [ ] Apply the exact tested migration; use the existing validated sync path to recover eligible real rows.
- [ ] Verify the actual workbook dates, queue states and website billing status; preserve immutable Sent and all unrelated Sheet cells. Record release evidence.
