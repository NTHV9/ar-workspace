# Restore tracker push delivery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make edits to the original tracker files wake synchronization promptly
and update the open web page without a manual reload, retaining exact restoration
of any owner-authorized live test cell.

**Architecture:** Reuse the existing authenticated Drive file watches, durable
wake/coalescing Workflow, shared synchronization lease and current-date authority.
The deployed false flags come from tracked Wrangler defaults overwriting the
previously approved true runtime flags even with `--keep-vars`. Restore approved
flags in the deployment source instead of adding a polling loop or new service.

**Tech Stack:** Cloudflare Workers/Workflows, existing Drive/Sheets adapters,
Supabase tracker authority, Vitest.

**Spec:** Latest owner request for prompt Sheet-to-web updates;
`docs/DECISIONS_AND_OPEN_ITEMS.md` Sheet date authority and previously approved
native best-effort writeback; live drift recorded in PROJECT_STATUS.

## Constraints

- Preserve all unrelated runtime bindings and secret binding names.
- No emails, OPERA writes, provider permission expansion, paid add-ons or new files.
- Original tracker file IDs/layout/formulas remain; mutate only backed-up test R cells.
- Keep conditional Phuket writes and native uncertainty protections.
- Five-minute scheduled fallback remains enabled.
- Restore test cells even if timing qualification fails; retain natural audit records.

## Tasks

- [ ] Add RED regressions that drive existing callback and native-write boundaries
  using the actual shipped configuration, rather than hard-coded enabled fixtures.
- [ ] Restore the approved push and native-write flags in `wrangler.jsonc` and
  rerun those regressions plus the full unit/integration suite and build.
- [ ] Independently review configuration/provenance, capture the live baseline,
  deploy and compare every plain binding and secret binding name; only approved
  flag changes are permitted. Verify registration/wake state on original files.
- [ ] Back up the exact live test identity/date and row values; clear an R cell
  through its normal editor, time provider notification, DB import and open-page
  status. Do not press Reload/Check changes during timed qualification.
- [ ] Confirm a later completed sync does not reinsert the cleared date, restore
  the original cell and observe its automatic return to billed. Verify row values
  and unchanged Sent-event count. Record measured limits in PROJECT_STATUS.
