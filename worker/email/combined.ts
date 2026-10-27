import type {CombinedEmail,CombinedContent,CombinedMemberInput} from '../../src/email/combined';
import {isHotelId} from '../../src/domain/hotels';
import {hotelMailbox} from '../../src/domain/mailboxes';
import {signatureWorkplace} from '../../src/email/signature';
import {parseEmailDraft} from './validation';
import {uuidPattern} from '../documents/jobs';
import {emailRpc,type EmailEnv} from './shared';
import {assertWritesEnabled} from '../operations/write-hold';
import {gmailCanRead,gmailToken} from './oauth';
import {deliveryView,submit,type Delivery} from './delivery';
import {prepareCombinedMail} from './combined-files';
const invalid=():never=>{throw Error('email_invalid');};
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return invalid();return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))invalid();}
export function combinedRevision(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<0)invalid();return Number(v);}
export function combinedId(v:unknown){if(typeof v!=='string'||!uuidPattern.test(v))return invalid();return v;}
export function parseCombinedContent(value:unknown):CombinedContent{
 const v=object(value);keys(v,['recipients','subject','body','richBody','signatureHotel']);if(!isHotelId(v.signatureHotel))return invalid();
 const p=parseEmailDraft({revision:0,purpose:'billing',recipients:v.recipients,subject:v.subject,body:v.body,richBody:v.richBody});
 return {recipients:p.recipients,subject:p.subject,body:p.body,richBody:p.richBody??null,signatureHotel:v.signatureHotel};
}
export function parseCombinedInput(value:unknown){
 const v=object(value);keys(v,['id','revision','commandId','members','content']);const id=combinedId(v.id),revision=combinedRevision(v.revision),commandId=combinedId(v.commandId);
 if(!Array.isArray(v.members)||!v.members.length||v.members.length>50)return invalid();
 const members:CombinedMemberInput[]=v.members.map(value=>{const m=object(value);keys(m,['memberId','documentJobId','documentRevision','draftId','draftRevision','stage','policyVersion']);
 if(!(m.stage===null||typeof m.stage==='string'&&m.stage.length>0&&m.stage.length<=100)||!(m.policyVersion===null||Number.isSafeInteger(m.policyVersion)&&Number(m.policyVersion)>0))return invalid();
 return {memberId:combinedId(m.memberId),documentJobId:combinedId(m.documentJobId),documentRevision:combinedRevision(m.documentRevision),draftId:combinedId(m.draftId),draftRevision:combinedRevision(m.draftRevision),stage:m.stage as string|null,policyVersion:m.policyVersion as number|null};});
 for(const key of ['memberId','draftId','documentJobId'] as const)if(new Set(members.map(m=>m[key])).size!==members.length)invalid();
 return {id,revision,commandId,members,content:parseCombinedContent(v.content)};
}
export function validateCombinedSignature(env:EmailEnv,actor:string,content:CombinedContent){const signature=content.richBody?.signature;if(signature&&(signature.staffId!==(env.REQUEST_ACTOR??actor)||signature.workplace!==signatureWorkplace(content.signatureHotel)))throw Error('email_signature_changed');}
/** Explicit public projection: SQL may retain private draft/workflow snapshots. */
export function combinedPublic(value:CombinedEmail):CombinedEmail {
 const delivery=value.delivery;
 return {id:value.id,revision:value.revision,mailbox:value.mailbox,content:parseCombinedContent(value.content),
  members:value.members.map(m=>({memberId:m.memberId,documentJobId:m.documentJobId,documentRevision:m.documentRevision,draftId:m.draftId,draftRevision:m.draftRevision,stage:m.stage,policyVersion:m.policyVersion,hotel:m.hotel,accountId:m.accountId,accountName:m.accountName,invoiceIds:m.invoiceIds,purpose:m.purpose,layout:m.layout,stageLabel:m.stageLabel,files:(m.files??[]).map(f=>({fileId:f.fileId,name:f.name,byteCount:f.byteCount,sha256:f.sha256}))})),
  totals:value.totals?{accounts:value.totals.accounts,invoices:value.totals.invoices,files:value.totals.files,bytes:value.totals.bytes}:value.totals,
  delivery:delivery?{id:delivery.id,state:delivery.state,mode:delivery.mode,gmailAccepted:delivery.gmailAccepted,recorded:delivery.recorded,reason:delivery.reason,stage:delivery.stage,stageLabel:delivery.stageLabel,sentAt:delivery.sentAt,...(delivery.preparationRetirement?.accepted===true?{preparationRetirement:{accepted:true as const}}:{})}:null};
}
export async function getCombined(env:EmailEnv,actor:string,id:string):Promise<CombinedEmail>{
 const value=await emailRpc<CombinedEmail&{error?:string}|null>(env,'ar_combined_email_get',{p_actor:actor,p_id:id});if(!value)throw Error('email_missing');if(value.error)throw Error(value.error);return combinedPublic(value);
}
export async function saveCombined(env:EmailEnv,actor:string,value:unknown){assertWritesEnabled(env);const v=parseCombinedInput(value);validateCombinedSignature(env,actor,v.content);return emailRpc(env,'ar_combined_email_save',{p_actor:actor,p_id:v.id,p_revision:v.revision,p_command:v.commandId,p_members:v.members,p_content:v.content});}
export async function sendCombined(env:EmailEnv,actor:string,id:string,value:unknown){
 assertWritesEnabled(env);const v=object(value);keys(v,['revision','commandId','confirmed']);if(v.confirmed!==true)invalid();const revision=combinedRevision(v.revision),commandId=combinedId(v.commandId);
 const preparation=await getCombined(env,actor,id);if(preparation.revision!==revision)throw Error('email_revision_conflict');if(preparation.delivery)return preparation.delivery;
 const content=parseCombinedContent(preparation.content);validateCombinedSignature(env,actor,content);
 if(!preparation.members.some(m=>m.hotel===content.signatureHotel)||preparation.members.some(m=>hotelMailbox(m.hotel)!==preparation.mailbox)||hotelMailbox(content.signatureHotel)!==preparation.mailbox)throw Error('email_forbidden');
 if(!content.recipients.to.length||!content.subject.trim()||!content.body.trim())throw Error('email_incomplete');
 if(!await gmailCanRead(env,actor,preparation.mailbox))throw Error('gmail_read_permission_required');
 const messageId=`<${commandId}@ar-workspace.ar-c82.workers.dev>`;const {raw,expected}=await prepareCombinedMail(env,actor,preparation,messageId);
 const token=await gmailToken(env,actor,preparation.mailbox);
 const claim=await emailRpc<Delivery>(env,'ar_combined_mail_claim',{p_actor:actor,p_id:commandId,p_preparation:id,p_revision:revision,p_message_id:messageId,p_expected:expected});
 if(claim.error)throw Error(claim.error);if(!claim.claimed)return deliveryView(claim);
 return submit(env,actor,claim,raw,token);
}
