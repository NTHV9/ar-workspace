import type {RemittanceAccount,RemittanceHistory,RemittanceInvoiceList,RemittanceList,RemittanceSummary} from '../../src/remittance/model';
import {checkedRemittanceRecord,checkedRemittanceRow,remittanceFileRequest,remittanceFileRpc,remittanceLimits,type RemittanceFilesEnv} from './files';
import {runRemittanceDiagnostic} from './diagnostic';
import {parseRemittanceDiagnostic,parseRemittanceFilters,parseRemittanceHistoryQuery,parseRemittanceId,parseRemittanceInput,parseRemittanceInvoiceQuery,parseRemittanceStatus,readRemittanceJson} from './validation';

export type RemittanceApiEnv=RemittanceFilesEnv;
const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const errors:Record<string,[number,string]>={
 unauthorized:[401,'Sign in again to access remittance records.'],
 forbidden:[403,'This request is not permitted from this page.'],
 remittance_forbidden:[403,'Your account cannot access this remittance record.'],
 not_found:[404,'This remittance route does not exist.'],
 method_not_allowed:[405,'This action is not supported on this remittance route.'],
 remittance_invalid:[400,'Review the remittance fields and try again.'],
 remittance_id_invalid:[400,'The record or command identifier is invalid.'],
 remittance_revision_invalid:[400,'Reload the record before confirming this change.'],
 remittance_confirmation_required:[400,'Review and confirm this action before continuing.'],
 remittance_amount_invalid:[400,'Enter a nonnegative THB amount with at most two decimal places. Leave unknown amounts blank.'],
 remittance_scope_invalid:[400,'Select one exact Hotel and Account for this notice.'],
 remittance_date_invalid:[400,'Enter a real received date that is not after today in Thailand.'],
 remittance_future_received_date:[400,'The received date cannot be after today in Thailand.'],
 remittance_reference_required:[400,'Enter a record reference of no more than 200 characters.'],
 remittance_reason_required:[400,'Enter a reason for this change, up to 1,000 characters.'],
 remittance_change_reason_required:[400,'Enter a reason for correcting this record.'],
 remittance_lines_invalid:[400,'Select at least one valid invoice identity from this Account.'],
 remittance_duplicate_invoice:[400,'An invoice is listed more than once. Keep each invoice once per notice.'],
 remittance_too_many_lines:[413,'This request exceeds the 5,000 invoice resource guard. No lines were truncated.'],
 remittance_request_too_large:[413,'This request exceeds the 1 MiB command resource guard. Nothing was truncated.'],
 remittance_allocation_exceeded:[400,'Known invoice allocations exceed the reported notice total.'],
 remittance_allocation_overflow:[400,'Known invoice allocations exceed the reported notice total.'],
 remittance_status_invalid:[400,'Choose either void or restore for this record.'],
 remittance_query_invalid:[400,'Review the filters, date range and pagination, then try again.'],
 remittance_missing:[404,'This remittance record could not be found.'],
 remittance_revision_conflict:[409,'This record changed after you opened it. Keep your edits, reload the current record and review again.'],
 remittance_command_conflict:[409,'This command ID was already used with different details. Review the recorded result before starting another action.'],
 remittance_scope_immutable:[409,'Hotel and Account cannot be changed. Void this notice with a reason and create the corrected notice.'],
 remittance_invoice_invalid:[409,'A selected invoice is no longer eligible for this Hotel and Account. Review the invoice selection.'],
 remittance_source_unverified:[409,'An invoice source balance is unverified. Refresh and review it before adding a new link.'],
 remittance_pending_upload:[409,'A file upload is pending. Retry or remove it before editing or voiding this record.'],
 remittance_voided:[409,'Restore this voided record before changing it.'],
 remittance_file_limit:[413,'This upload exceeds the configured file count or total size limit.'],
 remittance_file_conflict:[409,'This file ID belongs to different bytes or metadata. Retry the original file or choose a new file ID.'],
 remittance_file_missing:[404,'This supporting file could not be found.'],
 remittance_file_pending:[409,'This file upload is pending. Retry it with the same file ID.'],
 remittance_file_removed:[409,'This file was removed. Restore the retained evidence or upload a new file.'],
 remittance_file_unavailable:[503,'The private supporting file is unavailable. Keep its file ID and retry.'],
 remittance_not_configured:[503,'Remittance service configuration is unavailable.'],
 remittance_response_too_large:[503,'The service response exceeded its resource guard. No results were truncated.'],
 remittance_storage_unavailable:[503,'Private file storage is unavailable. Keep this upload and retry with the same file ID.'],
 remittance_upload_pending:[503,'The upload outcome is uncertain. Retry the same file with the same file ID.'],
 remittance_checksum_mismatch:[409,'Stored file bytes did not match the saved checksum. This file was not accepted.'],
 remittance_file_bytes_missing:[404,'The saved file bytes are unavailable.'],
 remittance_file_invalid:[400,'This supporting file failed validation. Use a static PDF, PNG or JPEG.'],
 remittance_file_not_ready:[409,'This file is not ready for download or restoration.'],
 remittance_file_reupload_required:[409,'This removed upload has no retained bytes. Upload it with a new file ID.'],
 remittance_file_too_large:[413,'This file exceeds the configured upload size limit.'],
 remittance_file_name_invalid:[400,'Use a valid PDF, PNG or JPEG filename.'],
 remittance_file_unsupported:[400,'Supporting evidence must be a static PDF, PNG or JPEG file.'],
 remittance_file_type_mismatch:[400,'The file contents do not match the declared file type.'],
 remittance_file_active_pdf:[400,'This PDF contains active content. Export a static PDF before uploading it.'],
 remittance_file_pdf_complexity:[400,'This PDF exceeds the file inspection complexity guard. Export a simpler static PDF.'],
 remittance_file_image_too_large:[413,'This image exceeds the supported pixel dimensions.'],
 remittance_file_animated_image:[400,'Animated images are not supported. Use a static PNG or JPEG.'],
 remittance_diagnostic_failed:[503,'The isolated connection test did not pass. Business records were not used.'],
 remittance_unavailable:[503,'Remittance data is unavailable. Keep your form and command ID, then retry or check the command result.'],
};
function errorResponse(error:unknown):Response {
 const requested=error instanceof Error?error.message:'';
 const code=Object.hasOwn(errors,requested)?requested:'remittance_unavailable';
 const [status,message]=errors[code];return json({error:code,message},status);
}
const unavailable=():never=>{throw Error('remittance_unavailable');};
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))return unavailable();return value as Record<string,unknown>;}
function string(value:unknown):string {if(typeof value!=='string')return unavailable();return value;}
function nullableString(value:unknown):string|null {return value===null?null:string(value);}
function bool(value:unknown):boolean {if(typeof value!=='boolean')return unavailable();return value;}
function count(value:unknown):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return unavailable();return value;}
function money(value:unknown):string {if(typeof value!=='string'||!/^(-?)(0|[1-9][0-9]*)\.[0-9]{2}$/.test(value))return unavailable();return value;}
function nullableMoney(value:unknown):string|null {return value===null?null:money(value);}
function checkedSummary(value:unknown):RemittanceSummary {
 const v=object(value);return {documents:count(v.documents),invoices:count(v.invoices),reportedAmount:nullableMoney(v.reportedAmount),knownReportedAmount:money(v.knownReportedAmount),unspecifiedAmounts:count(v.unspecifiedAmounts),linkedOpen:nullableMoney(v.linkedOpen),knownLinkedOpen:money(v.knownLinkedOpen),unverifiedInvoices:count(v.unverifiedInvoices)};
}
function checkedList(value:unknown):RemittanceList {
 const v=object(value);if(!Array.isArray(v.rows))return unavailable();return {rows:v.rows.map(checkedRemittanceRow),total:count(v.total),summary:checkedSummary(v.summary)};
}
function checkedAccounts(value:unknown):RemittanceAccount[] {
 const v=object(value);if(!Array.isArray(v.accounts))return unavailable();
 return v.accounts.map(item=>{const a=object(item);if(a.hotel!=='KAT'&&a.hotel!=='TSK')return unavailable();return {hotel:a.hotel,accountId:string(a.accountId),name:string(a.name),type:string(a.type),accountNo:nullableString(a.accountNo),verified:bool(a.verified)};});
}
function checkedInvoices(value:unknown):RemittanceInvoiceList {
 const v=object(value);if(!Array.isArray(v.rows))return unavailable();
 return {total:count(v.total),rows:v.rows.map(item=>{const r=object(item);return {invoiceId:string(r.invoiceId),invoiceNo:string(r.invoiceNo),folioNo:string(r.folioNo),guest:string(r.guest),transactionDate:string(r.transactionDate),currentOpen:nullableMoney(r.currentOpen),verified:bool(r.verified),eligible:bool(r.eligible),reason:nullableString(r.reason)};})};
}
function checkedHistory(value:unknown):RemittanceHistory {
 const v=object(value);if(!Array.isArray(v.rows))return unavailable();
 return {total:count(v.total),rows:v.rows.map(item=>{const row=object(item);if(!('snapshot' in row))return unavailable();return {revision:count(row.revision),action:string(row.action),reason:string(row.reason),recordedAt:string(row.recordedAt),snapshot:row.snapshot};})};
}
function noQuery(params:URLSearchParams) {if(params.size)throw Error('remittance_query_invalid');}
function method(request:Request,allowed:string[]) {return allowed.includes(request.method)?null:json({error:'method_not_allowed',message:errors.method_not_allowed[1]},405,{Allow:allowed.join(', ')});}

/** The main Worker authenticates the bearer token; every RPC independently checks the actor. */
export async function remittanceApi(request:Request,env:RemittanceApiEnv,actor:string):Promise<Response> {
 try {
  try{actor=parseRemittanceId(actor);}catch{throw Error('unauthorized');}
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(request.method!=='GET'&&((origin!==null&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site'))throw Error('forbidden');
  const path=url.pathname;
  if(path!=='/api/remittances'&&!path.startsWith('/api/remittances/'))throw Error('not_found');
  const parts=path==='/api/remittances'?[]:path.slice('/api/remittances/'.length).split('/');
  const rpc=(name:string,args:Record<string,unknown>={})=>remittanceFileRpc(env,name,{p_actor:actor,...args});
  if(parts.length===0){const denied=method(request,['GET']);if(denied)return denied;return json(checkedList(await rpc('ar_remittance_list',{p_filters:parseRemittanceFilters(url.searchParams)})));}
  if(parts.length===1&&parts[0]==='options'){
   const denied=method(request,['GET']);if(denied)return denied;noQuery(url.searchParams);
   const config=remittanceLimits(env),result=object(await rpc('ar_remittance_options')),accounts=checkedAccounts(result);
   if(result.accountTypes!==undefined&&!Array.isArray(result.accountTypes))return unavailable();
   const accountTypes=result.accountTypes===undefined?[...new Set(accounts.map(account=>account.type))]:(result.accountTypes as unknown[]).map(string);
   return json({accounts,accountTypes,config});
  }
  if(parts.length===1&&parts[0]==='invoices'){
   const denied=method(request,['GET']);if(denied)return denied;const q=parseRemittanceInvoiceQuery(url.searchParams);
   return json(checkedInvoices(await rpc('ar_remittance_invoices',{p_hotel:q.hotel,p_account:q.accountId,p_search:q.search,p_offset:q.offset,p_limit:q.limit})));
  }
  if(parts.length===1&&parts[0]==='diagnostic'){
   const denied=method(request,['POST']);if(denied)return denied;noQuery(url.searchParams);
   const input=parseRemittanceDiagnostic(await readRemittanceJson(request));return json(await runRemittanceDiagnostic(env,actor,input.commandId));
  }
  if(parts.length===2&&parts[0]==='commands'){
   const commandId=parseRemittanceId(parts[1]);const denied=method(request,['GET']);if(denied)return denied;noQuery(url.searchParams);
   const value=await rpc('ar_remittance_command_get',{p_command:commandId});if(value===null)return json({complete:false});
   const result=object(value);if(!bool(result.complete))return json({complete:false});
   let recordId:string;try{recordId=parseRemittanceId(result.recordId);}catch{return unavailable();}
   const revision=count(result.revision);if(revision<1)return unavailable();
   return json({complete:true,recordId,revision});
  }
  const id=parseRemittanceId(parts[0]);
  if(parts.length===1){
   const denied=method(request,['GET','PUT']);if(denied)return denied;noQuery(url.searchParams);
   const result=request.method==='GET'?await rpc('ar_remittance_get',{p_id:id}):await rpc('ar_remittance_save',{p_id:id,p_input:parseRemittanceInput(await readRemittanceJson(request))});
   if(result===null)throw Error(request.method==='GET'?'remittance_missing':'remittance_unavailable');
   const record=checkedRemittanceRecord(result);if(record.id!==id)return unavailable();return json(record);
  }
  if(parts.length===2&&parts[1]==='history'){
   const denied=method(request,['GET']);if(denied)return denied;const q=parseRemittanceHistoryQuery(url.searchParams);
   return json(checkedHistory(await rpc('ar_remittance_history',{p_id:id,p_offset:q.offset,p_limit:q.limit})));
  }
  if(parts.length===2&&parts[1]==='status'){
   const denied=method(request,['POST']);if(denied)return denied;noQuery(url.searchParams);const input=parseRemittanceStatus(await readRemittanceJson(request));
   const record=checkedRemittanceRecord(await rpc('ar_remittance_set_status',{p_id:id,p_command:input.commandId,p_revision:input.revision,p_status:input.status,p_reason:input.reason}));
   if(record.id!==id)return unavailable();return json(record);
  }
  if((parts.length===3||parts.length===4&&parts[3]==='restore')&&parts[1]==='files'){
   const fileId=parseRemittanceId(parts[2]),restore=parts.length===4;const denied=method(request,restore?['POST']:['GET','POST','DELETE']);if(denied)return denied;
   if(request.method!=='POST'||restore)noQuery(url.searchParams);
   else for(const key of url.searchParams.keys())if(!['name','revision'].includes(key))throw Error('remittance_query_invalid');
   const result=await remittanceFileRequest(request,env,actor,id,fileId,restore);return result instanceof Response?result:json(result);
  }
  throw Error('not_found');
 }catch(error){return errorResponse(error);}
}
