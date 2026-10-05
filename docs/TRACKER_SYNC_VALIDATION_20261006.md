# Partial tracker integration — validation checkpoint, 6 October 2026

Status: migration applied and runtime deployed; preparation controls enabled, but neither original tracker is authorized/connected and no bootstrap import has occurred. Native outbound remains held. Google Sheets API is enabled on the confirmed AR project; this does not grant access to the exact source files.

## Live checkpoint

- The exact migration SHA below was applied transactionally with BEGIN/COMMIT to the confirmed Supabase project. Readback: tracker schema present, zero bindings. All ten private tracker tables deny SELECT to anon/authenticated roles.
- Source `f791516f05871ab73330c365198c6e84fb7a85bd` deployed initially disabled as Worker version `97198f9b-bf88-4b81-9573-c2c03b6ee7bf`. Health returned HTTP 200, database_verified, OPERA connected and matching source; anonymous tracker/revision requests for both regions returned 401.
- Preparation flag `TRACKER_SYNC_ENABLED=true` with `TRACKER_BLOB_CAS_ENABLED=false` was then applied as version `091dd1a4-035d-4957-88a8-e7cdbf98041d`. Zero bindings/no bootstrap remain; this is not completed synchronization or writeback activation.
- Authenticated Connect attempts for both original files returned `tracker_authorization_required`. Existing Drive folder verification subsequently succeeded, proving the credential remains valid; exact source-file grants are missing. Original files were not read/imported through the Worker. Exact-original Picker authorization is being implemented without broader OAuth scope.
- No original spreadsheet write, email or Detail One Shot change occurred. Native outbound and all unproven write capabilities remain held. Live original-file authorization/bootstrap/behavior acceptance is pending.

## Exact-file authorization preparation

The authorization failure now has a scoped Google Picker flow. Configuration requires the verified AR session, regional authorization, private original-file binding and the existing AR-owned Drive connection. Picker lists only that exact file with its MIME type and requests the existing `drive.file` scope; its temporary GIS token stays in the browser closure and is never sent to the backend. The backend independently re-reads the configured original before recording connection. Selection alone does not import or confirm any preview. Existing archive-folder Picker behavior is preserved.

The new flow passed typecheck, 28 focused unit cases including folder regressions, and one built-browser case covering wrong-file/cancel handling, exact-file selection and backend re-read. Actual selection remains pending action-time user confirmation because it grants the AR app access to the original file; Google sign-in alone did not grant that access. No broader Drive scope, credential migration, workbook replacement or One Shot change is required.

## Authorized scope

- Preserve the original Phuket **XLSX file identity** and the existing Khao Lak native file. Exact IDs remain in private configuration. No copy adoption, conversion or sharing change is part of this integration.
- Partial two-way intent is limited to **R = first actual billing date**, **U/V/W = Follow 1/2/3**, with outbound facts sourced only from confirmed Sent evidence. Drafts, remittance, replies, API errors and missing rows do not establish actual sends or settlement.
- Inbound tracking values retain source/provenance and raw Thai **Y** status text. Unmapped statuses require review rather than silent translation into AR state. Credit terms and formula/reference cells are not an outbound edit surface.
- Exact Hotel/Account/Invoice matching, reviewed bootstrap snapshot, revision checks, ambiguity holds and conflict review precede acceptance. Preserve first actual billing evidence and prevent duplicate facts/writes.
- Current AgingMaster **1.0.6 remains unchanged**; this integration does not impose a new executable or all-PC upgrade requirement. Earlier 1.0.7/1.0.8 delivery notes are historical to the separate conversion/correction work.

## Write constraints

Native outbound writes remain **held**: a synthetic Drive v2 whole-file import returned HTTP 412 but still changed native content. That tested route is not a safe conditional-write mechanism. This is not a completed Sheets API v4 conditional-cell test; enabling the API does not prove a safe row-bound update. Do not bypass that hold using a normal Sheets update or interpret provider success as proof that competing edits were protected. Confirmed dates can remain queued/held without claiming they were written.

The two exact CAS test objects were checked against their private creation journals, markers, ownership and current permissions, then moved to recoverable Trash with readback verification. Neither original tracker was a cleanup target; private probe evidence remains outside Git.

Phuket's XLSX provider has a separately gated conditional-write path; activation is pending proof and deployment configuration. Preserve full workbook content/formulas, exact identity and expected values, provider revision/strong-head checks, and uncertain-result reconciliation. Do not retry an uncertain upload or overwrite a changed source. All provider credentials remain server-side, with exact-target authorization and no credentialed arbitrary URL/redirect fetch.

## Implemented and tested locally

- Core frozen migration: `supabase/migrations/20261006090000_ar_tracker_sync.sql`, SHA-256 `d65c2668e0ddca7d305448472bfc04577c14b0bf6e1261953bb5802761cba5d4`.
- Final local replay passed **94 migrations** with expanded tracker rollback fixtures. Core browser checks passed **five cases at 1280/390 px**. Root's full suite passed **172 files / 1,614 tests** and production build. Provider focused tests passed **39 cases**. These are local/synthetic results, not production imports or provider writeback acceptance.
- Source surfaces: `worker/tracker-sync/`, Reports status/review controls, register revision refresh and private SQL migration. Existing Reports link authentication and regional boundaries remain relevant; a link opening alone does not prove a tracker connection.

## Remaining live acceptance

1. Migration/deployment checks above are complete. Preserve their exact schema/source and private grants while completing remaining live original-file behavior acceptance.
2. Verify the preparation-enabled runtime and exact-original authorization UI without claiming a connection from the link or enabled flag alone.
3. Authorize each exact original file with the existing provider credential context; verify title/MIME/identity, stable snapshot, required headers and row membership.
4. Review and explicitly confirm the bootstrap import against its snapshot hash; changed snapshots require fresh preview. Verify inbound provenance/raw Y, conflicts, first-billing rules and collection/report projection.
5. Enable only proven capabilities. Test confirmed-Sent queueing, duplicates, concurrent edits, conditional conflicts and uncertain outcomes. Native outbound remains held until a safe method is separately demonstrated.

No live tracker connection, bootstrap import, financial workflow change or provider write is claimed at this checkpoint. Runtime deployment/preparation enablement is distinct from connected synchronization. Record subsequent live evidence separately without IDs, customer rows, secrets, private screenshots or test recipients in Git.
