# Document dispatch clock-skew regression repair

> Execute inline; independent review and required GitHub verification before release.

## Confirmed evidence

Reported four-invoice preparation was persisted before its provider instance by about 159 seconds, then generated in about 19 seconds. Several other fresh preparations remain queued/pending without provider instances and were subsequently exited by staff. Current provider document queue/running counts are zero. Do not restart those exited jobs.

The newly introduced strict `created_at <= Worker Date.now()` admission check deterministically suppresses a fresh create RPC result when the database timestamp leads Worker time by even 1 ms. Request-level regression reproduces queued-with-no-provider-create on both queues; six tests observed red. The original per-request Worker clock was not logged, so exact historical clock delta remains an inference. Cloudflare documents that timers reflect the last I/O, not continuously advancing wall clock.

## Narrow fix

Allow at most five minutes of database clock lead. Preserve the existing 23-hour upper age fence (one-hour margin before the provider's 24-hour retention floor), original queue, exact ID join, closure/retirement reconciliation and unknown-outcome safeguards. Excessive future/invalid timestamps and expired work remain blocked. No schema, retention-duration, quota, concurrency, recipient or financial change.

- [x] Reproduce fresh queued/no-dispatch through actual createDocumentJob with mocked backend result and both provider bindings; include expiry and exited cases.
- [ ] Apply bounded skew tolerance; run targeted/full unit, typecheck/build, review and required GitHub checks.
- [ ] Deploy exact qualified source preserving all other resources/settings/assets. Verify ordinary fresh dispatch with a disposable preparation only, no mail/history and no recovery of staff-exited jobs.
- [ ] Record source, provider timing and verification limits; discard the exact test preparation/bytes and preserve business Sent facts.
