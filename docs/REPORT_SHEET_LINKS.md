# Manual Google Sheets in Reports

Owner decision, 29 September 2026: retain the current Invoice Register and add a Google Sheets view in Reports. Phuket and Khao Lak open their existing manually maintained files in new browser tabs. This replaces the earlier integration discussion: the spreadsheet contents are an independent dataset, with no synchronization, import, automatic updates or OPERA data sent to them.

The existing Phuket workbook remains in Excel format; this feature does not convert or replace it. Editing and document permissions belong to Google's editor. Opening a file does not create an AR workflow event, send an email, or grant Google access.

## Configuration and access

- `REPORT_SHEET_PHUKET_ID` and `REPORT_SHEET_KHAOLAK_ID` are configured privately on the existing Worker. Real file identifiers are not stored in this repository or the public asset bundle.
- `GET /api/reports/sheets` uses the existing verified session and regional membership checks. It returns only the regions granted to the caller; the administrator can see both. It rejects query arguments and has no write operation.
- Destinations are constructed only as HTTPS Google Sheets edit URLs from validated file IDs. No arbitrary URL, redirect service, spreadsheet fetch, Google SDK or additional OAuth scope is involved. Responses are not cached.
- Native links use a new tab, `noopener noreferrer`, and a no-referrer policy. The original Reports page stays open. Invoice Register's existing unfinished-edit confirmation remains in effect when changing report views.

The feature does not create a spreadsheet data store, file-retention job or background sync. Missing link configuration is shown as unavailable; read errors can be retried.

## Verification

Synthetic tests cover unauthenticated/revoked access, each regional boundary, administrator access, absence of IDs from public configuration, invalid targets/methods and no Google data calls. Browser checks cover both destinations opening in new tabs, desktop/mobile layout, error recovery, no report-data writes, returning to Invoice Register and its unfinished-edit guard. Existing Register layout checks remain. Delivery evidence is recorded in PROJECT_STATUS; all retained screenshots use synthetic links and data.
