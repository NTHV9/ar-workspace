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

- [ ] Backend: Drive OAuth, configuration/status, fixed-destination verification, resumable upload, verified job archive and isolated synthetic test.
- [ ] UI: Storage destination/status and explicit Picker authorization; archive reviewed document exports with actual loading/error states.
- [ ] SQL: service-only owner/RLS guards, immutable source revisions, target revision and pre-generated file ID claims, safe retries.
- [ ] Tests: no unauthenticated access, wrong folder/owner/revision denied, no duplicate creates, checksum mismatch/partial archive truthfulness, explicit actions only.
- [ ] Real configuration: confirm required Google APIs/browser key, authorize Drive, select the owner-confirmed folder, prove Worker upload/read/cleanup of a synthetic PDF.
- [ ] Attended review, updated by owner: use synthetic accounts/documents only. By Email diagnostic may send to the one-time recipient authorized in chat; never persist that recipient in source/defaults. By System only links to the account portal and lets staff record the actual date themselves; test link/date behavior with synthetic data, without submitting to any portal or changing real account history.
- [ ] Push/deploy and record exact evidence in PROJECT_STATUS.

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
