# Workspace loading and current OPERA refresh — 16 September 2026

Owner requested diagnosis and repair of slow website opening / waiting for OPERA.

## Observations

- Latest completed open-triggered current refresh: KAT 427.7 seconds, TSK 112.9 seconds. Khao Lak hotel work ranged from 30.4 to 60.8 seconds, with two existing workflow slots.
- Current account verification is sequential within each hotel. Full source membership and account publication remain atomic.
- App polling reloads saved data only when every hotel in the region stops running. Dashboard also ignores publication changes while another hotel is running. Reloading the catalog replaces Portfolio with a loading screen even when its existing data is usable.
- Public asset request measured 255 ms; configuration requests 650 ms then 73 ms. Khao Lak saved-portfolio SQL measured 101.857 ms. These samples do not explain a multi-minute wait; no authentication or financial verification bypass is justified.

## Plan

1. Reproduce per-hotel completion delay and blank reload using synthetic browser fixtures for both regions.
2. Keep loaded catalog visible during reload; reload after each successful hotel publication without waiting for other hotels. Preserve owner/region/abort boundaries and avoid overlapping polling reloads.
3. Verify current accounts in bounded groups of two independent durable steps. Preserve step names, retries, source validation, private staging and final all-account publication barrier. No increase to Workflow instance limits or source page sizes. Readers/authentication promises stay inside their respective durable callbacks.
   Reuse a complete, strictly counted zero-inclusive audit only when it already proves explicit zero for every missing transaction. Otherwise keep the existing strict missing-invoice pass for all missing IDs. Disable reuse after printed-history confirmation and on any foreign-hotel row or tolerated count discrepancy. Normalization and relationship verification still run.
4. Test failure draining, replay, invalid-account handling, region changes and delayed responses; build and independent review.
5. Deploy, verify actual current-refresh time and inspect UI. Record the prior financial-history run outcome separately.

## Implemented and tested

- Catalog reloads retain the existing same-owner/region view. Polling and the initial refresh receipt both detect completed publications, including fast completion before the first polling tick. Pending catalog reads are not repeatedly cancelled; a terminal publication arriving during a request is loaded afterward.
- Dashboard observes each hotel publication, including the first success from a known empty publication baseline.
- Two independent account steps run concurrently within each existing current-refresh Workflow. A rejected step drains its admitted peer before cleanup; publication still requires every account and final source membership to validate.
- Exact zero evidence is reused only under the narrow conditions above. The synthetic fallback case reduced four source requests to three while preserving the same normalized invoices and relationship evidence. Partial, understated and foreign-scope evidence retains strict verification.
- Red browser tests reproduced waiting for other hotels and replacing usable Portfolio with a loader. Red source tests reproduced serial account work and duplicate closed-history reads.
- Full unit suite: 1,212 tests passed. TypeScript, Vite, public-asset build and Wrangler dry run passed. Browser verification covers 67 unique cases across loading, regions, Dashboard/Aging and sign-out; a fast-completion regression was fixed and rechecked. New UI captures were inspected and original tracked visual baselines retained.
- Independent review approved account batching, source reuse, publication handling and the final fast-completion helper. GitHub CI passed for deployed source.

## Deployed and verified live

- Source `169c0ff2c7184f4c4cbcf2d67d60a9ffa9335c30`, Worker version `90ce3610-624b-4b12-94dd-e167d744418e`, deployed around 02:02 ICT on 16 September. Existing variables, secrets, schedules and Workflow instance limits retained.
- Health/database check and all 19 anonymous boundary probes passed. Browser opening joined normal open-triggered Phuket jobs; manual Khao Lak verification used the existing queue and joined existing jobs rather than duplicating them.
- All six current refreshes succeeded and each published run ID matched its requested run. KAT completed all 105 account steps with no failed step. Cloudflare metadata confirmed the first two independent account steps started together.

| Hotel | Previous completed open refresh | New live refresh | Result |
|---|---:|---:|---|
| KAT | 427.7 s | 247.1 s | succeeded |
| TSK | 112.9 s | 79.3 s | succeeded |
| TLKL | 30.4 s | 30.0 s | succeeded |
| WAKL | 33.9 s | 21.8 s | succeeded |
| TLFO | 39.4 s | 20.6 s | succeeded |
| TSAN | 60.8 s | 26.7 s | succeeded |

These are observed execution times, excluding time queued behind another hotel. OPERA latency and live contents vary; they are not guaranteed speed ratios. The new Phuket jobs were open-triggered; Khao Lak jobs were manual.

- Live signed-in Portfolio displayed new TSK data while KAT was still running. Khao Lak displayed completed TLKL/TLFO publications while WAKL/TSAN were still queued/running. Reload retained usable Portfolio. Dashboard loaded after completion; no browser console errors observed.
- Private live screenshots were inspected through the browser and were not added to Git. The audit created no email, document or external recipient change.
- Previous financial-history follow-up: KAT's same 16 August–15 September run completed all 105 accounts in 65.1 minutes. The formerly timed-out payment batch succeeded in 482.8 seconds with five verified payments and no unknown result. This is the separate historical workload, not website opening/current-refresh time.
