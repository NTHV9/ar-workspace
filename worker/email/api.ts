import {emailRpc,emailJson,jsonBody,type EmailEnv,type EmailDraft} from './shared';
import {parseEmailDraft} from './validation';
import {gmailConnect,gmailStatus} from './oauth';
import {uuidPattern} from '../documents/jobs';
import {createGmailDraft,draftBudget,readMailFile} from './gmail-draft';

export async function emailApi(request:Request,env:EmailEnv,actor:string):Promise<Response>{
 try {
  const url=new URL(request.url), path=url.pathname;
  if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return emailJson({error:'forbidden'},403);
  if(path==='/api/gmail/status'&&request.method==='GET')return emailJson({...await gmailStatus(env,actor),maxAttachmentBytes:draftBudget(env)});
  const handoff=/^\/api\/email\/([0-9a-f-]{36})\/gmail-draft$/.exec(path);
  if(handoff&&request.method==='POST'){
   const v=await jsonBody(request);if(!uuidPattern.test(handoff[1])||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return emailJson({error:'email_invalid'},400);
   return emailJson(await createGmailDraft(env,actor,handoff[1],Number(v.revision)));
  }
  const preview=/^\/api\/email\/([0-9a-f-]{36})\/exports\/(\d+)$/.exec(path);
  if(preview&&request.method==='GET'){
   const d=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:preview[1]});const f=d?.exports[Number(preview[2])];if(!d||!f)return emailJson({error:'email_missing'},404);
   const file=await readMailFile(env,d,f);return new Response(new Uint8Array(file.bytes).buffer,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="reviewed-document.pdf"'}});
  }
  if(path==='/api/gmail/connect'&&request.method==='POST'){
   const v=await jsonBody(request);if(typeof v.jobId!=='string'||!uuidPattern.test(v.jobId))return emailJson({error:'email_invalid'},400);
   return gmailConnect(env,actor,v.jobId);
  }
  let result:unknown;
  if(path==='/api/email/open'&&request.method==='POST'){
   const v=await jsonBody(request);
   if(typeof v.jobId!=='string'||!uuidPattern.test(v.jobId)||!Number.isSafeInteger(v.documentRevision)||Number(v.documentRevision)<0)return emailJson({error:'email_invalid'},400);
   result=await emailRpc(env,'ar_email_open',{p_actor:actor,p_job_id:v.jobId,p_document_revision:v.documentRevision});
  }else{
   const match=/^\/api\/email\/([0-9a-f-]{36})$/.exec(path);
   if(!match||!uuidPattern.test(match[1]))return emailJson({error:'not_found'},404);
   if(request.method==='GET')result=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:match[1]});
   else if(request.method==='PUT'){
    const v=parseEmailDraft(await jsonBody(request));
    result=await emailRpc(env,'ar_email_save',{p_actor:actor,p_id:match[1],p_revision:v.revision,p_purpose:v.purpose,p_recipients:v.recipients,p_subject:v.subject,p_body:v.body});
   }else return emailJson({error:'method_not_allowed'},405);
  }
  if(!result)return emailJson({error:'email_missing'},404);
  if(typeof result==='object'&&'error' in result){const code=String(result.error);return emailJson({error:code},/conflict|package/.test(code)?409:/forbidden/.test(code)?403:/missing/.test(code)?404:400);}
  return emailJson(result);
 }catch(e){const code=e instanceof Error?e.message:'';const safe=['email_invalid','email_too_large','gmail_not_configured','gmail_not_connected','gmail_reconnect_required','email_forbidden','email_source_changed','email_package_changed','email_revision_conflict','email_handoff_pending','email_attachment_changed','email_attachment_unavailable'].includes(code)?code:'email_unavailable';return emailJson({error:safe},safe==='email_invalid'?400:safe==='email_too_large'?413:safe==='email_forbidden'?403:/changed|conflict|pending/.test(safe)?409:503);}
}
