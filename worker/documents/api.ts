import {acceptanceRows} from '../acceptance/context';
import {acceptanceRpc} from '../acceptance/routing';
import {readManagedStorage} from '../operations/storage';
import type {RefreshEnv} from '../refresh/backend';
import {documentSource} from './source-policy';
import {PDFDocument} from 'pdf-lib';
import {createDocumentJob,documentJob,dispatchDocumentJob,reconcileDocumentStatus,uploadPrivate,uuidPattern,type DocumentCreateInput} from './jobs';
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
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${routed.name}`,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY!,'Content-Type':'application/json'},body:JSON.stringify(routed.args),redirect:'manual',signal:AbortSignal.timeout(20000)});
 const value:unknown=await response.json();if(!response.ok){const message=value&&typeof value==='object'&&'message'in value?value.message:null;throw new Error(typeof message==='string'&&/^(document|storage|budget|retention)_[a-z_]+$/.test(message)?message:'document_service_unavailable');}return value;
}
export async function documentApi(request:Request,env:RefreshEnv,owner:string,headers:Record<string,string>):Promise<Response>{
 try{
  if(!uuidPattern.test(owner)||!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)return json({error:'document_service_unavailable'},503);
  const url=new URL(request.url);const origin=request.headers.get('Origin');if(request.method!=='GET'&&origin&&origin!==url.origin)return json({error:'forbidden'},403);
  if(url.pathname==='/api/documents'){
   if(request.method==='GET'){
    const offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)return json({error:'document_request_invalid'},400);
    if(env.ACCEPTANCE){const rows=await acceptanceRows(env,'ar_document_jobs','select=id,account_name,hotel,state,created_at,revision,purpose,content,layout&order=created_at.desc',21,offset);return json({jobs:rows.slice(0,20),hasMore:rows.length>20});}
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/ar_document_jobs?select=id,account_name,hotel,state,created_at,revision,purpose,content,layout&order=created_at.desc&limit=21&offset=${offset}`,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok)return json({error:'document_service_unavailable'},503);const rows=await response.json();if(!Array.isArray(rows))throw new Error('document_service_unavailable');return json({jobs:rows.slice(0,20),hasMore:rows.length>20});
   }
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   const input=await bodyJson(request,1024*1024);if(typeof input.commandKey!=='string'||!uuidPattern.test(input.commandKey)||!['KAT','TSK'].includes(String(input.hotel))||typeof input.accountId!=='string'||!input.accountId||input.accountId.length>200||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>4000||input.ids.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(input.ids).size!==input.ids.length||!['statement','invoices','both'].includes(String(input.content))||!['combined','statement_bundle','separate'].includes(String(input.layout))||!['billing','collection'].includes(String(input.purpose)))return json({error:'document_request_invalid'},400);
   input.statementSource=documentSource({content:String(input.content),statementSource:input.statementSource,ids:input.ids});
   return json(await createDocumentJob(env,owner,input as unknown as DocumentCreateInput),202);
  }
  const match=/^\/api\/documents\/([0-9a-f-]{36})(?:\/(project|save|upload|files|exports|dispatch)(?:\/([0-9a-f-]+))?)?$/.exec(url.pathname);
  if(!match||!uuidPattern.test(match[1]))return json({error:'not_found'},404);
  const [,id,action,child]=match,job=await documentJob(env,id);if(!job)return json({error:'document_job_missing'},404);if(job.owner!==owner)return json({error:'forbidden'},403);
  if(!action&&request.method==='GET')return json(await reconcileDocumentStatus(env,job));
  if(action==='dispatch'&&request.method==='POST')return json(await dispatchDocumentJob(env,job));
  if(request.method==='GET'&&['project','files','exports'].includes(action)){
   const file=action==='files'?job.files.find(f=>f.id===child&&f.state==='ready'):null;
   const index=Number(child);const exported=action==='exports'&&Number.isSafeInteger(index)&&index>=0?job.exports[index]:null;
   const key=action==='project'?job.project_key:file?.storage_key??exported?.storage_key;
   if(!key||!key.startsWith(`jobs/${id}/`))return json({error:'document_file_missing'},404);
   // The disposable bucket deliberately has no direct member policy. Its files
   // pass the same job-owner check above before the server reads their bytes.
   const response=await readManagedStorage(env,key,action==='project'?67108864:file?.byte_count??exported?.byte_count??104857600,env.ACCEPTANCE?{}:{headers});
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
   await uploadPrivate(env,key,bytes,type);
   await rpc(env,'ar_document_register_upload',{p_job_id:id,p_storage_key:key,p_bytes:bytes.length,p_sha256:sha256,p_mime:type});
   return json({storage_key:key,byte_count:bytes.length,sha256},201);
  }
  if(action==='save'&&request.method==='POST'){
   const input=await bodyJson(request,4*1024*1024);if(!Number.isSafeInteger(input.revision)||typeof input.projectKey!=='string'||!Array.isArray(input.exports)||typeof input.acknowledged!=='boolean')return json({error:'document_request_invalid'},400);
   return json(await rpc(env,'ar_document_save_project',{p_job_id:id,p_revision:input.revision,p_project_key:input.projectKey,p_exports:input.exports,p_acknowledged:input.acknowledged}));
  }
  return json({error:'method_not_allowed'},405);
 }catch(error){
  const code=error instanceof Error&&/^(document|storage|budget|retention)_[a-z_]+$/.test(error.message)?error.message:'document_service_unavailable';
  const status=code==='storage_file_expired'?410:code==='document_upload_too_large'?413:/conflict|selection_invalid|sources_unavailable/.test(code)?409:/invalid|source_retired/.test(code)?400:503;return json({error:code},status);
 }
}
