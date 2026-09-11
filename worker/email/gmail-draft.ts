import {assertAcceptanceRecipient} from '../acceptance/recipient';
import {assertWritesEnabled} from '../operations/write-hold';
import {readManagedStorage} from '../operations/storage';
import {emailRpc,boundedBody,googleJson,type EmailEnv,type EmailDraft} from './shared';
import {gmailToken} from './oauth';
import {hash,url64} from './crypto';
import {buildMime,type MailFile} from './mime';
import {documentJob} from '../documents/jobs';
import {makeReader} from '../opera/probe';
import {readBusinessDate,readVerifiedAccount} from '../refresh/read-snapshot';
import {revalidateThread} from './threads';
interface Attempt {id:string;state:string;claimed?:boolean;gmail_draft_id?:string;error?:string}
export function draftBudget(env:EmailEnv){const n=Number(env.GMAIL_DRAFT_MAX_BYTES??10485760);return Number.isSafeInteger(n)&&n>0&&n<=12582912?n:10485760;}
export async function readMailFile(env:EmailEnv,draft:EmailDraft,file:{name:string;storage_key:string;byte_count:number;sha256:string;mime?:string}):Promise<MailFile>{
 if(draft.document_closed_at)throw Error('document_closed');
 if(!file.storage_key.startsWith(`jobs/${draft.document_job_id}/`)||!/^jobs\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(file.storage_key)||/(^|\/)\.\.?($|\/)/.test(file.storage_key)||!Number.isSafeInteger(file.byte_count)||file.byte_count<1||file.byte_count>draftBudget(env))throw Error('email_attachment_invalid');
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('email_unavailable');
 const r=await readManagedStorage(env,file.storage_key,file.byte_count);
 if(!r.ok){await r.body?.cancel();throw Error('email_attachment_unavailable');}
 const bytes=await boundedBody(r,file.byte_count);if(bytes.length!==file.byte_count||await hash(bytes)!==file.sha256)throw Error('email_attachment_changed');
 return {name:file.name,mime:file.mime??'application/pdf',bytes};
}
export async function createGmailDraft(env:EmailEnv,owner:string,id:string,revision:number){
 assertWritesEnabled(env);
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:owner,p_id:id});
 if(!draft)throw Error('email_missing');await assertAcceptanceRecipient(env,draft.recipients);if(draft.revision!==revision)throw Error('email_revision_conflict');if(draft.package_changed)throw Error('email_package_changed');
 const existing=await emailRpc<Attempt|null>(env,'ar_gmail_attempt_get',{p_owner:owner,p_draft:id,p_revision:revision});
 if(existing)return {state:existing.state,created:existing.state==='created',alreadyRequested:true};
 // Retained legacy helper has no expected-choice claim. Thread handoffs use deliverMessage.
 if(draft.thread)throw Error('email_thread_invalid');
 const token=await gmailToken(env,owner);const messageId=`<${crypto.randomUUID()}@ar-workspace.ar-c82.workers.dev>`;const {raw}=await prepareMail(env,owner,draft,messageId);
 const attempt=await emailRpc<Attempt>(env,'ar_gmail_attempt_claim',{p_owner:owner,p_draft:id,p_revision:revision,p_message_id:messageId});
 if(attempt.error)throw Error(attempt.error);if(!attempt.claimed)return {state:attempt.state,created:attempt.state==='created',alreadyRequested:true};
 try{
  const response=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:{raw}})});
  const message=response.message as {id?:unknown}|undefined;
  if(typeof response.id!=='string'||!response.id||typeof message?.id!=='string')throw Error('gmail_unavailable');
  const saved=await emailRpc(env,'ar_gmail_attempt_finish',{p_owner:owner,p_id:attempt.id,p_draft_id:response.id,p_message_id:message.id});if(!saved)throw Error('email_unavailable');
  return {state:'created',created:true,alreadyRequested:false};
 }catch{
  // The remote operation may have succeeded. Never automatically repeat it.
  try{await emailRpc(env,'ar_gmail_attempt_finish',{p_owner:owner,p_id:attempt.id,p_draft_id:null,p_message_id:null});}catch{/* A pending claim still prevents a duplicate. */}
  return {state:'uncertain',created:false,alreadyRequested:true};
 }
}

export async function prepareMail(env:EmailEnv,owner:string,draft:EmailDraft,messageId:string){
 await assertAcceptanceRecipient(env,draft.recipients);
 if(draft.purpose==='billing'&&draft.billing_method==='system')throw Error('email_system_billing_required');
 const files=[...draft.exports,...draft.attachments];if(!files.length||files.length>50||files.reduce((n,f)=>n+f.byte_count,0)>draftBudget(env))throw Error('email_too_large');
 const job=await documentJob(env,draft.document_job_id);if(job?.closed_at)throw Error('document_closed');if(!job||job.owner!==owner||job.revision!==draft.document_revision||!job.acknowledged)throw Error('email_package_changed');
 const reader=makeReader(env,job.hotel),businessDate=await readBusinessDate(reader,job.hotel);
 const snapshot=await readVerifiedAccount(reader,job.hotel,job.account_id,businessDate);
 for(const invoice of job.manifest){const current=snapshot.invoices.find(i=>i.id===invoice.id);if(!current||current.open<=0||!['standalone','parent'].includes(current.collection_role)||current.open!==invoice.open||current.invoice_no!==invoice.invoice_no||current.folio_no!==invoice.folio_no)throw Error('email_source_changed');}
 const loaded:MailFile[]=[];for(const file of files)loaded.push(await readMailFile(env,draft,file));
 const thread=await revalidateThread(env,owner,draft);
 const raw=url64(buildMime({revision:draft.revision,purpose:draft.purpose,recipients:draft.recipients,subject:draft.subject,body:draft.body,richBody:draft.rich_body??null},loaded,messageId,thread));
 return {raw,expected:{messageId,recipients:draft.recipients,subject:draft.subject,body:draft.body,richBody:draft.rich_body??null,...(thread?{thread}:{}),files:files.map(f=>({name:f.name,byte_count:f.byte_count,sha256:f.sha256}))}};
}
