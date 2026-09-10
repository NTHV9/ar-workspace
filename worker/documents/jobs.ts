import {writeManagedStorage} from '../operations/storage';
import {workspaceStatement} from '../statement/generate';
import {documentSource} from './source-policy';
import type {WorkflowStep} from 'cloudflare:workers';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {makeReader} from '../opera/probe';
import {OperaError} from '../opera/client';
import {getNativeInvoicePdf,type DocumentInvoice} from './native-invoice';
export interface DocumentFile {id:string;kind:'statement'|'invoice';invoice_id:string|null;ordinal:number;state:string;storage_key:string|null;error_code:string|null;byte_count:number|null;sha256:string|null}
export interface DocumentExport {name:string;storage_key:string;byte_count:number;sha256:string}
export interface DocumentJob {statement_source?:string;template_version?:string|null;id:string;owner:string;hotel:string;account_id:string;account_name:string;content:string;layout:string;purpose:string;invoice_ids:string[];manifest:DocumentInvoice[];state:string;revision:number;project_key:string|null;exports:DocumentExport[];acknowledged:boolean;files:DocumentFile[];created_at:string}
export interface DocumentCreateInput {statementSource?:string;commandKey:string;hotel:string;accountId:string;ids:string[];content:string;layout:string;purpose:string}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function documentJob(env:RefreshEnv,id:string){return backendRpc<DocumentJob|null>(env,'ar_document_get',{p_job_id:id});}
export async function reconcileDocumentStatus(env:RefreshEnv,job:DocumentJob){
 if(!env.AR_REFRESH||!job.files.some(f=>['pending','generating'].includes(f.state)))return job;
 let status:string|undefined;try{status=(await(await env.AR_REFRESH.get(job.id)).status()).status;}catch{return job;}
 if(!['complete','errored','terminated'].includes(status??''))return job;
 const current=await documentJob(env,job.id);if(!current)return job;
 for(const file of current.files.filter(f=>['pending','generating'].includes(f.state)))await backendRpc(env,'ar_document_fail_file',{p_job_id:job.id,p_file_id:file.id,p_code:'document_workflow_interrupted',p_uncertain:file.state==='generating'});
 return (await documentJob(env,job.id))??job;
}
export async function dispatchDocumentJob(env:RefreshEnv,job:DocumentJob){
 if(!env.AR_REFRESH)throw new Error('document_dispatch_unavailable');
 if(job.files.some(f=>['pending','generating'].includes(f.state))){
  try{await env.AR_REFRESH.create({id:job.id,params:{runId:job.id,hotel:job.hotel,documentJob:true}});}
  catch{try{await(await env.AR_REFRESH.get(job.id)).status();}catch{throw new Error('document_dispatch_unavailable');}}
 }
 return reconcileDocumentStatus(env,job);
}
export async function createDocumentJob(env:RefreshEnv,owner:string,input:DocumentCreateInput){
 const source=documentSource(input);
 const job=await backendRpc<DocumentJob>(env,'ar_document_create_v2',{p_owner:owner,p_command_key:input.commandKey,p_hotel:input.hotel,p_account_id:input.accountId,p_ids:input.ids,p_content:input.content,p_layout:input.layout,p_purpose:input.purpose,p_statement_source:source});
 return dispatchDocumentJob(env,job);
}
export async function uploadPrivate(env:RefreshEnv,path:string,bytes:Uint8Array,type:string){
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new Error('private_storage_unavailable');
 if(!/^jobs\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)||/(^|\/)\.\.?($|\/)/.test(path))throw new Error('invalid_storage_path');
 await writeManagedStorage(env,path,bytes,type);
}
export async function runDocumentJob(env:RefreshEnv,jobId:string,step:WorkflowStep){
 const job=await documentJob(env,jobId);if(!job)throw new Error('document_job_missing');
 for(const file of job.files){
  if(!['pending','generating'].includes(file.state))continue;
  await step.do(`document-${file.id}`,{retries:{limit:0,delay:'5 seconds'},timeout:'8 minutes'},async()=>{
   const claim=await backendRpc<{claimed:boolean;file:DocumentFile}>(env,'ar_document_claim_file',{p_job_id:job.id,p_file_id:file.id});
   if(!claim.claimed)return {state:claim.file.state};
   let renderStarted=false;
   try{
    if(file.kind==='statement'&&job.statement_source!=='workspace')throw new OperaError('invalid_configuration',undefined,'document_statement_source_retired');
    const invoice=job.manifest.find(i=>i.id===file.invoice_id);if(file.kind!=='statement'&&(!invoice||invoice.hotel!==job.hotel||invoice.account_id!==job.account_id))throw new Error('document_manifest_invalid');
    const pdf=file.kind==='statement'?await workspaceStatement(env,job):await getNativeInvoicePdf(makeReader(env,job.hotel),invoice!,()=>{renderStarted=true;});
    const key=`jobs/${job.id}/originals/${file.id}.pdf`;
    await uploadPrivate(env,key,pdf.bytes,'application/pdf');
    await backendRpc(env,'ar_document_finish_file',{p_job_id:job.id,p_file_id:file.id,p_storage_key:key,p_bytes:pdf.bytes.length,p_sha256:pdf.sha256});
    return {state:'ready',pages:pdf.pages};
   }catch(error){
    const code=error instanceof OperaError?error.stage??error.code:error instanceof Error&&(/^(document_statement_[a-z_]+|document_source_changed|budget_[a-z_]+|storage_[a-z_]+)$/.test(error.message)||['document_manifest_invalid','private_storage_write_failed','private_storage_unavailable'].includes(error.message))?error.message:'document_generation_failed';
    await backendRpc(env,'ar_document_fail_file',{p_job_id:job.id,p_file_id:file.id,p_code:code,p_uncertain:renderStarted});
    return {state:renderStarted?'uncertain':'unavailable',code};
   }
  });
 }
 const result=await documentJob(env,job.id);return {state:result?.state??'unavailable',files:result?.files.length??0};
}
