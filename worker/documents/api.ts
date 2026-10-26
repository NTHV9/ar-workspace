import {cleanupTransientDocument} from '../operations/retention-sweep';
import {acceptanceRows} from '../acceptance/context';
import {acceptanceRpc} from '../acceptance/routing';
import {readManagedStorage,StorageWriteNotDispatched} from '../operations/storage';
import type {RefreshEnv} from '../refresh/backend';
import {documentSource} from './source-policy';
import {PDFDocument} from 'pdf-lib';
import {createDocumentJob,documentJob,dispatchDocumentJob,reconcileDocumentStatus,uploadPrivate,uuidPattern,type DocumentCreateInput,type DocumentJob} from './jobs';
import {isHotelId} from '../../src/domain/hotels';
import {administratorEmail} from '../../src/access/model';
import {boundedBody} from '../email/shared';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function bodyBytes(request:Request,max:number){
 const declared=Number(request.headers.get('Content-Length'));if(declared>max)throw new Error('document_upload_too_large');
 const reader=request.body?.getReader();if(!reader)throw new Error('document_request_invalid');const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>max){await reader.cancel();throw new Error('document_upload_too_large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes;
}
async function bodyJson(request:Request,max=65536):Promise<Record<string,unknown>>{
 if(!request.headers.get('Content-Type')?.includes('application/json'))throw new Error('document_request_invalid');
 const value:unknown=JSON.parse(new TextDecoder().decode(await bodyBytes(request,max)));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('document_request_invalid');return value as Record<string,unknown>;
}
async function rpc(env:RefreshEnv,name:string,args:Record<string,unknown>){const routed=acceptanceRpc(env,name,args);
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${routed.name}`,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY!,'Content-Type':'application/json',...(env.REQUEST_ACTOR?{'X-Ar-Actor':env.REQUEST_ACTOR}:{})},body:JSON.stringify(routed.args),redirect:'manual',signal:AbortSignal.timeout(20000)});
 const value:unknown=await response.json();if(!response.ok){const message=value&&typeof value==='object'&&'message'in value?value.message:null;throw new Error(typeof message==='string'&&/^(document|storage|budget|retention)_[a-z_]+$/.test(message)?message:'document_service_unavailable');}return value;
}
export async function documentApi(request:Request,env:RefreshEnv,owner:string,headers:Record<string,string>,background?:{waitUntil(promise:Promise<unknown>):void}):Promise<Response>{
 try{
  if(!uuidPattern.test(owner)||!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return json({error:'document_service_unavailable'},503);
  const url=new URL(request.url);const origin=request.headers.get('Origin');if(request.method!=='GET'&&origin&&origin!==url.origin)return json({error:'forbidden'},403);
  const backup=/^\/api\/documents\/([0-9a-f-]{36})\/backup\/([0-9a-f-]{36})$/.exec(url.pathname);
  if(backup){
   const [,jobId,objectId]=backup;if(!uuidPattern.test(jobId)||!uuidPattern.test(objectId))return json({error:'not_found'},404);
   if(request.method!=='GET')return json({error:'method_not_allowed'},405);
   if(env.ACCEPTANCE||env.REQUEST_ACTOR!==owner||env.REQUEST_ACCESS&&(!env.REQUEST_ACCESS.administrator||env.REQUEST_ACCESS.email!==administratorEmail))return json({error:'document_forbidden'},403);
   const receipt=await rpc(env,'ar_document_backup_target',{p_actor:owner,p_job_id:jobId,p_object_id:objectId}) as {job_id:string;object_id:string;storage_key:string;byte_count:number;sha256:string;mime:string};
   const pattern=new RegExp(`^jobs/${jobId}/(originals|exports|projects)/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\\.(pdf|json)$`),path=typeof receipt?.storage_key==='string'?pattern.exec(receipt.storage_key):null;
   if(receipt?.job_id!==jobId||receipt.object_id!==objectId||!path||path[1]==='projects'&&path[2]!=='json'||path[1]!=='projects'&&path[2]!=='pdf'||receipt.mime!==(path[2]==='json'?'application/json':'application/pdf')||!Number.isSafeInteger(receipt.byte_count)||receipt.byte_count<1||receipt.byte_count>104857600||!/^[0-9a-f]{64}$/.test(receipt.sha256))throw Error('document_backup_receipt_unverified');
   const response=await readManagedStorage(env,receipt.storage_key,receipt.byte_count);
   if(!response.ok){await response.body?.cancel();throw Error('document_file_unavailable');}
   const bytes=await boundedBody(response,receipt.byte_count),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(bytes.length!==receipt.byte_count||sha!==receipt.sha256)throw Error('document_backup_bytes_changed');
   return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':receipt.mime,'Content-Disposition':`attachment; filename="${objectId}.${path[2]}"`,'Content-Length':String(bytes.length),'X-Ar-Backup-Byte-Count':String(bytes.length),'X-Ar-Backup-Sha256':sha,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname==='/api/documents'){
   if(request.method==='GET'){
    const offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)return json({error:'document_request_invalid'},400);
    if(env.ACCEPTANCE){const rows=await acceptanceRows(env,'ar_document_jobs','select=id,account_name,hotel,state,created_at,revision,purpose,content,layout&order=created_at.desc',21,offset);return json({jobs:rows.slice(0,20),hasMore:rows.length>20});}
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/ar_document_jobs?select=id,account_name,hotel,state,created_at,revision,purpose,content,layout&order=created_at.desc&limit=21&offset=${offset}`,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok)return json({error:'document_service_unavailable'},503);const rows=await response.json();if(!Array.isArray(rows))throw new Error('document_service_unavailable');return json({jobs:rows.slice(0,20),hasMore:rows.length>20});
   }
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   const input=await bodyJson(request,1024*1024);if(typeof input.commandKey!=='string'||!uuidPattern.test(input.commandKey)||!isHotelId(input.hotel)||typeof input.accountId!=='string'||!input.accountId||input.accountId.length>200||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>4000||input.ids.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(input.ids).size!==input.ids.length||!['statement','invoices','both'].includes(String(input.content))||!['combined','statement_bundle','separate'].includes(String(input.layout))||!['billing','collection'].includes(String(input.purpose)))return json({error:'document_request_invalid'},400);
   input.statementSource=documentSource({content:String(input.content),statementSource:input.statementSource,ids:input.ids});
   return json(await createDocumentJob(env,owner,input as unknown as DocumentCreateInput),202);
  }
  const command=/^\/api\/documents\/commands\/([0-9a-f-]{36})\/abandon$/.exec(url.pathname);
  if(command){
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   const input=await bodyJson(request,1024);
   if(!uuidPattern.test(command[1])||!isHotelId(input.hotel)||typeof input.payloadDigest!=='string'||!/^[0-9a-f]{64}$/.test(input.payloadDigest)||Object.keys(input).some(k=>!['hotel','payloadDigest'].includes(k)))return json({error:'document_request_invalid'},400);
   if(!env.REQUEST_ACTOR)return json({error:'document_forbidden'},403);
   const resolved=await rpc(env,'ar_document_command_abandon',{p_actor:env.REQUEST_ACTOR,p_owner:owner,p_command_key:command[1],p_hotel:input.hotel,p_payload_digest:input.payloadDigest}) as {job_id?:string;commandKey:string;hotel:string;payloadDigest:string;outcome:string};
   if(resolved.commandKey!==command[1]||resolved.hotel!==input.hotel||resolved.payloadDigest!==input.payloadDigest)throw Error('document_command_receipt_invalid');
   if(['discarded','pending','protected'].includes(resolved.outcome)){if(!resolved.job_id||!uuidPattern.test(resolved.job_id))throw Error('document_command_receipt_invalid');if(resolved.outcome==='discarded'&&background)try{background.waitUntil(cleanupTransientDocument(env,owner,resolved.job_id).catch(()=>{}));}catch{}return json(resolved);}
   if(!resolved.job_id)return json(resolved);
   if(!uuidPattern.test(resolved.job_id))throw Error('document_command_receipt_invalid');
   // Separate RPC transaction: release command lock before existing global/actor abandon locks.
   const result=await rpc(env,'ar_document_abandon',{p_actor:owner,p_job_id:resolved.job_id}) as {job:DocumentJob;outcome:string};
   if(result.job?.id!==resolved.job_id)throw Error('document_command_receipt_invalid');
   if(result.outcome==='discarded'&&background)try{background.waitUntil(cleanupTransientDocument(env,owner,resolved.job_id).catch(()=>{}));}catch{}
   return json({...result,commandKey:command[1],hotel:input.hotel,payloadDigest:input.payloadDigest});
  }
  const match=/^\/api\/documents\/([0-9a-f-]{36})(?:\/(project|save|upload|files|exports|dispatch|review|discard|abandon)(?:\/([0-9a-f-]+))?)?$/.exec(url.pathname);
  if(!match||!uuidPattern.test(match[1]))return json({error:'not_found'},404);
  const [,id,action,child]=match,job=await documentJob(env,id);if(!job)return json({error:'document_job_missing'},404);if(job.owner!==owner)return json({error:'forbidden'},403);
  if(!action&&request.method==='GET')return json(await reconcileDocumentStatus(env,job));
  if(['discard','abandon'].includes(action)&&request.method==='POST'){
   const result=await rpc(env,action==='abandon'?'ar_document_abandon':'ar_document_discard',{p_actor:owner,p_job_id:id});
   const closed=action==='discard'||(result as {outcome?:string}).outcome==='discarded';
   if(closed&&background){try{background.waitUntil(cleanupTransientDocument(env,owner,id).catch(()=>{}));}catch{/* Scheduled maintenance retains the durable retry. */}}
   return json(result);
  }
  if(job.bytes_released)return json({error:'document_bytes_released'},410);if(job.closed_at)return json({error:'document_closed'},410);
  if(job.discard_requested_at)return json({error:'document_discard_pending'},409);
  if(job.lifecycle==='transient'&&(['project','save'].includes(action)||action==='upload'&&url.searchParams.get('kind')==='project'))return json({error:'document_project_retired'},409);
  if(action==='review'&&request.method==='POST'){
   const input=await bodyJson(request,4*1024*1024);if(!Number.isSafeInteger(input.revision)||Number(input.revision)<0||!Array.isArray(input.exports)||input.acknowledged!==true||Object.keys(input).some(k=>!['revision','exports','acknowledged'].includes(k)))return json({error:'document_request_invalid'},400);
   return json(await rpc(env,'ar_document_review',{p_actor:owner,p_job_id:id,p_revision:input.revision,p_exports:input.exports,p_acknowledged:true}));
  }
  if(action==='dispatch'&&request.method==='POST')return json(await dispatchDocumentJob(env,job));
  if(request.method==='GET'&&['project','files','exports'].includes(action)){
   const file=action==='files'?job.files.find(f=>f.id===child&&f.state==='ready'):null;
   const index=Number(child);const exported=action==='exports'&&Number.isSafeInteger(index)&&index>=0?job.exports[index]:null;
   const key=action==='project'?job.project_key:file?.storage_key??exported?.storage_key;
   if(!key||!key.startsWith(`jobs/${id}/`))return json({error:'document_file_missing'},404);
   // The disposable bucket deliberately has no direct member policy. Its files
   // pass the same job-owner check above before the server reads their bytes.
   const response=await readManagedStorage(env,key,action==='project'?67108864:file?.byte_count??exported?.byte_count??104857600,env.ACCEPTANCE||env.REQUEST_ACCESS?{}:{headers});
   if(!response.ok){await response.body?.cancel();return json({error:'document_file_unavailable'},503);}
   return new Response(response.body,{headers:{'Content-Type':action==='project'?'application/json':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(action==='upload'&&request.method==='POST'){
   const kind=url.searchParams.get('kind');if(!['project','export'].includes(kind??''))return json({error:'document_request_invalid'},400);
   if(!job.files.some(f=>f.state==='ready'))return json({error:'document_sources_unavailable'},409);
   const limit=Number(env.DOC_UPLOAD_MAX_BYTES??20*1024*1024);if(!Number.isSafeInteger(limit)||limit<1||limit>50*1024*1024)throw new Error('document_service_unavailable');
   const bytes=await bodyBytes(request,limit);const type=kind==='project'?'application/json':'application/pdf';
   if(kind==='export'&&new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return json({error:'document_pdf_invalid'},400);
   if(kind==='export'){try{const pdf=await PDFDocument.load(bytes,{updateMetadata:false});if(!pdf.getPageCount())throw new Error();}catch{return json({error:'document_pdf_invalid'},400);}}
   if(kind==='project'){const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||value.version!==1||!Array.isArray(value.pages)||!['statement','invoices','both'].includes(value.content)||value.pages.some((p:unknown)=>!p||typeof p!=='object'||!('sourceId'in p)||!job.files.some(f=>f.id===p.sourceId&&f.state==='ready')))return json({error:'document_project_invalid'},400);
    if(['statement','both'].includes(value.content)&&!job.files.some(f=>f.kind==='statement'&&f.state==='ready'))return json({error:'document_sources_unavailable'},409);
   }
   const key=`jobs/${id}/${kind==='project'?'projects':'exports'}/${crypto.randomUUID()}.${kind==='project'?'json':'pdf'}`;
   const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
   const intent=job.lifecycle==='transient'?await rpc(env,'ar_document_begin_upload',{p_actor:owner,p_job_id:id,p_storage_key:key,p_bytes:bytes.length,p_sha256:sha256}) as {created:boolean}:null;
   try{await uploadPrivate(env,key,bytes,type);}catch(error){if(intent?.created&&error instanceof StorageWriteNotDispatched)await rpc(env,'ar_document_cancel_undispatched_upload',{p_actor:owner,p_job_id:id,p_key:key,p_sha256:sha256});throw error;}
   await rpc(env,'ar_document_register_upload',{p_job_id:id,p_storage_key:key,p_bytes:bytes.length,p_sha256:sha256,p_mime:type});
   return json({storage_key:key,byte_count:bytes.length,sha256},201);
  }
  if(action==='save'&&request.method==='POST'){
   const input=await bodyJson(request,4*1024*1024);if(!Number.isSafeInteger(input.revision)||typeof input.projectKey!=='string'||!Array.isArray(input.exports)||typeof input.acknowledged!=='boolean')return json({error:'document_request_invalid'},400);
   return json(await rpc(env,'ar_document_save_project',{p_job_id:id,p_revision:input.revision,p_project_key:input.projectKey,p_exports:input.exports,p_acknowledged:input.acknowledged}));
  }
  return json({error:'method_not_allowed'},405);
 }catch(error){
  const code=error instanceof Error&&(/^(document|storage|budget|retention)_[a-z_]+$/.test(error.message)||error.message==='account_balance_only')?error.message:'document_service_unavailable';
  const status=code==='document_forbidden'?403:code==='storage_file_expired'||code==='document_closed'?410:code==='document_upload_too_large'?413:/balance_only|conflict|selection_invalid|sources_unavailable|pending|project_retired|archive_retired|busy/.test(code)?409:/invalid|source_retired/.test(code)?400:503;return json({error:code},status);
 }
}
