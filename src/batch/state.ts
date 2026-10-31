import {retainRetirementProjection} from '../email/delivery-status';
import type {CombinedContent,CombinedEmail,CombinedMemberInput} from '../email/combined';
import {defaultSelfCc} from '../email/default-recipients';
import type {HotelId} from '../domain/hotels';
import {hotelInRegion,isRegionId,type RegionId} from '../domain/hotels';
import type {DocumentJob} from '../../worker/documents/jobs';
import type {EmailDeliveryView} from '../../worker/email/shared';
import type {BatchSelection} from './selection';
export interface BatchOptions {content:'both'|'statement'|'invoices';layout:'combined'|'statement_bundle'|'separate'}
export interface CombinedSavePayload {id:string;revision:number;commandId:string;members:CombinedMemberInput[];content:CombinedContent}
export interface CombinedPendingSave {payload:CombinedSavePayload}
export interface CombinedBatchState {observedDelivery?:EmailDeliveryView;pendingSave?:CombinedPendingSave;id:string;revision:number;commandId:string;sendCommandId:string;content:CombinedContent;attempted?:boolean;saved?:CombinedEmail}
export interface BatchEntry {pdfDelivery?:'combined'|'split'|'separate';selection:BatchSelection;commandKey:string;jobId?:string;requested?:boolean;error?:string;stage?:string;policyVersion?:number|null;mailDraftId?:string;mailRevision?:number;attempted?:boolean;delivery?:EmailDeliveryView}
export interface BatchRecord {emailMode?:'separate'|'combined';combined?:CombinedBatchState;version:1;id:string;owner:string;workspaceOwner?:string;region:RegionId;phase?:'pdf'|'email';options:BatchOptions;entries:BatchEntry[]}
export interface BatchMailSnapshot {
 invoiceIds?:string[];
 jobId:string;documentRevision:number;draftId:string;mailRevision:number;hotel:string;accountId:string;accountName:string;
 sender:string;purpose:'billing'|'collection';stage:string|null;policyVersion:number|null;
 recipients:{to:string[];cc:string[];bcc:string[]};subject:string;files:string[];
 blocked:string|null;delivery:EmailDeliveryView|null;
}
export interface BatchEmailControl {busy:()=>boolean;save:()=>Promise<BatchMailSnapshot>}
export interface BatchDeliveryResult {state:string;delivery?:EmailDeliveryView;error?:string}
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=(owner:string,id:string)=>'ar-account-batch:'+encodeURIComponent(owner)+':'+id;
const activeKey=(owner:string,region:RegionId)=>'ar-account-batch-active:'+encodeURIComponent(owner)+':'+region;
export function activeBatchId(storage:StorageLike,owner:string,region:RegionId){try{const id=storage.getItem(activeKey(owner,region));return id&&loadBatch(storage,owner,id,region)?id:null;}catch{return null;}}
function validateGroups(region:RegionId,groups:BatchSelection[]){
 if(!groups.length||groups.length>20)throw Error('Select between 1 and 20 account work groups.');
 const members=new Set<string>(),groupKeys=new Set<string>();let count=0;
 for(const group of groups){
  if(!hotelInRegion(group.hotel,region)||!group.accountId||typeof group.accountId!=='string'||group.accountId.length>200||typeof group.key!=='string'||groupKeys.has(group.key)||typeof group.stage!=='string'||group.stage.length>100||!['billing','collection'].includes(group.purpose??'')||!Array.isArray(group.ids)||!group.ids.length)throw Error('The batch selection is invalid. Return to Collections.');
  groupKeys.add(group.key);
  for(const id of group.ids){const member=JSON.stringify([group.hotel,group.accountId,id]);if(typeof id!=='string'||!id||id.length>200||members.has(member))throw Error('An invoice is selected in more than one work group. Review the selection.');members.add(member);count++;}
 }
 if(count>4000)throw Error('Select up to 4,000 invoices per batch.');
}
export function createBatch(owner:string,region:RegionId,groups:BatchSelection[],options:BatchOptions,workspaceOwner=owner):BatchRecord{
 validateGroups(region,groups);return {version:1,id:crypto.randomUUID(),owner,workspaceOwner,region,options:{...options},entries:groups.map(selection=>({selection:structuredClone(selection),commandKey:crypto.randomUUID(),stage:selection.stage}))};
}
// Covers 4,000 escaped 200-character IDs plus two accepted message envelopes.
// This is a parser/record bound; the browser's actual storage quota stays unchanged.
export const MAX_BATCH_RESUME_BYTES=8*1024*1024;
export class BatchResumeError extends Error {}
export function combinedDelivery(c:CombinedBatchState|undefined):EmailDeliveryView|undefined{
 const previous=c?.observedDelivery,next=c?.saved?.delivery??undefined;
 const selected=previous&&(!next||previous.recorded&&!next.recorded||!next.recorded&&previous.gmailAccepted&&!next.gmailAccepted)?previous:next??previous;return selected?retainRetirementProjection(selected,previous,next):selected;
}
export function saveBatch(storage:StorageLike,batch:BatchRecord){
 const c=batch.combined;
 const compact=c?(()=>{const {saved:_,pendingSave,...base}=c;const observedDelivery=combinedDelivery(c);return {...base,...observedDelivery?{observedDelivery}:{},...pendingSave?{pendingSave:{payload:pendingSave.payload}}:{}};})():undefined;
 const raw=JSON.stringify({...batch,...compact?{combined:compact}:{}});
 if(raw.length>MAX_BATCH_RESUME_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BATCH_RESUME_BYTES)throw new BatchResumeError('This batch exceeds the bounded tab resume size. Shorten the message or prepare fewer invoices; the previous resume state is retained.');
 const recordKey=key(batch.owner,batch.id),pointerKey=activeKey(batch.owner,batch.region),previous=storage.getItem(recordKey),pointer=storage.getItem(pointerKey);let wrote=false;
 try{storage.setItem(recordKey,raw);wrote=true;if(pointer!==batch.id)storage.setItem(pointerKey,batch.id);}
 catch{
  // Storage writes are atomic individually; roll back the exact record if its pointer fails.
  if(wrote){if(previous===null)storage.removeItem(recordKey);else storage.setItem(recordKey,previous);}
  throw new BatchResumeError('Tab resume storage is full or unavailable. Your previous resume state is retained. Keep this tab open, free site storage space or shorten the message, then retry.');
 }
}
export function removeBatch(storage:StorageLike,owner:string,id:string){const batch=loadBatch(storage,owner,id,'phuket')??loadBatch(storage,owner,id,'khao-lak');storage.removeItem(key(owner,id));if(batch&&storage.getItem(activeKey(owner,batch.region))===id)storage.removeItem(activeKey(owner,batch.region));}
export function loadBatch(storage:StorageLike,owner:string,id:string,region:RegionId):BatchRecord|null{
 if(!uuid.test(id))return null;
 try{
  const raw=storage.getItem(key(owner,id));if(!raw||raw.length>MAX_BATCH_RESUME_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BATCH_RESUME_BYTES)return null;
  const batch:BatchRecord=JSON.parse(raw);
  if(batch.phase!==undefined&&!['pdf','email'].includes(batch.phase)||batch.version!==1||batch.id!==id||batch.owner!==owner||batch.region!==region||!isRegionId(batch.region)||!Array.isArray(batch.entries)||!['both','statement','invoices'].includes(batch.options?.content)||!['combined','statement_bundle','separate'].includes(batch.options?.layout)||batch.entries.some(e=>!uuid.test(e.commandKey)||e.jobId!==undefined&&!uuid.test(e.jobId)))return null;
  if(batch.emailMode!==undefined&&!['separate','combined'].includes(batch.emailMode)||batch.entries.some(e=>e.pdfDelivery!==undefined&&!['combined','split','separate'].includes(e.pdfDelivery)))return null;
  if(batch.combined){const c=batch.combined;if(!uuid.test(c.id)||!uuid.test(c.commandId)||!uuid.test(c.sendCommandId)||!Number.isSafeInteger(c.revision)||c.revision<0||!c.content||typeof c.content.subject!=='string'||typeof c.content.body!=='string'||!batch.entries.some(e=>e.selection.hotel===c.content.signatureHotel)||!['to','cc','bcc'].every(k=>Array.isArray(c.content.recipients?.[k as keyof typeof c.content.recipients])&&c.content.recipients[k as keyof typeof c.content.recipients].every(v=>typeof v==='string'))||c.saved&&(c.saved.id!==c.id||c.saved.mailbox!==region))return null;}
  const pending=batch.combined?.pendingSave;
  if(pending){const p=pending.payload,c=batch.combined!;if(!p||p.id!==c.id||p.revision!==c.revision||!uuid.test(p.commandId)||!validCombinedContent(p.content,batch)||!Array.isArray(p.members)||p.members.length!==batch.entries.length||new Set(p.members.map(m=>m.memberId)).size!==p.members.length||p.members.some(m=>{const e=batch.entries.find(e=>e.commandKey===m.memberId);return !e||m.documentJobId!==e.jobId||!uuid.test(m.draftId)||!Number.isSafeInteger(m.documentRevision)||m.documentRevision<0||!Number.isSafeInteger(m.draftRevision)||m.draftRevision<0||!(m.stage===null||typeof m.stage==='string')||!(m.policyVersion===null||Number.isSafeInteger(m.policyVersion)&&m.policyVersion!>0);}))return null;}
  if(batch.combined){const floor=combinedDelivery(batch.combined);if(floor){if(typeof floor.id!=='string'||!floor.id||floor.id.length>200||typeof floor.state!=='string'||typeof floor.mode!=='string')return null;batch.combined.observedDelivery=floor;}}
  validateGroups(region,batch.entries.map(e=>e.selection));return batch;
 }catch{return null;}
}
export function assertBatchJob(batch:BatchRecord,entry:BatchEntry,job:Pick<DocumentJob,'id'|'owner'|'hotel'|'account_id'|'invoice_ids'>){
 const s=entry.selection;
 if(!uuid.test(job.id)||entry.jobId&&job.id!==entry.jobId||job.owner!==(batch.workspaceOwner??batch.owner)||job.hotel!==s.hotel||job.account_id!==s.accountId||!Array.isArray(job.invoice_ids)||job.invoice_ids.length!==s.ids.length||new Set(job.invoice_ids).size!==job.invoice_ids.length||job.invoice_ids.some(id=>!s.ids.includes(id)))throw Error('Document identity does not match this batch account.');
}
export function freezeMail(rows:readonly BatchMailSnapshot[]):BatchMailSnapshot[]{
 if(!rows.length||rows.some(r=>r.blocked||!r.recipients.to.length||!r.subject.trim()||!r.files.length||r.purpose==='collection'&&(!r.stage||!r.policyVersion)))throw Error('Resolve each account’s email requirements before sending.');
 const ids=new Set(rows.map(r=>r.draftId));if(ids.size!==rows.length)throw Error('A message appears more than once in this batch.');
 return structuredClone([...rows]);
}
/** Only a human confirmation calls this. A thrown/uncertain send is never retried. */
export async function sendBatch(approved:readonly BatchMailSnapshot[],send:(mail:BatchMailSnapshot)=>Promise<EmailDeliveryView>,onResult:(mail:BatchMailSnapshot,result:BatchDeliveryResult)=>void,canContinue:()=>boolean=()=>true){
 let next=0;
 const work=async()=>{while(next<approved.length&&canContinue()){
  const mail=approved[next++];if(mail.delivery&&!(mail.delivery.mode==='draft'&&mail.delivery.state==='created'))continue;
  onResult(mail,{state:'sending'});
  try{const delivery=await send(mail);onResult(mail,{state:delivery.state,delivery});}
  catch(error){onResult(mail,{state:'checking',error:error instanceof Error?error.message:'The send result needs checking.'});}
 }};
 const outcomes=await Promise.allSettled([work(),work()]);const failed=outcomes.find(o=>o.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
}

export function initialCombined(batch:BatchRecord):CombinedBatchState{return {id:crypto.randomUUID(),revision:0,commandId:crypto.randomUUID(),sendCommandId:crypto.randomUUID(),content:{recipients:defaultSelfCc(batch.entries[0].selection.hotel,{to:[],cc:[],bcc:[]}),subject:'',body:'',richBody:null,signatureHotel:batch.entries[0].selection.hotel as HotelId}};}
export function combinedLocked(batch:BatchRecord){return !!batch.combined?.attempted||!!combinedDelivery(batch.combined);}
export function assertCombinedBatch(batch:BatchRecord,saved:CombinedEmail){
 if(saved.id!==batch.combined?.id||saved.mailbox!==batch.region||saved.members.length!==batch.entries.length||new Set(saved.members.map(m=>m.memberId)).size!==saved.members.length||saved.members.some(m=>{const e=batch.entries.find(e=>e.commandKey===m.memberId);return !e||m.documentJobId!==e.jobId||m.hotel!==e.selection.hotel||m.accountId!==e.selection.accountId||!m.invoiceIds.length||new Set(m.invoiceIds).size!==m.invoiceIds.length||m.invoiceIds.some(id=>!e.selection.ids.includes(id));}))throw Error('The shared email does not match this selected batch.');
}

function validCombinedContent(c:CombinedContent,batch:BatchRecord){return !!c&&typeof c.subject==='string'&&typeof c.body==='string'&&batch.entries.some(e=>e.selection.hotel===c.signatureHotel)&&(['to','cc','bcc'] as const).every(k=>Array.isArray(c.recipients?.[k])&&c.recipients[k].every(v=>typeof v==='string'));}
