# Drive archive and attended workflow validation

Owner approved continuing in order: configure the real Drive destination, validate one By Email and one By System account, review email wording, then continue conversation/remittance/report work. The destination URL was supplied explicitly and connector metadata initially showed an owner-only My Drive folder owned by the allowed AR account. A subsequent read confirmed public link Editor access; the owner explicitly approved changing it to Restricted while preserving the AR owner. Its ID and private evidence stay outside Git.

## Scope for this increment

- Add a Drive connection for the web application's Worker, separately from the Codex connector and Gmail connection. Use the existing new application's Google OAuth project/client with a separate encrypted Drive token record and PKCE state. Request drive.file scope. Browser Picker obtains its own short-lived drive.file token from Google; never return backend provider tokens or client secrets to the browser.
- Use Google Picker to grant the application access to the already-confirmed folder. Picker public configuration is restricted to the application origin/project and exposed only to authenticated staff. Backend checks the selected folder ID against the confirmed destination and verifies metadata/capabilities before enabling writes.
- Explicitly archive reviewed PDF exports from an owned, acknowledged document job revision. No automatic archiving of every source or merge-only operation. Keep the complete export set and report per-file pending/verified/error state.
- Use pre-generated Drive IDs plus durable command claims to prevent duplicates after uncertain upload results. Check parent folder, MIME, owner/application metadata, byte count and checksum; verified output URLs come from Google metadata.
- Support My Drive and Shared Drive API flags. Never change sharing, visit arbitrary credentialed URLs or follow authorization across hosts. No file deletion policy is enabled. A user-initiated synthetic connection test may move only the exact test file it created to Trash after verification.
- Keep OAuth/client secrets in Worker Secrets, encrypted refresh tokens and upload receipts in private Supabase data. No customer documents, folder IDs, raw responses or one-time recipients in Git.
- Reuse the registered /api/gmail/callback for a namespaced Drive state/cookie, avoiding changes to the Gmail grant or its stored tokens. Document any required Google console configuration and do not claim connection success until the Worker can read/write/verify the confirmed folder.

## Work and validation

- [x] Backend: Drive OAuth, configuration/status, fixed-destination verification, resumable upload, verified job archive and isolated synthetic test.
- [x] UI: Storage destination/status and explicit Picker authorization; archive reviewed document exports with actual loading/error states.
- [x] SQL: service-only owner/RLS guards, immutable source revisions, target revision and pre-generated file ID claims, safe retries.
- [x] Tests: no unauthenticated access, wrong folder/owner/revision denied, no duplicate creates, checksum mismatch/partial archive truthfulness, explicit actions only.
- [x] Real configuration: confirm required Google APIs/browser key, authorize Drive, select the owner-confirmed folder, prove Worker upload/read/cleanup of a synthetic PDF.
- [x] Synthetic validation requested by owner: By Email diagnostic sent and verified without customer files or business history; recipient was not persisted in source/defaults. By System portal link/guidance and billing-send guards passed browser simulation, without portal submission or changes to real account history. This does not claim an actual external portal billing event was performed.
- [x] Push/deploy and record exact evidence in PROJECT_STATUS.

## Provider sources inspected

- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/picker/guides/web-picker-sample
- https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setselectfolderenabled
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/guides/enable-shareddrives

## Configuration progress

- The provided folder now reads Restricted/owner-only in both Google UI and connector metadata. This was verified after the owner approved restricting it; no other sharing was changed.
- Google Cloud reauthentication was completed by the owner. The new-app client ar-workspace-gmail now has the explicitly approved JavaScript origin for the Worker; its existing server callback remains unchanged.
- Google Drive API was already enabled. Google Picker API was enabled for this project. The owner approved creating ar-workspace-picker; Google UI shows HTTP referrers and two API restrictions. Allowed referrers are the Worker origin and docs.google.com; APIs are Drive and Picker. No service-account binding was selected.
- The restricted browser key was placed in Worker Secret GOOGLE_PICKER_BROWSER_KEY without printing its value or saving it in Git. Project number is public configuration. Browser uses its own narrow, short-lived Picker token; server credentials remain private.
- Applied ar_drive_archive migration after confirming no name collisions; synthetic SQL rollback checks passed. Seeded only the explicitly confirmed target row with worker verification still pending. No archive files or business events were created by SQL tests.
- Backend/UI review fixes cover stale-token CAS, reviewed destination revisions, old-target receipts and null-safe assertions.49 Drive unit tests and full319 unit tests passed; Typecheck passed. Live Worker verification follows deployment.

## Live result and Picker correction

- Source `ebfc2cf79fba1d3636b323edd613accb65e00302` is pushed and deployed. The Picker key initially failed despite matching the Google Console key and having the approved restrictions. The deployed HTML used `same-origin` referrer policy, which suppressed the application's origin on the cross-origin Picker iframe request.
- Changed only the asset referrer policy to `strict-origin-when-cross-origin`. The regression drives a browser iframe request from the actual deployed page, intercepts only its synthetic destination, and checks that Referer is the application origin with no path/query. It failed before the fix and passed after deployment. OAuth callbacks retain `no-referrer`; the key's website and API restrictions remain unchanged.
- The owner selected the real folder successfully after the fix. Worker/DB confirmed Restricted sharing and revision 1. At 17:44:24 ICT, the explicit test uploaded a synthetic 622-byte PDF, verified metadata/SHA-256 and read-back bytes, and moved only its durable pre-generated Drive file ID to Trash. The receipt records read_verified=true/state=trashed with no error or retained upload session.
- At 17:45:45 ICT, a real Gmail diagnostic sent one synthetic PDF and verified SENT. No customer attachment, supplemental file, account default, billing date or business sent event was introduced. Business events remain zero.
- 26 deployed browser cases passed for Drive/document/By System plus the new referrer regression. Real reviewed customer export archival remains intentionally untested; only the isolated synthetic connection test touched Drive. Automatic archiving/deletion remain disabled, and retention remains undecided.
- Provider references: [Google Picker key restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker) and [Referrer policy behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).
