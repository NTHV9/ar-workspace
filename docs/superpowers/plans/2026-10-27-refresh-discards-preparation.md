# Refresh discards temporary preparation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's latest decision: refresh/F5 and normal tab close discard preparation; browser-tab switching preserves work. Explicit Exit and trusted Sent keep existing behavior.

**Architecture:** Any non-persisted pagehide queues the existing exact, authenticated, idempotent Exit. PageSwap absence is no longer interpreted as close proof. A small tab-bound sessionStorage return marker prevents a discarded document/batch from reopening after reload; it is navigation metadata, never deletion authority. Existing durable outbox receipts/reconciliation remain the cleanup mechanism.

**Tech Stack:** Existing React/TypeScript, browser lifecycle/sessionStorage, Cloudflare/Supabase cleanup APIs; no new dependency, worker, schedule or cloud resource.

**Spec:** Latest owner message on 27 October 2026 explicitly supersedes F5-preservation and deferred-native-close proposals. Preserve BFCache behavior and cancelled beforeunload. No claim covers process kill/crash without a lifecycle event.

**Ruling:** Preserve the existing validated Gmail authorization navigation. `EmailComposer.connect()` leaves through `location.assign(accounts.google.com)`; treating that requested handoff as abandonment would break mailbox connection while preparing email. A scoped one-navigation hold does not persist credentials or change provider requests. A subsequent unload after a cancelled attempt is an ordinary Exit.

## Global Constraints

- No email resend, billing/Sheet date write, financial/VAT change or PDF editor change.
- Keep current actor/authorization, exact identities, stable Exit commands, receipts and bounded outbox behavior.
- Remove only the matching local batch-resume key; never clear all storage.
- Local tests and exact-head GitHub checks must pass before deployment.

## Review Focus

- Successful reload and failed-network reload must both discard, including delayed lifecycle events.
- A cancelled close and repeated tab switching must preserve accepted Note/Undo state.
- Reload of a pending single/batch create must not create again or reopen discarded work.
- A malformed/foreign/unrelated return marker must not redirect or clear unrelated state.
- Queue/storage failure must not record a false successful discard; lost receipts retain recovery.

### Task 1: Native lifecycle and exact return fence

**Files:** `src/preparation/tab-exit.ts`, new `src/preparation/exit-return.ts`, `src/App.tsx`; tests `tests/preparation-tab-exit.test.ts`, new `tests/preparation-exit-return.test.ts`.

**Interfaces:** Keep `attachTabExit(window,onExit)`; `.exit()` reports whether durable enqueue succeeded. `rememberExitReturn(storage,actor,params,hasCreates)` stores bounded tab/scope metadata only after enqueue. `consumeExitReturn(storage,params)` returns Collections only for the matching tab and prior scope, and removes only that batch's resume key.

- [x] Write/run RED for successful reload/PageSwap now causing exactly one Exit.
- [x] Add exact-marker tests for single, batch, pending create, corruption, other tabs/routes and protected outbox state.
- [x] Implement the small lifecycle change and route fence before route effects mount.
- [x] Run focused units, typecheck and inspect the source diff.

### Task 2: Real browser contracts and qualification

**Files:** `tests/browser/preparation-tab-exit.spec.ts`, its real HTTP fixture, `.github/workflows/verify.yml`, decisions/status documentation.

- [x] Update reload and failed-reload expectations to discard, preserving native HTTP and exact marker assertions.
- [x] Cover return to Collections, no duplicate single/batch creation, failed reload's delayed Exit, cancelled close and tab-switch Note preservation.
- [x] Repeat the eight critical scenarios locally; run whole units with bounded local workers.
- [ ] Obtain bounded independent review, validate YAML, push one frozen candidate and wait for every required GitHub stage.
- [ ] Deploy only that qualified source, verify live health/assets, and record actual outcomes separately from prior failed runs.
