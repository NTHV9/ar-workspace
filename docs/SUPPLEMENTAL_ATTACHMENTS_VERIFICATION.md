# Supplemental attachments — 10 September 2026

## Implemented

Email Composer supports one-at-a-time upload of static PDF, PNG and JPEG files. Supplemental files remain separate from generated PDFs, while total file count and byte budget include both. Owners can preview all PDF pages, view images, and remove supplemental files from the current message. The send confirmation lists both groups.

Uploads require the verified app user and draft ownership. UUID command identity and SHA-256 prevent duplicate writes on retry; a storage-success/metadata-loss retry reads and hashes the existing object before attaching it. Database revision, current document package, handoff state, combined byte budget and file-count guards are checked atomically before metadata changes. Removal is soft and does not delete original/private storage objects or sent evidence. Unresolved/handed-off messages cannot have their attachment set silently changed.

Rejected/failed selections remain visible and block draft/send handoff until explicit retry or removal. Message edits must be saved before attachment mutation. Download and preview use authenticated Worker routes with no-store/nosniff responses and exact stored hash checks.

## Format and resource checks

- Extension, declared type and byte signature/parser checks; filename control/path characters rejected.
- PDF: readable, non-encrypted, with known script/action, form and embedded-file structures rejected. Object graph inspection is bounded. Preview mounts a canvas page renderer, not a PDF action/annotation/XFA layer.
- PNG: one legal IHDR, legal color/bit-depth/compression/filter/interlace, chunk ordering and CRC validation, no APNG. Expanded IDAT scanlines are streamed and bounded by the validated raster size; duplicate-header and expansion-overrun regressions pass. No unbounded raster inflater is used server-side.
- JPEG: signature/end marker and dimension/header inspection. Image limit is 8 million pixels and 8192 pixels per side.
- Whole message uses the existing Worker attachment budget (10 MiB by default, configurable up to 12 MiB) and 50-file operational cap. Files are not silently omitted or replaced with links.

This is format/structure inspection, not a claim of a full antivirus scan. XLSX, DOCX, archives, animated PNG and interactive/encrypted PDFs remain unsupported in this increment.

## Database changes

Applied to Supabase `ar-workspace` (`jmyvpurzmoiecpydjrci`):

- `20260909190500_ar_supplemental_attachments.sql`: inspection metadata, owner-scoped receipt lookup, guarded/idempotent add, guarded soft remove; unused placeholder writer execution retired.
- `20260909194500_ar_test_supplemental_snapshot.sql`: optional explicit supplemental selection in isolated diagnostics; owner/revision/active-ID verification before claim.
- `20260909195000_ar_test_command_guard.sql`: same-command diagnostic intent must match recipient digest and supplemental selection, including concurrent claims.

Storage bucket remains private with its prior configuration. No account rules, financial balances, legacy services or paid plans were changed.

## Real tests

- Browser → Cloudflare Worker → Supabase Private Storage uploaded one synthetic two-page PDF, PNG and JPEG. All three stored SHA-256 values matched the local originals. PDF page 2 and both image previews loaded from the protected routes.
- A synthetic PDF with a harmless JavaScript OpenAction was rejected before attachment/storage registration. UI showed Not attached and blocked Gmail draft/Send Now until the failed selection was explicitly removed.
- Owner then explicitly approved a one-time email test. The diagnostic option was explicitly selected to include the three synthetic supplemental files. Generated customer PDFs are excluded by the diagnostic path.
- At **10 September 2026 03:04:07 ICT**, Gmail sent evidence was verified for one new test email with four files: the system-generated test PDF plus the three selected synthetic files. Worker verified message identity, sender/recipient digest, text and all attachment hashes. No customer Statement PDF was sent.
- The recipient was entered only in the one-time test field, cleared after submission, and not stored in account defaults, message recipient profiles, source or this document. Private test records retain its digest for verification; Gmail retains its own message record.
- The three synthetic supplementals were removed from the working draft after verification. Postchecks: active supplemental files 0, removed records 3, business sent events 0, changed billing/reminder histories 0, saved nonempty message recipient profiles 0. Total verified diagnostic deliveries is now 2 across this and the prior test.

## Automated verification

- Typecheck/production Build passed; **212 unit tests passed**.
- **14 browser tests passed** against deployed Cloudflare assets with synthetic intercepted APIs: upload, page navigation, PNG preview, combined send-preview membership, removal, rejection blocking, same-ID retry after lost response, explicit diagnostic selection, and existing composer/send regressions at desktop/laptop/mobile sizes.
- SQL rollback tests passed: upload replay, combined budget, stale remove, owner boundaries, handoff lock, tombstone non-resurrection, diagnostic source revision and intent guards. No rollback fixture was retained as business data.
- Anonymous GET/POST/DELETE attachment routes returned 401. No credentials or customer screenshots were committed; synthetic UI captures are in `evidence/supplemental-*.png`. Original design references remain unchanged.
- Review found a PNG predecode allocation risk; it was fixed with header/structure checks and streamed raster-length verification. Review accepted the corrected boundary and the diagnostic file-selection boundary.

## Deployment

- Repository `NTHV9/ar-workspace`, branch `codex/opera-refresh`.
- Runtime source `171f84c5be987327f21eba5115cfd1eb3ec3073d`.
- Worker `ar-workspace`, deployment `ea16fc1e477a499c81326c35487d1f60`.
- Workflow version `337c0f1a-c9b3-4675-8676-43276b2a1242`.
- URL: https://ar-workspace.ar-c82.workers.dev/
- Health reported the matching source SHA. Existing Gmail 15-minute and OPERA 07:00/19:00 ICT schedules remain unchanged.

Next separate increments include reusable/rich-text message templates, existing Gmail threads, real account-rule setup and remaining reply/remittance/reporting workflows. This increment does not claim those are complete.
