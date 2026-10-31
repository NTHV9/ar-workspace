import type {CombinedEmail} from '../../src/email/combined';
import {hotelMailbox,mailboxSender} from '../../src/domain/mailboxes';
import {documentJob} from '../documents/jobs';
import {emailRpc,type EmailEnv,type EmailDraft} from './shared';
import {draftBudget,readMailFile} from './gmail-draft';
import {requireRegionalDelivery} from './regional-delivery';
import {signatureLogoFile} from './signature-logo';
import {assertAcceptanceRecipient} from '../acceptance/recipient';
import {buildMime,type MailFile} from './mime';
import {hash,url64} from './crypto';
export async function combinedMemberFiles(env:EmailEnv,actor:string,p:CombinedEmail,memberId:string){
 const member=p.members.find(m=>m.memberId===memberId);if(!member)throw Error('email_missing');
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:member.draftId});
 if(!draft||draft.owner!==actor||draft.id!==member.draftId||draft.document_job_id!==member.documentJobId||draft.document_revision!==member.documentRevision||draft.revision!==member.draftRevision||draft.hotel!==member.hotel||draft.account_id!==member.accountId||draft.purpose!==member.purpose||hotelMailbox(draft.hotel)!==p.mailbox)throw Error('email_package_changed');
 if(draft.package_changed)throw Error('email_package_changed');await requireRegionalDelivery(env,draft);
 const job=await documentJob(env,member.documentJobId);if(job?.preparation_retirement?.accepted||draft.preparation_retirement?.accepted)throw Error('document_preparation_retired');if(job?.bytes_released||draft.bytes_released)throw Error('document_bytes_released');if(job?.closed_at||draft.document_closed_at)throw Error('document_closed');
 if(!job||job.owner!==actor||job.revision!==member.documentRevision||!job.acknowledged||job.hotel!==member.hotel||job.account_id!==member.accountId||job.layout!==member.layout||!member.invoiceIds.length||new Set(member.invoiceIds).size!==member.invoiceIds.length||member.invoiceIds.some(id=>!job.invoice_ids.includes(id))||JSON.stringify(draft.invoice_ids)!==JSON.stringify(member.invoiceIds))throw Error('email_package_changed');
 const manifests=[...draft.exports,...draft.attachments];
 if(manifests.length!==member.files.length||!manifests.length)throw Error('email_package_changed');
 for(let i=0;i<manifests.length;i++){const f=member.files[i],m=manifests[i];if(f.fileId!==member.memberId+':'+i||f.sha256!==m.sha256||f.byteCount!==m.byte_count||!f.name||f.name.length>200||/[\x00-\x1f\x7f<>:"/\\|?*]/.test(f.name))throw Error('email_package_changed');}
 return {draft,manifests,member};
}
export async function prepareCombinedMail(env:EmailEnv,actor:string,p:CombinedEmail,messageId:string){
 await assertAcceptanceRecipient(env,p.content.recipients);
 const logo=p.content.richBody?.signature?signatureLogoFile():null,publicFiles=p.members.flatMap(m=>m.files);
 if(!publicFiles.length||publicFiles.length+(logo?1:0)>50||publicFiles.some(f=>!Number.isSafeInteger(f.byteCount)||f.byteCount<1)||publicFiles.reduce((n,f)=>n+f.byteCount,logo?.bytes.length??0)>draftBudget(env))throw Error('email_too_large');
 if(new Set(publicFiles.map(f=>f.name.toLowerCase())).size!==publicFiles.length)throw Error('email_package_changed');
 const sources=[];for(const member of p.members)sources.push(await combinedMemberFiles(env,actor,p,member.memberId));
 const files:MailFile[]=[];for(const {draft,manifests,member} of sources)for(let i=0;i<manifests.length;i++){const file=await readMailFile(env,draft,manifests[i]);files.push({...file,name:member.files[i].name});}
 const identity={mailbox:p.mailbox,sender:mailboxSender(p.mailbox)},content=p.content;
 const expected={...identity,messageId,signatureHotel:content.signatureHotel,recipients:content.recipients,subject:content.subject,body:content.body,richBody:content.richBody,files:[...publicFiles.map(f=>({name:f.name,byte_count:f.byteCount,sha256:f.sha256})),...(logo?[{name:logo.name,byte_count:logo.bytes.length,sha256:await hash(logo.bytes),inlineId:logo.inlineId}]:[])]};
 return {raw:url64(buildMime({revision:p.revision,purpose:'billing',recipients:content.recipients,subject:content.subject,body:content.body,richBody:content.richBody},files,messageId,null,identity)),expected};
}
