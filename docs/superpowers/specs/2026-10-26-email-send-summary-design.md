# Email send result screen

Status: owner-approved intent; implementation and qualification remain pending.
Scope: standalone EmailComposer, separate Account batch sends and one combined email.
Baseline: worktree `pdf-ui-qualified`, HEAD `407d1f6`; parent verified deployed
application source `f866a7c46c75041933a13736ce889375cf6fa69f`. This planning
document does not claim an independent production verification or a deployment.

## Approved outcome

After the human clicks the send action, replace the visible composer/overview surface with a
dedicated, prominent progress/result screen. Staff should immediately understand
whether email was sent, whether history still needs attention, and what to do
next. All new UI is English. The owner explicitly chooses **manual Back to
Collections**, never automatic navigation. No repeat product approval is needed.

Latest owner clarification: once Gmail confirms or accepts sending, the
employee's task is complete. **Back to Collections is immediately available**,
even while the app records/checks history. History completion is not a staff
navigation gate. Existing server-side processing/reconciliation continues from
durable receipts; this does not promise that every conflicted history entry
will automatically finish. Do not add polling or provider calls to meet this UX.

Latest owner approval also replaces repeated send confirmation with **one-click
sending**. Standalone and combined composers show one clear **Send now** action.
That explicit click saves current edits, validates recipients/policy/package,
freezes the returned saved envelope and submits exactly one send request. Remove
the acceptance checkbox and repeated send-confirmation dialog/panel. Do not
replace them with another popup. Backend `confirmed: true` remains: this human
click is the authorization, not a removed safety fence. No send on render,
reload, state restoration or save alone. Show preparation/progress feedback while
the click is processing; show success only after actual provider evidence.

Separate batches retain useful Account selection/overview and its selection
checkboxes, which are not send-acceptance checkboxes. **Send N emails** directly
saves/validates/freezes the selected scope and sends without another dialog or
acceptance step. Navigation that only opens overview says **Review emails** or
**Email overview**, never a label implying it sends. Each surface has one clear
send CTA; do not duplicate global-header and body Send now buttons.

Keep synchronous admission locking across the entire save/preflight/send chain
so double-clicks cannot create two submissions. Use the exact saved revision,
recipients, message, filenames and applicable policy captured by this action;
later input/state changes cannot alter an admitted envelope. Preserve known 4xx
pre-admission correction and existing lost-save exact replay, command identities,
receipt floors and all backend validation. A save failure cannot fall through to
send; uncertain send cannot return to a fresh send action.

Use the existing Luminous AR identity, Plus Jakarta Sans and established color
tokens. A large status symbol, clear headline and short explanation precede
recipient details and message/Account/Invoice/file counts. Keep the primary
action visible without reading a long message. Do not keep recipient inputs,
message editing, attachment editing or a send-confirmation panel visible behind
the result. Avoid confetti, marketing copy, unnecessary animation and new assets.
Use restrained motion only for progress, respecting reduced-motion preference.

## Result meanings and exact primary copy

| Evidence | Headline | Meaning and actions |
|---|---|---|
| Original send request in flight | `Sending email…` / `Sending emails…` | Progress, frozen reviewed scope; no second send or navigation while the admitted operation runs. |
| `state === 'sent' && recorded === true` | `Email sent` / `Emails sent` | Green/teal success; `Billing / collection history recorded.` |
| `gmailAccepted === true`, history not recorded | `Email sent` / `Emails sent` | Explicit amber `History update pending`; `Gmail accepted this email. You can return to Collections while history processing continues. Do not resend.` |
| Attempt exists, no confirmed evidence | `Sending not confirmed` | Amber attention; `Check the existing result before taking another action. Do not resend.` Never imply success or an unsent retry permission. |
| Mixed separate-batch results | `Email results` | Clearly count confirmed/accepted messages, history-pending messages, unconfirmed attempts and unattempted Accounts separately. Never label the entire batch sent. |

The standard completed-result actions are **Back to Collections** (primary) and
**Open Gmail Sent** (secondary link using the current regional `gmailUrl(region,
'sent')`). Accepted and unknown outcomes retain the existing check/review controls
with their current guards; link text does not claim Gmail verification. Checking
an outcome displays checking feedback, not the original sending headline.
Accepted-result check/review controls are optional recovery, never a mandatory
employee step before leaving. A busy metadata/history check must not disable
Back to Collections. Distinguish generic busy feedback from `backDisabled`,
which is reserved for actual sending, an exit already in flight or another
genuinely unsafe operation. `state === 'sending'` always disables return.

Provider `mode === 'draft' && state === 'created'` without accepted evidence is
still **Gmail draft — not sent** in the existing preparation flow, not success.
Admin-only Create Gmail draft behavior, Draft recovery and staff restrictions
remain unchanged. Existing known validation rejections before a handoff return
to the composer/overview error UI; they are not announced as successful or uncertain sends.

## Summary accuracy

- Count actual Gmail messages separately from Accounts: combined = 1 message,
  standalone = 1 message, separate = the number of attempted message envelopes.
- Account identity is Hotel + Account ID. Multiple work groups for the same
  Account do not create extra Accounts. Invoice identity also includes Hotel and
  Account. File count means generated PDFs plus supplemental attachments,
  excluding inline signature images.
- Use the frozen reviewed/saved envelope, never later editable input. Display
  To and expandable CC/BCC with wrapping; separate sends keep recipient groups
  per message/Account rather than implying all recipients got all attachments.
- For partial batches, scope each row and its counts to its own message. Explain
  attempted/selected counts separately from remaining Accounts. Preserve all
  unattempted Accounts and per-Account tabs; offer **Review remaining emails**.
- After reload, unavailable recipient/file details are explicitly unavailable
  until verified loading finishes; never invent zero counts or copy recipients
  from another Account. Preserve known receipts even if subsequent reads fail.

## Integration boundaries

Create one presentational result component and one small pure delivery classifier
under `src/email/`. Hosts remain responsible for transport, state, identity,
recovery, navigation and lifecycle. Do not introduce a replacement send state
machine or a new persistence record for the result page.

Standalone EmailComposer needs a distinct send-action flag spanning its admitted
save/validate/freeze/send chain (generic busy also covers unrelated save/upload/check),
renders the result inside its existing modal boundary and
keeps SentMatchReview usable. Retain the same dialog element/ref across the
transition so `showModal()` and modal focus behavior are not lost. A restored
delivery opens the appropriate result; Draft-only preparation does not.

The normal composer `onClose` returns to PDF work and cannot implement the new
Collections action. Add `onBackToCollections?: () => void` through EmailComposer
and DocumentRoute. App supplies `() => { void navigateView('collections'); }`,
which already executes `leaveDocument()` and its exact-child cleanup checks.
Keep ordinary close behavior for preparation. Do not automatically call either
callback when a send/check completes. Closed-job reload must retain an honest
sent receipt and manual Collections action without reopening purged files.
For accepted/recorded results, metadata/history checking alone must not mark
navigation dirty or block leave; preserve protection for actual sends, unsaved
unsafe edits and active cleanup. Exiting during a check retains known receipts
and uses safe existing exact-child cleanup, not cleared evidence or a resend.

Separate batches own the progress/result surface in BatchRoute. Keep account
tabs and all current records while hiding the composer/review controls during
the send/result. Show recovery per attempted Account and a path back to remaining
unsent work; selecting a tab must never send. EmailComposer's new standalone
result branch is gated to `!batch`. In a separate batch, selecting an attempted
Account keeps its result/recovery visible; selecting an unattempted Account opens
normal preparation. Do not reopen the disabled composer for an admitted outcome.
CombinedEmailComposer owns its
shared result and receives an `onBackToCollections` callback from BatchRoute
using its existing guarded `leave()` followed by `onClose()`. Preserve the shared
composer instance and control registration so checks and original-request
recovery remain available. Batch header must not advertise active Review & send
or Back to PDFs actions over a locked shared result.
Refine batch `switching`/`combinedBusy`/control-busy gates so an accepted or
recorded result can leave during metadata/history checks. Genuine send/exit and
unsafe preparation operations still block. Return cannot discard another
Account's unsafe operation, bypass child checks or erase durable attempts/history.
Retain receipts while late check responses settle; do not write after unmount
or recreate cleared resume data.

## Safeguards and exclusions

All UI is English. Navigation is manual. No PDF engine, VAT, backend, schema,
send API, credential, retention or cloud-resource changes. No automatic email.
No new paid service or dependency. Preserve reviewed bytes, immutable IDs,
attempt markers, explicit-human-click admission, backend `confirmed: true`, receipt floors and provider evidence.
In particular retain `combinedDelivery()` monotonic recorded/accepted evidence,
`assertCombinedBatch`, pending save replay and the exact original command retry
admission. A result view must not mint IDs, clear receipts or authorize resend.

F5/reload resumes active work; it is not Exit. Explicit Back to Collections uses
existing exact-job Exit checks and preserves Draft/uncertain files and business
history. A failed cleanup stays on the current result with an actionable error.
Do not remove resume state merely because the screen becomes successful. Do not
re-fetch OPERA or regenerate PDFs as part of result rendering. No new automatic
polling or provider calls; reuse existing human check/reload/review and admitted
original-request recovery controls only. Existing emailDeliveryStatus may remain
unchanged for Account history; the new result owns its approved headline copy.

## Acceptance and evidence

Synthetic browser checks must cover all three send paths: deferred progress,
confirmed success, accepted/history pending, unknown/lost response, status
recovery, manual navigation, no duplicate POST, refresh and failed Exit. Separate
batches additionally cover partial selection, remaining Accounts and multiple
work groups per Account; combined additionally covers recorded/accepted receipt
floors and original-request recovery after reload. Draft and Admin-only behavior
must remain covered. Verify every touched recovery control still works when the
composer fields are absent.
Pin one click -> one send POST, rapid double-click -> one send POST, exact unsaved
edits and filenames in the saved/sent revision, current policy and recipient
validation, no acceptance checkbox/dialog/popup, save failure -> zero send POSTs,
lost-save exact replay and no send on F5. Separate selection checkboxes remain
and the overview-only label does not imply sending. Existing tests for removed
confirmation UI must migrate to these behavioral assertions, not lose coverage.
For standalone, separate and combined flows, hold a history check response open
after Gmail acceptance and assert Back to Collections remains enabled and works
through guarded Exit before the check resolves. Assert no resend, no required
manual retry and retained receipts. Actual send-in-flight must still disable
return. Generic `busy` with a history-pending result is not `backDisabled`.

Inspect actual browser captures at 1440×900, 1280×800 and 390×844 with long
recipients and multiple Accounts. Check accessible status announcement, heading
focus on transition, keyboard reachability, wrapping, contrast and no horizontal
overflow. Preserve the seven original reference PNGs and existing baselines;
record new synthetic result captures separately. Their paths were verified in
planning; this document does not claim that all seven were visually inspected.

Only local documents are produced by this planning task. Existing uncommitted
PROJECT_STATUS and PROJECT_AUDIT work belongs to another task and must remain
untouched. Implementation later records implemented/tested/deployed/enabled
separately, preserving that unrelated checkpoint. Real email verification needs
the separately authorized one-time recipient and must not be inferred from a
synthetic browser pass.
