import type {RemittanceConfig,RemittanceFile,RemittanceRecord,RemittanceRow} from '../../src/remittance/model';
import {boundedBody} from '../email/shared';
import {hash} from '../email/crypto';
import {inspectSupplemental,supplementalName} from '../email/supplemental-validation';
import {parseRemittanceFileAction,readRemittanceJson,parseRevision} from './validation';

export interface RemittanceFilesEnv {
 SUPABASE_URL?:string;SUPABASE_SECRET_KEY?:string;
 REMITTANCE_MAX_FILE_BYTES?:string;REMITTANCE_MAX_FILES?:string;REMITTANCE_MAX_TOTAL_FILE_BYTES?:string;
}
const MiB=1048576;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const checksum=/^[0-9a-f]{64}$/;
const money=/^-?(?:0|[1-9][0-9]*)\.[0-9]{2}$/;
const allowedRpcErrors=new Set([
 'remittance_invalid','remittance_forbidden','remittance_missing','remittance_revision_conflict','remittance_command_conflict',
 'remittance_scope_immutable','remittance_invoice_invalid','remittance_source_unverified','remittance_pending_upload','remittance_voided',
 'remittance_file_limit','remittance_file_conflict','remittance_file_missing','remittance_file_pending','remittance_file_removed','remittance_file_unavailable',
 'remittance_allocation_overflow','remittance_change_reason_required','remittance_future_received_date',
]);
export function remittanceLimits(env:RemittanceFilesEnv):RemittanceConfig {
 const read=(value:string|undefined,fallback:number,max:number)=>{if(value===undefined)return fallback;if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw Error('remittance_not_configured');return Number(value);};
 return {maxFileBytes:read(env.REMITTANCE_MAX_FILE_BYTES,10*MiB,20*MiB),maxFiles:read(env.REMITTANCE_MAX_FILES,50,200),maxTotalFileBytes:read(env.REMITTANCE_MAX_TOTAL_FILE_BYTES,100*MiB,512*MiB)};
}
export function remittanceService(env:RemittanceFilesEnv){
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('remittance_not_configured');
 let base:URL;try{base=new URL(env.SUPABASE_URL);}catch{throw Error('remittance_not_configured');}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('remittance_not_configured');
 return {origin:base.origin,key:env.SUPABASE_SECRET_KEY};
}
async function bodyBytes(response:Request|Response,max:number,tooLarge:string){
 try{return await boundedBody(response,max);}catch(e){if(e instanceof Error&&e.message==='email_too_large')throw Error(tooLarge);throw Error('remittance_unavailable');}
}
/** Fixed RPC names and configured HTTPS origin only; never expose provider error bodies. */
export async function remittanceFileRpc<T=unknown>(env:RemittanceFilesEnv,name:string,args:Record<string,unknown>):Promise<T>{
 if(!/^ar_remittance_[a-z_]+$/.test(name))throw Error('remittance_invalid');
 const service=remittanceService(env);let response:Response;
 try{response=await fetch(`${service.origin}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:service.key,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'manual',signal:AbortSignal.timeout(30000)});}catch{throw Error('remittance_unavailable');}
 if(!response.ok){await response.body?.cancel();throw Error('remittance_unavailable');}
 let value:unknown;
 const bytes=await bodyBytes(response,32*MiB,'remittance_response_too_large');
 try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('remittance_unavailable');}
 if(value&&typeof value==='object'&&'error' in value&&!('id' in value)&&value.error!==null)throw Error(typeof value.error==='string'&&allowedRpcErrors.has(value.error)?value.error:'remittance_unavailable');
 return value as T;
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('remittance_unavailable');return value as Record<string,unknown>;}
function text(value:unknown){if(typeof value!=='string')throw Error('remittance_unavailable');return value;}
function nullableText(value:unknown){return value===null?null:text(value);}
function integer(value:unknown,min=0){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min)throw Error('remittance_unavailable');return value;}
function amount(value:unknown){const s=text(value);if(!money.test(s))throw Error('remittance_unavailable');return s;}
function nullableAmount(value:unknown){return value===null?null:amount(value);}
function choice<const T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))throw Error('remittance_unavailable');return value as T;}
function idText(value:unknown){const s=text(value);if(!uuid.test(s))throw Error('remittance_unavailable');return s;}
function checkedFile(value:unknown):RemittanceFile {
 const v=object(value);const name=text(v.name),mime=text(v.mime),byteCount=integer(v.byteCount,1),sha256=text(v.sha256);
 try{if(supplementalName(name)!==mime)throw Error();}catch{throw Error('remittance_file_invalid');}
 if(byteCount>20*MiB||!checksum.test(sha256))throw Error('remittance_file_invalid');
 const error=nullableText(v.error);
 return {id:idText(v.id),name,mime,byteCount,sha256,state:choice(v.state,['pending','ready','removed']),error:error===null?null:allowedRpcErrors.has(error)?error:'remittance_file_unavailable',createdAt:text(v.createdAt)};
}
/** Strip internal keys rather than forwarding arbitrary service JSON to the browser. */
export function checkedRemittanceRow(value:unknown):RemittanceRow {
 const v=object(value);
 return {id:idText(v.id),revision:integer(v.revision,1),state:choice(v.state,['active','voided']),hotel:choice(v.hotel,['KAT','TSK']),accountId:text(v.accountId),accountName:text(v.accountName),accountType:text(v.accountType),accountNo:nullableText(v.accountNo),receivedDate:text(v.receivedDate),reference:text(v.reference),sourceNote:text(v.sourceNote),notes:text(v.notes),reportedAmount:nullableAmount(v.reportedAmount),allocatedAmount:amount(v.allocatedAmount),unallocatedAmount:nullableAmount(v.unallocatedAmount),
  invoiceCount:integer(v.invoiceCount),fileCount:integer(v.fileCount),pendingFiles:integer(v.pendingFiles),linkedOpen:nullableAmount(v.linkedOpen),knownLinkedOpen:amount(v.knownLinkedOpen),unverifiedLines:integer(v.unverifiedLines),resolution:choice(v.resolution,['awaiting_opera','linked_zero','needs_review','voided']),createdAt:text(v.createdAt),updatedAt:text(v.updatedAt),voidReason:nullableText(v.voidReason)};
}
export function checkedRemittanceRecord(value:unknown):RemittanceRecord {
 const v=object(value);if(!Array.isArray(v.lines)||!Array.isArray(v.files))throw Error('remittance_unavailable');
 return {...checkedRemittanceRow(v),
  lines:v.lines.map(item=>{const l=object(item);return {invoiceId:text(l.invoiceId),reportedAmount:nullableAmount(l.reportedAmount),invoiceNo:text(l.invoiceNo),folioNo:text(l.folioNo),guest:text(l.guest),currentOpen:nullableAmount(l.currentOpen),currentStatus:choice(l.currentStatus,['open','zero','unverified','missing']),sourceVerifiedAt:nullableText(l.sourceVerifiedAt)};}),
  files:v.files.map(checkedFile)};
}
interface StoredFile extends RemittanceFile {storageKey:string}
function storedFile(value:unknown,recordId:string,fileId:string):StoredFile {
 const v=object(value),file=checkedFile(v);if(file.id!==fileId||v.storageKey!==`remittances/${recordId}/${fileId}`)throw Error('remittance_file_invalid');return {...file,storageKey:v.storageKey};
}
function validateIdentity(actor:string,...ids:string[]){if(!uuid.test(actor))throw Error('remittance_forbidden');if(ids.some(id=>!uuid.test(id)))throw Error('remittance_invalid');}
export interface PrivateRemittanceObject {storageKey:string;byteCount:number;sha256:string;mime:string}
/** Caller must validate exact owner-bound key before entering this shared transport. */
function storageUrl(env:RemittanceFilesEnv,file:PrivateRemittanceObject,read:boolean){
 // Even an accidental future caller cannot turn a key into a URL or traversal path.
 const segments=file.storageKey.split('/');if(segments.length!==3||!['remittances','remittance-diagnostics'].includes(segments[0])||!segments.slice(1).every(s=>uuid.test(s))||!checksum.test(file.sha256)||!Number.isSafeInteger(file.byteCount)||file.byteCount<1||file.byteCount>20*MiB||!['application/pdf','image/png','image/jpeg'].includes(file.mime))throw Error('remittance_file_invalid');
 const service=remittanceService(env);return {url:`${service.origin}/storage/v1/object/${read?'authenticated/':''}ar-working-files/${file.storageKey}`,key:service.key};
}
export async function readRemittanceObject(env:RemittanceFilesEnv,file:PrivateRemittanceObject):Promise<Uint8Array>{
 const target=storageUrl(env,file,true);let response:Response;
 try{response=await fetch(target.url,{headers:{apikey:target.key},redirect:'manual',signal:AbortSignal.timeout(30000)});}catch{throw Error('remittance_storage_unavailable');}
 if(!response.ok){await response.body?.cancel();throw Error(response.status===404?'remittance_file_bytes_missing':'remittance_storage_unavailable');}
 const length=response.headers.get('Content-Length');if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)!==file.byteCount)){await response.body?.cancel();throw Error('remittance_checksum_mismatch');}
 let bytes:Uint8Array;try{bytes=await bodyBytes(response,file.byteCount,'remittance_checksum_mismatch');}catch(e){if(e instanceof Error&&e.message==='remittance_checksum_mismatch')throw e;throw Error('remittance_storage_unavailable');}
 if(bytes.length!==file.byteCount||await hash(bytes)!==file.sha256)throw Error('remittance_checksum_mismatch');return bytes;
}
export async function writeRemittanceObject(env:RemittanceFilesEnv,file:PrivateRemittanceObject,bytes:Uint8Array){
 const target=storageUrl(env,file,false);if(bytes.length!==file.byteCount||await hash(bytes)!==file.sha256)throw Error('remittance_file_conflict');
 let response:Response;try{response=await fetch(target.url,{method:'POST',headers:{apikey:target.key,'Content-Type':file.mime,'x-upsert':'false'},body:new Uint8Array(bytes).buffer,redirect:'manual',signal:AbortSignal.timeout(30000)});}catch{throw Error('remittance_upload_pending');}
 const status=response.status;await response.body?.cancel();
 if(!response.ok&&status!==400&&status!==409)throw Error('remittance_storage_unavailable');
 // Success and duplicate responses both require exact byte proof before metadata finish.
 await readRemittanceObject(env,file);
}
function inspectionError(error:unknown):never {
 const code=error instanceof Error?error.message:'';
 const codes:Record<string,string>={email_too_large:'remittance_file_too_large',attachment_name_invalid:'remittance_file_name_invalid',attachment_unsupported:'remittance_file_unsupported',attachment_type_mismatch:'remittance_file_type_mismatch',attachment_active_pdf:'remittance_file_active_pdf',attachment_pdf_complexity:'remittance_file_pdf_complexity',attachment_image_too_large:'remittance_file_image_too_large',attachment_animated_image:'remittance_file_animated_image'};
 throw Error(codes[code]??'remittance_file_invalid');
}
async function getFile(env:RemittanceFilesEnv,actor:string,recordId:string,fileId:string){
 const value=await remittanceFileRpc(env,'ar_remittance_file_get',{p_actor:actor,p_id:recordId,p_file_id:fileId});if(value===null)throw Error('remittance_file_missing');return storedFile(value,recordId,fileId);
}
function recordResult(value:unknown,recordId:string){const record=checkedRemittanceRecord(value);if(record.id!==recordId)throw Error('remittance_unavailable');return record;}
export async function remittanceFileRequest(request:Request,env:RemittanceFilesEnv,actor:string,recordId:string,fileId:string,restore=false):Promise<RemittanceRecord|Response>{
 validateIdentity(actor,recordId,fileId);
 if(restore&&request.method!=='POST'||!restore&&!['GET','POST','DELETE'].includes(request.method))return new Response(null,{status:405,headers:{Allow:restore?'POST':'GET, POST, DELETE','Cache-Control':'no-store'}});
 if(request.method==='GET'){
  const file=await getFile(env,actor,recordId,fileId);if(file.state!=='ready')throw Error('remittance_file_not_ready');const bytes=await readRemittanceObject(env,file);
  return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':file.mime,'Content-Length':String(bytes.length),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(request.method==='DELETE'||restore){
  const action=parseRemittanceFileAction(await readRemittanceJson(request));
  if(restore){
   const receipt=await remittanceFileRpc(env,'ar_remittance_command_get',{p_actor:actor,p_command:action.commandId});let complete=false;
   if(receipt!==null){const command=object(receipt);if(typeof command.complete!=='boolean')throw Error('remittance_unavailable');complete=command.complete;if(complete){idText(command.recordId);integer(command.revision,1);}}
   // A completed command still goes through file_status to verify the exact action,
   // record and input. Its recorded success must not depend on Storage availability.
   if(!complete){const file=await getFile(env,actor,recordId,fileId);if(file.state==='pending')throw Error('remittance_file_not_ready');try{await readRemittanceObject(env,file);}catch(e){if(file.state==='removed'&&e instanceof Error&&e.message==='remittance_file_bytes_missing')throw Error('remittance_file_reupload_required');throw e;}}
  }
  return recordResult(await remittanceFileRpc(env,'ar_remittance_file_status',{p_actor:actor,p_id:recordId,p_file_id:fileId,p_command:action.commandId,p_revision:action.revision,p_restore:restore,p_reason:action.reason,p_limits:remittanceLimits(env)}),recordId);
 }
 const url=new URL(request.url),revision=url.searchParams.get('revision'),name=url.searchParams.get('name')??'';
 if(!revision||!/^\d+$/.test(revision)||url.searchParams.getAll('revision').length!==1||url.searchParams.getAll('name').length!==1)throw Error('remittance_invalid');const parsedRevision=parseRevision(Number(revision));
 const limits=remittanceLimits(env);let inspection;
 try{supplementalName(name);}catch(e){inspectionError(e);}
 const bytes=await bodyBytes(request,limits.maxFileBytes,'remittance_file_too_large');
 try{inspection=await inspectSupplemental(bytes,name,(request.headers.get('Content-Type')??'').split(';')[0].trim().toLowerCase());}catch(e){inspectionError(e);}
 const expected={id:fileId,name,mime:inspection.mime,byteCount:inspection.byte_count,sha256:inspection.sha256,inspection:{version:1,...(inspection.pages?{pages:inspection.pages}:{}),...(inspection.width?{width:inspection.width,height:inspection.height}:{})}};
 const result=object(await remittanceFileRpc(env,'ar_remittance_file_begin',{p_actor:actor,p_id:recordId,p_revision:parsedRevision,p_file:expected,p_limits:limits}));
 const file=storedFile(result.file,recordId,fileId),record=recordResult(result.record,recordId);
 if(file.state==='removed'||file.name!==expected.name||file.mime!==expected.mime||file.byteCount!==expected.byteCount||file.sha256!==expected.sha256)throw Error('remittance_file_conflict');
 if(file.state==='ready'){await readRemittanceObject(env,file);return record;}
 await writeRemittanceObject(env,file,bytes);
 return recordResult(await remittanceFileRpc(env,'ar_remittance_file_finish',{p_actor:actor,p_id:recordId,p_file_id:fileId,p_sha256:file.sha256}),recordId);
}
