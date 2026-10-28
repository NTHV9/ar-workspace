import type {HotelId,RegionId} from '../../src/domain/hotels';
import {backendRpc} from '../refresh/backend';
import {nativeAppendDueFormula,type NativeAppendCell} from './append-native';
import type {ProviderSnapshot,TrackerAdapter,TrackerEnv} from './service';
export interface SentAppendPlan {rowKey:string;agent:string;metadataId:number;providerVersion:string;values:NativeAppendCell[]}
export interface SentAppendCandidate {
 id:string;state:string;hotel:HotelId;accountId:string;invoiceId:string;invoiceNo:string;folio:string|null;sourceHash:string;currentSourceAt?:string;readbackOnly?:boolean;plan?:SentAppendPlan;planHash?:string;
 desiredDates:{R:string|null;U:string|null;V:string|null;W:string|null};
 sourceRow:{accountNo:string;accountName:string;guest:string|null;transactionDate:string;open:string;aging:string[];age:number;agingLabel:string;agingStatus:string;businessDate:string;creditTerm:number|null;billingRequired:boolean;sourceAt?:string};
}
export interface SentAppendInput {plan:SentAppendPlan;identity:{hotel:HotelId;accountNo:string;invoiceNo:string;folioNo:string|null;transactionDate:string};priorUncertain:boolean}
export interface SentAppendResult {status:'written'|'exists'|'conflict'|'uncertain';mutationStarted?:boolean;identityMatched?:boolean;retrySafe?:boolean;rejectedStatus?:number;version?:string}
const validDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const normalized=(v:string)=>v.replace(/\s+/g,' ').trim();
function money(v:string):bigint {if(!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(v))throw Error('tracker_append_source_invalid');const negative=v.startsWith('-'),[whole,fraction='']=v.replace(/^-/,'').split('.');const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('tracker_append_source_invalid');return negative?-n:n;}
export function appendMetadataId(value:string):number {let n=2166136261;for(const byte of new TextEncoder().encode(value)){n^=byte;n=Math.imul(n,16777619);}return (n&2147483647)||1;}
export function buildSentAppendPlan(job:SentAppendCandidate,snapshot:ProviderSnapshot):SentAppendPlan {
 const s=job.sourceRow;if(!snapshot.version||!s||!job.invoiceNo||!s.accountNo||!validDay(s.transactionDate)||!validDay(s.businessDate)||s.aging.length!==6||!Number.isInteger(s.age)||s.age<0||s.creditTerm!==null&&(!Number.isInteger(s.creditTerm)||s.creditTerm<0||s.creditTerm>3650))throw Error('tracker_append_source_invalid');
 const amount=money(s.open),buckets=s.aging.map(money);if(amount<=0n||buckets.reduce((a,b)=>a+b,0n)!==amount)throw Error('tracker_append_source_invalid');
 if(snapshot.rows.some(r=>r.hotel===job.hotel&&r.accountNo===s.accountNo&&r.invoiceNo===job.invoiceNo&&(r.folio??null)===job.folio&&(r.transactionDate??null)===s.transactionDate))throw Error('tracker_append_existing_row');
 const aliases=new Map<string,{agent:string;property:string}>();for(const r of snapshot.rows)if(r.hotel===job.hotel&&r.accountNo===s.accountNo&&r.agent&&r.property){const agent=normalized(r.agent),property=normalized(r.property);if(agent&&property)aliases.set(JSON.stringify([property,agent]),{property,agent});}
 if(!aliases.size)throw Error('tracker_append_alias_missing');if(aliases.size!==1)throw Error('tracker_append_alias_ambiguous');const {agent,property}=[...aliases.values()][0];
 const invoice=/^\d+$/.test(job.invoiceNo)?BigInt(job.invoiceNo).toString():normalized(job.invoiceNo),rowKey=`${property}|${agent}|I:${invoice}|1`;
 if(rowKey.length>500||snapshot.rows.some(r=>r.rowKey===rowKey))throw Error('tracker_append_key_conflict');
 for(const value of Object.values(job.desiredDates))if(value!==null&&!validDay(value))throw Error('tracker_append_source_invalid');
 const values:NativeAppendCell[]=[property,agent,s.accountNo,s.guest,job.invoiceNo,job.folio,s.transactionDate,Number(amount)/100,...buckets.map(n=>Number(n)/100),s.age,s.agingLabel,s.agingStatus,
  job.desiredDates.R,s.creditTerm,{formula:nativeAppendDueFormula(s.billingRequired)},job.desiredDates.U,job.desiredDates.V,job.desiredDates.W,null,null,null,null,null,null,s.businessDate,s.businessDate,'ใหม่วันนี้',rowKey];
 if(values.length!==33)throw Error('tracker_append_source_invalid');return {rowKey,agent,metadataId:appendMetadataId(rowKey),providerVersion:snapshot.version,values};
}
/** No Gmail boundary exists in this module. Retrying only concerns Sheet jobs. */
export async function syncMissingSentRows(env:TrackerEnv,actor:string,owner:string,region:RegionId,lock:string,fileId:string,adapter:TrackerAdapter,snapshot:ProviderSnapshot):Promise<{changed:boolean;deferred:boolean}> {
 if(env.TRACKER_SENT_ROW_APPEND_ENABLED!=='true'||!adapter.appendSentRow)return {changed:false,deferred:false};
 const page=await backendRpc<{jobs:SentAppendCandidate[];total:number}>(env,'ar_tracker_append_candidates',{p_actor:actor,p_region:region,p_lock:lock,p_offset:-1});
 if(!page||!Array.isArray(page.jobs)||page.jobs.length>100)throw Error('tracker_append_invalid');let changed=false,deferred=false,current=snapshot,mutations=0,readbacks=0;
 const staleMinutes=Number(env.REFRESH_STALE_MINUTES??30),fresh=(at:string|undefined)=>Number.isFinite(staleMinutes)&&staleMinutes>0&&typeof at==='string'&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=Date.now()&&Date.parse(at)>=Date.now()-staleMinutes*60000;
 for(const candidate of page.jobs){
  let job=candidate;
  if(['hold','conflict','written'].includes(job.state))continue;
  const originallyReadback=job.readbackOnly===true||['writing','uncertain'].includes(job.state);
  if(originallyReadback?readbacks>=5:mutations>=10)continue;
  if(!job.plan){
   if(!fresh(job.sourceRow.sourceAt)){deferred=true;continue;}
   let plan:SentAppendPlan;try{plan=buildSentAppendPlan(job,current);}catch{deferred=true;continue;}
   job=await backendRpc<SentAppendCandidate>(env,'ar_tracker_append_prepare',{p_actor:actor,p_region:region,p_lock:lock,p_id:job.id,p_plan:plan,p_hash:job.sourceHash,p_rows:current.rows});
  }
  if(!job.plan||!job.planHash||['hold','conflict','written'].includes(job.state)){deferred=true;continue;}
  const readbackOnly=job.readbackOnly===true||['writing','uncertain'].includes(job.state);
  if(!readbackOnly)job=await backendRpc<SentAppendCandidate>(env,'ar_tracker_append_begin',{p_actor:actor,p_region:region,p_lock:lock,p_id:job.id,p_hash:job.planHash});
  if(!job.plan||!job.planHash||['hold','conflict','written'].includes(job.state)){deferred=true;continue;}
  const priorUncertain=readbackOnly||job.readbackOnly===true;
  if(!priorUncertain&&!fresh(job.currentSourceAt??job.sourceRow.sourceAt)){
   await backendRpc(env,'ar_tracker_append_finish',{p_actor:actor,p_region:region,p_lock:lock,p_id:job.id,p_state:'pending',p_receipt:{planHash:job.planHash,metadataId:job.plan.metadataId,rowKey:job.plan.rowKey,providerVersion:job.plan.providerVersion,mutationStarted:false}});deferred=true;continue;
  }
  if(priorUncertain)readbacks++;else mutations++;
  const identity={hotel:job.hotel,accountNo:job.sourceRow.accountNo,invoiceNo:job.invoiceNo,folioNo:job.folio,transactionDate:job.sourceRow.transactionDate};
  let result:SentAppendResult;
  try{result=await adapter.appendSentRow(env,owner,region,fileId,{plan:job.plan,identity,priorUncertain});}catch{result={status:'uncertain',mutationStarted:true};}
  const state=result.status==='written'?'written':result.status==='exists'?'hold':result.status==='conflict'?'hold':!priorUncertain&&result.retrySafe&&(result.mutationStarted===false||[412,429].includes(result.rejectedStatus??0))?'pending':'uncertain';
  await backendRpc(env,'ar_tracker_append_finish',{p_actor:actor,p_region:region,p_lock:lock,p_id:job.id,p_state:state,p_receipt:{planHash:job.planHash,metadataId:job.plan.metadataId,rowKey:job.plan.rowKey,providerVersion:result.version??job.plan.providerVersion,mutationStarted:result.mutationStarted===true,...(result.rejectedStatus!==undefined?{rejectedStatus:result.rejectedStatus}:{}),...(result.status==='written'?{matches:result.identityMatched===true}:{}),...(result.status==='exists'?{existingIdentity:true}:{})}});
  const mayHaveChanged=result.status==='written'||result.status==='exists'||result.mutationStarted===true||result.version!==undefined&&result.version!==current.version;
  if(result.status!=='written'&&result.status!=='exists')deferred=true;
  // A lost append response may still have committed. Never reuse its old ETag
  // for later appends or date writes; a failed reread stops this sync safely.
  if(mayHaveChanged){changed=true;current=await adapter.read(env,owner,region,fileId);}
 }
 return {changed,deferred};
}
