import {writeManagedStorage,StorageWriteNotDispatched} from '../operations/storage';
import {boundedBody,emailRpc,jsonBody,type EmailAttachment,type EmailDraft,type EmailEnv} from './shared';
import {draftBudget,readMailFile} from './gmail-draft';
import {hash} from './crypto';
import {inspectSupplemental,supplementalName} from './supplemental-validation';

interface AttachmentRecord extends EmailAttachment {removed:boolean}
async function writeFile(env:EmailEnv,draft:EmailDraft,file:EmailAttachment,bytes:Uint8Array){
 if(env.OPERATIONS_BUDGET_ENABLED==='true'){await writeManagedStorage(env,file.storage_key,bytes,file.mime??'application/pdf');return;}
 const r=await fetch(`${env.SUPABASE_URL}/storage/v1/object/ar-working-files/${file.storage_key}`,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY!,'Content-Type':file.mime,'x-upsert':'false'},body:new Uint8Array(bytes).buffer,redirect:'manual',signal:AbortSignal.timeout(30000)});
 const status=r.status;await r.body?.cancel();if(r.ok)return;
 if(status===400||status===409){await readMailFile(env,draft,file);return;}
 throw Error('email_attachment_unavailable');
}
export async function supplementalRequest(request:Request,env:EmailEnv,actor:string,draftId:string,fileId:string):Promise<EmailDraft|Record<string,unknown>|Response>{
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:draftId});if(!draft)throw Error('email_missing');if(draft.document_closed_at)throw Error('document_closed');
 if(request.method==='GET'){
  const file=draft.attachments.find(a=>a.id===fileId);if(!file)throw Error('email_attachment_missing');
  const content=await readMailFile(env,draft,file);
  return new Response(new Uint8Array(content.bytes).buffer,{headers:{'Content-Type':content.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method==='DELETE'){
  const v=await jsonBody(request);if(!Number.isSafeInteger(v.revision)||Number(v.revision)<0)throw Error('email_invalid');
  return emailRpc(env,'ar_email_attachment_remove',{p_actor:actor,p_id:draftId,p_revision:v.revision,p_file_id:fileId});
 }
 if(request.method!=='POST')return new Response(null,{status:405});
 const url=new URL(request.url),name=url.searchParams.get('name')??'',revision=url.searchParams.get('revision');
 const mime=supplementalName(name);if(!revision||!/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision)))throw Error('email_invalid');
 const existing=await emailRpc<AttachmentRecord|null>(env,'ar_email_attachment_record',{p_actor:actor,p_id:draftId,p_file_id:fileId});
 if(existing?.removed)throw Error('attachment_command_conflict');
 const bytes=await boundedBody(request,draftBudget(env));
 if(existing){
  if(existing.name!==name||existing.mime!==mime||existing.byte_count!==bytes.length||existing.sha256!==await hash(bytes))throw Error('attachment_command_conflict');
  return draft;
 }
 if(draft.package_changed)throw Error('email_package_changed');if(draft.revision!==Number(revision))throw Error('email_revision_conflict');
 const [unresolved,legacy]=await Promise.all([
  emailRpc<boolean>(env,'ar_mail_unresolved',{p_actor:actor,p_draft:draftId}),
  emailRpc<{state:string}|null>(env,'ar_gmail_attempt_get',{p_owner:actor,p_draft:draftId,p_revision:draft.revision}),
 ]);
 if(unresolved||legacy)throw Error('email_handoff_pending');
 const files=[...draft.exports,...draft.attachments];if(files.length+1>50||files.reduce((n,f)=>n+f.byte_count,0)+bytes.length>draftBudget(env))throw Error('email_too_large');
 const inspected=await inspectSupplemental(bytes,name,(request.headers.get('Content-Type')??'').split(';')[0].trim().toLowerCase());
 const file:EmailAttachment={id:fileId,name,storage_key:`jobs/${draft.document_job_id}/email/${draft.id}/${fileId}`,mime:inspected.mime,byte_count:inspected.byte_count,sha256:inspected.sha256};
 const intent=draft.document_lifecycle==='transient'?await emailRpc<{created:boolean}>(env,'ar_document_begin_upload',{p_actor:actor,p_job_id:draft.document_job_id,p_storage_key:file.storage_key,p_bytes:file.byte_count,p_sha256:file.sha256}):null;
 try{await writeFile(env,draft,file,bytes);}catch(error){if(intent?.created&&error instanceof StorageWriteNotDispatched)await emailRpc(env,'ar_document_cancel_undispatched_upload',{p_actor:actor,p_job_id:draft.document_job_id,p_key:file.storage_key,p_sha256:file.sha256});throw error;}
 return emailRpc(env,'ar_email_attachment_add_v2',{p_actor:actor,p_id:draftId,p_revision:draft.revision,p_file_id:fileId,p_name:name,p_key:file.storage_key,p_mime:file.mime,p_bytes:file.byte_count,p_sha256:file.sha256,p_budget:draftBudget(env),p_inspection:{version:1,...(inspected.pages?{pages:inspected.pages}:{}),...(inspected.width?{width:inspected.width,height:inspected.height}:{})}});
}
