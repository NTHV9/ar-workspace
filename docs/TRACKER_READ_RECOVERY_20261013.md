# Khao Lak tracker read recovery — 13 October 2026

The owner reported a red synchronization status after the system audit. Fresh status showed Phuket succeeding, shared Drive connected, and Khao Lak's last successful import at 10:51 ICT. The stored generic `tracker_unavailable` message did not identify the failed stage. Pending field differences were separate from the failure and zero writes were queued.

## Confirmed cause

A narrow diagnostic release logs only region, static phase, exact allowlisted error code and trusted numeric HTTP status. The next automatic failed attempt emitted `provider_read / drive_response_too_large`. The native Google Sheets read requested the entire `A:AG` grid, including cell metadata, and exceeded its existing 16 MiB response limit. File download size is not the typed Sheets API response size.

Read-only export inspection found the expected headers and no duplicate nonblank canonical Invoice identity. A reconstruction of the occupied grid passed the existing native parser. This reconstruction is supporting evidence, not a claim to have captured the exact oversized provider response.

## Narrow repair

- Read the compact AG key column with `valueRenderOption=FORMULA`, preserving formula-key rejection and the existing maximum occupied-row limit.
- Fetch one typed `A1:AG{last occupied key row}` response, preserving all identity, formula, date-format and rich-text checks and the existing 16 MiB cap.
- Verify key positions against discovery and read the key column again before returning a complete snapshot. Any mismatch fails before import or write.
- Keep one typed-grid response, existing best-effort native updates, exact writeback identity checks and uncertainty handling. Do not infer atomic consistency from Drive version/timestamps.
- Allow unrelated sheet metadata while requiring one exact target title, as the previous parser did.

The original file, sheet structure, employee-entered values, permissions and AgingMaster are unchanged. No manual sync, initial import confirmation, conflict resolution or email send was used to diagnose the failure. Normal scheduled synchronization continues.

Google's [spreadsheet read documentation](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get) supports restricting the requested cell range; [values.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get) provides the compact key-column read without cell-format metadata.

## Verification

Red regression reproduces the old formatted-tail size failure. Focused native/provider/sync/telemetry checks and TypeScript pass after the repair, including key movement, missing/truncated data, duplicate identities, formula keys, response caps and exact single-POST/uncertain writeback behavior. Final deployment and actual recovery are recorded below after verification; the repair is not declared enabled from local tests alone.
