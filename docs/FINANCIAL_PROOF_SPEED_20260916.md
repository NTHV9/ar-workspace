# Financial proof throughput — 16 September 2026

Owner requested further speed while retaining complete, accurate data.

## Baseline

The preceding KAT run for 16 August–15 September succeeded in 65 minutes 11 seconds (Workflow start/end). Completed Workflow step durations: history discovery/reads 199.0 seconds (105 account steps); invoice proofs 1,547.1 seconds (603 batches); payment proofs 2,017.4 seconds (112 batches); other steps 34.9 seconds. These timings include provider/database waiting, not only OPERA response time. Its payment batch 60-0 hit a CPU limit on the first attempt and succeeded on retry; the baseline total includes that retry.

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
- Deployment/live throughput and full-result comparison were pending at this initial checkpoint; see the completed verification below.

## First live attempt and CPU repair

- Source `3329ac5e385875d355808d57dec8e2731338c4c8` was deployed as Worker `dc1f6cc5-fb9d-4c02-9f00-9c35404d5db3`. Health/database and 19 anonymous boundary checks passed.
- The live attempt failed after 43.5 minutes, at payment batch ordinal 60 / batch 1. Cloudflare reported a CPU-time limit, then an internal retry error. The preceding large batch completed in 194.6 seconds versus 482.8 seconds before, with the same five verified payments / 1,226 links. This partial speed result is not a successful full rollout.
- All three published dataset fingerprints remained identical after the failed attempt. No incomplete dataset was published.
- Production was returned to proven source `169c0ff2c7184f4c4cbcf2d67d60a9ffa9335c30`, Worker `100d7037-70f0-4844-963f-09c544a5316a`, while repairing the overhead.
- Avoidable work found: every parsed response body was copied even when it had exactly one consumer. The repaired adapter transfers that exclusively owned body directly. Only queued shared results are copied for isolation; consumer count freezes before source execution. Input snapshots and freshness barriers remain.
- Controlled CPU benchmark: 60 fresh parses of a 1,442,903-byte JSON response. Parse plus unconditional copy used 1,609 ms CPU; the repaired adapter used 375 ms. Timing is informational and does not prove production headroom. Ownership, shared nested mutation isolation and zero unnecessary-copy assertions are deterministic.
- Full repaired suite: 1,223 tests passed; TypeScript/build and independent review passed. The CPU ceiling has not been increased. A new full live run was required at this checkpoint; its completed result is recorded below.

## Completed live verification and task handoff — 16 September 2026

- Deployed/enabled source `12078d5964e6be3c2c5090788ce314e44b6efe10`, Worker `2774224b-659e-4b2e-b36d-7f1577a64a20`. The original task deployed this repair before stopping. The continuation independently confirmed the same live source, database health and all 19 anonymous boundary checks. Existing CPU/concurrency limits, resources and schedules remain unchanged.
- Repaired run `9ff874ce-beb9-4f32-a4af-7e6e1590a3fe` completed at 04:50 ICT. Cloudflare reports successful completion of all 1,033 steps, all 105 account finalizations, no failed attempts and no retries. SQL independently confirms `succeeded`, a matching publication, complete period coverage and no error for 16 August–15 September.
- Workflow elapsed time was 2,765.396 seconds (46 minutes 5 seconds), compared with 3,911.144 seconds (65 minutes 11 seconds) for baseline `4f6b4ec7-eec0-41a7-9516-87fe8dc739ee`: about 19 minutes 6 seconds / 29.3% less. These are two observed runs; provider latency and the baseline retry affect the comparison. They do not establish a guaranteed speed ratio or CPU headroom for every future workload.

| Completed step group | Baseline | Repaired run |
|---|---:|---:|
| History reads, 105 steps | 199.0 s | 179.5 s |
| Invoice proofs, 603 batches | 1,547.1 s | 1,319.1 s |
| Payment proofs, 112 batches | 2,017.4 s | 1,198.0 s |
| Other, 213 steps | 34.9 s | 30.7 s |

- The formerly CPU-affected batch 60-0 completed in 211.5 seconds without retry. The baseline's 482.8 seconds included a failed attempt; its successful attempt alone took 286.3 seconds. Batch 60-1, where the first optimized rollout failed, completed in 79.5 seconds. Both returned the same verified-payment/link counts and zero unknown results as their completed baseline steps.
- Compared every named durable output after excluding only new read telemetry: all 1,033 outputs match the baseline. SQL comparisons of the retained 105 account records found zero differences in membership, counts, verified invoice identities, account context or coverage after excluding observation time. The repaired publication recorded 5,595 invoices, 369 payments and 4,830 application links, with no source-data/status change events in that run.
- The full-table fingerprints captured before the repair were recovered privately from the original task. Current payment fingerprints still match. Current invoice/application fingerprints are not an exact rerun comparison because a later successful scheduled publication advanced the source window to 17 August–16 September and changed mapping coverage, including 100 application observation statuses. The run-scoped comparisons above isolate the tested window; no claim is made that later live tables remain byte-identical to the earlier snapshot. No fingerprints or customer payloads are committed.
- Aggregate proof telemetry reports 40,626 underlying calls and 22 copied responses. The repaired workload completed without the previous CPU failure; this does not raise or measure the provider CPU ceiling.
- Validation inherited from the same source: full 1,223-test suite, seven financial/region browser cases, production build/public assets, dry run and independent review passed. GitHub CI passed for the deployed source. The continuation reran 105 focused tests and TypeScript successfully. No application/source edits were necessary during the handoff; only verification documentation was completed.
- Integration: [PR46](https://github.com/NTHV9/ar-workspace/pull/46). The deployed runtime remains the tested source above; subsequent evidence-only commits do not require another deployment.
