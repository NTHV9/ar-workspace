# Full PDF Workspace and Google Sheet CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute and verify each domain.

**Goal:** Implement the owner's approved full-workflow GitHub verification scope for PDF Workspace and the app's Google Sheet integration, including creation failures, editable field fidelity and row changes.

**Architecture:** Extend the existing Vitest/Playwright verification pipeline. Keep the currently selected checks, qualify omitted relevant workflow tests and add meaningful missing joined scenarios. Tests use synthetic APIs/provider adapters; provider-service qualification is a separate, explicitly identified boundary.

**Tech Stack:** Existing TypeScript, Vitest, Playwright, Vite and GitHub Actions. No new paid service or production resource.

**Spec:** The owner's accepted scope in this conversation; existing PRODUCT_SPEC, DECISIONS_AND_OPEN_ITEMS and the implementation source define field and lifecycle rules.

## Global Constraints

- Pause the actual staff Sent-to-Sheet incident. Do not retry or alter its records, dates or identity mappings.
- Preserve deployed runtime ff88342/Worker ae0fe3 unless an actual new reproducible bug requires a separately verified fix.
- No CI production credentials, customer PDFs/JSON, one-use recipients, real email sends or Sheet writes.
- OPERA remains financial authority. Google Sheet controls actual billing and Follow-up1–3 dates, including cleared dates; Friendly/Final retain their existing source rules.
- Preserve Hotel/Account isolation, draft/uncertainty retention, exact file identity, no duplicate commands and strict PDF/background safeguards.
- Keep all existing CI checks. Do not remove assertions, skip cases or replace reference images merely to obtain green results.

## Review Focus

- Partially generated packages must identify the actual failed Invoice and preserve successful files without inventing replacements.
- Typing, line growth/shrink and export must retain intended text and untouched fields, including right header, tax totals and subsequent pages.
- Switching Accounts/phases must preserve each account's own documents, edits and email package.
- A confirmed Sent event does not by itself prove a Sheet cell was updated; unmatched, conflicting and uncertain targets must not be written blindly.
- Sheet deletions, concurrent edits, notification replays and stale responses must not resurrect dates or overwrite user changes.

## Tasks

- [x] Inventory PDF and Sheet requirements against source, unit tests, selected browser cases and external-service boundaries.
- [x] PDF domain: qualify complete preparation/editor/package/session/handoff/recovery workflows; add missing generation-failure identity, field-fidelity and row-change cases.
- [x] Sheet domain: qualify complete connection/import/writeback/notification/conflict/recovery workflows; add missing joined adapter/RPC cases, including all mapped field rules and cleared dates.
- [x] Integrate the two domains into existing CI selection without duplicating checks unnecessarily; preserve all previous selected cases.
- [x] Retain failure screenshots/traces so a failed scenario identifies its step, input and expected outcome using synthetic data only.
- [x] Publish an inspectable feature-to-test matrix with explicit simulated versus service-verified versus outstanding classifications.
- [ ] Independently review scope, assertions, privacy and runtime diffs; run local checks and committed-head GitHub verification.
- [ ] Record enabled CI scope and results in PROJECT_STATUS. Deploy only if there are separately qualified runtime fixes; CI-only changes do not need an app deployment.
