# Email Send Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace send-time composers with prominent, truthful progress and result screens, with a manual return to Collections.

**Architecture:** One presentational component and pure classifier render the existing delivery evidence. Standalone and batch hosts keep transport, admission, immutable IDs, recovery and exact-child navigation lifecycle. No new endpoint or persistence model.

**Tech Stack:** Existing React 19, TypeScript, Vite, CSS, lucide-react, Vitest and Playwright; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-26-email-send-summary-design.md`

## Global Constraints

- All UI is English. Navigation is manual.
- One-click Send now saves/validates/freezes then sends. Remove acceptance checkboxes and repeated confirmation panels; preserve separate Account selection checkboxes and backend `confirmed: true`.
- Gmail confirmation/acceptance completes the employee task. Back to Collections is immediately available during history recording/checking; history completion is not a staff navigation gate.
- No PDF engine, VAT, backend, schema, send API, credential, retention or cloud-resource changes.
- No automatic email. No new paid service or dependency.
- No new automatic polling or provider calls. Reuse human check/reload/review/original-request controls.
- Preserve reviewed bytes, immutable IDs, attempt markers, explicit-human-click admission, receipt floors and provider evidence.
- F5/reload resumes active work; it is not Exit.
- Existing uncommitted PROJECT_STATUS and PROJECT_AUDIT work belongs to another task and must remain untouched by these implementation agents.
- Owner method: Astra High planning/review and GPT-6.1 Sol Medium implementation. Owner-approved intent is already captured; do not repeat product questions.

## Review Focus

1. Lost response after acceptance: success evidence cannot downgrade or enable another send (Tasks 1 and 3).
2. Partial batch with multiple stages for one Account: messages and Accounts differ, remaining work stays reachable (Task 3).
3. Closed transient job on reload: do not reopen deleted bytes or lose the manual Collections destination (Task 2).
4. Long recipients and narrow viewports: the result, recovery actions and primary return remain readable/reachable (Task 4).
5. Cleanup/status-read delay or failure: accepted results can return during history checks; actual send/unsafe exit stays protected, preserving identifiers and files (Tasks 1, 2 and 3).

## File ownership and shared interface

Task 1 owns `src/email/send-result.ts`, `src/email/EmailSendResult.tsx`,
`src/email/send-result.css`, `tests/email-send-result.test.ts`.
Task 2 owns `src/EmailComposer.tsx`, `src/DocumentRoute.tsx`, `src/App.tsx`,
`tests/browser/email-composer.spec.ts`, `tests/browser/email-navigation.spec.ts`,
`tests/browser/document-route.spec.ts`, and only necessary single-composer fixture
edits. Task 3 owns `src/batch/BatchRoute.tsx`,
`src/batch/CombinedEmailComposer.tsx`, `src/batch/batch.css`,
`tests/browser/combined-email.spec.ts`,
`tests/browser/batch-workspace/pdf-editor.spec.ts`, and batch fixture edits.
Do not modify `src/batch/state.ts` transport/persistence logic unless review finds
an unavoidable integration defect; report it first. Task 4 is integration review
and verification, not a separate feature.

Task 1 completes before Tasks 2 and 3. Tasks 2 and 3 may run independently with
the fixed shared interface below and no cross-owner file edits. Do not run heavy
unit/build/browser suites concurrently on this Windows host.

```ts
// src/email/send-result.ts
export type EmailSendResultState = 'sending' | 'sent' | 'history-pending' | 'unconfirmed' | 'partial';
export type EmailSendOutcome = 'sent' | 'history-pending' | 'unconfirmed';
export function emailSendOutcome(delivery: EmailDeliveryView | null | undefined): EmailSendOutcome;
export interface EmailSendCounts {
  messages: number; accounts: number; invoices: number; files: number | null;
}
export interface EmailSendRecipientGroup {
  key: string; label: string;
  recipients: { to: string[]; cc: string[]; bcc: string[] } | null;
}
// src/email/EmailSendResult.tsx
export interface EmailSendResultProps {
  state: EmailSendResultState;
  counts: EmailSendCounts;
  recipientGroups: readonly EmailSendRecipientGroup[];
  gmailSentUrl: string;
  onBackToCollections: () => void;
  busy?: boolean; // check/metadata feedback; does not itself disable Back
  backDisabled?: boolean; // actual send/exit/unsafe-operation protection only
  detail?: string; // host supplies partial-result accounting or scoped explanation
  error?: string;
  recovery?: ReactNode; // existing host-owned check/review/exact-retry controls
  children?: ReactNode; // per-message batch outcomes and remaining-work action
}
export default function EmailSendResult(props: EmailSendResultProps): React.JSX.Element;
```

`emailSendOutcome` uses `sent && recorded` first, then `gmailAccepted`, otherwise
unconfirmed. It is deliberately not a permission predicate. Hosts exclude a
plain provider Draft from the result surface. A malformed `sent` without
recorded or accepted evidence is unconfirmed. Batch `partial` is host-derived
when results are mixed or unattempted Accounts remain. Counts describe the
displayed scope, never a claim that every message was sent.

### Task 1: Shared result presentation and evidence classification

**Files:** create the four Task 1 files listed above.

**Interfaces:** produces the exact exported types/functions/component above;
consumes `EmailDeliveryView` from `worker/email/shared.ts` and existing design
tokens. No fetch, routing, storage or provider side effects in these files.

- [x] **Step 1: Write failing classifier and markup tests.** Use Vitest and
  `renderToStaticMarkup` (existing React, no DOM dependency). Pin:

```ts
expect(emailSendOutcome({id:'d',mode:'send',state:'sent',recorded:true})).toBe('sent');
expect(emailSendOutcome({id:'d',mode:'send',state:'awaiting_evidence',gmailAccepted:true,recorded:false})).toBe('history-pending');
expect(emailSendOutcome({id:'d',mode:'send',state:'sent',recorded:false})).toBe('unconfirmed');
expect(emailSendOutcome(undefined)).toBe('unconfirmed');
expect(emailSendOutcome({id:'d',mode:'draft',state:'created'})).toBe('unconfirmed');
```

  Test names: `shows Email sent with History update pending for accepted evidence`,
  `shows Email results for partial without claiming Emails sent`,
  `disables Back to Collections while sending`, `shows unavailable files without
  a false zero`, `renders recipient groups separately`,
  `keeps Back enabled for history-pending with busy true`,
  `disables Back when backDisabled is true`. Assert exact headlines,
  both standard actions, CC/BCC visibility via details and injected recovery.
- [x] **Step 2: Run** `pnpm exec vitest run tests/email-send-result.test.ts`;
  expect initial failure because the new exports do not exist.
- [x] **Step 3: Implement** the interface and spec copy. A focusable heading
  receives focus once on meaningful result-state transitions; use a polite
  live status for progress, stable error alerts and no duplicated status prose.
  Standard return is disabled only when `state === 'sending' || backDisabled`;
  generic busy does not disable it. Accepted copy says `Gmail accepted this email.
  You can return to Collections while history processing continues. Do not
  resend.` Existing server-side processing continues; never promise all conflicts
  will automatically complete. Gmail uses the supplied URL,
  `target="_blank"` and `rel="noopener noreferrer"`. Wrap recipient text and
  counts on compact screens. Keep CSS scoped to the result component.
- [x] **Step 4: Run** the focused unit test and `pnpm typecheck`; expect pass.
- [x] **Step 5: Handoff** the fixed exports to both implementation owners. Commit
  only when the parent authorizes the implementation checkpoint; stage explicit
  Task 1 paths, never unrelated documentation. Suggested message:
  `feat: add shared email send result presentation`.

### Task 2: Standalone composer result and real Collections navigation

**Files:** Task 2 ownership above; existing `src/email-composer.css` only if
needed to size the persistent dialog around the shared result.

**Interfaces:** consumes Task 1. Adds optional
`onBackToCollections?: () => void` to EmailComposer and DocumentRoute props.
App passes `() => { void navigateView('collections'); }` through DocumentRoute.
Existing `onClose` and batch registration retain their meanings. Production
standalone result always has the explicit Collections callback; direct test
harnesses may use their supplied onClose as the fallback.

- [x] **Step 1: Write failing browser cases** in existing suites using synthetic
  route fixtures. `single send replaces composer and stays until manual return`:
  defer POST response, assert `Sending email…`, hidden Email message field,
  disabled Back to Collections; resolve sent+recorded, assert `Email sent`, exact
  recipients/counts and one POST. Verify no URL transition until return clicked.
  `one Send now click saves current edits and submits once`: edit recipients,
  subject/body and filenames, click once, assert saved revision/body exactly
  matches send payload, `confirmed: true`, one POST and no acceptance control or
  confirmation popup. `double click admits one operation`: delay save/send and
  assert one save chain and one POST. `invalid recipients or changed policy do
  not send`: validation keeps correction UI, zero send POSTs. `save failure does
  not send`: retain edits, zero send POSTs. Existing lost-save replay and F5
  tests retain the same command/revision without automatic submission.
  `accepted send retains recovery without resend`: accepted/history-pending then
  successful check; assert headline stays sent, pending clears and POST count=1.
  `accepted result can return while history check is pending`: hold check
  response open, assert Back to Collections enabled, click it, assert guarded
  navigation completes before releasing check; no resend or lost receipt.
  `lost send response remains unconfirmed`: check/reload failures retain no-resend
  state and the existing SentMatchReview action. `draft remains preparation`:
  Admin creates Draft, no Email sent heading; staff lacks Create Gmail draft.
  `result return uses Collections from account origin`: successful guarded exit
  lands on Collections, not Account/PDF. `failed result exit stays visible`:
  abandon failure does not navigate. `closed sent job reload remains a receipt`:
  no PDF read/reopen request, manual Collections still works.
- [x] **Step 2: Run**
  `pnpm test:browser:smoke tests/browser/email-composer.spec.ts tests/browser/email-navigation.spec.ts tests/browser/document-route.spec.ts`;
  expect new assertions to fail on the old visible composer/navigation.
- [x] **Step 3: Integrate** within EmailComposer's existing dialog. Replace
  reviewSend -> confirming/ack -> sendNow with one `sendNow(): Promise<void>`
  user action under the existing synchronous admission lock: save current edits,
  validate current recipients/package/policy, freeze the returned saved draft and
  policy version, then submit that exact revision with `confirmed: true`. Remove
  acceptance checkbox and repeated confirmation panel; expose one Send now CTA.
  Never use stale React draft state after persistCurrentEdits resolves. Keep
  known pre-admission 4xx correction and unknown transport no-resend handling.
  Hold a dedicated send-action flag across this chain, separate from unrelated
  save/upload/check busy. A save/preflight failure must not submit a send request.
  Gate this standalone result branch to `!batch`; Task 3
  owns the separate-batch result presentation. Derive summary from the saved reviewed draft and job.
  Replace the content branch, not the dialog ref; retain SentMatchReview outside
  the hidden editor branch and wire its callbacks unchanged. Exclude Draft-only
  state and connection tests. Pass existing checkSent/reloadDeliveryStatus
  controls into recovery; check operations never look like a new send.
  For accepted/recorded result state, navigationDirty must exclude metadata/history
  busy alone. Separate generic busy from actual-send/exit and unsafe-edit
  protection; return must not be rejected solely because checkSent or
  reloadDeliveryStatus is pending. Preserve live/unmount guards and durable
  receipt truth when late responses settle. Actual sends, unsafe unsaved edits
  and cleanup in flight retain their protection.
- [x] **Step 4: Wire** the optional callback through DocumentRoute and App as
  specified. Closed-job sent receipt uses the callback too; do not fetch expired
  files to manufacture missing summary detail. Preserve leavePreparation and
  leaveDocument execution and surface their errors. No automatic close timer.
  Existing server-side receipts/reconciliation continue history work after return;
  no new polling/provider calls or mandatory human retry is introduced.
- [x] **Step 5: Run** Step 2 command plus
  `pnpm exec vitest run tests/email-delivery-status.test.ts tests/email-draft-admin.test.ts tests/email-verified-sent-recovery.test.ts`
  and `pnpm typecheck`; expect pass. Update old post-send headline assertions
  only where the approved UI replaced them; retain their behavioral assertions.
- [x] **Step 6: Handoff/commit** explicit Task 2 paths after parent approval.
  Suggested message: `feat: show dedicated single email send results`.

### Task 3: Separate and combined Account batch results

**Files:** Task 3 ownership above. Locate fixture source via existing harness
imports before editing; do not modify standalone fixtures owned by Task 2.

**Interfaces:** consumes Task 1. Adds required
`onBackToCollections: () => void` to CombinedEmailComposer; BatchRoute supplies
its existing confirmed/guarded leave-then-onClose path. Optional
`onResultVisibilityChange?: (visible: boolean) => void` may be added only if
needed to hide header preparation controls; derive locked results from existing
`combinedLocked` wherever sufficient. No changes to sendBatch API or state IDs.

- [x] **Step 1: Write failing batch browser cases.** Separate: `batch sending
  replaces review with progress`, `partial send retains unsent Account tabs`,
  `same Account stage groups count as two messages and one Account`, `unknown
  entry check never resends`, `batch result exit failure retains resume state`.
  Assert sends equal exactly the approved messages, rows never treat unknown as
  sent, unselected Accounts remain reachable through Review remaining emails,
  and no composer fields/send controls are visible on the result.
  Combined: `combined result counts one message across Account packages`,
  `accepted shared result remains sent across failed checks and F5`, `unknown
  shared result retains original request recovery`, `manual return uses protected
  child cleanup`, `accepted separate result can exit during history check`,
  `accepted combined result can exit during history check`. Hold check responses
  open and assert Back enabled, guarded exit completes before check settles,
  receipts retained and no resend. Assert same commandId/revision for an admitted original retry,
  no spontaneous resend on check/reload, accepted/recorded floor preserved and
  no batch removal before accepted cleanup. Reuse current fixture sent/accepted
  evidence and existing lost-response controls rather than replacing contracts.
  `combined one-click save and send freezes current inputs`: one Send now click
  persists manual recipients/body/package and submits one exact saved revision
  and command with `confirmed: true`; no acknowledgment checkbox or repeated
  confirmation panel. `combined double click sends once`: delayed save/transport
  still admits one request. `combined save or recipient/policy validation failure
  never sends`: zero send POSTs, correctable inputs retained and prior uncertain
  save uses the original exact replay. `separate overview label does not send`:
  Review emails or Email overview opens selection with zero send calls; Send N
  emails directly performs exactly N admitted requests. Keep selection checkboxes;
  assert no send-acceptance checkbox/popup, no duplicated send CTA and no send on F5.
- [x] **Step 2: Run**
  `pnpm test:browser:smoke tests/browser/combined-email.spec.ts tests/browser/batch-workspace/pdf-editor.spec.ts`;
  expect new result assertions to fail initially.
- [x] **Step 3: Integrate separate results.** Freeze the selected envelopes before
  transport as today, retain them in memory for this result and derive restored
  attempts from existing entries after F5. Render shared result plus per-entry
  evidence/recovery and remaining-work action. Keep two-worker send concurrency,
  preserve the useful Account-selection overview, and label overview-only
  navigation Review emails or Email overview. Send N emails validates/freezes
  the selected saved envelopes and sends directly from that click with no new
  acceptance step/dialog. Preserve the synchronous batch admission lock,
  and selecting an attempted Account tab on its result/recovery surface rather
  than reopening the disabled composer; unattempted tabs open preparation. Keep
  admission checks, current account controls and tab session data. Distinguish
  sent/history-pending/unconfirmed/unattempted; use distinct Hotel+Account keys
  for counts. Replace existing state-only sentCount/tab/row predicates with
  `state === 'sent' && recorded === true`; accepted remains sent with history
  update pending, never history-complete. Show unavailable metadata honestly after reload until verified
  reads provide it; do not create fake snapshots or persist customer copies.
- [x] **Step 4: Integrate combined results.** Use `combinedDelivery(current)` and
  existing `saved.content`, `saved.members` and reviewed totals. Separate true
  request progress from generic operation busy. When locked, replace common
  editor/review UI with shared result while retaining current check(),
  retryAdmission and retryOriginal controls. Keep observed receipt floors,
  assertCombinedBatch, pendingSave and immutable sendCommandId untouched. Remove
  acknowledgment/repeated confirmation UI. One Send now action holds the
  synchronous lock across prepare/save/validation/freeze and the original send
  request, using the exact returned CombinedEmail revision rather than stale
  React state. Resolve earlier pendingSave by its exact replay before considering
  current content; a failure must stop before send. Preserve `confirmed: true`,
  preflight/command fences, proven pre-admission 4xx correction and unknown-send
  locks. Remove duplicate global/body send CTA; overview-only labels cannot imply
  send. Hide
  misleading prepare/send header actions; keep per-Account tabs and disabled
  navigation during actual sending/unsafe operations. Back to Collections calls
  the existing batch Exit path. Refine leave/switching/combinedBusy/control-busy
  checks: accepted/recorded outcomes may leave during metadata/history checks,
  while true send/exit or unsafe preparation work still blocks. Set backDisabled
  only for those real constraints, not generic check busy. Keep exact-child
  cleanup, per-Account evidence and receipt/idempotency floors; late check
  responses must not resurrect removed resume state or write after unmount.
  No required check/retry before accepted-result return, and no new polling or
  provider call; existing durable backend processing retains history work.
- [x] **Step 5: Run** Step 2 command plus
  `pnpm exec vitest run tests/batch-state.test.ts tests/batch-lifecycle.test.ts tests/combined-email-state.test.ts tests/combined-email-delivery.test.ts tests/email-send-result.test.ts`
  and `pnpm typecheck`; expect pass. Old test assertions can follow the new
  headings, but no receipt/no-resend/reload assertion may be deleted to pass.
- [x] **Step 6: Handoff/commit** explicit Task 3 paths after parent approval.
  Suggested message: `feat: show Account batch email results`.

### Task 4: Integrate, inspect and independently review

**Files:** changed implementation/tests only; parent later owns a separate
PROJECT_STATUS checkpoint, preserving the unrelated 17-line audit work.

**Interfaces:** complete flow from all prior tasks; no new production interface.

- [x] **Step 1: Run sequentially** `pnpm test`, `pnpm build`, then the focused
  browser commands from Tasks 2 and 3 plus `tests/browser/email-draft-recovery.spec.ts`.
  Expect all tests/build to pass. Do not relax gates or run heavy suites in parallel.
- [x] **Step 2: Capture and inspect** synthetic result states for all three flows
  at 1440×900, 1280×800 and 390×844. At least one long To/CC/BCC list and mixed
  partial result must be inspected. Assert heading focus, live status, keyboard
  access to recovery and return, horizontal scroll width <= viewport, hidden
  composer fields and no duplicate Send buttons. Store new captures under
  `evidence/email-send-summary-<flow>-<state>-<width>.png`, never overwrite reference
  PNGs or old visual goldens. Do one batched correction and confirmation pass.
- [x] **Step 3: Review** with Astra High against the spec and actual diff. Trace
  4xx rejection, accepted receipt, unknown outcome, recorded result, refresh and
  every exit callback; verify no source/backend/tax changes and no new secret or
  customer data. Recheck any reported defect after correction.
- [x] **Step 4: Report** implemented/tested separately from deployed/enabled.
  Parent records customer-free evidence in PROJECT_STATUS without disturbing
  the unrelated audit. Deployment and any real mail test require their own
  concrete authorized release/test destinations; this UI plan itself sends no
  mail, changes no cloud resource and claims no live provider verification.

## Planning self-review

Coverage checked: all three flows, English, manual return, partial results,
Admin Draft, accurate counts, recovery/receipt floors, F5/Exit, no API changes
and visual evidence have explicit owners/tests. Latest one-click sending, exact
save/freeze, double-click admission and removal of repeated acceptance UI have
explicit tests; backend human authorization and receipt fences remain. Shared names/types match across
tasks. Task 1 is the dependency; Tasks 2/3 own disjoint source files. Existing
AGENTS security/lifecycle requirements remain active; newer owner intent permits
this UI refinement but does not authorize provider sends or resource changes.
