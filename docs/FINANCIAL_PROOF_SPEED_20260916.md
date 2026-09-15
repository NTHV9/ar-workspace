# Financial proof throughput — 16 September 2026

Owner requested further speed while retaining complete, accurate data.

## Baseline

The preceding KAT run for 16 August–15 September succeeded in 65.1 minutes. Completed Workflow step durations: history discovery/reads 199.0 seconds (105 account steps); invoice proofs 1,547.1 seconds (603 batches); payment proofs 2,017.4 seconds (112 batches); other steps 34.9 seconds. These timings include provider/database waiting, not only OPERA response time.

## Plan

1. Preserve the date window, every existing proof endpoint, before/after barriers, monetary/identity checks, complete pagination and atomic SQL publication.
2. Replace waves of three independent proofs with a continuous three-worker pool: deterministic output order, no admissions after a known rejection, and drain all admitted work before failure.
3. Add a reader scoped to a single durable step. Limit underlying OPERA method calls to three. Coalesce only identical **queued, not yet started** method/argument pairs, remove them before execution, and clone results per caller. Never join an already-running read: a recheck must not receive a snapshot started before its preceding proof barrier. No result cache across successive reads, accounts, steps or runs.
4. Run independent payment proofs concurrently through that shared reader without multiplying the underlying request limit. Keep aggregate durable outputs private-data-free; collect counts/timing only.
5. Verify unchanged proof results, fresh before/after reads, failure draining, request bounds and replay; build, review and deploy. Validate with live work and compare measured throughput without claiming a guaranteed duration.

No SQL migration, new cloud resource, reduced source window or increased Workflow instance limit is planned.

Oracle publishes an environment-wide synchronous request limit; this change keeps the existing three-read bound instead of increasing it. [Oracle OHIP limits](https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_limits.htm).

## Implemented / verification

- Continuous proof pool and per-step reader scheduler implemented. Sharing is queued-only, with cloned arguments/results and method/scope/page-sensitive keys. Running and settled responses are never reused.
- Existing proof checks and the full source window remain unchanged. Independent review found and resolved the planned freshness risk before implementation; final code review found no blocker.
- The existing payment proof suite runs through the new reader. New checks cover a recheck racing an older active snapshot, pagination keys, nested concurrency, failed reads/retries, ordered results, synchronous failure, lease failure at per-payment admission and draining admitted payment proofs before any save.
- Full initial suite: 1,220 tests passed; the subsequently added payment-drain test and per-payment lease refinement passed in the nine-case orchestration suite. TypeScript, production/public-asset build, dry run and seven financial/region browser cases passed.
- Controlled workload: three different payments each contributing to the same 21 invoices. Complete returned proof objects match serial execution. Calls reduced from 219 to 153; elapsed synthetic time from 10,200 ms to 5,300 ms, at a maximum of three underlying calls. This workload demonstrates the sharing opportunity; live proportions may differ.
- Live baseline semantic fingerprints were captured privately for invoice observations, payment observations and application links, excluding observation timestamps/run IDs. No customer payload or fingerprints were added to Git.
- Deployment/live throughput and full-result comparison pending.

## First live attempt and CPU repair

- Source `3329ac5e385875d355808d57dec8e2731338c4c8` was deployed as Worker `dc1f6cc5-fb9d-4c02-9f00-9c35404d5db3`. Health/database and 19 anonymous boundary checks passed.
- The live attempt failed after 43.5 minutes, at payment batch ordinal 60 / batch 1. Cloudflare reported a CPU-time limit, then an internal retry error. The preceding large batch completed in 194.6 seconds versus 482.8 seconds before, with the same five verified payments / 1,226 links. This partial speed result is not a successful full rollout.
- All three published dataset fingerprints remained identical after the failed attempt. No incomplete dataset was published.
- Production was returned to proven source `169c0ff2c7184f4c4cbcf2d67d60a9ffa9335c30`, Worker `100d7037-70f0-4844-963f-09c544a5316a`, while repairing the overhead.
- Avoidable work found: every parsed response body was copied even when it had exactly one consumer. The repaired adapter transfers that exclusively owned body directly. Only queued shared results are copied for isolation; consumer count freezes before source execution. Input snapshots and freshness barriers remain.
- Controlled CPU benchmark: 60 fresh parses of a 1,442,903-byte JSON response. Parse plus unconditional copy used 1,609 ms CPU; the repaired adapter used 375 ms. Timing is informational and does not prove production headroom. Ownership, shared nested mutation isolation and zero unnecessary-copy assertions are deterministic.
- Full repaired suite: 1,223 tests passed; TypeScript/build and independent review passed. The CPU ceiling has not been increased. A new full live run is still required before calling the CPU issue resolved.
