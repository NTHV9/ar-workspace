import {hotelMailbox,mailboxSender,frozenMailIdentity,type MailboxId} from '../../src/domain/mailboxes';
import {signatureLogoFile} from './signature-logo';
import {signatureWorkplace,parseSignatureProfile} from '../../src/email/signature';
import {isHotelId} from '../../src/domain/hotels';
import {assertAcceptanceRecipient} from '../acceptance/recipient';
import {requireRegionalDelivery} from './regional-delivery';
import {assertWritesEnabled} from '../operations/write-hold';
import {readPolicyForHandoff} from '../collection/policy-api';
import {isCollectionStageKey,parseStageSnapshot,policyStageLabel} from '../../src/domain/collection-policy';
import {plainMessage,richText} from '../../src/email/rich-message';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {emailRpc,googleJson,GoogleResponseError,boundedBody,type EmailEnv,type EmailDraft} from './shared';
import {gmailToken,gmailCanRead} from './oauth';
import {hash,url64} from './crypto';
import {buildMime} from './mime';
import {prepareMail,readMailFile,draftBudget} from './gmail-draft';
import type {MailFile} from './mime';
import {verifySentEvidence,verifyDraftEvidence,decodeUrl64,type ExpectedMail} from './sent-evidence';
import {parseRecipients} from '../settings/validation';
import {syntheticConversation,type ThreadProof} from './threads';
export interface Delivery {id:string;owner:string;draft_id:string|null;revision:number|null;mode:'send'|'draft'|'test';state:string;stage:string|null;stage_snapshot?:unknown;message_id:string;gmail_id:string|null;provider_receipt_id:string|null;gmail_draft_id:string|null;draft_send_claimed_at?:string|null;verified_sent_evidence?:{gmailId:string;sentAt:string;mailbox:MailboxId}|null;sent_at:string|null;reason:string|null;created_at:string;snapshot:{expected:ExpectedMail&{recipientHash?:string;supplementalSource?:TestSupplementals;replyToDeliveryId?:string;signatureHotel?:string}};claimed?:boolean;error?:string}
const submittedSendReceipt=(d:Delivery)=>!!(d.provider_receipt_id&&/^[A-Za-z0-9_-]+$/.test(d.provider_receipt_id)&&(d.mode==='send'||d.mode==='draft'&&d.draft_send_claimed_at));
const acknowledgedSend=(d:Delivery)=>d.state==='sent'||!!d.sent_at||submittedSendReceipt(d);
function verifiedExternalSend(d:Delivery){
 const proof=d.verified_sent_evidence;if(!proof||d.mode==='test'||typeof proof.gmailId!=='string'||!/^[-A-Za-z0-9_]{1,200}$/.test(proof.gmailId)||typeof proof.sentAt!=='string'||!Number.isFinite(Date.parse(proof.sentAt))||Date.parse(proof.sentAt)>Date.now()+300000||Date.parse(proof.sentAt)<Date.parse(d.created_at)-300000||proof.mailbox!==frozenMailIdentity(d.snapshot.expected).mailbox)return null;
 return proof;
}
export const deliveryView=(d:Delivery)=>{
 const stage=isCollectionStageKey(d.stage)?d.stage:null;let stageLabel=stage?policyStageLabel(stage):null;
 if(stage&&d.stage_snapshot)try{const snapshot=parseStageSnapshot(d.stage_snapshot);if(snapshot.key===stage)stageLabel=snapshot.label;}catch{/* Keep the recorded stage key when its historical label cannot be verified. */}
 const verified=verifiedExternalSend(d);
 return {id:d.id,state:d.state,mode:d.mode,gmailAccepted:acknowledgedSend(d)||!!verified,sentAt:d.sent_at??verified?.sentAt??null,reason:d.reason,stage,stageLabel,recorded:d.state==='sent'&&d.mode!=='test'};
};
async function record(env:EmailEnv,actor:string,d:Delivery,state:string,gmailId:string|null=null,draftId:string|null=null,reason:string|null=null){
 await emailRpc(env,'ar_mail_record',{p_actor:actor,p_id:d.id,p_state:state,p_gmail_id:gmailId,p_gmail_draft_id:draftId,p_reason:reason});
}
function assertDelivery(d:Delivery){if(d.error)throw Error(d.error);}
// The success response belongs to the exact MIME and recipients we submitted.
// Record that send immediately; a content readback is unnecessary on this path.
// The atomic DB confirmation retains its workflow/revision and duplicate fences.
async function confirmAcknowledgedSend(env:EmailEnv,actor:string,d:Delivery,id:string,sentAt:string,persistReceipt=true){
 const accepted={...d,provider_receipt_id:id,state:'awaiting_evidence'};
 try{
  if(persistReceipt&&!await emailRpc<boolean>(env,'ar_mail_record',{p_actor:actor,p_id:d.id,p_state:'awaiting_evidence',p_gmail_id:id,p_gmail_draft_id:null,p_reason:null}))throw Error('email_record_unavailable');
  const confirmed=await emailRpc<Record<string,unknown>>(env,'ar_mail_confirm_sent',{p_actor:actor,p_id:d.id,p_gmail_id:id,p_sent_at:sentAt});
  if(confirmed.error||!['sent','review_required'].includes(String(confirmed.state)))throw Error('email_record_unavailable');
  if(confirmed.state==='review_required'){
   const fresh=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:d.id});
   return {...deliveryView(fresh??accepted),...confirmed,gmailAccepted:true,sentAt,reason:fresh?.reason??'history_review_required'};
  }
  return {...deliveryView(accepted),...confirmed,gmailAccepted:true,sentAt,reason:null};
 }catch{
  // A concurrent checker may have committed, or confirmation may have committed
  // before its response was lost. Read once before presenting a false failure.
  try{const fresh=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:d.id});if(fresh?.state==='sent')return deliveryView(fresh);}catch{/* Keep the accepted send separate from unavailable history. */}
  return {...deliveryView(accepted),gmailAccepted:true,recorded:false,reason:'history_recording_unavailable'};
 }
}
async function submit(env:EmailEnv,actor:string,delivery:Delivery,raw:string,token:string){
 assertDelivery(delivery);if(!delivery.claimed)return deliveryView(delivery);
 try{
  const draft=delivery.mode==='draft';const message={raw,...(delivery.snapshot.expected.thread?{threadId:delivery.snapshot.expected.thread.threadId}:{})};const r=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/'+(draft?'drafts':'messages/send'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(draft?{message}:message)});
  const id=draft?(r.message as {id?:unknown})?.id:r.id;if(typeof id!=='string'||!/^[A-Za-z0-9_-]+$/.test(id)||draft&&typeof r.id!=='string')throw Error('gmail_unavailable');
  if(delivery.mode==='send')return confirmAcknowledgedSend(env,actor,delivery,id,new Date().toISOString());
  await record(env,actor,delivery,draft?'created':'awaiting_evidence',id,draft?String(r.id):null);
  if(draft)return {...deliveryView(delivery),state:'created',created:true,recorded:false};
 }catch{try{await record(env,actor,delivery,'awaiting_evidence',null,null,'provider_result_unconfirmed');}catch{/* durable pending claim prevents retry */}}
 // Read-only reconciliation is safe even after an ambiguous provider response.
 try{return await checkDelivery(env,actor,delivery.id);}catch{return {...deliveryView(delivery),state:'awaiting_evidence',recorded:false};}
}
export async function deliverMessage(env:EmailEnv,actor:string,draftId:string,revision:number,mode:'send'|'draft',stage:string|null,policyVersion?:number){
 assertWritesEnabled(env);
 const existing=await emailRpc<Delivery|null>(env,'ar_mail_for_draft',{p_actor:actor,p_draft:draftId,p_revision:revision});if(existing)return mode==='send'&&existing.mode==='draft'&&existing.state==='created'?sendExistingDraft(env,actor,existing,revision,stage,policyVersion):deliveryView(existing);
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:draftId});if(!draft)throw Error('email_missing');if(draft.revision!==revision)throw Error('email_revision_conflict');if(draft.package_changed)throw Error('email_package_changed');
 await requireRegionalDelivery(env,draft);
 const mailbox=hotelMailbox(draft.hotel);if(!await gmailCanRead(env,actor,mailbox))throw Error('gmail_read_permission_required');
 if(draft.rich_body?.signature&&(draft.rich_body.signature.staffId!==(env.REQUEST_ACTOR??actor)||draft.rich_body.signature.workplace!==(isHotelId(draft.hotel)?signatureWorkplace(draft.hotel):'')))throw Error('email_signature_changed');
 if(draft.purpose==='billing'&&draft.billing_method==='system')throw Error('email_system_billing_required');
 parseRecipients(draft.recipients);if(mode==='send'&&(!draft.recipients.to.length||!draft.subject.trim()||!draft.body.trim()))throw Error('email_incomplete');
 if(draft.purpose==='collection'&&!isCollectionStageKey(stage))throw Error('email_stage_required');
 const stagePolicy=draft.purpose==='collection'?await readPolicyForHandoff(env,actor,stage!,policyVersion):null;
 if(draft.purpose==='billing')stage=null;
 const id=crypto.randomUUID(),messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`,token=await gmailToken(env,actor,mailbox);
 const {raw,expected}=await prepareMail(env,actor,draft,messageId);
 await requireRegionalDelivery(env,draft);
 const claim=await emailRpc<Delivery>(env,'ar_mail_claim',{p_actor:actor,p_id:id,p_draft:draftId,p_revision:revision,p_mode:mode,p_stage:stage,p_message_id:messageId,p_expected:{...expected,...(stagePolicy?{policyVersion:stagePolicy.policyVersion}:{})}});
 return submit(env,actor,claim,raw,token);
}
export interface TestSupplementals {draftId:string;revision:number;ids:string[]}
const canonical=(v:unknown):string=>JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
async function sendExistingDraft(env:EmailEnv,actor:string,d:Delivery,revision:number,stage:string|null,policyVersion?:number){
 if(d.owner!==actor||d.revision!==revision||d.stage!==stage||!d.gmail_draft_id||!/^[A-Za-z0-9_-]+$/.test(d.gmail_draft_id))throw Error('email_handoff_pending');
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:d.draft_id});
 if(!draft)throw Error('email_missing');if(draft.revision!==revision)throw Error('email_revision_conflict');if(draft.package_changed)throw Error('email_package_changed');
 parseRecipients(draft.recipients);if(!draft.recipients.to.length||!draft.subject.trim()||!draft.body.trim())throw Error('email_incomplete');
 await requireRegionalDelivery(env,draft);
 if(draft.rich_body?.signature&&draft.rich_body.signature.staffId!==(env.REQUEST_ACTOR??actor))throw Error('email_signature_changed');
 if(draft.purpose==='collection')await readPolicyForHandoff(env,actor,stage!,policyVersion);
 const identity=frozenMailIdentity(d.snapshot.expected);if(identity.mailbox!==hotelMailbox(draft.hotel))throw Error('email_forbidden');
 if(!await gmailCanRead(env,actor,identity.mailbox))throw Error('gmail_read_permission_required');
 const {raw,expected}=await prepareMail(env,actor,draft,d.message_id);
 for(const key of Object.keys(expected) as (keyof typeof expected)[])if(canonical(expected[key])!==canonical(d.snapshot.expected[key]))throw Error('email_package_changed');
 const token=await gmailToken(env,actor,identity.mailbox),headers={Authorization:'Bearer '+token};
 let remote:Record<string,unknown>;
 try{remote=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${d.gmail_draft_id}?format=full`,{headers});}
 catch(e){if(e instanceof GoogleResponseError&&e.status===404)return checkDelivery(env,actor,d.id);throw e;}
 const message=remote.message as Parameters<typeof verifyDraftEvidence>[0];
 if(remote.id!==d.gmail_draft_id||!message?.id||!/^[A-Za-z0-9_-]+$/.test(message.id))throw Error('email_draft_changed');
 const verified=await verifyDraftEvidence(message,{...d.snapshot.expected,gmailId:message.id},async id=>{
  const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/attachments/${encodeURIComponent(id)}`,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok){await response.body?.cancel();throw Error('gmail_unavailable');}
  const value=JSON.parse(new TextDecoder().decode(await boundedBody(response,18*1024*1024))) as {data?:string};if(typeof value.data!=='string')throw Error('gmail_unavailable');return decodeUrl64(value.data);
 });
 if(verified.status!=='verified')throw Error('email_draft_changed');
 const claim=await emailRpc<Delivery>(env,'ar_mail_claim_draft_send',{p_actor:actor,p_id:d.id,p_revision:revision,p_expected:d.snapshot.expected,p_policy_version:policyVersion??null});
 assertDelivery(claim);if(!claim.claimed)return deliveryView(claim);
 // Send the existing ID with the exact reviewed MIME, not a new message. This
 // also fences Gmail edits between our read and send. Never retry this POST.
 try{
  const result=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/drafts/send',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:d.gmail_draft_id,message:{raw,...(expected.thread?{threadId:expected.thread.threadId}:{})}})});
  if(typeof result.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(result.id))throw Error('gmail_unavailable');
  return confirmAcknowledgedSend(env,actor,claim,result.id,new Date().toISOString());
 }catch{try{await record(env,actor,claim,'awaiting_evidence',null,null,'provider_result_unconfirmed');}catch{/* The one-time claim still fences any resend. */}}
 try{return await checkDelivery(env,actor,d.id);}catch{return {...deliveryView(claim),state:'awaiting_evidence',recorded:false};}
}
const testSourceKey=(s?:TestSupplementals)=>JSON.stringify(s?[s.draftId,s.revision,s.ids]:null);
export async function sendDiagnostic(env:EmailEnv,actor:string,id:string,recipient:string,supplementals?:TestSupplementals,rich=false,replyToDeliveryId?:string,region?:MailboxId){
 await assertAcceptanceRecipient(env,{to:[recipient],cc:[],bcc:[]});
 assertWritesEnabled(env);
 if(replyToDeliveryId&&supplementals)throw Error('email_invalid');
 let mailbox:MailboxId=region??'phuket';if(replyToDeliveryId){const source=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:replyToDeliveryId});if(!source||source.owner!==actor||source.mode!=='test'||source.state!=='sent'||source.draft_id!==null)throw Error('email_test_command_conflict');const identity=frozenMailIdentity(source.snapshot.expected);if(region&&region!==identity.mailbox)throw Error('email_test_command_conflict');mailbox=identity.mailbox;}
 if(supplementals){const source=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:supplementals.draftId});if(!source)throw Error('email_missing');const derived=hotelMailbox(source.hotel);if(region&&region!==derived)throw Error('email_forbidden');mailbox=derived;}
 const identity={mailbox,sender:mailboxSender(mailbox)};const recipients=parseRecipients({to:[recipient],cc:[],bcc:[]});if(!await gmailCanRead(env,actor,mailbox))throw Error('gmail_read_permission_required');
 const recipientHash=await hash(new TextEncoder().encode(JSON.stringify({to:recipients.to.map(s=>s.toLowerCase()),cc:[],bcc:[]})));
 const existing=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});if(existing){if(existing.mode!=='test'||frozenMailIdentity(existing.snapshot.expected).mailbox!==mailbox||existing.snapshot.expected.recipientHash!==recipientHash||testSourceKey(existing.snapshot.expected.supplementalSource)!==testSourceKey(supplementals)||!!existing.snapshot.expected.richBody!==rich||existing.snapshot.expected.replyToDeliveryId!==replyToDeliveryId)throw Error('email_test_command_conflict');return deliveryView(existing);}
 const extraFiles:MailFile[]=[];if(supplementals){const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:supplementals.draftId});if(!draft)throw Error('email_missing');await requireRegionalDelivery(env,draft);if(draft.revision!==supplementals.revision)throw Error('email_revision_conflict');const selected=supplementals.ids.map(fileId=>{const file=draft.attachments.find(a=>a.id===fileId);if(!file)throw Error('email_attachment_missing');return file;});if(selected.reduce((n,f)=>n+f.byte_count,0)>draftBudget(env))throw Error('email_too_large');for(const file of selected)extraFiles.push(await readMailFile(env,draft,file));}
 const reply=replyToDeliveryId?(await syntheticConversation(env,actor,replyToDeliveryId,recipientHash)).choice:null;
 const thread:ThreadProof|null=reply?{threadId:reply.threadId,parentMessageId:reply.parentMessageId,rfcMessageId:reply.rfcMessageId,references:reply.references,subject:reply.subject,parentDate:reply.parentDate}:null;
 const messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`,subject=reply?reply.subject:supplementals?'Katathani AR Workspace — attachment verification':'Katathani AR Workspace — direct send verification';
 const body='This is an authorized one-time integration test sent directly by AR Workspace on Cloudflare. Includes a system-generated synthetic PDF and any supplemental files explicitly selected for this test. This test does not change billing, collection stages or financial balances.';
 const richBody=rich?plainMessage(body):null;if(richBody)richBody.blocks[0].runs[0].bold=true;
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica);page.drawText('AR Workspace - Email integration test',{x:45,y:775,size:18,font});page.drawText('Synthetic document only. No customer or invoice data.',{x:45,y:735,size:11,font});page.drawText('No billing or collection activity will be recorded.',{x:45,y:710,size:11,font});const bytes=await pdf.save();
 const files:MailFile[]=[{name:'AR-Workspace-Test.pdf',mime:'application/pdf',bytes},...extraFiles];if(files.length>50||files.reduce((n,f)=>n+f.bytes.length,0)>draftBudget(env))throw Error('email_too_large');
 const expected={...identity,messageId,subject,body,...(thread?{thread,replyToDeliveryId}:{}),...(richBody?{richBody}:{}),files:await Promise.all(files.map(async f=>({name:f.name,byte_count:f.bytes.length,sha256:await hash(f.bytes)}))),recipientHash,...(supplementals?{supplementalSource:supplementals}:{})};
 const raw=url64(buildMime({revision:0,purpose:'billing',recipients,subject,body,richBody},files,messageId,reply,identity)),token=await gmailToken(env,actor,mailbox);
 const claim=await emailRpc<Delivery>(env,'ar_mail_claim',{p_actor:actor,p_id:id,p_draft:null,p_revision:null,p_mode:'test',p_stage:null,p_message_id:messageId,p_expected:expected});
 return submit(env,actor,claim,raw,token);
}
/** Synthetic signature previews only: no document/Invoice scope or billing events. */
export async function sendSignatureDiagnostic(env:EmailEnv,actor:string,id:string,recipient:string,hotel:string){
 if(!isHotelId(hotel)||env.REQUEST_ACCESS)throw Error('email_invalid');
 const mailbox=hotelMailbox(hotel),identity={mailbox,sender:mailboxSender(mailbox)};assertWritesEnabled(env);const recipients=parseRecipients({to:[recipient],cc:[],bcc:[]});await assertAcceptanceRecipient(env,recipients);
 const recipientHash=await hash(new TextEncoder().encode(JSON.stringify({to:recipients.to.map(s=>s.toLowerCase()),cc:[],bcc:[]})));
 const existing=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});
 if(existing){if(existing.mode!=='test'||existing.snapshot.expected.recipientHash!==recipientHash||existing.snapshot.expected.signatureHotel!==hotel)throw Error('email_test_command_conflict');return deliveryView(existing);}
 if(!await gmailCanRead(env,actor,mailbox))throw Error('gmail_read_permission_required');
 const profile=parseSignatureProfile(await emailRpc(env,'ar_access_signature_get',{p_actor:env.REQUEST_ACTOR??actor}));
 const sample=!profile.signature.name||!profile.signature.title;
 const signature={...profile.signature,name:profile.signature.name||'Sample staff name',title:profile.signature.title||'Sample position',workplace:signatureWorkplace(hotel)};
 const subject=`Email signature preview — ${hotel} — ${signatureWorkplace(hotel)}`;
 const richBody={...plainMessage(`This is a test preview of the email signature for ${signatureWorkplace(hotel)}.${sample?' Sample staff details are used for this preview.':''} No customer documents are included.`),signature};
 const body=richText(richBody),logo=signatureLogoFile(),messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`;
 const expected={...identity,messageId,subject,body,richBody,signatureHotel:hotel,recipientHash,files:[{name:logo.name,byte_count:logo.bytes.length,sha256:await hash(logo.bytes),inlineId:logo.inlineId}]};
 const raw=url64(buildMime({revision:0,purpose:'billing',recipients,subject,body,richBody},[],messageId,null,identity)),token=await gmailToken(env,actor,mailbox);
 const claim=await emailRpc<Delivery>(env,'ar_mail_claim',{p_actor:actor,p_id:id,p_draft:null,p_revision:null,p_mode:'test',p_stage:null,p_message_id:messageId,p_expected:expected});
 return submit(env,actor,claim,raw,token);
}
export async function checkDelivery(env:EmailEnv,actor:string,id:string){
 const d=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});if(!d)throw Error('email_missing');if(d.state==='sent')return deliveryView(d);
 const identity=frozenMailIdentity(d.snapshot.expected);if(!await gmailCanRead(env,actor,identity.mailbox))throw Error('gmail_read_permission_required');const token=await gmailToken(env,actor,identity.mailbox),headers={Authorization:'Bearer '+token};
 // A durable provider receipt from our own successful send already proves the
 // submitted MIME was accepted. Retrying its history only needs Gmail's date,
 // not another download/inspection of the message or attachments. Draft-create
 // receipts and uncertain POSTs never enter this path.
 if(d.mode!=='test'&&!d.verified_sent_evidence&&submittedSendReceipt(d)&&d.provider_receipt_id){
  try{
   const id=d.provider_receipt_id;
   const message=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata`,{headers});
   const labels=message.labelIds;
   const time=Number(message.internalDate);
   if(message.id!==id||!Array.isArray(labels)||!labels.includes('SENT')||labels.includes('DRAFT')||!Number.isSafeInteger(time)||time<1||time>Date.now()+300000)throw Error('gmail_metadata_unavailable');
   return confirmAcknowledgedSend(env,actor,d,id,new Date(time).toISOString(),false);
  }catch{return {...deliveryView(d),recorded:false,reason:'history_recording_unavailable'};}
 }
 let hits:{id:string}[]=[];
 // Gmail's web composer can replace RFC Message-ID and remove custom headers.
 // Its recorded message ID is a candidate identity for either path; the complete
 // evidence check below still requires SENT, no DRAFT, exact recipients/content
 // and attachment hashes. Draft creation itself never establishes sending.
 const trustedId=verifiedExternalSend(d)?.gmailId??d.provider_receipt_id;
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
 let message:Record<string,unknown>;
 try{message=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,{headers});}
 catch(error){
  if(!trustedId||!(error instanceof GoogleResponseError)||error.status!==404)throw error;
  // Gmail may replace a draft's provider message ID when a person sends it.
  // Its absence is not SENT evidence and never permits a new send or a weaker match.
  await record(env,actor,d,'review_required',null,null,'gmail_receipt_missing');
  return {...deliveryView(d),state:'review_required',reason:'gmail_receipt_missing',recorded:false};
 }
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
 if(result.status!=='verified'){if(result.status==='review_required')await record(env,actor,d,'review_required',messageId,null,result.reason??'message_content_unverified');return {...deliveryView(d),state:result.status==='not_sent'?d.state:'review_required',reason:result.reason??result.status};}
 try{
  // Preserve independently verified external Sent evidence before the business
  // transaction. This never upgrades a Draft-create receipt or skips verification.
  if(d.mode!=='test'&&!await emailRpc<boolean>(env,'ar_mail_record_verified_sent',{p_actor:actor,p_id:id,p_gmail_id:messageId,p_sent_at:result.sentAt,p_expected:d.snapshot.expected}))throw Error('email_record_unavailable');
  const confirmed=await emailRpc<Record<string,unknown>>(env,'ar_mail_confirm_sent',{p_actor:actor,p_id:id,p_gmail_id:messageId,p_sent_at:result.sentAt});
  if(confirmed.error||!['sent','review_required'].includes(String(confirmed.state)))throw Error('email_record_unavailable');
  if(confirmed.state==='review_required'){
   const fresh=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});
   return {...deliveryView(fresh??d),...confirmed,gmailAccepted:true,sentAt:result.sentAt,reason:fresh?.reason??'history_review_required'};
  }
  return {...deliveryView(d),...confirmed,gmailAccepted:true,sentAt:result.sentAt,reason:null};
 }catch{
  try{const fresh=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});if(fresh?.state==='sent')return deliveryView(fresh);}catch{/* A verified send remains sent even if history cannot be read. */}
  return {...deliveryView(d),state:'awaiting_evidence',gmailAccepted:true,sentAt:result.sentAt,recorded:false,reason:'history_recording_unavailable'};
 }
}
