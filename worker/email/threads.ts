import type {ThreadChoice,ThreadList,ThreadMessage,ThreadPreview,ThreadSummary} from '../../src/email/threads';
import {parseRecipients,validMailbox,type Recipients} from '../settings/validation';
import {emailRpc,googleJson,type EmailDraft,type EmailEnv} from './shared';
import {gmailCanRead,gmailToken} from './oauth';
import {unbase64} from './crypto';

const sender='ar@katathani.com';
export type ThreadProof=Omit<ThreadChoice,'matchedRecipients'>&{matchedRecipients?:string[]};
const invalid=():never=>{throw Error('email_thread_invalid');};
export function providerId(v:unknown):string {if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))return invalid();return v;}
export function rfcIds(v:string):string[]{
 if(typeof v!=='string'||v.length>16000||/[\r\n\x00-\x1f\x7f]/.test(v))return invalid();
 if(!v.trim())return [];
 const ids=v.trim().split(/ +/);if(ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>id.length>900||!/^<[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*>$/.test(id)))return invalid();return ids;
}
export function externalRecipients(recipients:Recipients):string[]{
 const v=parseRecipients(recipients);return [...v.to,...v.cc].map(s=>s.toLowerCase()).filter(s=>s!==sender).sort();
}
export function validateReplyHeaders(v:ThreadProof){
 providerId(v.threadId);providerId(v.parentMessageId);
 if(rfcIds(v.rfcMessageId).length!==1||!Array.isArray(v.references)||!v.references.length||v.references.some(s=>typeof s!=='string')||JSON.stringify(rfcIds(v.references.join(' ')))!==JSON.stringify(v.references)||v.references.at(-1)!==v.rfcMessageId||typeof v.subject!=='string'||!v.subject.trim()||v.subject.length>998||/[\x00-\x1f\x7f]/.test(v.subject)||!Number.isFinite(Date.parse(v.parentDate)))return invalid();
}
export function validateThreadChoice(v:ThreadChoice,recipients?:Recipients,subject?:string):ThreadChoice {
 validateReplyHeaders(v);
 if(!Array.isArray(v.matchedRecipients)||!v.matchedRecipients.length||new Set(v.matchedRecipients).size!==v.matchedRecipients.length||v.matchedRecipients.some(s=>typeof s!=='string'||!validMailbox(s)||s!==s.toLowerCase()||s===sender))return invalid();
 if(subject!==undefined&&v.subject!==subject)throw Error('email_thread_subject_locked');
 if(recipients&&!externalRecipients(recipients).some(s=>v.matchedRecipients.includes(s)))throw Error('email_thread_unrelated');
 return v;
}
function addresses(v:string):string[]{
 if(!v.trim())return [];
 if(v.length>16000||/[\r\n\x00-\x1f\x7f;]/.test(v))return invalid();
 const pieces=v.match(/(?:[^,"]|"[^"]*")+/g)??[];
 // Require complete comma-separated mailboxes; reject unbalanced or leftover syntax.
 if(pieces.join(',').replace(/\s/g,'')!==v.replace(/\s/g,''))return invalid();
 const result=pieces.map(piece=>{const s=piece.trim();const angle=/^(?:[^<>]*)<([^<>]+)>$/.exec(s);const value=(angle?angle[1]:s).toLowerCase();if(!validMailbox(value))return invalid();return value;});
 if(result.length>400||new Set(result).size!==result.length)return invalid();return result;
}
function subjectText(v:string){
 const decoded=v.replace(/\?=\s+=\?/g,'?==?').replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi,(_,encoding:string,data:string)=>new TextDecoder('utf-8',{fatal:true}).decode(encoding.toLowerCase()==='b'?unbase64(data):Uint8Array.from(data.replaceAll('_',' ').replace(/=([0-9a-f]{2})/gi,(_x,n:string)=>String.fromCharCode(parseInt(n,16))),c=>c.charCodeAt(0))));
 if(!decoded.trim()||decoded.length>998||/[\x00-\x1f\x7f]/.test(decoded)||/=\?[^?]+\?/.test(decoded))return invalid();return decoded;
}
interface ParsedMessage extends ThreadMessage {cc:string[];rfcMessageId:string;references:string[];replyTo:string[];draft:boolean}
interface Conversation {thread:ThreadSummary;messages:ParsedMessage[];historyId:string}
export function parseConversation(value:Record<string,unknown>,threadId:string,recipients:Recipients,selectedRfcId?:string):Conversation {
 if(providerId(value.id)!==providerId(threadId))return invalid();
 if(typeof value.historyId!=='string'||!/^\d{1,30}$/.test(value.historyId))return invalid();
 if(!Array.isArray(value.messages)||!value.messages.length)throw Error('email_thread_unavailable');
 if(value.messages.length>1000)throw Error('email_thread_too_large');
 const ids=new Set<string>(),rfcs=new Set<string>();
 const messages:ParsedMessage[]=value.messages.map((row:unknown)=>{
  if(!row||typeof row!=='object')return invalid();const m=row as Record<string,unknown>;const id=providerId(m.id);
  if(providerId(m.threadId)!==threadId||ids.has(id))return invalid();ids.add(id);
  const payload=m.payload as {headers?:unknown}|undefined;if(!Array.isArray(payload?.headers))return invalid();
  const headers=payload.headers as unknown[];
  const header=(name:string,required=false)=>{const matches=headers.filter(h=>h&&typeof h==='object'&&typeof (h as {name?:unknown}).name==='string'&&(h as {name:string}).name.toLowerCase()===name.toLowerCase());if(matches.length>1||required&&matches.length!==1)return invalid();const raw=(matches[0] as {value?:unknown}|undefined)?.value??'';if(typeof raw!=='string')return invalid();const v=raw.replace(/\r\n[ \t]+/g,' ');if(/[\r\n\x00-\x1f\x7f]/.test(v))return invalid();return v;};
  const rfc=rfcIds(header('Message-ID',true));if(rfc.length!==1||rfcs.has(rfc[0]))return invalid();rfcs.add(rfc[0]);
  const references=rfcIds(header('References')),replyTo=rfcIds(header('In-Reply-To'));if(references.includes(rfc[0]))return invalid();
  const from=addresses(header('From',true));if(from.length!==1)return invalid();const to=addresses(header('To')),cc=addresses(header('Cc'));
  const date=Number(m.internalDate);if(!Number.isSafeInteger(date)||date<1||date>Date.now()+300000)return invalid();
  const labels=m.labelIds??[];if(!Array.isArray(labels)||labels.some(s=>typeof s!=='string')||m.snippet!==undefined&&(typeof m.snippet!=='string'||m.snippet.length>4000))return invalid();
  const draft=labels.includes('DRAFT');const direction:ThreadMessage['direction']=from[0]===sender?'outgoing':to.includes(sender)||cc.includes(sender)?'incoming':'unknown';
  return {id,date:new Date(date).toISOString(),from:from[0],to,cc,subject:subjectText(header('Subject',true)),snippet:typeof m.snippet==='string'?m.snippet:'',direction,matchesReply:!!selectedRfcId&&replyTo.includes(selectedRfcId),rfcMessageId:rfc[0],references,replyTo,draft};
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const participants=[...new Set(messages.flatMap(m=>[m.from,...m.to,...m.cc]))].sort();
 if(!externalRecipients(recipients).some(s=>participants.includes(s)))throw Error('email_thread_unrelated');
 const latest=messages.filter(m=>!m.draft).at(-1);if(!latest)throw Error('email_thread_unavailable');
 return {thread:{threadId,parentMessageId:latest.id,subject:latest.subject,participants,latestAt:latest.date,messageCount:messages.length},messages,historyId:value.historyId};
}
export function chooseParent(conversation:Conversation,recipients:Recipients,parentId:string):ThreadChoice {
 const parent=conversation.messages.find(m=>m.id===providerId(parentId));if(!parent||parent.draft)throw Error('email_thread_invalid');
 const matchedRecipients=externalRecipients(recipients).filter(s=>[parent.from,...parent.to,...parent.cc].includes(s));
 if(!matchedRecipients.length)throw Error('email_thread_unrelated');
 const ancestors=parent.references.length?parent.references:parent.replyTo.length===1?parent.replyTo:[];
 return validateThreadChoice({threadId:conversation.thread.threadId,parentMessageId:parent.id,rfcMessageId:parent.rfcMessageId,references:[...ancestors,parent.rfcMessageId],subject:parent.subject,matchedRecipients,parentDate:parent.date});
}
async function tokenForRead(env:EmailEnv,actor:string){if(!await gmailCanRead(env,actor))throw Error('gmail_read_permission_required');return gmailToken(env,actor);}
const metadataQuery=(message=false)=>{const q=new URLSearchParams({format:'metadata',fields:message?'id,threadId,labelIds,internalDate,snippet,payload/headers':'id,historyId,messages(id,threadId,labelIds,internalDate,snippet,payload/headers)'});for(const name of ['Message-ID','References','In-Reply-To','Subject','From','To','Cc'])q.append('metadataHeaders',name);return q;};
async function readConversation(token:string,id:string,recipients:Recipients,selectedRfcId?:string){
 try{return parseConversation(await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${providerId(id)}?${metadataQuery()}`,{headers:{Authorization:'Bearer '+token}}),id,recipients,selectedRfcId);}catch(e){if(e instanceof Error&&e.message==='email_too_large')throw Error('email_thread_too_large');throw e;}
}
async function accessibleDraft(env:EmailEnv,actor:string,id:string,revision:number){
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:id});if(!draft)throw Error('email_missing');
 if(draft.owner!==actor)throw Error('email_forbidden');if(draft.revision!==revision)throw Error('email_revision_conflict');if(draft.package_changed)throw Error('email_package_changed');return draft;
}
export async function listThreads(env:EmailEnv,actor:string,id:string,revision:number,pageToken?:string):Promise<ThreadList>{
 const draft=await accessibleDraft(env,actor,id,revision),recipients=externalRecipients(draft.recipients);if(!recipients.length)throw Error('email_thread_recipients_required');
 if(recipients.length>100)throw Error('email_thread_too_large');
 if(pageToken!==undefined&&(pageToken.length>2048||!/^[-A-Za-z0-9_=]+$/.test(pageToken)))return invalid();
 const token=await tokenForRead(env,actor);
 const q=new URLSearchParams({q:'-in:trash -in:spam {'+recipients.flatMap(s=>['from:"'+s+'"','to:"'+s+'"','cc:"'+s+'"']).join(' ')+'}',maxResults:'10',...(pageToken?{pageToken}:{})});
 const page=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/threads?'+q,{headers:{Authorization:'Bearer '+token}});
 if(page.threads!==undefined&&!Array.isArray(page.threads))return invalid();const rows=(page.threads??[]) as {id?:unknown}[];
 if(rows.length>10||new Set(rows.map(r=>providerId(r.id))).size!==rows.length)return invalid();
 const threads:ThreadSummary[]=[];for(const row of rows)threads.push((await readConversation(token,providerId(row.id),draft.recipients)).thread);
 const nextPageToken=page.nextPageToken===undefined?null:page.nextPageToken;if(nextPageToken!==null&&(typeof nextPageToken!=='string'||nextPageToken.length>2048||!/^[-A-Za-z0-9_=]+$/.test(nextPageToken)||nextPageToken===pageToken))return invalid();
 return {threads,nextPageToken:nextPageToken as string|null};
}
function preview(conversation:Conversation,offset:number,historyId?:string):ThreadPreview {
 if(!Number.isSafeInteger(offset)||offset<0||offset>=conversation.messages.length&&offset!==0)return invalid();
 if(offset>0&&!historyId)return invalid();if(historyId!==undefined&&historyId!==conversation.historyId)throw Error('email_thread_changed');
 return {thread:conversation.thread,messages:conversation.messages.slice(offset,offset+50).map(({id,date,from,to,subject,snippet,direction,matchesReply})=>({id,date,from,to,subject,snippet,direction,matchesReply})),nextMessageOffset:offset+50<conversation.messages.length?offset+50:null,checkedAt:new Date().toISOString(),historyId:conversation.historyId};
}
export async function previewThread(env:EmailEnv,actor:string,id:string,revision:number,threadId:string,offset=0,historyId?:string){const d=await accessibleDraft(env,actor,id,revision);return preview(await readConversation(await tokenForRead(env,actor),threadId,d.recipients,d.thread?.rfcMessageId),offset,historyId);}
export interface SavedDraftScope {hotel:'KAT'|'TSK';accountId:string;draftId:string}
/** Historical inspection does not grant permission to edit, select a thread, or send. */
export async function savedDraftForReview(env:EmailEnv,actor:string,scope:SavedDraftScope):Promise<EmailDraft> {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 if(!uuid.test(actor))throw Error('email_forbidden');
 if(!uuid.test(scope.draftId)||!['KAT','TSK'].includes(scope.hotel)||typeof scope.accountId!=='string'||!scope.accountId.trim()||scope.accountId.length>200||/[\x00-\x1f\x7f]/.test(scope.accountId))throw Error('email_invalid');
 const draft=await emailRpc<EmailDraft|null>(env,'ar_email_get',{p_actor:actor,p_id:scope.draftId});if(!draft)throw Error('email_missing');
 if(draft.owner!==actor||draft.id!==scope.draftId||draft.hotel!==scope.hotel||draft.account_id!==scope.accountId)throw Error('email_forbidden');
 if(!uuid.test(draft.document_job_id)||!Number.isSafeInteger(draft.revision)||draft.revision<0||!Number.isSafeInteger(draft.document_revision)||draft.document_revision<0||typeof draft.package_changed!=='boolean'||typeof draft.subject!=='string'||typeof draft.body!=='string'||!['billing','collection'].includes(draft.purpose))throw Error('email_invalid');
 parseRecipients(draft.recipients);if(draft.thread)validateThreadChoice(draft.thread,draft.recipients,draft.subject);
 return draft;
}
/** The only provider ID comes from the owner/scoped saved choice, never from the URL. */
export async function previewSavedDraftThread(env:EmailEnv,actor:string,scope:SavedDraftScope,revision:number,offset=0,historyId?:string):Promise<ThreadPreview> {
 if(!Number.isSafeInteger(revision)||revision<0||!Number.isSafeInteger(offset)||offset<0||offset>0&&!historyId||historyId!==undefined&&!/^\d{1,30}$/.test(historyId))return invalid();
 const draft=await savedDraftForReview(env,actor,scope);if(draft.revision!==revision)throw Error('email_revision_conflict');if(!draft.thread)throw Error('email_thread_not_selected');
 const saved=validateThreadChoice(draft.thread,draft.recipients,draft.subject);
 const conversation=await readConversation(await tokenForRead(env,actor),saved.threadId,draft.recipients,saved.rfcMessageId);
 const parent=chooseParent(conversation,draft.recipients,saved.parentMessageId);
 if(parent.rfcMessageId!==saved.rfcMessageId||JSON.stringify(parent.references)!==JSON.stringify(saved.references)||parent.subject!==saved.subject||parent.parentDate!==saved.parentDate)throw Error('email_thread_changed');
 return preview(conversation,offset,historyId);
}
export async function selectThread(env:EmailEnv,actor:string,id:string,revision:number,threadId:string|null,parentId?:string){
 const d=await accessibleDraft(env,actor,id,revision);
 const choice=threadId===null?null:chooseParent(await readConversation(await tokenForRead(env,actor),threadId,d.recipients),d.recipients,providerId(parentId));
 return emailRpc(env,'ar_email_thread_select',{p_actor:actor,p_id:id,p_revision:revision,p_choice:choice});
}
export async function revalidateThread(env:EmailEnv,actor:string,draft:Pick<EmailDraft,'thread'|'recipients'|'subject'>):Promise<ThreadChoice|null>{
 if(!draft.thread)return null;const old=validateThreadChoice(draft.thread,draft.recipients,draft.subject);
 const fresh=chooseParent(await readConversation(await tokenForRead(env,actor),old.threadId,draft.recipients),draft.recipients,old.parentMessageId);
 if(fresh.rfcMessageId!==old.rfcMessageId||JSON.stringify(fresh.references)!==JSON.stringify(old.references)||fresh.subject!==old.subject||fresh.parentDate!==old.parentDate)throw Error('email_thread_changed');
 // Keep the exact saved choice as the atomic claim fence; overlap was freshly checked above.
 return old;
}
interface SyntheticDelivery {id:string;owner:string;mode:string;state:string;draft_id:string|null;gmail_id:string|null;snapshot:{expected:{recipientHash?:string;subject:string}}}
export async function syntheticConversation(env:EmailEnv,actor:string,id:string,recipientHash?:string){
 const delivery=await emailRpc<SyntheticDelivery|null>(env,'ar_mail_get',{p_actor:actor,p_id:id});
 if(!delivery||delivery.owner!==actor||delivery.mode!=='test'||delivery.state!=='sent'||delivery.draft_id!==null||!delivery.gmail_id||!delivery.snapshot.expected.recipientHash||(recipientHash&&delivery.snapshot.expected.recipientHash!==recipientHash))throw Error('email_test_command_conflict');
 const token=await tokenForRead(env,actor);
 const message=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerId(delivery.gmail_id)}?${metadataQuery(true)}`,{headers:{Authorization:'Bearer '+token}});
 if(providerId(message.id)!==delivery.gmail_id||!Array.isArray(message.labelIds)||!message.labelIds.includes('SENT')||message.labelIds.includes('DRAFT'))return invalid();
 const headers=(message.payload as {headers?:{name:string;value:string}[]}|undefined)?.headers??[];
 const to=headers.filter(h=>h.name.toLowerCase()==='to');const cc=headers.filter(h=>h.name.toLowerCase()==='cc');
 if(to.length!==1||cc.some(h=>h.value.trim()))return invalid();const recipients={to:addresses(to[0].value),cc:[],bcc:[]};if(recipients.to.length!==1)return invalid();
 const {hash}=await import('./crypto');const digest=await hash(new TextEncoder().encode(JSON.stringify(recipients)));if(digest!==delivery.snapshot.expected.recipientHash)throw Error('email_test_command_conflict');
 const conversation=await readConversation(token,providerId(message.threadId),recipients);
 const choice=chooseParent(conversation,recipients,delivery.gmail_id);const parent=conversation.messages.find(m=>m.id===delivery.gmail_id);if(parent?.from!==sender||choice.subject!==delivery.snapshot.expected.subject)throw Error('email_thread_changed');
 return {conversation,choice};
}
export async function previewSyntheticConversation(env:EmailEnv,actor:string,id:string,offset=0,historyId?:string){const {conversation,choice}=await syntheticConversation(env,actor,id);for(const m of conversation.messages)m.matchesReply=m.replyTo.includes(choice.rfcMessageId);return preview(conversation,offset,historyId);}
