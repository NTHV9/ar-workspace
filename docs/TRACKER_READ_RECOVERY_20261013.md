# Khao Lak tracker read recovery — 13 October 2026

The owner reported a red synchronization status after the system audit. Fresh status showed Phuket succeeding, shared Drive connected, and Khao Lak's last successful import at 10:51 ICT. The stored generic `tracker_unavailable` message did not identify the failed stage. Pending field differences were separate from the failure and zero writes were queued.

## Confirmed cause

A narrow diagnostic release logs only region, static phase, exact allowlisted error code and trusted numeric HTTP status. The next automatic failed attempt emitted `provider_read / drive_response_too_large`. The native Google Sheets read requested the entire `A:AG` grid, including cell metadata, and exceeded its existing 16 MiB response limit. File download size is not the typed Sheets API response size.

Read-only export inspection found the expected headers and no duplicate nonblank canonical Invoice identity. A reconstruction of the occupied grid passed the existing native parser. This reconstruction is supporting evidence, not a claim to have captured the exact oversized provider response.

## Narrow repair

- Read the compact AG key column with `valueRenderOption=FORMULA`, preserving formula-key rejection and the existing maximum occupied-row limit.
- Read the occupied grid in 200-row typed responses. Parse each page with the original header rows and true row offsets; retain only normalized provider rows and page digests, releasing unused cell metadata. Preserve the 16 MiB per-response limit and bound retained normalized rows to 16 MiB as well.
- Validate spreadsheet/title/sheet ID, page bounds and key positions, and reject duplicate AG or canonical Invoice identities across page boundaries. Recheck the compact key column before returning the complete snapshot. Any incomplete/changed page fails before import or write.
- Preserve existing best-effort native updates, exact writeback identity checks and uncertainty handling. The key fence detects row movement, not an atomic snapshot of same-key field edits; Drive timestamps do not establish native-sheet consistency.
- Allow unrelated sheet metadata while requiring one exact target title, as the previous parser did.

The original file, sheet structure, employee-entered values, permissions and AgingMaster are unchanged. No initial import confirmation, conflict resolution or email send was performed. Diagnosis used read-only checks and automatic failure evidence. A normal Check changes attempt after the first repair confirmed that even one trimmed typed response still exceeded the cap, before imports; this is why the final repair pages and discards metadata instead of simply trimming the range or increasing memory limits. Normal scheduled synchronization continues.

Google's [spreadsheet read documentation](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get) supports restricting the requested cell range; [values.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get) provides the compact key-column read without cell-format metadata.

## Verification

Red regressions reproduce the old oversized-response failure and occupied typed metadata exceeding 16 MiB in aggregate. Focused native/provider/sync/telemetry checks and TypeScript pass after repair, including later-page key movement, missing/truncated data, changed sheet/offset, duplicate identities, formula keys, response caps and exact single-POST/uncertain writeback behavior. Private differential replay of the reconstructed current export produces exactly the same 1,101 provider rows and schema as the original parser, using nine reads with at most 200 grid rows per request. Final deployment and actual recovery are recorded below after verification; the repair is not declared enabled from local tests alone.

## Deployed and recovered

Final source `cd2fc8f6ab5b50319a70711813d9223aa5a021b3` is deployed as Worker `f52fb2ce-32e7-459b-be8d-df597b6e6379`. Normal release build and exact-source health pass. Runtime and non-variable bindings are identical; only COMMIT_SHA changes. Existing schedules, workflows, credentials and integration flags are preserved.

Final focused suite: **90/90 passed**. Entire unit suite: **1,887/1,887 passed**. Astra's independent review passes.

A normal Check changes run on the deployed reader starts at **12:26:31 ICT** and succeeds at **12:26:39 ICT** on 13 October. Fresh application readback confirms `error=null`, connected/enabled/available/writebackAvailable=true and zero pending writes. The red error disappears in the actual Reports UI; a private screenshot was inspected. This is verified manual recovery through the normal synchronization function; the next scheduled recurrence was not needed to establish this result and is not claimed as observed.

Pending field differences update to 2,016 after the current source becomes readable. They remain separate review items, not synchronization failures; no conflict values were guessed or manually resolved. No original-sheet layout/permission change, email send, schema migration or OPERA accounting write was performed.
