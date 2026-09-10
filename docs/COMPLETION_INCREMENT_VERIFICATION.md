# Completion increment verification

Status at 2026-09-10 21:34 ICT: pushed/deployed and tested on Cloudflare; SQL applied/tested on the confirmed Supabase project. The all-work Goal remains active.

Source `c369c848dbc69e7d7cb9407e7f546e51469d13e5`, Worker deployment `66ce2d5bd1884a48a14d5e65b9d0ebb1`, Workflow version `b1a66d8a-52c6-406b-b8c0-ace38634dbac`. Health matches source and database. [Source CI](https://github.com/NTHV9/ar-workspace/actions/runs/34489256837) passed.

Final Cloudflare browser run passed19/19 in16.6seconds. The initial run saw old UI on two deep links (17/19); verified the current HTML/script and repeated the complete suite successfully, without changing assertions. New anonymous boundaries5/5 and existing thread/remittance19/19 rejected access. An authenticated real Account read returned zero saved history/documents correctly; no mutation was made.

Financial diagnostic Workflow runs `f6716c81-304f-4a5e-9bda-462d1fe9b909` (KAT) and `ce768ad8-fb8e-4df2-8d82-56851f1b38d7` (TSK) completed read-only. Nonempty history samples matched page10/20 membership/value and transaction-date/adjacent-day checks; TSK included four zero invoices. Three applied-payment mapping reads failed validation. These outcomes do not enable ingestion or prove cash/application-date statistics. No raw identifiers, amounts or customer content were returned in the diagnostics.

## Behavior

- New Statement requests always use AR Workspace; Invoice/Folio generation remains OPERA API. Older native Statement jobs stay readable as historical records. Native Statement research flags and the generic connection probe no longer call Statement APIs. No renderer watermark/layout changes.
- Account history separates immutable verified Gmail facts from manually entered historical corrections. Documents paginate by job; email reviews open the exact saved draft and stored conversation read-only, even if the current document has since changed. No implicit draft creation from the history reader.
- Explicit invoice notes, disputes, holds, release and reopen acknowledgement use scoped revisioned commands and immutable audit. A later hold/reopen cannot erase an already verified SENT fact. Previously verified zero survives unknown observations, so a later verified nonzero still requires review. Fresh unknown/missing is not a verified zero.
- Account forms survive background reload/token renewal; navigation asks before discarding unsaved edits. Mobile can preview source PDF pages without editing. Desktop edits survive resizing; draft save/resume remains available.

## Database evidence

Applied migrations: ar_statement_source_policy134824, ar_account_workspace_read140014, ar_invoice_exceptions140917, ar_financial_diagnostic_candidates142129 (all 20260910). The first three have isolated synthetic BEGIN/ROLLBACK fixtures under tests/sql; all passed. Permissions reject direct client mutation and actor/Hotel/Account crossover. All synthetic records rolled back. Financial candidate read was limited to2Accounts perHotel, and only aggregate counts were inspected. Financial provider semantics remain unverified until the new diagnostic runs on Cloudflare.

The exceptions migration stores compact last-verified balances for existing verified source rows. A zero retention clock starts at this new observation, not an invented historical clearance/payment date. No existing business exception, send event or billing/reminder date was seeded.

## Validation and review

- Unit suite at this checkpoint:666tests/67files; TypeScript passed. This includes unenabled foundations; exact deployed-source CI is recorded after push.
- Source-policy tests cover omitted source, retired native requests, source budget bypass and Invoice preservation. Existing document recovery tests remain.
- SQL source tests cover command replay and legacy-RPC policy; account evidence covers exact scope, pagination, immutable message/history provenance and multiple document revisions; exception tests cover independent flags, new-handoff fences and SENT-after-hold/reopen.
- Browser synthetic suites cover account history/documents1440×900,1280×800,390×844; saved-email revision1440/390; invoice hold/review1440/1280/390; uncertain command retry; mobilePDFpreview/desktopresize; dirty-account navigation/token refresh.
- Review found two issues and both were fixed: the old generic probe still read Statement selection; history navigation could open a newer email draft than listed. New regressions cover both.
- Screenshots are synthetic, API-intercepted test evidence. Source design PNGs remain unchanged. Real customer screenshots/files are not part of this increment's Git artifacts.

## Boundaries

Collection-policy TypeScript foundation preserves default behavior; its UI/database integration is pending. Global budget and retention foundation is not yet enabled. No customer mail was sent, no source ledger changed, no old resource deleted and no paid service added. The local recovery drill is separate evidence from actual managed-backup restoration.
