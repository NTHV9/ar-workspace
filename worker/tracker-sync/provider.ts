import {driveToken} from '../drive/oauth';
import {google,identity} from '../drive/provider';
import {boundedBytes,readJson} from '../drive/shared';
import type {RegionId} from '../../src/domain/hotels';
import type {TrackerAdapter,TrackerEnv,ProviderSnapshot,ProviderWrite} from './service';
import {prepareTrackerWorkbook,type TrackerCellChange} from './workbook';

const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',NATIVE='application/vnd.google-apps.spreadsheet';
const targets={phuket:{name:'Master_KAT_AR_Tracker_Phuket.xlsx',mime:XLSX},'khao-lak':{name:'Master_SAN_AR_Tracker',mime:NATIVE}} as const;
interface TrackerMetadata {id:string;name:string;mimeType:string;trashed:boolean;version:string;modifiedTime:string;md5Checksum?:string;sha256Checksum?:string;size?:string;capabilities?:{canDownload?:boolean;canEdit?:boolean;canModifyContent?:boolean}}
type CasEnv=TrackerEnv&{TRACKER_BLOB_CAS_ENABLED?:string};
function target(env:TrackerEnv,region:RegionId,fileId:string){
 const expected=targets[region],configured=region==='phuket'?env.REPORT_SHEET_PHUKET_ID:env.REPORT_SHEET_KHAOLAK_ID;
 if(!expected||typeof configured!=='string'||!/^[A-Za-z0-9_-]{20,200}$/.test(configured)||fileId!==configured)throw Error('tracker_target_conflict');return expected;
}
async function check(response:Response):Promise<Response>{
 if(response.status===401||response.status===403||response.status===404){await response.body?.cancel();throw Error('tracker_authorization_required');}
 if(!response.ok){await response.body?.cancel();throw Error('tracker_provider_unavailable');}return response;
}
async function access(env:TrackerEnv,owner:string){try{const token=await driveToken(env,owner);await identity(token);return token;}catch{throw Error('tracker_authorization_required');}}
async function metadata(token:string,region:RegionId,fileId:string):Promise<TrackerMetadata>{
 const expected=targets[region];const q=new URLSearchParams({supportsAllDrives:'true',fields:'id,name,mimeType,trashed,version,modifiedTime,md5Checksum,sha256Checksum,size,capabilities(canDownload,canEdit,canModifyContent)'});
 const value=await readJson(await check(await google('https://www.googleapis.com/drive/v3/files/'+fileId+'?'+q,token)));
 if(value.id!==fileId||value.name!==expected.name||value.mimeType!==expected.mime||value.trashed!==false||typeof value.version!=='string'||!/^\d+$/.test(value.version)||typeof value.modifiedTime!=='string')throw Error('tracker_target_conflict');
 if((value.capabilities as {canDownload?:boolean}|undefined)?.canDownload!==true)throw Error('tracker_authorization_required');return value as unknown as TrackerMetadata;
}
async function digest(bytes:Uint8Array){const sum=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(sum)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function strongEtag(value:unknown):value is string{return typeof value==='string'&&/^"[\x21\x23-\x7e]{1,500}"$/.test(value);}
async function v2(token:string,fileId:string,method:'GET'|'PUT',init:RequestInit={}):Promise<Response>{
 const path=method==='GET'?'https://www.googleapis.com/drive/v2/files/':'https://www.googleapis.com/upload/drive/v2/files/';
 const query=method==='GET'?new URLSearchParams({fields:'id,title,mimeType,etag',supportsAllDrives:'true'}):new URLSearchParams({uploadType:'media',supportsAllDrives:'true'});
 return fetch(path+fileId+'?'+query,{...init,method,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(90000)});
}
async function etag(token:string,region:RegionId,fileId:string):Promise<string|null>{
 const response=await check(await v2(token,fileId,'GET'));const value=await readJson(response),expected=targets[region];
 if(value.id!==fileId||value.title!==expected.name||value.mimeType!==expected.mime)throw Error('tracker_target_conflict');return strongEtag(value.etag)?value.etag:null;
}
async function readStable(token:string,region:RegionId,fileId:string){
 for(let attempt=0;attempt<2;attempt++){
  const before=await metadata(token,region,fileId),head=await etag(token,region,fileId),expected=targets[region];
  const url='https://www.googleapis.com/drive/v3/files/'+fileId+(expected.mime===XLSX?'?alt=media&supportsAllDrives=true':'/export?'+new URLSearchParams({mimeType:XLSX}));
  const bytes=await boundedBytes(await check(await google(url,token)),8*1024*1024),confirmedHead=await etag(token,region,fileId),after=await metadata(token,region,fileId);
  if(before.version!==after.version||before.modifiedTime!==after.modifiedTime||before.md5Checksum!==after.md5Checksum||head!==confirmedHead)continue;
  if(expected.mime===XLSX&&before.size!==String(bytes.length))throw Error('tracker_provider_unavailable');
  if(expected.mime===XLSX&&before.sha256Checksum&&before.sha256Checksum!==await digest(bytes))throw Error('tracker_provider_unavailable');
  const prepared=prepareTrackerWorkbook(bytes,region);
  return {bytes,prepared,parsed:prepared.snapshot,metadata:after,etag:head,version:head?'v2:'+head:'v3:'+after.version+':'+await digest(bytes)};
 }
 throw Error('tracker_snapshot_changed');
}
export async function readTrackerWorkbook(env:TrackerEnv,owner:string,region:RegionId,fileId:string):Promise<ProviderSnapshot>{
 target(env,region,fileId);const token=await access(env,owner),snapshot=await readStable(token,region,fileId);
 return {version:snapshot.version,rows:snapshot.parsed.rows,schemaFingerprint:snapshot.parsed.schemaFingerprint,
  capabilities:{conditionalWrite:region==='phuket'&&(env as CasEnv).TRACKER_BLOB_CAS_ENABLED==='true'&&snapshot.etag&&snapshot.metadata.capabilities?.canEdit===true&&snapshot.metadata.capabilities?.canModifyContent===true?'proven':'unverified'}};
}
/** Version comparisons are observations, never atomic authorization. v3 If-Match
 * was ignored by the live synthetic probe; native conditional writes remain
 * unproven. Preserve a visible conflict hold rather than overwrite a collaborator. */
export async function writeTrackerCells(env:TrackerEnv,owner:string,region:RegionId,fileId:string,input:ProviderWrite):Promise<{status:'written'|'conflict'|'uncertain';version?:string}>{
 return writeTrackerBatch(env,owner,region,fileId,[input]);
}
export async function writeTrackerBatch(env:TrackerEnv,owner:string,region:RegionId,fileId:string,inputs:readonly ProviderWrite[]):Promise<{status:'written'|'conflict'|'uncertain';version?:string}>{
 target(env,region,fileId);
 if(region!=='phuket'||(env as CasEnv).TRACKER_BLOB_CAS_ENABLED!=='true')return {status:'conflict'};
 if(!inputs.length||inputs.length>100||inputs.reduce((sum,input)=>sum+input.changes.length,0)>300)throw Error('tracker_batch_limit');
 if(inputs.some(input=>!input.changes.length||input.changes.some(c=>!['R','U','V','W'].includes(c.field)||typeof c.value!=='string')))throw Error('tracker_patch_forbidden');
 const token=await access(env,owner),current=await readStable(token,region,fileId);
 if(!current.etag||inputs.some(input=>input.version!==current.version)||current.metadata.capabilities?.canEdit!==true||current.metadata.capabilities?.canModifyContent!==true)return {status:'conflict'};
 let bytes:Uint8Array;
 try{bytes=current.prepared.patchBatch(inputs.map(input=>({rowKey:input.rowKey,expectedIdentity:{...input.expectedIdentity,folioNo:input.expectedIdentity.folio},changes:input.changes as TrackerCellChange[]})));}catch{return {status:'conflict'};}
 let response:Response;
 try{response=await v2(token,fileId,'PUT',{headers:{'If-Match':current.etag,'Content-Type':XLSX},body:bytes as BodyInit});}catch{return {status:'uncertain'};}
 if(response.status===412){await response.body?.cancel();return {status:'conflict'};}
 if(!response.ok){await response.body?.cancel();return {status:'uncertain'};}await response.body?.cancel();
 try{const confirmed=await readStable(token,region,fileId);if(await digest(confirmed.bytes)!==await digest(bytes))return {status:'conflict',version:confirmed.version};return {status:'written',version:confirmed.version};}
 catch{return {status:'uncertain'};}
}
export const trackerAdapter:TrackerAdapter={read:readTrackerWorkbook,write:writeTrackerCells,writeBatch:writeTrackerBatch};
