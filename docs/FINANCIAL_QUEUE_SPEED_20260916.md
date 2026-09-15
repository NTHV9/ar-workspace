# OPERA financial-history queue — 16 September 2026

## Scope and baseline

Owner authorized speeding up the existing financial-history queue. No changes to monetary definitions, source scope, publication rules, schedules, database capacity, or document/interactive refresh queues.

Production metadata before changes (15 September evening, ICT): one financial Workflow slot; TSK 38.4 minutes working, TLKL 218.3 minutes waiting / 44.3 working, WAKL 260.4 waiting / 25.0 working. KAT failed after 180.9 minutes at payment mapping ordinal 60 / batch 0: both attempts reached the 600-second step timeout. That account had 1,491 invoice mappings and nine payment mappings. Customer identities and source payloads are excluded from this report.

## Implementation and verification plan

1. Reproduce serial invoice/payment verification latency with synthetic provider delays and exact read-count assertions.
2. Bound independent invoice verification reads to three concurrent operations. Preserve each before/after barrier, source-identity check, exact reconciliation, deterministic result order, and all pagination reads. Drain in-flight operations before reporting a failed batch.
3. Allow two existing financial Workflow instances to run together. Same-hotel, different-window contention uses durable one-minute sleeps for up to 1,440 claim attempts (approximately 24 hours); other claim errors keep a short retry budget. Leave document and interactive refresh limits unchanged. No extra resources or subscription changes.
4. Run relevant financial/payment, error, replay, routing and build checks; request independent review before integration.
5. Deploy the checked source and verify actual queue progress, upstream error categories, health and a fresh KAT history run. Report observed performance separately from synthetic timing.
6. Record tested/deployed/enabled status here and in PROJECT_STATUS.

## Evidence references

- [Cloudflare Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/): retain granular steps and idempotency; parallel work must preserve dependencies.
- Existing database claim/lease and publication checks remain authoritative. No SQL changes are planned.

## Results

- Implemented bounded three-way reads and two financial slots. Same-hotel contention does not consume a slot while sleeping. Existing SQL hotel locking, exact-window command deduplication and atomic publication remain unchanged.
- Red tests reproduced serial execution and the premature busy-claim failure before their fixes.
- Synthetic payment proof with 60 invoice links and one-second provider latency: 192 seconds serial versus 75 seconds bounded (60.9% less waiting). Both versions perform exactly 192 source reads. This is a controlled latency comparison, not a production throughput guarantee.
- Full unit suite: 1,204 tests across 119 files passed. Covers 25-minute same-hotel contention, terminal claim errors, ordered results, failure draining, before/after proof barriers, incomplete/changed source data and replay without duplicate completed mappings.
- TypeScript, Vite build, connector public-asset build and final Wrangler dry run passed. Seven existing browser financial/region tests passed. Independent code review approved the final change; GitHub CI passed for source `fa24e42d633ebd85ea5a84dad09d39cf304dc827`.

## Production rollout

- Deployed/enabled source `fa24e42d633ebd85ea5a84dad09d39cf304dc827`; Worker version `dfaf5083-351b-4891-89c0-846bf00293c5` at approximately 00:44 ICT on 16 September. Existing configuration and provider secrets retained.
- Deployment health and database verification passed; all 19 anonymous boundary probes were rejected. Live Cloudflare and SQL metadata both confirmed two simultaneous financial runs (KAT and TLFO), with no queued instance at the observation time.
- A fresh KAT read for the same 16 August–15 September source window began at 00:45:22 ICT. It progressed through completed account checkpoints and into a large account's invoice mapping batches; no failed Workflow step or provider-unavailable/timeout mapping category was observed in the sampled portion.
- The first 19 matching invoice-mapping step names with identical aggregate results took 122.151 seconds in the prior run and 44.057 seconds in the new run (63.9% less elapsed time). This is a production sample with the same result counts, not a guarantee about entire-run duration or identical source bytes. Provider latency can vary.
- Eight unverified payment-detail mappings in this sample remain explicitly unverified; they are not treated as successful/zero. Aggregate outcomes match the corresponding old checkpoints. Private prior per-row mapping staging had already been cleaned, so no claim of exact per-row identity equality is made.
- The full KAT and TLFO history runs were still in progress at closeout. Full-run duration and whether the previously timed-out large payment batch completes are not yet verified. They continue in the existing durable queue; no additional run, cancellation, or automatic email was created.
