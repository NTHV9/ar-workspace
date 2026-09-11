import {emailRpc,googleJson,boundedBody,type EmailEnv} from './shared';
import {gmailCanRead,gmailToken} from './oauth';
import {verifySentEvidence,decodeUrl64} from './sent-evidence';
import {hash} from './crypto';
import type {Delivery} from './delivery';
const safeId=(v:string)=>/^[A-Za-z0-9_-]{1,200}$/.test(v);
async function source(env:EmailEnv,actor:string,id:string){const d=await emailRpc<Delivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});if(!d||d.owner!==actor||d.mode==='test')throw Error('email_missing');if(!await gmailCanRead(env,actor))throw Error('gmail_read_permission_required');const token=await gmailToken(env,actor),headers={Authorization:'Bearer '+token};const p=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers});if(String(p.emailAddress).toLowerCase()!=='ar@katathani.com')throw Error('email_forbidden');return {d,headers};}
async function inspect(d:Delivery,headers:Record<string,string>,gmailId:string){
 if(!safeId(gmailId))throw Error('email_invalid');const message=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`,{headers});
 const expected={...d.snapshot.expected,gmailId};const result=await verifySentEvidence(message,expected,async id=>{const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}/attachments/${encodeURIComponent(id)}`,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});if(!r.ok){await r.body?.cancel();throw Error('gmail_unavailable');}const data=JSON.parse(new TextDecoder().decode(await boundedBody(r,18*1024*1024))) as {data?:string};if(!data.data)throw Error('gmail_unavailable');return decodeUrl64(data.data);});
 const time=typeof message.internalDate==='string'?Number(message.internalDate):NaN,eligible=result.status==='verified'&&Number.isFinite(time)&&time>=Date.parse(d.created_at)-300000;
 const proof=eligible?await hash(new TextEncoder().encode(JSON.stringify({delivery:d.id,gmailId,sentAt:result.sentAt,expected:d.snapshot.expected}))):null;
 return {gmailId,sentAt:Number.isFinite(time)?new Date(time).toISOString():null,eligible,reason:eligible?null:result.reason??'not_sent',proof};
}
/** Candidate search never records sending. Exact content/attachments are checked
 * before a human can select a message whose original correlation was rewritten. */
export async function sentCandidates(env:EmailEnv,actor:string,id:string,pageToken=''){
 if(pageToken.length>2000)throw Error('email_invalid');const {d,headers}=await source(env,actor,id);
 const q='after:'+Math.floor((Date.parse(d.created_at)-300000)/1000)+' subject:"'+d.snapshot.expected.subject.replace(/["\\]/g,' ')+'"';
 const page=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q,labelIds:'SENT',includeSpamTrash:'true',maxResults:'10',...(pageToken?{pageToken}:{})}),{headers});
 if(page.nextPageToken===pageToken&&pageToken)throw Error('gmail_unavailable');const candidates=(page.messages??[]) as {id:string}[];if(!Array.isArray(candidates)||candidates.length>10||candidates.some(c=>!safeId(c.id)))throw Error('gmail_unavailable');
 const rows=[];for(const candidate of candidates)rows.push(await inspect(d,headers,candidate.id));return {rows,nextPageToken:page.nextPageToken??null,subject:d.snapshot.expected.subject,recordsHistory:false};
}
export async function reviewSentMatch(env:EmailEnv,actor:string,id:string,input:{gmailId:string;proof:string;reason:string;confirmed:boolean}){
 if(input.confirmed!==true||!safeId(input.gmailId)||!/^[0-9a-f]{64}$/.test(input.proof)||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>1000)throw Error('email_invalid');
 const {d,headers}=await source(env,actor,id),fresh=await inspect(d,headers,input.gmailId);if(!fresh.eligible||fresh.proof!==input.proof)throw Error('email_sent_match_changed');
 return emailRpc(env,'ar_mail_reviewed_sent',{p_actor:actor,p_id:id,p_gmail_id:input.gmailId,p_sent_at:fresh.sentAt,p_proof:input.proof,p_reason:input.reason.trim()});
}
