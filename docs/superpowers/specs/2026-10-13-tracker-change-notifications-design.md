# Tracker change notifications

Status: approved for implementation on 13 October 2026. Latest owner clarification prioritizes Sheet edits appearing on the already-open web page. Keep five-minute fallback. Deployment and real-service evidence are recorded separately.

## Intended outcome

Employees continue editing the original trackers. When a file changes, the application begins synchronization without waiting for the five-minute schedule. An already-open dashboard refreshes its saved status after the import commits. Immediate outbound-send wakeup is deferred from this scope; existing writeback behavior remains. Sheet R/U/V/W remain authoritative, including blanks; actual Sent evidence, other stage rules and OPERA financial ownership remain unchanged.

The design reduces idle provider reads; it does not promise zero-latency delivery or zero background maintenance. Do not describe it as guaranteed real time.

## Existing integration and constraints

- Phuket uses the existing XLSX file and conditional blob updates. Khao Lak uses the existing native Google Sheet and approved best-effort date updates.
- The original file IDs, workbook layout, formulas, permissions, employee workflow and AgingMaster remain unchanged. No Apps Script installation or workbook conversion is needed for the proposed Drive notification path.
- `worker/index.ts` schedules tracker checks alongside the five-minute OPERA ticker. Separate tracker scheduling decisions without increasing OPERA calls.
- `syncTracker` uses the database lease and rejects overlapping regional runs; ordinary checks also have a five-minute freshness gate. Event-driven runs may bypass freshness, never the lease.
- `src/reports/use-tracker-revision.ts` already checks committed regional revisions every 60 seconds. Extend this seam, keeping identity/access isolation and dirty-editor protection.
- No paid product, new credential scope or public exposure of business data is part of this design. A required privilege expansion would be reported separately, not applied implicitly.

## Notification registration

Use Drive `files.watch` separately for the two configured files with the existing authorized Drive identity. Request only original file channels; never watch the whole Drive. Register against a fixed HTTPS callback on the existing Worker.

Persist the intended channel before calling Google because the initial `sync` message can arrive before the registration response. Store region, owner, configured file identity, channel UUID, hashed random verification token, returned resource ID, provider expiration and registration state in private service-only storage. Do not put credentials or customer data in channel tokens, logs, URLs or browser responses.

The returned resource ID must be tied to the server-side registration response. A pre-registration notification cannot establish that binding or directly authorize a read. Retain it as a wake hint and verify registration before processing. Registration timeout remains an uncertain channel, not proof of failure. Duplicate/overlapping valid channels must not create duplicate regional work.

Drive file watches expire within one day. Renew ahead of the actual expiration using a new UUID; allow a short verified overlap. Failed renewal preserves the previous channel until expiry and falls back to scheduled checks. Retire only channel IDs created by this integration.

## Callback and durable work

The callback accepts POST only and exposes no user data. Validate bounded channel/resource/message headers and the secret token against a live registered channel. Ignore caller-provided URLs; choose file/region only from the persisted channel. Unknown, revoked or invalid channels cannot start reads or writes.

Commit a durable regional wake request before returning success. Process it through durable execution, not solely a request-lifetime background promise. The implementation should reuse the existing Workflow capability where practical, without consuming or altering OPERA job identities. Repeated notifications coalesce into one regional pending generation. An event arriving during synchronization leaves another pending generation rather than being lost when the run finishes. Duplicate or out-of-order messages do not clear newer work.

Coalesce a short burst for approximately five seconds with a maximum wait of 15 seconds before attempting work. A busy existing regional lease defers the request; it does not erase it. Provider errors retain a retryable request with bounded backoff and visible existing error status. No customer payloads are retained in notification receipts.

The notification is only a hint that something changed, not an authoritative version or cell value. Re-read and validate through the existing provider adapter. Do not use the native Sheet Drive modified-time/version as a content-change gate; previous integration evidence did not establish that guarantee.

## Avoiding feedback loops and unnecessary reads

Writes from the web can also produce Drive notifications. Perform one validated readback if needed; apply only actual source differences and do not generate new outbound intents from unchanged imported values. Preserve generation safeguards from the Sheet-authority migration. Do not ignore all notifications during a self-write, as a simultaneous employee edit could otherwise be lost.

A committed eligible actual-send outbox entry wakes the regional worker. Draft creation, failed or uncertain sends and isolated tests do not trigger real billing writeback. Use committed server-side pending work to choose the region, not client-submitted hotel data. Recovery/reconciliation of a later-confirmed send follows the same path. Mail completion must not wait for a full Sheet download.

## Browser updates — latest approved refinement

Use the existing authenticated Supabase client to subscribe to a minimal region/revision/time publication table with regional RLS. Publish only after successful import. The event triggers the existing authorized revision check and guarded refresh. Read once on startup to close the initial snapshot race. Keep 60-second healthy fallback and 10-second fallback when the channel is unavailable; neither calls Google or OPERA. Pause reads in hidden tabs and catch up on return without discarding edits.

## Fallback and staged enablement

1. Deploy notification support disabled, with five-minute source checks unchanged.
2. Enable and register each original file independently after local and cloud callback validation. Continue existing source checks during observation.
3. Verify actual notification receipt and subsequent committed import for each original file, covering employee/native edits and the existing file-update mechanism where evidence is available. A registration response or initial `sync` message alone is not proof of edit delivery.
4. Keep five-minute fallback for both regions, skipping a recent successful ordinary check under the shared lease/freshness rules. Manual Check changes remains available.
5. Automatic maintenance renews channels and retries durable pending work without downloading unchanged files merely to maintain a watch. A global kill switch returns to current five-minute behavior.

No real billing dates will be changed merely to provoke an event. Use an isolated disposable fixture for edit/clear/burst/recovery tests and observe legitimate original-file changes for final file-specific proof. If no real edit occurs during validation, report that part as pending and retain its five-minute fallback.

## Acceptance and evidence

- Invalid tokens, wrong file/channel, retired channels, oversized headers and forged resource URLs cannot read customer data or enqueue authorized work.
- Early `sync`, duplicate and out-of-order callbacks, renewal overlap, registration timeouts and expiration remain recoverable.
- Bursts coalesce; edits during reads and while a regional lease is busy are eventually re-read; crashes after receipt do not lose the pending request.
- Confirmed send wakes writeback without slowing the send response. Draft/unknown/test paths do not write dates. Existing uncertain-write protections are retained.
- Employee edits/clears to R/U/V/W converge to the correct current state; other regions, OPERA money and immutable history remain unchanged.
- Self-write notification does not create a repeating write loop and does not suppress a concurrent employee correction.
- Visible browser updates only on committed revision, hidden tabs pause, cross-region/user changes clear cached revision state and dirty edits survive.
- Measure provider reads during idle time and edit-to-callback, callback-to-import and import-to-display separately. Publish measured results rather than a fixed latency guarantee.
- Original-file events and synthetic events are reported separately. Keep private identifiers, payloads and screenshots out of Git.

## Documentation basis

Google Drive push notifications: https://developers.google.com/workspace/drive/api/guides/push

Google notification bodies do not contain file contents; the application must read the current state. File channels have a maximum one-day expiration and require explicit renewal. These limits and channel behavior were checked on 13 October 2026.
