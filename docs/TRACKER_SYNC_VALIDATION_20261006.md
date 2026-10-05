# Partial tracker integration — validation checkpoint, 6 October 2026

Status: implemented and tested locally; database migration, runtime deployment, connection and activation remain pending. Google Sheets API is enabled on the confirmed AR project. Supabase authentication confirmed the correct project and absence of the tracker schema; that is a preflight result, not an applied migration or live connection.

## Authorized scope

- Preserve the original Phuket **XLSX file identity** and the existing Khao Lak native file. Exact IDs remain in private configuration. No copy adoption, conversion or sharing change is part of this integration.
- Partial two-way intent is limited to **R = first actual billing date**, **U/V/W = Follow 1/2/3**, with outbound facts sourced only from confirmed Sent evidence. Drafts, remittance, replies, API errors and missing rows do not establish actual sends or settlement.
- Inbound tracking values retain source/provenance and raw Thai **Y** status text. Unmapped statuses require review rather than silent translation into AR state. Credit terms and formula/reference cells are not an outbound edit surface.
- Exact Hotel/Account/Invoice matching, reviewed bootstrap snapshot, revision checks, ambiguity holds and conflict review precede acceptance. Preserve first actual billing evidence and prevent duplicate facts/writes.
- Current AgingMaster **1.0.6 remains unchanged**; this integration does not impose a new executable or all-PC upgrade requirement. Earlier 1.0.7/1.0.8 delivery notes are historical to the separate conversion/correction work.

## Write constraints

Native outbound writes remain **held**: a failed compare-and-swap attempt was shown to have a side effect, so the native path is not accepted as a safe conditional-write mechanism. Do not bypass that hold using a normal Sheets update or interpret provider success as proof that competing edits were protected. Confirmed dates can remain queued/held without claiming they were written.

Phuket's XLSX provider has a separately gated conditional-write path; activation is pending proof and deployment configuration. Preserve full workbook content/formulas, exact identity and expected values, provider revision/strong-head checks, and uncertain-result reconciliation. Do not retry an uncertain upload or overwrite a changed source. All provider credentials remain server-side, with exact-target authorization and no credentialed arbitrary URL/redirect fetch.

## Implemented and tested locally

- Core frozen migration: `supabase/migrations/20261006090000_ar_tracker_sync.sql`, SHA-256 `d65c2668e0ddca7d305448472bfc04577c14b0bf6e1261953bb5802761cba5d4`.
- Final local replay passed **94 migrations** with expanded tracker rollback fixtures. Core browser checks passed **five cases at 1280/390 px**. Root's full suite passed **172 files / 1,614 tests** and production build. Provider focused tests passed **39 cases**. These are local/synthetic results, not production imports or provider writeback acceptance.
- Source surfaces: `worker/tracker-sync/`, Reports status/review controls, register revision refresh and private SQL migration. Existing Reports link authentication and regional boundaries remain relevant; a link opening alone does not prove a tracker connection.

## Remaining live acceptance

1. Apply the exact reviewed migration to the confirmed Supabase project; verify private access grants, schema fingerprint and existing workflow/report behavior without importing customer state implicitly.
2. Deploy the reviewed runtime with existing bindings preserved. Verify source health, regional authorization and disabled/unavailable behavior before activation.
3. Authorize each exact original file with the existing provider credential context; verify title/MIME/identity, stable snapshot, required headers and row membership.
4. Review and explicitly confirm the bootstrap import against its snapshot hash; changed snapshots require fresh preview. Verify inbound provenance/raw Y, conflicts, first-billing rules and collection/report projection.
5. Enable only proven capabilities. Test confirmed-Sent queueing, duplicates, concurrent edits, conditional conflicts and uncertain outcomes. Native outbound remains held until a safe method is separately demonstrated.

No live tracker connection, import, financial workflow change, provider write or runtime activation is claimed at this checkpoint. Record subsequent live evidence separately without IDs, customer rows, secrets, private screenshots or test recipients in Git.
