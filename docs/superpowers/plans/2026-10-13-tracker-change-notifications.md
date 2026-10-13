# Tracker change notifications implementation plan

**Goal:** Editing the original Sheet wakes synchronization and updates an open web page without Reload.
**Spec:** ../specs/2026-10-13-tracker-change-notifications-design.md
**Owner decisions:** Proceed with fastest Sheet-to-web updates; retain five-minute fallback, skipping recent successful checks. Original files and existing accounting semantics stay unchanged.
**Execution:** Parallel independent SQL and browser work, root owns provider/workflow/integration and real-service verification; independent final review. Existing owner model preference: Sol Medium implementation, Astra High review.

## Rulings

- Latest approval supersedes the proposed 15-minute fallback and 10-second primary browser polling: retain five minutes and use authenticated Supabase Realtime for a small regional publication marker after commit. Browser fallback does not call Google.
- Primary scope is Sheet-to-web, explicitly clarified by owner. Accelerating outbound email writeback is deferred; preserve its existing semantics.
- Dedicated tracker Workflow binding avoids waiting behind OPERA refresh concurrency. No plan upgrade or paid add-on is permitted; use existing Worker/Workflow service.
- Owner explicitly approved proceeding and fastest implementation after the linked spec. Record implementation decisions here without asking again for the same scope.

## Tasks and contracts

- [ ] SQL service-only watch channels: prepare/activate/notify; hashed token, original-file binding, expiry/renewal overlap and early-sync handling. Test spoofed, expired and changed-binding callbacks.
- [ ] SQL durable regional wake generations: pending/begin/finish, old-run fencing, events during run, delayed failure retry. Test duplicate/out-of-order messages and crash recovery.
- [ ] Region/revision/time publication marker only, authenticated region-scoped RLS and Realtime publication; update after successful tracker finish. No financial payload.
- [ ] Worker files.watch registration, pinned callback, redirect rejection and response checks; callback commits before acknowledgement and dispatches Workflow. Test malformed headers, disabled/held mode and failed dispatch durability.
- [ ] Dedicated tracker Workflow uses existing sync/lease, short burst coalescing and no automatic replay of uncertain writes. Re-dispatch newer generations and retain five-minute recovery/OPERA schedule.
- [ ] Browser subscribes using existing Supabase client, checks authorized revision API, coalesces events and catches up on reconnect. Preserve hidden-tab and dirty-editor guards; test auth/scope cleanup.
- [ ] Focused tests, typecheck, SQL behavioral replay and independent review before deployment. Preserve current provider bindings/vars; verify deployed source.
- [ ] Transactional schema preflight, enable original-file watches without business edits. Separate registration from actual edit-delivery evidence; report unproven boundaries.

## Regression boundaries

No OPERA writes, customer mail, real Sheet date test edits, file conversion/moves, permission expansion or customer fixtures in Git. Preserve pending corrections and immutable Sent history.
