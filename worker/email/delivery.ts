import {PDFDocument,StandardFonts} from 'pdf-lib';
import {emailRpc,googleJson,boundedBody,type EmailEnv,type EmailDraft} from './shared';
import {gmailToken,gmailCanRead} from './oauth';
import {hash,url64} from './crypto';
import {buildMime} from './mime';
import {prepareMail,readMailFile,draftBudget} from './gmail-draft';
import type {MailFile} from './mime';
import {verifySentEvidence,decodeUrl64,type ExpectedMail} from './sent-evidence';
import {parseRecipients} from '../settings/validation';
export interface Delivery {id:string;owner:string;draft_id:string|null;revision:number|null;mode:'send'|'draft'|'test';state:string;stage:string|null;message_id:string;gmail_id:string|null;provider_receipt_id:string|null;gmail_draft_id:string|null;sent_at:string|null;reason:string|null;created_at:string;snapshot:{expected:ExpectedMail&{recipientHash?:string;supplementalSource?:TestSupplementals}};claimed?:boolean;error?:string}
export const deliveryView=(d:Delivery)=>({id:d.id,state:d.state,mode:d.mode,sentAt:d.sent_at,reason:d.reason,recorded:d.state==='sent'&&d.mode!=='test'});
async function record(env:EmailEnv,actor:string,d:Delivery,state:string,gmailId:string|null=null,draftId:string|null=null,reason:string|null=null){
 await emailRpc(env,'ar_mail_record',{p_actor:actor,p_id:d.id,p_state:state,p_gmail_id:gmailId,p_gmail_draft_id:draftId,p_reason:reason});
}
function assertDelivery(d:Delivery){if(d.error)throw Error(d.error);}
async function submit(env:EmailEnv,actor:string,delivery:Delivery,raw:string,token:string){
 assertDelivery(delivery);if(!delivery.claimed)return deliveryView(delivery);
 try{
  const draft=delivery.mode==='draft';const r=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/'+(draft?'drafts':'messages/send'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(draft?{message:{raw}}:{raw})});
  const id=draft?(r.message as {id?:unknown})?.id:r.id;if(typeof id!=='string'||!id||draft&&typeof r.id!=='string')throw Error('gmail_unavailable');
  await record(env,actor,delivery,draft?'created':'awaiting_evidence',id,draft?String(r.id):null);
  if(draft)return {id:delivery.id,state:'created',created:true,mode:'draft',recorded:false};
 }catch{try{await record(env,actor,delivery,'awaiting_evidence',null,null,'provider_result_unconfirmed');}catch{/* durable pending claim prevents retry */}}
 // Read-only reconciliation is safe even after an ambiguous provider response.
 try{return await checkDelivery(env,actor,delivery.id);}catch{return {id:delivery.id,state:'awaiting_evidence',recorded:false};}
}
export async function deliverMessage(env:EmailEnv,actor:string,draftId:string,revision:number,mode:'send'|'draft',stage:string|null){
 if(!await gmailCanRead(env,actor))throw Error('gmail_read_permission_required');
 const existing=await emailRpc<Delivery|null>(env,'ar_mail_for_draft',{p_actor:actor,p_draft:draftId,p_revision:revision});if(existing)return deliveryView(existing);
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:draftId});if(!draft)throw Error('email_missing');if(draft.revision!==revision)throw Error('email_revision_conflict');if(draft.package_changed)throw Error('email_package_changed');
 parseRecipients(draft.recipients);if(mode==='send'&&(!draft.recipients.to.length||!draft.subject.trim()||!draft.body.trim()))throw Error('email_incomplete');
 if(draft.purpose==='collection'&&!['Friendly','Follow 1','Follow 2','Follow 3','Final'].includes(stage??''))throw Error('email_stage_required');
 if(draft.purpose==='billing')stage=null;
 const id=crypto.randomUUID(),messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`,token=await gmailToken(env,actor);
 const {raw,expected}=await prepareMail(env,actor,draft,messageId);
 const claim=await emailRpc<Delivery>(env,'ar_mail_claim',{p_actor:actor,p_id:id,p_draft:draftId,p_revision:revision,p_mode:mode,p_stage:stage,p_message_id:messageId,p_expected:expected});
 return submit(env,actor,claim,raw,token);
}
export interface TestSupplementals {draftId:string;revision:number;ids:string[]}
const testSourceKey=(s?:TestSupplementals)=>JSON.stringify(s?[s.draftId,s.revision,s.ids]:null);
export async function sendDiagnostic(env:EmailEnv,actor:string,id:string,recipient:string,supplementals?:TestSupplementals){
 const recipients=parseRecipients({to:[recipient],cc:[],bcc:[]});if(!await gmailCanRead(env,actor))throw Error('gmail_read_permission_required');
 const recipientHash=await hash(new TextEncoder().encode(JSON.stringify({to:recipients.to.map(s=>s.toLowerCase()),cc:[],bcc:[]})));
 const existing=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});if(existing){if(existing.mode!=='test'||existing.snapshot.expected.recipientHash!==recipientHash||testSourceKey(existing.snapshot.expected.supplementalSource)!==testSourceKey(supplementals))throw Error('email_test_command_conflict');return deliveryView(existing);}
 const extraFiles:MailFile[]=[];if(supplementals){const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:supplementals.draftId});if(!draft)throw Error('email_missing');if(draft.revision!==supplementals.revision)throw Error('email_revision_conflict');const selected=supplementals.ids.map(fileId=>{const file=draft.attachments.find(a=>a.id===fileId);if(!file)throw Error('email_attachment_missing');return file;});if(selected.reduce((n,f)=>n+f.byte_count,0)>draftBudget(env))throw Error('email_too_large');for(const file of selected)extraFiles.push(await readMailFile(env,draft,file));}
 const messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`,subject=supplementals?'Katathani AR Workspace — attachment verification':'Katathani AR Workspace — direct send verification';
 const body='This is an authorized one-time integration test sent directly by AR Workspace on Cloudflare. Includes a system-generated synthetic PDF and any supplemental files explicitly selected for this test. This test does not change billing, collection stages or financial balances.';
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica);page.drawText('AR Workspace - Email integration test',{x:45,y:775,size:18,font});page.drawText('Synthetic document only. No customer or invoice data.',{x:45,y:735,size:11,font});page.drawText('No billing or collection activity will be recorded.',{x:45,y:710,size:11,font});const bytes=await pdf.save();
 const files:MailFile[]=[{name:'AR-Workspace-Test.pdf',mime:'application/pdf',bytes},...extraFiles];if(files.length>50||files.reduce((n,f)=>n+f.bytes.length,0)>draftBudget(env))throw Error('email_too_large');
 const expected={messageId,subject,body,files:await Promise.all(files.map(async f=>({name:f.name,byte_count:f.bytes.length,sha256:await hash(f.bytes)}))),recipientHash,...(supplementals?{supplementalSource:supplementals}:{})};
 const raw=url64(buildMime({revision:0,purpose:'billing',recipients,subject,body},files,messageId)),token=await gmailToken(env,actor);
 const claim=await emailRpc<Delivery>(env,'ar_mail_claim',{p_actor:actor,p_id:id,p_draft:null,p_revision:null,p_mode:'test',p_stage:null,p_message_id:messageId,p_expected:expected});
 return submit(env,actor,claim,raw,token);
}
export async function checkDelivery(env:EmailEnv,actor:string,id:string){
 const d=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});if(!d)throw Error('email_missing');if(d.state==='sent')return deliveryView(d);
 if(!await gmailCanRead(env,actor))throw Error('gmail_read_permission_required');const token=await gmailToken(env,actor),headers={Authorization:'Bearer '+token};
 let hits:{id:string}[]=[];
 const trustedId=d.mode!=='draft'?d.provider_receipt_id:null;
 if(trustedId)hits=[{id:trustedId}];
 else{
  const search=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q:'in:sent rfc822msgid:'+d.message_id,maxResults:'2'}),{headers});
  hits=(search.messages as {id:string}[]|undefined)??[];
  if(search.nextPageToken)throw Error('gmail_search_ambiguous');
  if(!hits.length){
   // Gmail can replace RFC Message-ID when sending. Match a preserved private
   // correlation header instead; subject/date only narrow the candidate set.
   let pageToken='';let pages=0;
   do{
    if(++pages>10)throw Error('gmail_search_budget_exceeded');
    const q='in:sent after:'+Math.floor((Date.parse(d.created_at)-300000)/1000)+' subject:"'+d.snapshot.expected.subject.replace(/["\\]/g,' ')+'"';
    const page=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q,maxResults:'50',...(pageToken?{pageToken}:{})}),{headers});
    for(const candidate of (page.messages as {id:string}[]|undefined)??[]){
     if(!/^[A-Za-z0-9_-]+$/.test(candidate.id))throw Error('gmail_unavailable');
     const meta=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${candidate.id}?format=metadata&metadataHeaders=X-AR-Delivery-ID`,{headers});
     const values=(meta.payload as {headers?:{name:string;value:string}[]}|undefined)?.headers?.filter(h=>h.name.toLowerCase()==='x-ar-delivery-id')??[];
     if(values.length===1&&values[0].value===d.id)hits.push(candidate);
    }
    pageToken=typeof page.nextPageToken==='string'?page.nextPageToken:'';
   }while(pageToken);
  }
 }
 if(!hits.length)return {...deliveryView(d),reason:'no_sent_evidence'};
 if(hits.length!==1){await record(env,actor,d,'review_required',null,null,'ambiguous_sent_match');return {...deliveryView(d),state:'review_required',reason:'ambiguous_sent_match'};}
 const messageId=hits[0].id;if(typeof messageId!=='string'||!/^[A-Za-z0-9_-]+$/.test(messageId))throw Error('gmail_unavailable');
 const message=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,{headers});
 let expected={...d.snapshot.expected,...(trustedId?{gmailId:trustedId}:{})};
 if(d.mode==='test'){
  const payload=message.payload as {headers?:{name:string;value:string}[]}|undefined;const to=payload?.headers?.filter(h=>h.name.toLowerCase()==='to');const cc=payload?.headers?.find(h=>h.name.toLowerCase()==='cc')?.value;const bcc=payload?.headers?.find(h=>h.name.toLowerCase()==='bcc')?.value;
  const recipient=to?.length===1?to[0].value.trim().toLowerCase():'';
  // Tests send one bare address. Any provider/user change requires review.
  const recipients={to:[recipient],cc:[],bcc:[]};const digest=await hash(new TextEncoder().encode(JSON.stringify(recipients)));
  if(cc||bcc||digest!==expected.recipientHash){await record(env,actor,d,'review_required',messageId,null,'test_recipient_changed');return {...deliveryView(d),state:'review_required'};}
  expected={...expected,recipients};
 }
 const result=await verifySentEvidence(message,expected,async attachmentId=>{
  const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});if(!r.ok){await r.body?.cancel();throw Error('gmail_unavailable');}
  const data=JSON.parse(new TextDecoder().decode(await boundedBody(r,18*1024*1024))) as {data?:string};if(typeof data.data!=='string')throw Error();return decodeUrl64(data.data);
 });
 if(result.status!=='verified'){if(result.status==='review_required')await record(env,actor,d,'review_required',messageId,null,result.reason??'message_content_unverified');return {...deliveryView(d),state:result.status==='not_sent'?d.state:'review_required',reason:result.status};}
 return {id:d.id,mode:d.mode,...await emailRpc<Record<string,unknown>>(env,'ar_mail_confirm_sent',{p_actor:actor,p_id:id,p_gmail_id:messageId,p_sent_at:result.sentAt})};
}
