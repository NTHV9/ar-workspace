# Confirmed Sent Missing Tracker Rows Implementation Plan

> **For agentic workers:** Use executing-plans for integration and focused parallel
> implementation, then independent review.

**Goal:** Add the ten approved missing Sent rows and automatically recover future
missing-row additions without another email or existing-date overwrite.

**Architecture:** A private append journal validates immutable Sent and qualified
AR source. A pure row planner uses current Sheet aliases; separate native/XLSX
append adapters create only fresh rows. Existing synchronization imports readback.

**Tech Stack:** TypeScript, Cloudflare, PostgreSQL, Google Sheets/Drive, existing
OOXML preservation code; unchanged Python Aging Master for compatibility testing.

**Spec:** ../specs/2026-10-25-tracker-sent-row-append.md

## Constraints and Review Focus

No mail; original files/formats; no existing-cell backfill; no restoration of a
staff-cleared blank; no full financial publisher; no Aging Master/LFS change.
Review source/key drift, metadata-ID collisions, lost replies, duplicate insertions,
current existing rows with blank dates, and preservation on the next daily import.

### Task 1: Source and durable append journal

- [ ] Failing SQL fixtures: actual Sent only, scoped restoration, exact aliases,
  qualified AR roots, authority history, duplicates, source drift and lease loss.
- [ ] Generated migration: candidates/prepare/begin/finish, owner policy/cutoff and
  ten-row preview/apply; classic outbox excludes journal-owned writes.
- [ ] Disposable PostgreSQL migration/fixture verification and independent review.

### Task 2: Append adapters

- [ ] Native red/green: full headers, raw literal strings, initial typed dates,
  fresh-row atomic batch, fixed unique metadata ID, existing-row no-write/readback.
- [ ] XLSX red/green: new row only, exact key/identity, DATE1904, unchanged old
  cells/ZIP entries, formula safety and protected blanks.
- [ ] Actual existing Aging Master synthetic merge retains key and actual dates.

### Task 3: Integration and visibility

- [ ] Pure planner red/green and safe provider integration under the shared lease.
- [ ] Durable recovery/retry tests, no-resend proof, post-append fresh snapshot.
- [ ] Pending/addition hold status UI with focused browser checks.

### Task 4: Actual qualification and ten-row recovery

- [ ] Owned provider-copy append, retry and preservation checks; clean up exact IDs.
- [ ] Full appropriate unit/SQL/browser/type/build checks and review.
- [ ] Apply only the append migration; deploy while preserving runtime bindings.
- [ ] Fresh read-only preview of the ten originals; enable scoped policy and execute
  the authorized additions; verify actual dates and unchanged preexisting rows.
- [ ] Record actual enabled state/limits and push reviewed changes.
