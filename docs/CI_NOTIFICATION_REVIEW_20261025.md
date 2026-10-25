# GitHub notification investigation — 25 October 2026

Scope: the nine supplied notification screenshots and the newer current-head run.
Each row below was checked against the actual Actions job log, not inferred from
the notification title. These are PR142 runs of the single `verify` job.

| Commit | Actions run | Failed browser cases |
| --- | --- | --- |
| 237eca0 | [1031](https://github.com/NTHV9/ar-workspace/actions/runs/40027126417) | Two legacy PDF raster-comparison cases |
| f0f7727 | [1034](https://github.com/NTHV9/ar-workspace/actions/runs/40081180027) | Sent-review close and Browser Back |
| 9aa3a80 | [1037](https://github.com/NTHV9/ar-workspace/actions/runs/40087235263) | Sent-review close and Browser Back |
| 170bc4c | [1039](https://github.com/NTHV9/ar-workspace/actions/runs/40108101016) | Sent-review close and Browser Back |
| 2a20741 | [1042](https://github.com/NTHV9/ar-workspace/actions/runs/40121515016) | Untouched template return and Sent-review Back |
| 8f51989 | [1043](https://github.com/NTHV9/ar-workspace/actions/runs/40123690752) | Three batch-CC layout cases and template return |
| e9d2b90 | [1045](https://github.com/NTHV9/ar-workspace/actions/runs/40125750995) | Two batch-CC layout cases and template return |
| 66946c2 | [1046](https://github.com/NTHV9/ar-workspace/actions/runs/40129010730) | Two batch-CC cases, template return and Sent-review Back |
| 2cbd7ea | [1048](https://github.com/NTHV9/ar-workspace/actions/runs/40130322960) | Two batch-CC cases and template return; browser475 passed |
| 7cb9381 | [1051](https://github.com/NTHV9/ar-workspace/actions/runs/40133839465) | Two batch-CC cases and template return; browser476 passed |

Typecheck, unit tests and build succeeded in these inspected jobs. The later jobs
also passed the isolated SQL/service qualification. `All jobs have failed` is the
summary of one failed `verify` job, not evidence that every test or live operation
failed. Later verification stages were skipped after browser smoke failed.

## Causes established at the actual failure boundaries

- **Historical PDF comparison:** the legacy check compared different render
  pipelines. The existing ff88342 repair compares the same normalized 300dpi
  raster/PDF path and includes deliberate shift/text-removal negative controls.
  Current unchanged tests pass both1440/1280 locally with zero differing pixels;
  negative controls detect108387 shifted pixels and3070 removed-text pixels. The
  later inspected CI runs no longer fail these cases. No old source is restored
  and no pixel tolerance or negative control is removed.
- **Batch CC proof race:** the test inspected synthetic persisted drafts as soon
  as Review was clicked, while the final email save was still pending. A save
  barrier deterministically reproduced the same empty-CC assertion. Product
  review correctly waits; tests now wait for the visible completed review phase
  before checking the same exact recipients. Delayed save, retry and account-switch
  cases retain required self CC, saved CC, exports and no-send assertions.
- **Template fixture precondition:** the saved synthetic email omitted the new
  required regional self CC. Opening the composer correctly added it and made the
  parent draft dirty, so saving a nested template did not make Back unguarded.
  The default fixture now includes its saved self CC; a paired test preserves
  genuinely unsaved parent recipients while saving a template.
- **Real browser-guard timing:** Chromium reproduced a close-then-immediate-Back
  race. Passive dirty/listener effects lagged the removed review dialog. A DOM
  removal microtask probe reproduced the stale guard3/3. Dirty notifications and
  unload listeners are committed as layout effects so guard state agrees with
  the visible editor/dialog. Pending operations and actual unsaved changes remain
  protected; history/navigation algorithms are unchanged.

## Integration and verification

Changes are applied on the current branch, preserving the deployed warning
lifecycle, Sheet date authority, credit overrides, regional self CC and active
OPERA refresh. No historical branch is checked out, merged or deployed to repair
old failures. No real email, provider date write or production ledger change is
part of this CI diagnosis. Existing assertions, SQL guards and browser coverage
remain enabled. Historical failed runs retain their original truthful result.

The authoritative final result is the same-head workflow on
[PR142 checks](https://github.com/NTHV9/ar-workspace/pull/142/checks); older hashes
are historical evidence, not a reason to rewind the current deployment. Final
local verification and release evidence are recorded in PROJECT_STATUS.
