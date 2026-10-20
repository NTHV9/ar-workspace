import {hotelInRegion,isRegionId,type RegionId} from '../domain/hotels';
import type {DocumentJob} from '../../worker/documents/jobs';
import type {EmailDeliveryView} from '../../worker/email/shared';
import type {BatchSelection} from './selection';
export interface BatchOptions {content:'both'|'statement'|'invoices';layout:'combined'|'statement_bundle'|'separate'}
export interface BatchEntry {selection:BatchSelection;commandKey:string;jobId?:string;requested?:boolean;error?:string;stage?:string;policyVersion?:number|null;mailDraftId?:string;mailRevision?:number;attempted?:boolean;delivery?:EmailDeliveryView}
export interface BatchRecord {version:1;id:string;owner:string;workspaceOwner?:string;region:RegionId;phase?:'pdf'|'email';options:BatchOptions;entries:BatchEntry[]}
export interface BatchMailSnapshot {
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
export function saveBatch(storage:StorageLike,batch:BatchRecord){storage.setItem(key(batch.owner,batch.id),JSON.stringify(batch));storage.setItem(activeKey(batch.owner,batch.region),batch.id);}
export function removeBatch(storage:StorageLike,owner:string,id:string){const batch=loadBatch(storage,owner,id,'phuket')??loadBatch(storage,owner,id,'khao-lak');storage.removeItem(key(owner,id));if(batch&&storage.getItem(activeKey(owner,batch.region))===id)storage.removeItem(activeKey(owner,batch.region));}
export function loadBatch(storage:StorageLike,owner:string,id:string,region:RegionId):BatchRecord|null{
 if(!uuid.test(id))return null;
 try{
  const raw=storage.getItem(key(owner,id));if(!raw||raw.length>1_000_000)return null;
  const batch:BatchRecord=JSON.parse(raw);
  if(batch.phase!==undefined&&!['pdf','email'].includes(batch.phase)||batch.version!==1||batch.id!==id||batch.owner!==owner||batch.region!==region||!isRegionId(batch.region)||!Array.isArray(batch.entries)||!['both','statement','invoices'].includes(batch.options?.content)||!['combined','statement_bundle','separate'].includes(batch.options?.layout)||batch.entries.some(e=>!uuid.test(e.commandKey)||e.jobId!==undefined&&!uuid.test(e.jobId)))return null;
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
