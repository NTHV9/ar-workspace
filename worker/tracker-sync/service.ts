import {backendRpc,type RefreshEnv} from '../refresh/backend';
import type {ReportSheetLinksEnv} from '../reports/sheet-links';
import type {DriveEnv} from '../drive/shared';
import type {RegionId,HotelId} from '../../src/domain/hotels';
import {canResolveWithoutAccountNumber,type TrackerValues,type TrackerField} from './model';
import {trackerIdentityMatches} from './native';
import {OperaError} from '../opera/client';
import {syncMissingSentRows,type SentAppendInput,type SentAppendResult} from './append';
import {syncCreditTerms} from './credit';

type SyncPhase='provider_read'|'validate'|'snapshot_import'|'membership'|'credit'|'outbox'|'write_result'|'provider_write'|'finish';
const syncErrorCodes=new Set([
 'invalid_configuration','invalid_request','redirect_rejected','provider_unavailable','provider_unauthorized','provider_rejected','response_too_large','invalid_response','timeout','duplicate_member','pagination_incomplete','pagination_changed',
 'tracker_target_conflict','tracker_authorization_required','tracker_provider_unavailable','tracker_snapshot_changed','tracker_schema_unverified','tracker_intent_not_confirmed',
 'tracker_workbook_invalid','tracker_workbook_too_large','tracker_row_identity_ambiguous','tracker_row_identity_invalid','tracker_row_key_ambiguous','tracker_schema_ambiguous',
 'tracker_native_cell_invalid','tracker_native_date_invalid','tracker_native_identity_ambiguous','tracker_native_identity_invalid','tracker_native_schema_invalid',
 'tracker_native_keys_too_large','tracker_native_grid_too_large','tracker_credit_invalid',
 'drive_response_too_large','drive_unavailable','drive_invalid','drive_not_configured','budget_database_exceeded','retention_busy',
]);
function logSyncFailure(region:RegionId,phase:SyncPhase,error:unknown){
 const candidate=error instanceof DOMException&&error.name==='TimeoutError'?'timeout':error instanceof OperaError?error.code:error instanceof Error?error.message:'';
 const code=syncErrorCodes.has(candidate)?candidate:'unknown_error';
 const upstreamStatus=error instanceof OperaError&&Number.isSafeInteger(error.upstreamStatus)&&Number(error.upstreamStatus)>=100&&Number(error.upstreamStatus)<=599?error.upstreamStatus:undefined;
 // Static context only: never serialize the error, its cause, provider details,
 // sheet identifiers, versions, row identities or business values.
 console.error(JSON.stringify({event:'tracker_sync_failure',region,phase,code,...(upstreamStatus!==undefined?{upstreamStatus}:{})}));
}

export interface TrackerEnv extends RefreshEnv,ReportSheetLinksEnv,DriveEnv {TRACKER_SYNC_ENABLED?:string;TRACKER_BLOB_CAS_ENABLED?:string;TRACKER_NATIVE_BEST_EFFORT_ENABLED?:string;TRACKER_SENT_ROW_APPEND_ENABLED?:string;TRACKER_CREDIT_FILL_ENABLED?:string}
export interface ProviderRow {rowKey:string;hotel:HotelId;accountNo:string;invoiceNo:string;folio:string|null;folioNo?:string|null;transactionDate?:string|null;agent?:string;property?:string;fields:TrackerValues;locator:unknown;issues?:string[];formulaFields?:TrackerField[];blockedWriteFields?:('R'|'S'|'U'|'V'|'W')[]}
export interface ProviderSnapshot {version:string;rows:ProviderRow[];schemaFingerprint:string;capabilities:{conditionalWrite:'proven'|'unsupported'|'unverified';writeAssurance?:'cas'|'best-effort'|'held'}}
export interface ProviderWrite {version:string;rowKey:string;expectedIdentity:Omit<ProviderRow,'fields'|'locator'|'rowKey'>;locator:unknown;changes:{field:TrackerField;value:string|null;expected:string|null}[]}
export interface TrackerAdapter {
 appendSentRow?(env:TrackerEnv,owner:string,region:RegionId,fileId:string,input:SentAppendInput):Promise<SentAppendResult>;
 read(env:TrackerEnv,owner:string,region:RegionId,fileId:string):Promise<ProviderSnapshot>;
 write(env:TrackerEnv,owner:string,region:RegionId,fileId:string,input:ProviderWrite):Promise<{status:'written'|'conflict'|'uncertain';version?:string}>;
 writeBatch?(env:TrackerEnv,owner:string,region:RegionId,fileId:string,inputs:readonly ProviderWrite[]):Promise<{status:'written'|'conflict'|'uncertain';version?:string}>;
}
export const trackerFile=(env:TrackerEnv,region:RegionId)=>region==='phuket'?env.REPORT_SHEET_PHUKET_ID:env.REPORT_SHEET_KHAOLAK_ID;
function normalizedRows(snapshot:ProviderSnapshot){
 const identityCounts=new Map<string,number>(),key=(r:ProviderRow)=>JSON.stringify([r.hotel,r.accountNo,r.invoiceNo,r.folio]);
 for(const row of snapshot.rows)identityCounts.set(key(row),(identityCounts.get(key(row))??0)+1);
 const corroboratingKey=(r:ProviderRow)=>JSON.stringify([r.hotel,r.invoiceNo,r.folio??null,r.transactionDate??null]),corroboratingCounts=new Map<string,number>(),missingAccountGroups=new Set<string>();
 for(const row of snapshot.rows){const k=corroboratingKey(row);corroboratingCounts.set(k,(corroboratingCounts.get(k)??0)+1);if(canResolveWithoutAccountNumber(row))missingAccountGroups.add(k);}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return snapshot.rows.map(row=>{
  const fieldHolds=new Set((row.issues??[]).flatMap(issue=>/^([A-Z]{1,2})_invalid$/.exec(issue)?.[1]??[]));
  for(const field of ['R','U','V','W','X']){const date=row.fields[field as TrackerField];if(date!==null&&date!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||field!=='X'&&date>today))fieldHolds.add(field);}
  const received=row.fields.Z,invalidAmount=received!==null&&received!==undefined&&!/^\d{1,14}(?:\.\d{1,2})?$/.test(received);
  const term=row.fields.S;if(term!==null&&term!==undefined&&(!/^\d{1,4}(?:\.\d+)?$/.test(term)||!Number.isInteger(Number(term))||Number(term)>3650))fieldHolds.add('S');
  if(invalidAmount)fieldHolds.add('Z');if((row.fields.AB?.length??0)>4000)fieldHolds.add('AB');if((row.fields.AC?.length??0)>160)fieldHolds.add('AC');
  const missingAccountAllowed=canResolveWithoutAccountNumber(row);
  const identityIssue=(row.issues??[]).some(issue=>!/^([A-Z]{1,2})_invalid$/.test(issue)&&!(issue==='account_missing'&&missingAccountAllowed));
  const completeCorroboration=!!row.folio&&!!row.transactionDate&&/^\d{4}-\d{2}-\d{2}$/.test(row.transactionDate)&&Number.isFinite(Date.parse(row.transactionDate))&&new Date(row.transactionDate+'T00:00:00Z').toISOString().slice(0,10)===row.transactionDate;
  return {...row,ambiguous:identityCounts.get(key(row))!==1||(completeCorroboration||missingAccountGroups.has(corroboratingKey(row)))&&corroboratingCounts.get(corroboratingKey(row))!==1,fieldHolds:[...fieldHolds],holdReason:identityIssue?'provider_identity_requires_review':(!row.accountNo&&!missingAccountAllowed)||!row.invoiceNo?'incomplete_identity':null};
 });
}
export async function trackerSnapshotHash(snapshot:ProviderSnapshot){
 const bytes=new TextEncoder().encode(JSON.stringify({schema:snapshot.schemaFingerprint,rows:normalizedRows(snapshot)}));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function previewTracker(env:TrackerEnv,actor:string,owner:string,region:RegionId,adapter:TrackerAdapter){
 const fileId=trackerFile(env,region);if(!fileId)throw Error('tracker_target_conflict');
 const snapshot=await adapter.read(env,owner,region,fileId);validateTrackerSnapshot(snapshot);
 return backendRpc(env,'ar_tracker_preview',{p_actor:actor,p_region:region,p_file_id:fileId,p_version:snapshot.version,p_hash:await trackerSnapshotHash(snapshot),p_rows:normalizedRows(snapshot)});
}
export async function confirmTrackerPreview(env:TrackerEnv,actor:string,owner:string,region:RegionId,adapter:TrackerAdapter,id:string,hash:string){
 const fileId=trackerFile(env,region);if(!fileId)throw Error('tracker_target_conflict');
 const snapshot=await adapter.read(env,owner,region,fileId);validateTrackerSnapshot(snapshot);
 if(await trackerSnapshotHash(snapshot)!==hash)throw Error('tracker_preview_changed');
 return backendRpc(env,'ar_tracker_confirm_preview',{p_actor:actor,p_region:region,p_id:id,p_hash:hash,p_version:snapshot.version});
}
export function validateTrackerSnapshot(snapshot:ProviderSnapshot){
 if(!snapshot.version||!snapshot.schemaFingerprint||!Array.isArray(snapshot.rows)||snapshot.rows.length>100000||new Set(snapshot.rows.map(r=>r.rowKey)).size!==snapshot.rows.length)throw Error('tracker_schema_unverified');
}
/** Shared DB lease coalesces tabs/checks. Native best-effort uncertainty is
 * readback-only; conditional blob writes keep their existing CAS behavior. */
export async function syncTracker(env:TrackerEnv,actor:string,owner:string,region:RegionId,adapter:TrackerAdapter,force=false){
 const lock=crypto.randomUUID(),claim=await backendRpc<{status:string;fileId?:string}>(env,'ar_tracker_claim',{p_actor:actor,p_region:region,p_lock:lock,p_force:force});
 if(claim.status!=='claimed')return {status:claim.status};
 if(!claim.fileId||claim.fileId!==trackerFile(env,region))throw Error('tracker_target_conflict');
 let version:string|null=null,phase:SyncPhase='provider_read';
 try{
  let snapshot=await adapter.read(env,owner,region,claim.fileId);phase='validate';validateTrackerSnapshot(snapshot);
  const appended=await syncMissingSentRows(env,actor,owner,region,lock,claim.fileId,adapter,snapshot);
  if(appended.changed){snapshot=await adapter.read(env,owner,region,claim.fileId);validateTrackerSnapshot(snapshot);}version=snapshot.version;
  let rows=normalizedRows(snapshot);
  phase='snapshot_import';
  for(let offset=0;offset<rows.length;offset+=500)await backendRpc(env,'ar_tracker_snapshot',{p_actor:actor,p_region:region,p_lock:lock,p_rows:rows.slice(offset,offset+500)});
  phase='membership';
  await backendRpc(env,'ar_tracker_membership',{p_actor:actor,p_region:region,p_lock:lock,p_keys:snapshot.rows.map(r=>r.rowKey)});
  phase='credit';const credit=await syncCreditTerms(env,actor,owner,region,lock,claim.fileId,adapter,snapshot,rows);
  if(credit.changed){
   phase='provider_read';snapshot=await adapter.read(env,owner,region,claim.fileId);phase='validate';validateTrackerSnapshot(snapshot);version=snapshot.version;rows=normalizedRows(snapshot);
   phase='snapshot_import';for(let offset=0;offset<rows.length;offset+=500)await backendRpc(env,'ar_tracker_snapshot',{p_actor:actor,p_region:region,p_lock:lock,p_rows:rows.slice(offset,offset+500)});
   phase='membership';await backendRpc(env,'ar_tracker_membership',{p_actor:actor,p_region:region,p_lock:lock,p_keys:snapshot.rows.map(r=>r.rowKey)});
  }
  phase='outbox';
  const pending=await backendRpc<{id:string;rowKey:string;identity:ProviderWrite['expectedIdentity'];locator:unknown;field:TrackerField;value:string|null;expected:string|null;state:string}[]>(env,'ar_tracker_outbox',{p_actor:actor,p_region:region,p_lock:lock});
  const eligible:typeof pending=[];
  const record=async(item:typeof pending[number],state:'written'|'conflict'|'uncertain'|'held')=>{phase='write_result';return backendRpc<{state?:string}>(env,'ar_tracker_write_result',{p_actor:actor,p_region:region,p_lock:lock,p_id:item.id,p_state:state,p_expected:item.expected,p_value:item.value,p_version:version});};
  for(const item of pending){
   const row=rows.find(r=>r.rowKey===item.rowKey);
   // Exact readback also resolves a prior upload timeout without another write.
   let state:'written'|'conflict'|'uncertain'|'held';
   const nativeUncertain=region==='khao-lak'&&item.state==='uncertain';
   if(nativeUncertain){const exact=!!row&&trackerIdentityMatches(row,item.identity)&&!row.holdReason&&!row.ambiguous&&!row.fieldHolds.includes(item.field)&&!row.formulaFields?.includes(item.field)&&item.value!==null&&row.fields[item.field]===item.value;await record(item,exact?'written':'uncertain');continue;}
   if(!row||!trackerIdentityMatches(row,item.identity)||row.holdReason||row.ambiguous||row.fieldHolds.includes(item.field)||row.formulaFields?.includes(item.field)||item.value===null)state='conflict';
   else if(row.fields[item.field]===item.value)state='written';
   else if(row.blockedWriteFields?.some(f=>f===item.field))state='held';
   else if(region==='khao-lak'?env.TRACKER_NATIVE_BEST_EFFORT_ENABLED!=='true'||snapshot.capabilities.writeAssurance!=='best-effort':snapshot.capabilities.conditionalWrite!=='proven')state='held';
   else{eligible.push(item);continue;}
   await record(item,state);
  }
  const groups=new Map<string,ProviderWrite>();
  const contradictory=new Set<string>();
  for(const item of eligible){
   let group=groups.get(item.rowKey);if(!group){group={version,rowKey:item.rowKey,expectedIdentity:item.identity,locator:item.locator,changes:[]};groups.set(item.rowKey,group);}
   const prior=group.changes.find(c=>c.field===item.field);
   if(prior&&(prior.value!==item.value||prior.expected!==item.expected))contradictory.add(item.rowKey);
   else if(!prior)group.changes.push({field:item.field,value:item.value,expected:item.expected});
  }
  for(const item of eligible.filter(i=>contradictory.has(i.rowKey)))await record(item,'conflict');
  const attempted=eligible.filter(i=>!contradictory.has(i.rowKey)),inputs=[...groups.values()].filter(g=>!contradictory.has(g.rowKey));
  // Durably freeze every native intent before the first provider mutation. A
  // worker termination/result-RPC failure must not turn it into another POST.
  if(region==='khao-lak'&&inputs.length)for(const item of attempted){const intent=await record(item,'uncertain');if(intent.state!=='uncertain')throw Error('tracker_intent_not_confirmed');}
  if(inputs.length&&adapter.writeBatch){
   phase='provider_write';
   let result:{status:'written'|'conflict'|'uncertain';version?:string};
   try{result=await adapter.writeBatch(env,owner,region,claim.fileId,inputs);}catch{result={status:'uncertain'};}
   if(result.version)version=result.version;
   for(const item of attempted)await record(item,result.status);
  }else if(inputs.length===1){
   phase='provider_write';
   let result:{status:'written'|'conflict'|'uncertain';version?:string};
   try{result=await adapter.write(env,owner,region,claim.fileId,{...inputs[0],version});}catch{result={status:'uncertain'};}
   if(result.version)version=result.version;for(const item of attempted)await record(item,result.status);
  }else for(const item of attempted)await record(item,'held');
  phase='finish';await backendRpc(env,'ar_tracker_finish',{p_actor:actor,p_region:region,p_lock:lock,p_version:version,p_error:null});return {status:'checked'};
 }catch(error){
  logSyncFailure(region,phase,error);
  await backendRpc(env,'ar_tracker_finish',{p_actor:actor,p_region:region,p_lock:lock,p_version:version,p_error:'tracker_unavailable'}).catch(()=>{});
  throw error;
 }
}
