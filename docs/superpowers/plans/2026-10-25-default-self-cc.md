# Default self CC implementation plan

**Goal:** New email preparations include the hotel's regional AR mailbox in CC, included before either human-triggered Gmail draft or Send Now; other recipient addresses remain editable.

**Architecture:** Reuse the current hotel-to-mailbox mapping in a small immutable recipient helper. Apply it when opening any editable workspace draft (no delivery/handoff, unchanged package), when leaving recipient inputs and before saving edits. Mark added defaults as unsaved edits so existing atomic save precedes both handoff paths. The owner subsequently confirms self CC must always be present and asks to remove the confusing Load account recipients button. Preserve other recipient edits; normalize self to one CC entry, even if it previously appeared in To/BCC. No backend/schema/provider changes are needed.

**Tech stack:** Existing React/TypeScript, Vitest and Playwright.

**Authority:** Owner approval in this chat on 25 October 2026: implement in a separate worktree, test, send no real emails, preserve newer work. The prior proposed editable default and isolation approach are approved; execute inline without another approval gate.

**Isolation:** Base aff8494 (latest committed main work stream), not the older b0b1fb2 branch in the original folder. Other active refresh changes stay in their worktree. No deployment or shared checkout merge during concurrent work.

## Constraints and review focus

- Phuket KAT/TSK use ar@katathani.com; Khao Lak TLKL/WAKL/TLFO/TSAN use ar@thesandskhaolak.com.
- Preserve other account To/CC/BCC addresses; put self exactly once in CC, ignoring case/outer whitespace.
- Persist the visible reviewed recipient list before handoff; no hidden CC injection at sending time.
- Uncertain/existing Gmail handoffs must remain unchanged, even when revision is zero; do not rewrite already frozen provider snapshots.
- No provider calls from tests; all browser APIs and delivery endpoints are synthetic. Use a separate local port and test output folder.

## Task 1: Implement and qualify editable defaults

- [x] Run existing mailbox, email draft/handoff/MIME and regional-policy tests as baseline.
- [x] Add unit tests in tests/email-default-recipients.test.ts and browser tests/harness in tests/browser/default-self-cc; observe missing-default failures.
- [x] Add src/email/default-recipients.ts, integrate workspace restore, recipient blur and save paths in src/EmailComposer.tsx; remove the profile reload button/handler.
- [x] Prove both regional defaults across all hotels, duplicate avoidance, saved reopen, required-self retention, removal of other CC recipients, no reload button, save conflict preservation, Gmail draft payload and Send Now review/payload using mocks.
- [x] Run focused regressions, build/typecheck and browser tests; inspect screenshots at desktop/mobile widths.
- [x] Review the diff, record results/limitations in docs/PROJECT_STATUS.md and commit only this worktree's changes. Keep the isolated result available for later ordered integration.
