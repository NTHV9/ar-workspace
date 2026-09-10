import {emailRpc,emailJson,jsonBody,type EmailEnv,type EmailDraft} from './shared';
import {parseEmailDraft} from './validation';
import {gmailConnect,gmailStatus} from './oauth';
import {uuidPattern} from '../documents/jobs';
import {draftBudget,readMailFile} from './gmail-draft';
import {supplementalRequest} from './supplemental';
import {templateRequest} from './templates';
import {deliverMessage,sendDiagnostic,checkDelivery,deliveryView,type Delivery} from './delivery';

export async function emailApi(request:Request,env:EmailEnv,actor:string):Promise<Response>{
 try {
  const url=new URL(request.url), path=url.pathname;
  if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return emailJson({error:'forbidden'},403);
  if(path==='/api/email/templates'||path.startsWith('/api/email/templates/'))return templateRequest(request,env,actor);
  const supplemental=/^\/api\/email\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})$/.exec(path);
  if(supplemental){if(!uuidPattern.test(supplemental[1])||!uuidPattern.test(supplemental[2]))throw Error('email_invalid');const r=await supplementalRequest(request,env,actor,supplemental[1],supplemental[2]);return r instanceof Response?r:await draftResponse(r,env,actor);}
  if(path==='/api/gmail/status'&&request.method==='GET')return emailJson({...await gmailStatus(env,actor),maxAttachmentBytes:draftBudget(env)});
  if(path==='/api/email/test-send'&&request.method==='POST'){
   const v=await jsonBody(request);if(v.confirmed!==true||typeof v.commandId!=='string'||!uuidPattern.test(v.commandId)||typeof v.recipient!=='string')return emailJson({error:'email_invalid'},400);
   let supplemental;if(v.supplemental!==undefined){const x=v.supplemental as Record<string,unknown>;if(!x||typeof x!=='object'||typeof x.draftId!=='string'||!uuidPattern.test(x.draftId)||!Number.isSafeInteger(x.revision)||Number(x.revision)<0||!Array.isArray(x.ids)||!x.ids.length||x.ids.length>49||x.ids.some(i=>typeof i!=='string'||!uuidPattern.test(i))||new Set(x.ids).size!==x.ids.length)return emailJson({error:'email_invalid'},400);supplemental={draftId:x.draftId,revision:Number(x.revision),ids:x.ids as string[]};}
   if(v.rich!==undefined&&typeof v.rich!=='boolean')return emailJson({error:'email_invalid'},400);
   return emailJson(await sendDiagnostic(env,actor,v.commandId,v.recipient,supplemental,v.rich===true));
  }
  const check=/^\/api\/email\/deliveries\/([0-9a-f-]{36})\/check$/.exec(path);
  if(check&&request.method==='POST')return emailJson(await checkDelivery(env,actor,check[1]));
  const send=/^\/api\/email\/([0-9a-f-]{36})\/send$/.exec(path);
  if(send&&request.method==='POST'){
   const v=await jsonBody(request);if(v.confirmed!==true||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||!(v.stage===null||typeof v.stage==='string'))return emailJson({error:'email_invalid'},400);
   return emailJson(await deliverMessage(env,actor,send[1],Number(v.revision),'send',v.stage as string|null));
  }
  const handoff=/^\/api\/email\/([0-9a-f-]{36})\/gmail-draft$/.exec(path);
  if(handoff&&request.method==='POST'){
   const v=await jsonBody(request);if(!uuidPattern.test(handoff[1])||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return emailJson({error:'email_invalid'},400);
   if(!(v.stage===undefined||v.stage===null||typeof v.stage==='string'))return emailJson({error:'email_invalid'},400);
   return emailJson(await deliverMessage(env,actor,handoff[1],Number(v.revision),'draft',typeof v.stage==='string'?v.stage:null));
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
    result=await emailRpc(env,'ar_email_save_v2',{p_actor:actor,p_id:match[1],p_revision:v.revision,p_purpose:v.purpose,p_recipients:v.recipients,p_subject:v.subject,p_body:v.body,p_rich_body:v.richBody??null,p_template_ref:v.templateRef??null});
   }else return emailJson({error:'method_not_allowed'},405);
  }
  return await draftResponse(result,env,actor);
 }catch(e){const code=e instanceof Error?e.message:'';const safe=['email_system_billing_required','email_request_too_large','attachment_invalid','attachment_name_invalid','attachment_unsupported','attachment_type_mismatch','attachment_active_pdf','attachment_invalid_pdf','attachment_pdf_complexity','attachment_invalid_image','attachment_image_too_large','attachment_animated_image','attachment_command_conflict','email_attachment_missing','email_missing','email_test_command_conflict','email_invalid','email_too_large','gmail_not_configured','gmail_not_connected','gmail_reconnect_required','gmail_read_permission_required','email_incomplete','email_stage_required','email_rules_missing','email_forbidden','email_source_changed','email_package_changed','email_revision_conflict','email_handoff_pending','email_attachment_changed','email_attachment_unavailable'].includes(code)?code:'email_unavailable';return emailJson({error:safe},safe.startsWith('attachment_')&&!safe.endsWith('_conflict')?400:/missing$/.test(safe)?404:safe==='email_invalid'?400:(safe==='email_too_large'||safe==='email_request_too_large')?413:safe==='email_forbidden'?403:/changed|conflict|pending|incomplete|stage_required|rules_missing|system_billing_required/.test(safe)?409:503);}
}

async function draftResponse(result:unknown,env:EmailEnv,actor:string){
 if(!result)return emailJson({error:'email_missing'},404);
  if(typeof result==='object'&&'error' in result){const code=String(result.error);return emailJson({error:code},/conflict|package/.test(code)?409:/forbidden/.test(code)?403:/missing/.test(code)?404:400);}
  const draft=result as EmailDraft;
  const attempt=await emailRpc<{state:string}|null>(env,'ar_gmail_attempt_get',{p_owner:actor,p_draft:draft.id,p_revision:draft.revision});
  const delivery=await emailRpc<Delivery|null>(env,'ar_mail_for_draft',{p_actor:actor,p_draft:draft.id,p_revision:draft.revision});
  return emailJson({...draft,gmail_handoff:delivery?.state??attempt?.state??null,delivery:delivery?deliveryView(delivery):null});
}
