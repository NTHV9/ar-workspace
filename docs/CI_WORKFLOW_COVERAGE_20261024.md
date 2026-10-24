# PDF Workspace and Google Sheet workflow verification

This implements the owner's approved whole-workflow scope. Coverage means named
business behaviors and failure paths, not a promise that every possible PDF,
Unicode font, spreadsheet layout or provider incident is reproducible in CI.

## Execution boundaries

- **Browser:** the actual built React app/editor, synthetic jobs/documents and
  intercepted API/provider traffic. Unexpected external traffic is blocked.
- **Service/adapter units:** real parsers, synchronization and adapter code with
  synthetic HTTP and RPC responses. These do not execute PostgreSQL functions.
- **SQL:** ordered migrations and rollback fixtures execute on disposable local
  PostgreSQL 17 with minimal Supabase auth/storage stand-ins. This is not a live
  Supabase Auth/PostgREST or Google provider attestation.
- **External services:** real OPERA, Gmail and Google file access must be qualified
  separately with authorized accounts and controlled data. CI has no production
  credentials, customer PDFs or one-use test recipient.

## PDF Workspace feature map

| ID | Behavior and required result | Browser evidence |
| --- | --- | --- |
| PDF01 | Preparation metadata, selected Account/Hotel/Invoices and layout remain exact | `document-route`, `collections-workspace`, batch suites |
| PDF02 | Generation failure identifies the exact unavailable Invoice and reason; successful sources remain separate | `document-route` missing-source/subset cases |
| PDF03 | Download failure retries atomically; metadata retry does not regenerate or send | `document-route` loading/recovery cases |
| PDF04 | Source memory budget blocks oversized packages before body downloads | `document-route` budget gate; `pdf-source-loading` units |
| PDF05 | Statement-only, Invoices-only, both and all three delivery layouts retain page/source membership | editor, document-route, attachment and batch suites |
| PDF06 | Original Invoice fields accept keyboard edits and retain intended glyphs in Preview/export | `document-fields/pdf-editor.spec.ts`: 28 representative original-field classes |
| PDF07 | Address/header/table line growth, shrink and row insertion/deletion preserve other columns and tax/body content | stationery-header, statement-rows, row-lifecycle, flow-engine and document-route suites |
| PDF08 | Repeated movement uses unique commands; paper, cursor and selection remain aligned; occupied destinations remain blocked | native-movement, editor-resilience suites |
| PDF09 | Source fonts/styles, unsupported glyphs and explicit replacement-font recovery remain visible and safe | source-style, font-recovery, native-background suites |
| PDF10 | Text, whiteout, shapes/images, selection, positioning and page order are reversible and survive export | editor, source-deletion, flow-engine suites |
| PDF11 | Attachment identity/order, naming, expiry, upload uncertainty and budget rules remain exact | invoice-pdf-attachments, supplemental-files suites |
| PDF12 | Final Preview and downloaded/reviewed bytes correspond to the actual edited package | editor, document-route and batch byte-inspection cases |
| PDF13 | Account switching retains its own edits and files; identical IDs in different Hotels cannot cross | batch-workspace suite and batch session/source-snapshot units |
| PDF14 | PDF/email phase is shared across the batch; every email uses its own reviewed bytes and receipt | batch-workspace and document-route handoff cases |
| PDF15 | Draft, pending or uncertain send work stays protected; status checks do not resend | batch-workspace, email-draft-recovery, email-composer suites |
| PDF16 | Reload, Back, explicit exit, failed cleanup, pending save and sign-out retain or close the correct job | document-route and email-navigation suites |
| PDF17 | Saved email/conversation history stays immutable and paginated; attachments and account scope remain exact | saved-email-review, email navigation and draft recovery suites |

The field catalog covers original company/address/guest/TAX ID; title and right
header values; transaction date/description/reference/debit/credit; net, VAT,
Non-VAT, totals/outstanding and cashier name. It checks typed value, field anchor,
actual Preview/export and unchanged neighbors. It is not OCR or a guarantee that
all imported fonts can draw arbitrary new characters. Unsupported cases retain
explicit refusal or replacement-font recovery checks.

The field oracle combines exact typed native text where available, independently
drawn expected glyph shape, unchanged anchors and exact untouched-neighbor pixels.
Independent old-glyph ink bounds preserve adjacent text when building the expected
reference. Every edited-region RGB channel must differ by at most one level and
the native-eligible foreground glyph mask must match; native text is an additional semantic check,
not an exemption from the image comparison. Wrong-glyph, black-overlay and gray
background PDF controls must fail. Empty optional fields without source glyphs use
the tested Add text anywhere fallback; a scan is not claimed to have native fields.

## Google Sheet feature and column map

| ID | Behavior and required result | Evidence |
| --- | --- | --- |
| GS01 | Connect only the authorized regional original; reject copies, wrong metadata/MIME, trashed files and changed rights | picker/provider units; tracker-sync/report-link UI |
| GS02 | Preview/confirm import uses exact snapshot, identity and capacity, not an unreviewed source | preview eligibility/capacity SQL; tracker-sync UI |
| GS03 | Hotel, Account, Invoice, Folio/date and durable row identity survive movement and leading zeroes | model/native/workbook/provider units; identity-recovery SQL |
| GS04 | Nonblank Account No. is never ignored; missing/duplicate/ambiguous targets do not write neighbors | sync/native units; missing-row SQL |
| GS05 | Confirmed Sent queues durable intents for Billing and Follow-up1–3; Draft/unconfirmed/unmapped stages do not invent writes | sync units; confirmed-writeback/provenance SQL |
| GS06 | Read, preimage check, write, readback and receipt remain distinct; timeout recovery never blindly posts twice | joined native/service units; native-uncertain SQL |
| GS07 | Sheet date corrections and clears win over stale queued intents, including concurrent deletion | sheet-authority/sync/writeback SQL; joined native race units |
| GS08 | Formula/invalid/boolean/date/amount/reference fields remain validated without changing OPERA amounts | workbook/native/provider units; bootstrap-ledger/sync SQL |
| GS09 | Notification replay, coalescing, backup polling and revision publication do not create duplicate work | watch/revision units; change-notifications SQL |
| GS10 | Hidden/visible and multi-tab catch-up refresh once; dirty editors retain unsaved work | tracker-background/tracker-sync/Register UI |
| GS11 | Differences/conflict categories, pagination, stale replies, choices and provenance remain exact | conflicts API units; tracker-conflict-pages UI; conflict/provenance SQL |
| GS12 | Provider403/429/timeouts, stale versions, missing rows/files and malformed schemas fail safely | native/provider/service units and UI recovery |
| GS13 | Regions and actors remain scoped; private helper permissions are preserved | worker access tests and local SQL contracts, with auth-stub boundary above |
| GS14 | PostgreSQL verification rejects unsafe targets before DDL and cleans up only its own scratch data | isolated runner guards; service identity attestation |

| Cells | Current authority and direction |
| --- | --- |
| A/C/E/F/G/AG | Hotel/Account/Invoice/Folio/date/durable row identity. Used for exact matching, not a license to reassign an Invoice. |
| R, U, V, W | Sheet master Billing/Follow1/Follow2/Follow3 dates, including null clears. Confirmed web events queue frozen write intents under current generation rules. |
| S | Account credit-term settings remain authority; Sheet term is a validated reference. |
| T | Due date remains derived under the billing/base-date and credit-term rules; formula/reference cells are preserved. |
| X | Promised-date tracking import/merge with validation and conflict handling. |
| Y | Raw Sheet status remains distinct from recognized canonical tracking status. |
| Z | Reported received tracking amount; never an OPERA payment or open-balance authority. |
| AA | Difference/reference cell only; never a financial source or outbound write target. |
| AB/AC | Bounded note and owner tracking fields under current import/merge rules. |

Friendly/Final/custom web stages do not gain invented Sheet columns. The known
per-Invoice blocked-reason UI improvement and the actual staff Sent/Sheet incident
are not implemented or remediated by this CI task; missing-row tests preserve the
current safe pending behavior instead of claiming a successful write.

## Evidence, limits and migration state

On failure, CI retains browser screenshots/traces plus HTML/JSON results. SQL
artifacts use an explicit `report.json`/`*-psql.log` allowlist; cluster directories
and local password files are excluded. All such inputs are synthetic.

Actual SQL execution exposed a resolver alias collision that mocked HTTP tests
could not reveal. The new guarded migration changes only the colliding authority
alias and verifies function grants/security/search-path invariants. Its focused
fixture reproduces the old failure before the migration and verifies resolution
afterward. The migration is branch-only at this stage: it has not been applied to
the hosted database and no actual conflicts, dates or Sheet rows were changed.

Final committed-head counts and results are recorded in PROJECT_STATUS and the
PR completion note after qualification. Local provider mocks and SQL fixtures are
complementary layers, not a claim that CI sends real mail or edits a real Sheet.
