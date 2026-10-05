# Phuket native Google Sheets conversion — 5 October 2026

## Current owner correction — 6 October 2026

The owner requires the **original Phuket file identity and link**, not a new master file: “คุณเปลี่ยนไปใช้ไฟล์ใหม่หรอ คือจะให้ใช้ไฟล์เดิมนะ”. Root restored private `REPORT_SHEET_PHUKET_ID` to the original file and verified its exact authenticated Reports link and visible XLSX tracking tab. Khao Lak and application source are unchanged. Original MD5 and modified time match; Drive version metadata changed from 2421 to 2422, which is not evidence of a data edit. The original remains XLSX; no supported in-place native conversion is claimed.

Corrected AgingMaster **1.0.8** was delivered at `Desktop/AgingMaster/AgingMaster_1.0.8.exe`, 45,154,688 bytes, SHA-256 `cd6e4ee73231f0f642d32d43fa8a0102e53a92b68517aa6ff0753c9c6e01a492` (independently matched by root). Embedded original-XLSX/Khao Lak targets and original-only default production manifest were verified; the native production profile was removed. Static/Defender checks passed, source tests 746 passed / 3 skipped and packaging tests 180 passed / 4 skipped against 1.0.8. No packaged production write is claimed. Version 1.0.7 was moved out of Desktop delivery into ignored private archive; 1.0.6 remains unchanged and also targets the original. The mandatory all-PC native migration instruction is superseded.

The native copy is **not the approved master** or Reports destination; its browser tabs were closed. Read-only audit found no semantic cell/formula/style differences, but its modified time changed since creation, so it will not be trashed/deleted. Root completed and verified name-only marking: `[NOT IN USE] Master_KAT_AR_Tracker_Phuket (conversion copy)`. The copy is not trashed; content/history/ACL were preserved and original metadata remained unchanged during rename. Partial AR synchronization remains unimplemented.

Everything below is historical evidence for the superseded native-copy target; its tests do not establish current original-target or 1.0.8 acceptance.

## Same-ID feasibility probe — 6 October 2026

- Fresh live qualification used a private five-cell synthetic XLSX. One Drive v3 `files.update` on its own test ID requesting native MIME with XLSX media failed HTTP 400 `invalidContentType`: “Invalid MIME type provided for uploaded content”. Test ID, XLSX MIME and exact bytes remained unchanged.
- Positive controls passed: identical-byte XLSX→XLSX `files.update` retained the same ID; `files.create` made a native file with a distinct ID and verified known cells/formula/date, cached result 241 and private ownership. Thus this tested v3 update route does not support same-ID XLSX→native conversion; this is not a universal claim about all methods or future support.
- The initial probe remains classified inconclusive; these controls are a fresh qualification, not a rewrite of that initial result. Original files, production configuration, 1.0.8 and Reports links were untouched.
- Both exact test files were checked against their markers/private owners, moved to recoverable Trash and readback-verified. Evidence is private in AgingMaster `artifacts/same-id-synthetic-probe-20261006`; no IDs/customer data/secrets enter AR Git.
- Official references: [Drive files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [upload guide](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Google conversion guidance](https://support.google.com/a/users/answer/9331167?hl=en).

## Historical migration checkpoint — superseded

Status, 6 October 2026: conversion, recalculation/readback and actual source-pipeline tests passed; AgingMaster 1.0.7 delivered and Phuket Reports binding enabled. Authenticated Reports reload verified the exact native Phuket destination without a gid and the unchanged Khao Lak destination. Native new-tab opening and delivered-production executable packaging checks passed. Final read-only freshness/access verification passed; QA cleanup is complete; migration delivered with the stated limits. Conversion and operational evidence below were supplied by Astra and the coordinating task; AR source inspection was performed by this documentation task.

The owner's latest approval supersedes the 29 September no-conversion decision **only for this scoped Phuket migration**. Keep the original Phuket XLSX untouched. Khao Lak and other files are outside this conversion. The AR Reports view continues to expose regional links; an AR-to-Sheets integration is a separate future implementation and is not implemented by creating a native copy.

## Confirmed preparation and target handling

- The UI-created native candidate is titled `Master_KAT_AR_Tracker_Phuket`, with confirmed AR ownership and Restricted access. It is a new file: original file metadata, ownership and revision history are not preserved identically.
- Conversion, recalculation/readback and actual source-pipeline acceptance passed before the private Reports binding switch. The source workbook remains intact.
- Keep the original and candidate exact file IDs in the authorized private task context and deployment configuration. Match IDs, MIME type and ownership; a matching title alone is insufficient. Real IDs, customer rows, financial payloads, credentials and test recipients do not belong in this repository.
- Source freshness was checked when applying access. Eleven audience grants were preserved with exact readback and zero differences; the AR account is the new owner and the former owner is a writer. No notification emails were sent. Original XLSX ownership, sharing and content remain unchanged.

## Approved delivery sequence and acceptance evidence

1. Create a native Google Sheets copy while preserving the original XLSX.
2. Validate the copy against the original: all required tabs, dimensions and row membership; values and signed THB totals; dates and identifiers; formula presence, references, recalculation results and errors; relevant formatting and operational controls. A conversion notification or equal totals alone does not prove completeness.
3. Adapt **Detail One Shot** to support the exact native target and produce a new executable. Confirm target type and identity before writes, preserve supported update scope and formulas, and reject unrelated or ambiguous files. Conversion does not imply that the old XLSX updater can work without modification.
4. Test the complete loop on the candidate: source read, native update, formula recalculation, reconciled output and visible result. Cover failed/partial writes and repeat execution so a retry does not duplicate or damage the workbook. Retain aggregate/private evidence without committing customer data. A build or isolated unit pass is insufficient evidence of a working native loop.
5. Only after the coordinating task records successful validation, switch the Phuket Reports binding to the validated candidate and verify the authenticated destination, regional access and normal new-tab behavior. Keep the original available and record the exact private target used.

If a later formula, layout, permission or update incompatibility is found, pause updates and investigate. Reverting the Reports binding can restore the old destination, but does not undo edits already made to the native file or reconcile diverging data. Do not promise a lossless downgrade, zero risk or unchanged desktop tooling. Reconcile relevant data before treating either version as current. No deletion is required for cutover or rollback.

## AR Reports cutover surface

The current link handler never reads or writes spreadsheet content. Its environment binding is the only live destination switch:

| Surface | Role after successful validation |
|---|---|
| Private Worker binding `REPORT_SHEET_PHUKET_ID` | Set to the exact validated native candidate. Preserve `REPORT_SHEET_KHAOLAK_ID` and unrelated bindings. This is the actual destination change; do not put its real value in `wrangler.jsonc`. |
| `worker/reports/sheet-links.ts` | Existing handler constructs a Google edit URL from the validated private ID and only returns authorized regions. Native and XLSX IDs use the same URL form; no ID-specific source edit is needed. |
| `worker/index.ts` and `worker/access/scope.ts` | Existing authenticated `GET /api/reports/sheets` routing and membership boundary remain applicable. No write route exists. |
| `src/reports/GoogleSheetsReports.tsx` | Existing UI validates the returned URL and opens a separate tab. No hardcoded production ID requires replacement. |
| `tests/report-sheet-links.test.ts` | Existing synthetic tests cover authenticated scope, invalid destinations, no public-ID exposure and no Google provider reads. Run if this boundary changes; do not insert real IDs. |
| `tests/browser/report-sheet-links.spec.ts` and `tests/browser/invoice-register.spec.ts` | Preserve new-tab links, responsive behavior, error recovery and the unfinished Register edit guard. Post-cutover live read-only verification must separately confirm the real native target. |
| `docs/REPORT_SHEET_LINKS.md` and `docs/DECISIONS_AND_OPEN_ITEMS.md` | After acceptance, update the current description that Phuket remains XLSX and clearly record this scoped supersession. Retain the historical 29 September checkpoint. |
| `docs/PROJECT_STATUS.md` and this checkpoint | Record validated evidence, actual binding cutover, deployment/source if any and enabled status separately. |

No AR app source change is needed solely to replace the link destination. New sheet-content synchronization would require its own backend implementation and validation.

Google reuploads regenerate tab `gid` values. Link to the file without pinning an old `gid`; any future synchronization must resolve tabs by exact names and expected headers, then use their current IDs.

## Separate integration intent, not an enabled capability

The eventual partial bidirectional mapping discussed with the owner is column **R = first actual billing date**, and **U/V/W = Follow 1/Follow 2/Follow 3**. Recognize only the explicit hotel mappings: `KT → KAT`, `TS → TSK`, `SAN → TSAN`, `WAT → WAKL`, `LFO → TLFO`, `TLKL → TLKL`; exclude `LFS`.

This is recorded intent, not a schema migration, imported history or working synchronization. Preserve Hotel + Account + stable Invoice identity; do not join by name/amount alone. Drafts do not count as actual sends, reminder dates do not establish settlement, and API errors or missing rows do not establish zero. Conflict handling, source precedence, first-billing preservation, actual-event evidence, permissions and no-duplicate commands must be resolved and tested before enabling any such integration. Do not reinterpret R/U/V/W as OPERA accounting write authority.

## Evidence at this checkpoint

- Astra's independent source/native API comparison passed: **14 tabs, 140,311 nonempty cells, 4,131 formula cells and their cached results, and 1,644 tracking keys** match. At initial conversion, worksheet XML, styles and shared strings were byte-equal. This proves the compared content, not identical file metadata/history/ownership or completed recalculation.
- A no-op upload to a separate QA clone initially ended in `ManualRecoveryRequired` during verification. Subsequent read-only verification of that clone at stable metadata revision 9 passed semantic and readback validation: all values, formulas, tracking keys and normalized visual styles match. Twelve differences concern unused trailing default-column ranges; three concern border representation. The migration candidate remains unchanged since Google Save As; the QA upload did not target it.
- Bounded **read-only** late-revision success reconciliation and wrong-candidate authority guards passed 184 tests. Rollback head guards and uncertain-upload retry restrictions remain intact.
- Current 5 October conversion plus real recalculation/readback passed. The reviewer-accepted composition also passed the actual source pipeline using archived 26 September QA → actual 29 September KT/TS PDFs with date guards intact: KT 1,235 rows and TS 210 rows, counts/totals matching to cents; 806 tracking records retained all ten fields unchanged; 9,889 prior archive rows preserved and 71 removed rows archived. Archiving here is Detail One Shot source-membership semantics, **not OPERA-verified zero**. This is not a 5 October PDF import or a separate owner instruction approving the test composition.
- AgingMaster 1.0.7 was delivered at `Desktop/AgingMaster/AgingMaster_1.0.7.exe`, 45,153,306 bytes, SHA-256 `ac944d8a86ba8cf56ba9181ef5576018cba23c76f2c715609ffed792cba50392`. Version 1.0.6 remains unchanged. Production 1.0.7 embeds the exact native Phuket target and retains Khao Lak's target. Static validation and Defender passed; source tests passed 746 with 3 skipped; packaging tests passed 180 with 4 skipped. Sol confirmed the packaging rerun against the delivered production SHA: 180 passed / 4 skipped with process version 1.0.7. Source and packaging suites total seven skips. The full source pipeline ran against QA; no actual production write by the packaged executable is claimed.
- Staff must use 1.0.7 on every updating machine before the next update and use the new Reports link. Older executables continue targeting the old XLSX. Delivery is not proof that every staff PC has installed the new version.
- Read the existing Reports handler, UI, routing/access checks and synthetic link tests. Confirmed production file IDs are absent from these source surfaces and `wrangler.jsonc`.
- At approximately 00:13 ICT on 6 October, the coordinating task successfully applied the existing Worker's private `REPORT_SHEET_PHUKET_ID` binding to the validated native file. Application source is unchanged (`cb574a0e902c8b507592a93b3c0e3e54e9b7bf46`); Khao Lak's binding is unchanged. Seven report-link unit tests passed. Authenticated live Reports reload verified the exact native Phuket link without a gid and the original Khao Lak link. Clicking the Phuket link opened the exact native file in a new tab with Extensions and no XLSX badge; the original Reports tab remained open. The main tracking view was inspected at 1280×720; customer screenshot evidence remains private in AgingMaster artifacts. Final read-only freshness/access verification passed with all eleven canonical grants matching exactly, AR ownership preserved and no original-source change; QA cleanup is complete: the exact QA clone and four task-created backups (five objects) were validated against journals/source digests/appProperties and moved to recoverable Trash. Production native file, original XLSX and Khao Lak were excluded; private local evidence is retained.
- Changes in this AR task are documentation only. The pre-existing untracked `docs/DASHBOARD_REDESIGN_REFERENCES_20261003.md` is preserved.
- Cleanup returned `EXACT_QA_OBJECTS_RECOVERABLY_TRASHED`, object count five: the exact private QA clone and four task-created backup IDs were validated against journals, source digests and appProperties, then moved to recoverable Trash. The production native file, original XLSX and Khao Lak were excluded; private local evidence is retained. No agent work remains for this migration; staff must still use 1.0.7 on every updating PC, and AR spreadsheet synchronization remains disabled/unimplemented.
- Final live read-only helper returned `FINAL_ACL_AND_FRESHNESS_VERIFIED`: all eleven canonical permissions matched exactly, AR ownership was preserved and the original source remained unchanged. Post-binding health returned HTTP 200, status `ok`, Supabase `database_verified`, OPERA connected and unchanged source `cb574a0e902c8b507592a93b3c0e3e54e9b7bf46`. QA cleanup is complete; staff installation on all updating PCs remains a user step.
