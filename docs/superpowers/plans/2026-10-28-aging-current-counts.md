# Current Aging Invoice Counts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the checked tasks inline; request an independent bounded review before release.

**Goal:** Historical missing children must not hide verified current Aging counts; nonzero debit and credit invoices remain individually counted even when their net is zero.

**Architecture:** Change only the protected Aging SQL read projection. An old missing child may be excluded only when it retains well-formed zero-parent lineage and the complete current root inventory reconciles against the current OPERA account and every native Aging bucket. Do not change persisted invoices or infer individual zeros from account net zero.

**Tech Stack:** PostgreSQL 17, existing Supabase migrations and synthetic SQL runner, existing React Aging UI.

**Spec:** Latest owner's decisions in this chat and docs/DECISIONS_AND_OPEN_ITEMS.md.

## Constraints and review focus

- Preserve Hotel + Account + Invoice boundaries, authentication and pagination.
- No source balances, Sheet dates, history, provider configuration or PDF changes.
- Missing current roots and malformed/positive/conflicting parent lineage must remain incomplete.
- Eight nonzero offsetting standalone rows must count as eight, with zero net.
- Historical children must never appear as extra current debt or be marked cleared by this read.
- A child exclusion must fail closed if current root/bucket reconciliation fails.

## Task 1: Reproduce and repair count projection

- [x] Add a synthetic fixture for historical missing children and offsetting roots; register it with the existing SQL runner.
- [x] Run the fixture before implementation and observe the historical-child count failure.
- [x] Create a migration that separates proven current children from eligible historical missing children and applies the latter exclusion only after native reconciliation.
- [x] Run the new fixture, existing signed Aging and source membership fixtures and complete registered SQL contracts. Final local PG17 evidence: 150 migrations / 48 rollback fixtures and registered real concurrency checks pass; 119 focused TypeScript tests and typecheck pass. Independent scoped review READY; its three suggested negative cases are included in this final SQL run.

## Task 2: Verify and release

- [ ] Inspect the eight disputed KAT invoices independently of the saved database; report any unavailable evidence explicitly.
- [ ] Run typecheck, relevant unit/browser tests and required CI; obtain independent review.
- [ ] Apply the exact tested migration to the existing project; verify current counts and unchanged source data.
- [ ] Verify the deployed Aging UI and record implemented/tested/deployed/enabled evidence in PROJECT_STATUS.
