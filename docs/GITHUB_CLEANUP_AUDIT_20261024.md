# GitHub cleanup and historical failure audit — 24 October 2026

## Repository organization completed

The owner authorized closing superseded work and checking historical failures for
real defects. PRs #117–#141 were individually refreshed and their exact heads
verified as ancestors of deployed source `9f8b9438a25e53fd51053bf4455d331749c2d2e0`.
All 25 were closed with a supersession comment linking to
[PR #142](https://github.com/NTHV9/ar-workspace/pull/142). GitHub then returned only
#142 in the open-PR listing. No PR was merged and no branch, commit, discussion,
Actions history or cloud resource was deleted. This cleanup did not deploy code.
The public entry, PDF editor chunk and CSS still matched the qualified build.

## Historical Actions coverage

Inventoried all 1,030 retained runs of the single repository workflow,
`Verify new AR workspace`. Of these, 216 historical runs had failed, across 123
unique commit heads. All 216 job inventories were inspected: 114 push events and
102 pull-request events. No runs were discarded as equivalent merely by SHA.

| Failed stage | Runs |
| --- | ---: |
| Synthetic browser workflows | 200 |
| Publication polling and continuous Aging | 11 |
| TypeScript | 3 |
| Run-level failure with cancelled, empty job and unavailable log | 2 |

Fetched and parsed 214 available latest-job logs, covering 1,557 failure
occurrences, 36 distinct test/compiler titles and 39 title/error signatures.
The earlier attempts of both retried workflows were also inspected; they added
no new failure signature. Raw payloads and normalized evidence stay in ignored
`.tmp/ci-repair/failure-audit/`; they are not published in this repository.

Two runs remain evidence gaps:
[37368221413](https://github.com/NTHV9/ar-workspace/actions/runs/37368221413) and
[37367990772](https://github.com/NTHV9/ar-workspace/actions/runs/37367990772).
Their only job is cancelled without steps, and its log returns BlobNotFound.
Direct attempt-one job inventories confirmed that result. Their original cause
cannot be established; they are not classified as diagnosed or harmless.

## Current coverage and historical repairs

All affected test files remain in the current smoke or audit configuration.
These areas include Collections selection, Dashboard reload cache, PDF movement,
native-font deletion, row insertion, PDF attachments and names, Aging ranges and
credits, email signature placement, retention guidance, Sheet links, tracker
recovery, report query scope, retrying invoice reads, Voucher reopening,
publication updates, Register scrolling/paste and TypeScript financial types.

The earlier exact keyboard/touch billing-legend title was replaced when the
product moved to account-first billing drill-down. Its recorded failure was a
one-versus-two identical request-count assertion; current scope tests inspect
every request rather than assuming one fetch. This is not claimed as identical
keyboard/touch coverage. Other retained assertions and concrete fixture or
runtime repairs are mapped to their logs in the private manifest.

Qualified release source passed
[40018814886](https://github.com/NTHV9/ar-workspace/actions/runs/40018814886):
4,339 unit/integration tests, 252 browser smoke cases, three performance cases
and 15 publication/Aging cases. The documentation-only successor also passed
[40020423909](https://github.com/NTHV9/ar-workspace/actions/runs/40020423909).
Passing checks establish current tested behavior, not every historical cause.

## Additional current PDF investigation

An expanded local PDF run exercised 108 cases beyond the normal CI selection.
It initially recorded 99 passes and nine failures. Two failures used a production
test against the wrong local host. Several others assumed raster-only output or
used fixtures that no longer represented recognized tables or blank destinations.
Those expectations require behavior-preserving repair, not relaxed safeguards.

Separate reproducible probes found genuine current editor defects:

- A full-width header image's bounding box blocked left address growth even
  where its actual pixels were blank. This was reproduced with all six private
  previously qualified hotel Invoice samples.
- Contextual controls moved the paper during a pointer gesture, changing a
  requested downward drag into an upward PDF-coordinate move.
- Native graphic IDs leaked into generated movement command IDs, so repeated
  movements could be rejected as duplicates.

These findings are independent of merely counting old red runs. Implementation,
qualification and deployment of their repairs are tracked in PROJECT_STATUS.
OPERA amounts, VAT/Non-VAT sources, database state, Sheet dates and email history
are outside these changes. No real billing or customer email is used for probes.

## Repair qualification

The three runtime defects have bounded fixes with independent safety review:
active-page native-only residual header qualification, stable gesture layout and
coordinates, and movement-command ID ownership. No per-Invoice exception or
financial calculation change was introduced. All six actual private samples
preserve right-column, VAT/TAX-ID and body pixels, strict export and Undo. A
partially unsupported left-header sample qualifies while its unremoved glyphs
remain occupied; an unqualifiable native page fails closed.

All122 local PDF cases qualify after behavioral test repairs and a single
artifact-only screenshot-path correction for a Windows file-open failure.
4,346 unit/integration cases, three performance cases, build/public asset checks
and independent review pass. CI now includes every **/pdf-editor.spec.ts suite,
collecting342 browser cases. Deployment is gated on committed-head GitHub checks;
its final source/version record is posted to PR #142 without rewriting old runs.
