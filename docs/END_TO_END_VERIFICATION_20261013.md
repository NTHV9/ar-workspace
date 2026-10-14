# Further functional verification — 13 October 2026

The owner approved the five-part follow-up, then excluded another real-employee-login test and specifically requested hands-on PDF Workspace use. This report distinguishes actual service evidence from isolated/simulated boundaries. No application code or production configuration changed in this round.

## Actual service evidence

### Automatic tracker recurrence

No Check changes or manual sync was invoked during this observation window. Sanitized scheduled Worker events were correlated with fresh tracker status for both regions. Four new successful rounds were observed:

| ICT | Phuket success | Khao Lak success |
|---|---|---|
| 14:01 | 14:01:51 | 14:01:58 |
| 14:11 | 14:11:23 | 14:11:24 |
| 14:16 | 14:16:25 | 14:16:30 |
| 14:26 | 14:26:13 | 14:26:15 |

Each matched round had null stored error, zero pending writes and no tracker failure event. Additional later successful timestamps were observed; they are not needed for this four-round claim. Scheduled checks occur every five minutes, while the existing freshness/lease guards can skip a check; a new publication every five minutes is not claimed. Final actual Reports UI also showed successful, non-red status for both regions.

### Financial summary/detail consistency

- Current Aging was checked for all six operational hotels using stable publication identity before/after each pagination run. All **413 Accounts, 2,367 detail rows and 2,891 Account/bucket aggregates** reconciled exactly, including signed credits. No pagination duplicate, missing Account or unverified bucket was observed in that capture.
- Dashboard checks compared summary → Account aggregates → every matching Invoice for six metrics in each of the six hotels: open, billed, unbilled, 61+ days, unbilled 31+ days and credits. All **36 hotel/metric checks** passed. The 31+/61+ eligibility and credit signs were checked separately.
- The inspector uses credits from `openBalanceBreakdown.credit`, not an assumed credits entry in the legacy metric array. DRF retains open/61+ financial exposure while remaining excluded from billing work, as specified. These were corrections to audit assumptions, not product defects or changes.
- This proves internal consistency of the captured OPERA-derived publications, not a new independent comparison against every OPERA PDF. Real source updates changed counts between captures; figures from different publications were not treated as discrepancies.

### Actual duplicate-send check

Two simultaneous requests used one private test command ID and the authorized one-time recipient. Both returned the same delivery ID: one saw the existing pending delivery, the other reached Sent. Subsequent readback confirmed a persisted Sent timestamp, `mode=test`, `recorded=false` and no Invoice stage. The intended output was one synthetic diagnostic PDF message; no customer document or CC/BCC was included.

This exercises the real API/claim/Gmail path. It is evidence of one application delivery and verified provider Sent, not a claim to have counted the recipient's inbox. The technical receipt is retained for duplicate prevention; the recipient and command ID are not stored in this repository. The edited multi-document PDF package below was **not** sent by this check.

## Isolated integration and failure scenarios

The existing joined proof was adapted to the current native key/page protocol and compiled repository migrations 105–114 inside an owned loopback-only PostgreSQL transaction. Current confirmation/event/outbox SQL and production sync/adapters execute; Google/Gmail boundaries in this joined proof are simulated.

Both regional formats pass distinct R/U/V/W dates, selected/unselected/other-hotel identity, same-confirmation replay, sync replay, first-billing preservation after resend, excluded draft/test/unconfirmed modes, native response-loss readback and a newer same-field send during uncertainty. Only the selected four XLSX date spans change; seven other ZIP entries and unrelated native GridData remain equal. All 109 original local-table row fingerprints match after rollback. This is not a fresh actual Google-cell-write or customer-send test.

A separate disposable local database, populated with the current migrations, tested two independent PostgreSQL sessions saving the same Account revision. The second session was observed waiting on a database lock; after the first committed, the stale save was rejected and the first value/revision remained. The exact owned database was removed after the check. No production staff, permissions or financial rows were used.

**39 fresh browser cases passed** against a rebuilt isolated current-source bundle: PDF import/scan pixels/filenames/layouts, reviewed-byte handoff, email revision failures and repeat clicks, dirty-state/session renewal and transient preparation behavior. These browser provider boundaries are mocked; they are not relabeled as real cloud saves.

## Hands-on PDF Workspace

The actual current `PdfWorkspace` component was operated through the browser in an isolated local harness. Inputs were a Statement generated by the application renderer, two synthetic Invoice documents, and the owner's previously supplied three-page scanner PDF. The scan was used only locally and was never emailed.

Manually exercised:

- Edit address text, use + Line and Enter: the right-hand Account field retained identical position; the existing Whiteout layer remained.
- Insert a table row: the next row's fields moved together; Undo/Redo restored the original placement.
- Import all three scan pages, rename the scan, reassign it to the other Invoice and rename all output files.
- Move a scan page and undo; add/delete a blank page and verify Undo/Redo returns to seven pages.
- Inspect all split-file Preview pages, change Preview zoom and switch to one combined PDF.
- Click Download with the harness's local-only download transport. A real seven-page PDF was downloaded and inspected; no cloud document job or business draft was created.

The three split exports contain 1/2/4 pages. All seven pages of the combined download match the corresponding split/original rendered pages pixel-for-pixel at the same 900-pixel rendering scale; the three scanned pages remain nonblank with their original orientation. The original scan hash is unchanged. The edited Statement was inspected visually and retains the three-line address, Account/date fields, table and totals. Text extraction is not used to declare that flattened page blank.

The manual harness uses isolated save/download callbacks. It does **not** prove a new live Supabase/Drive save followed by emailing this exact seven-page package. Actual generic test mail, current application-route browser handoff tests and manual renderer/export proof are recorded separately above.

## Differences requiring data review

At the later category read:

| Region | Reference values (S/T) | Dates | Identity | Other | Total |
|---|---:|---:|---:|---:|---:|
| Phuket | 6,881 | 3 | 1 | 1 | 6,886 |
| Khao Lak | 1,916 | 9 | 76 | 4 | 2,005 |

The date-conflict records include five future-date values and one non-date text value in Khao Lak. They were not guessed or corrected automatically. Reference differences do not overwrite website credit rules. Some retained conflicts may concern historical/absent source rows.

All Phuket pages were read under stable counts. The longer Khao full-page scan overlapped changing data, so its accumulated row count is not represented as a single-instant inventory; the table uses fresh category counts instead. These review items are distinct from a synchronization failure.

## Outcome and scope

No new product defect was reproduced within the qualified cases. No conflict was accepted in bulk, no original sheet layout/formula/permission was changed, and no OPERA accounting action was taken. Real employee login/access testing was skipped at the owner's request. Private evidence and test fixtures remain outside Git; the downloaded QA PDF remains available locally for inspection.
