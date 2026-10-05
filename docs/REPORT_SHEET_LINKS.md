# Manual Google Sheets in Reports

Latest scope, 6 October: the owner authorized partial tracker integration using the **original Phuket XLSX** and existing **Khao Lak native file**, preserving exact private destinations. R first actual billing and U/V/W Follow 1-3 are the limited outbound fields and require confirmed Sent; inbound tracking retains provenance and raw Thai Y. The native outbound path remains held after failed CAS produced a side effect. Current AgingMaster 1.0.6 is unchanged; no new executable requirement.

Implementation and local tests passed; Sheets API is enabled, but the Supabase migration is pending and runtime is not deployed/enabled. Neither tracker is claimed connected or synchronized. See [validation guide](TRACKER_SYNC_VALIDATION_20261006.md). The earlier no-sync decision below is historical and superseded only by this bounded authorization; earlier executable conversion/correction notes do not impose current staff migration requirements.

Owner decision, 29 September 2026: retain the current Invoice Register and add a Google Sheets view in Reports. Phuket and Khao Lak open their existing manually maintained files in new browser tabs. This replaces the earlier integration discussion: the spreadsheet contents are an independent dataset, with no synchronization, import, automatic updates or OPERA data sent to them.

Latest owner correction, 6 October: use the **original Phuket file identity and link**, not a new master. Root restored its private Reports binding and verified the exact authenticated link and original XLSX tracking tab. Khao Lak is unchanged; original content MD5/modified time match despite Drive metadata version churn. Prior native-copy cutover is reverted and historical; the copy is not used or approved master. Name-only [NOT IN USE] marking is complete and readback-verified; the copy was not trashed and content/history/ACL were preserved. No in-place native conversion is claimed. See [correction and historical evidence](PHUKET_NATIVE_SHEETS_20261005.md).

Corrected original-XLSX-target AgingMaster 1.0.8 is delivered and verified; 1.0.7 was withdrawn into ignored private archive, while 1.0.6 remains unchanged and also targets the original. The mandatory all-PC native migration instruction is superseded. Partial bidirectional AR synchronization remains unimplemented. Editing and document permissions belong to Google's editor. Opening a file does not create an AR workflow event, send an email, or grant Google access.

## Configuration and access

- `REPORT_SHEET_PHUKET_ID` and `REPORT_SHEET_KHAOLAK_ID` are configured privately on the existing Worker. Real file identifiers are not stored in this repository or the public asset bundle.
- `GET /api/reports/sheets` uses the existing verified session and regional membership checks. It returns only the regions granted to the caller; the administrator can see both. It rejects query arguments and has no write operation.
- Destinations are constructed only as HTTPS Google Sheets edit URLs from validated file IDs. No arbitrary URL, redirect service, spreadsheet fetch, Google SDK or additional OAuth scope is involved. Responses are not cached.
- Native links use a new tab, `noopener noreferrer`, and a no-referrer policy. The original Reports page stays open. Invoice Register's existing unfinished-edit confirmation remains in effect when changing report views.

The feature does not create a spreadsheet data store, file-retention job or background sync. Missing link configuration is shown as unavailable; read errors can be retried.

## Verification

Synthetic tests cover unauthenticated/revoked access, each regional boundary, administrator access, absence of IDs from public configuration, invalid targets/methods and no Google data calls. Browser checks cover both destinations opening in new tabs, desktop/mobile layout, error recovery, no report-data writes, returning to Invoice Register and its unfinished-edit guard. Existing Register layout checks remain. Delivery evidence is recorded in PROJECT_STATUS; all retained screenshots use synthetic links and data.
