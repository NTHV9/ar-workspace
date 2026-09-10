# Remittance records and evidence

Owner approved this next increment and explicitly confirmed one hotel and one Account per notice. PRODUCT_SPEC 12/13/17 and current decisions govern behavior. Extend the incumbent Luminous interface; supporting-surfaces-v1.png and Account Detail are visual references, not old business rules.

## Behavior

A notice records received date in Thailand, a human-readable record reference, source note, general notes, optional reported total, and one or more exact Invoice identities in the same Hotel/Account. Optional per-invoice reported allocations remain blank when the notice does not specify them. A blank amount is unknown, never zero. Reported total is counted once per notice; linked invoice/open totals are deduplicated across notices in summaries.

The owner-confirmed single scope is immutable after creation. To correct a wrong scope, void the notice with a reason and create the correct one. Ordinary corrections require an explicit reason and retain version history. Void/restore is recoverable and does not delete evidence. There is no operation that changes OPERA balances, workflow dates/stages/holds, cash receipts or sent KPIs.

New invoice links require verified standalone/parent identities with nonnegative saved OPERA balance. Verified zero rows may be linked for late/historical notices; compressed children cannot be counted as separate debt. Previously linked missing/unverified rows remain visible as needs review, not zero. Current linked-zero means only that all linked saved OPERA balances are verified zero; it does not assert cash collection or that this notice caused settlement. Show source timestamps.

Known per-line allocations cannot exceed a known notice total. Any difference is unallocated reported amount, not unpaid cash. Unknown allocations or partial settlement never produce an inferred remaining payment. A notice can have a known total and no line allocations.

Views: Pending (all received dates; active notices with open/unknown linked balances), Received activity (explicit received-date range), and All records (including linked zero; optional voided). Hotel/Account Type/Account/reference filters and pagination apply consistently. Summary separates notice count, unique linked invoices, known/unknown reported amounts, and unique verified/unknown OPERA open balance. Keep no cash-collected metric. Historical notice data stays when linked balances later reach zero.

Optional supporting static PDF/PNG/JPEG evidence is uploaded after saving the notice, using the existing private Supabase bucket and file inspection. No HTML/remote image execution, no arbitrary credentialed fetch, no email send or Drive auto-archive. Explicit download checks owner and checksum. Removing evidence is a recoverable metadata removal, with bytes retained while retention is undecided. Pending uploads can be retried with the same file ID or explicitly removed; record edits/void are blocked during pending upload so proof cannot silently attach to changed metadata.

All writes use command IDs, expected revision, owner checks and explicit review/confirmation. Unknown outcomes retain the same command and form; never retry as a new record automatically. An exact repeat returns its recorded result even if later edits advanced the notice; the UI fetches current state when needed. No financial/customer data or test recipient in Git.

## Validation and live proof

Use synthetic browser fixtures for create/edit/void/restore, paginated invoice selection, unknown allocations, overlapping notices, missing/zero source data, upload errors and responsive layouts. Database tests use synthetic Hotel/Account/Invoice/notice rows in a subtransaction that rolls back before returning; production customer rows are never test inputs. A dedicated authenticated diagnostic reuses the database save/read/status routines in that subtransaction, then uploads/reads a fixed synthetic PDF in an isolated private diagnostic path and records only its receipt. That tiny test artifact is retained; there is no automatic file purge.

## API and contracts

Shared models are in src/remittance/model.ts. All routes are authenticated in the existing Worker, with service-only RPCs validating the actor again.

- GET /api/remittances/options -> RemittanceOptions (all account options, configurable file resource limits).
- GET /api/remittances/invoices?hotel=KAT&accountId=...&search=...&page=0&limit=50 -> RemittanceInvoiceList.
- GET /api/remittances?view=pending|activity|all&hotel=...&accountId=...&type=...&search=...&from=YYYY-MM-DD&to=...&includeVoided=false&page=0&limit=50 -> RemittanceList. Dates affect activity only.
- GET /api/remittances/:id -> RemittanceRecord. GET /:id/history?page=0&limit=20 -> RemittanceHistory.
- PUT /api/remittances/:id with RemittanceInput; revision0 creates, later revisions correct the record. Returns RemittanceRecord.
- POST /:id/status {commandId,revision,status:'active'|'voided',reason,confirmed:true} -> RemittanceRecord.
- GET /api/remittances/commands/:commandId -> {complete:boolean,recordId?:string,revision?:number}; missing is unknown, not proof of failure.
- POST /:id/files/:fileId?revision=N&name=... raw file bytes -> RemittanceRecord. GET same -> checksum-verified private bytes. DELETE same {commandId,revision,reason,confirmed:true} -> soft removal and RemittanceRecord.
- POST /:id/files/:fileId/restore {commandId,revision,reason,confirmed:true} verifies retained bytes before restoring the evidence link. A removed incomplete upload without stored bytes must be uploaded under a new file ID instead.
- POST /api/remittances/diagnostic {commandId,confirmed:true} -> RemittanceDiagnostic. No real notice survives this test; diagnostic file receipts use a separate private table/path and never enter business summaries.

Money is sent as decimal strings and calculated as integer satang/SQL numeric. Validate dates strictly against the Thai calendar (received date cannot be future). IDs and hotel scopes are exact; no automatic match by guest, invoice number, amount or similar account name.

## RPC contract for implementation

Every function is public service-only, security definer with empty search_path and an independent approved-actor check; underlying records remain inaccessible to direct client writes. Error results are {error:string}.

| Function | Arguments after p_actor uuid | Result |
|---|---|---|
| ar_remittance_options | none | {accounts:RemittanceAccount[]} |
| ar_remittance_invoices | p_hotel text,p_account text,p_search text,p_offset int,p_limit int | RemittanceInvoiceList |
| ar_remittance_list | p_filters jsonb (view,hotel,accountId,type,search,from,to,includeVoided,offset,limit) | RemittanceList |
| ar_remittance_get | p_id uuid | RemittanceRecord or null |
| ar_remittance_history | p_id uuid,p_offset int,p_limit int | RemittanceHistory |
| ar_remittance_save | p_id uuid,p_input jsonb (normalized RemittanceInput) | RemittanceRecord |
| ar_remittance_set_status | p_id uuid,p_command uuid,p_revision int,p_status text,p_reason text | RemittanceRecord |
| ar_remittance_command_get | p_command uuid | {complete:boolean,recordId?:uuid,revision?:int} |
| ar_remittance_file_begin | p_id uuid,p_revision int,p_file jsonb (id,name,mime,byteCount,sha256,inspection),p_limits jsonb (config) | {file:RemittanceFile & {storageKey:string},record:RemittanceRecord} |
| ar_remittance_file_finish | p_id uuid,p_file_id uuid,p_sha256 text | RemittanceRecord |
| ar_remittance_file_get | p_id uuid,p_file_id uuid | RemittanceFile & {storageKey:string}, including removed metadata for verified restoration |
| ar_remittance_file_status | p_id uuid,p_file_id uuid,p_command uuid,p_revision int,p_restore boolean,p_reason text,p_limits jsonb | RemittanceRecord |
| ar_remittance_diagnostic_check | none | {passed:boolean,rolledBack:boolean,checks:int} |
| ar_remittance_diagnostic_begin | p_command uuid,p_file jsonb (name,mime,byteCount,sha256) | {storageKey:string,verified:boolean,byteCount:number,sha256:string} |
| ar_remittance_diagnostic_finish | p_command uuid | {passed:boolean,byteCount:number,sha256:string,retained:true} |

File begin never increments notice revision until finish. Pending reservations block ordinary save/void; overlapping file finishes increment the current revision, never overwrite it. File IDs and uploaded metadata are immutable. Restoring evidence checks retained bytes first and rechecks the expected notice revision atomically. No delete API is called on Supabase Storage.

The file-count limit applies to active pending/ready links. The total-byte limit includes all retained/reserved file metadata, including removed links; unlinking evidence does not release retained storage quota. Restoring an existing file does not add its already-retained bytes a second time. Exact completed restore commands replay the recorded result before Storage access, while new restores still require byte verification.

List rows use RemittanceRow: omit lines/files rather than loading every invoice/file for every page row. Expose invoiceCount/fileCount/pendingFiles. Detail, edit and evidence actions load GET /:id for the complete RemittanceRecord; no UI may interpret omitted lines as an empty notice. Historical Account name/type are captured at creation and retained; filters use that recorded type for consistency across activity and pending views.

Showing voided records is for audit. Summary values always exclude voided records, even when those rows are visible; row total remains the pagination count. Pending always includes only active notices, over all received dates.
