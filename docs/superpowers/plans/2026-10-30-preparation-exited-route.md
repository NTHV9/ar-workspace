# Recover an exited preparation route to Collections

> Execute inline; independent scoped review before release.

Owner explicitly confirms: known exited preparation routes should return to Collections automatically so employees do not remain on a confusing error/retry page. Preserve F5/native-close/Exit discard policy; preserve active work, batch members, mail history and pending server cleanup. Do not revive deleted files or auto-create a replacement.

## Evidence boundary

Exact screenshot originates in beforeResume when the exact job is settled/blocked in the current actor exit coordinator/outbox. Deterministic reproduction: exit A, revisit A through history. Original preceding action is unknown; no false-abandon has been proven. Latest provider job completed before its accepted Exit; no claim that merely opening PDF Workspace caused that Exit.

## Implementation

- Typed exited-route signal retaining existing message and exact job ID.
- Single-document App handles only a signal matching the current documentJob and no active batch: replace URL with Collections retaining region/hotel/queue filters, forget only that exited job locally, keep pending outbox, without any notice or popup. No blanket abandon, provider restart, file read or automatic new preparation.
- Explicit single PDF Exit silently returns to Collections after a verified abandonment receipt. No discard confirmation for transient edits; failed cleanup retains edits and permits retry. Batch fallback and other active accounts remain intact. Active normal load failures retain retry behavior.
- Reuse existing exit-return destination filter; prevent stale async signal from replacing a different new job.

- [x] Add failing valid-session browser regression for exit/history return, exact-scope recovery and normal PDF navigation/token refresh without Exit.
- [ ] Implement minimal recovery; targeted/full tests, typecheck/build and independent review; required GitHub checks.
- [ ] Deploy exact qualified source; verify actual fresh preparation can open PDF Workspace, known-exited route recovers, no mail/business date mutations; discard exact disposable test bytes.

## Deferred work

The previously approved three old retired/pending metadata jobs and their automatic finalization remain pending separately. No cleanup or status mutation of those jobs is part of this urgent UI recovery.

Owner refinement: silently return single-document stale exited routes to Collections; do not display a new notice, dialog or popup. Batch handling must not abandon or redirect other active accounts.

Verification in progress: new browser regressions cover valid-session staff editing/token refresh, stale exact route recovery, server-known discarded/pending routes, manual Sent result, silent dirty Exit and failed Exit retaining edits. Independent scoped review READY; 41 lifecycle unit tests passed. Full local and GitHub qualification remain required before deployment.
