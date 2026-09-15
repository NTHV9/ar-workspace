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
- TypeScript, Vite build and connector public-asset build passed. Seven existing browser financial/region tests passed. Wrangler dry run validated the initial concurrency change; final deployment and live timing remain pending.
