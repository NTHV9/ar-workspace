import {backendRpc} from '../refresh/backend';
import type {RegionId} from '../../src/domain/hotels';
import {trackerIdentityMatches} from './native';
import {validTrackerCredit} from './workbook';
import type {ProviderRow,ProviderSnapshot,ProviderWrite,TrackerAdapter,TrackerEnv} from './service';

interface CreditJob {id:string;rowKey:string;identity:ProviderWrite['expectedIdentity'];locator:unknown;value:string;state:'pending'|'uncertain'}
type CreditRow=ProviderRow&{holdReason?:string|null;ambiguous?:boolean;fieldHolds?:string[]};
/** One bounded batch per lease. Every attempted intent is durably uncertain
 * before publication, including CAS uploads; uncertain jobs are readback only. */
export async function syncCreditTerms(env:TrackerEnv,actor:string,owner:string,region:RegionId,lock:string,fileId:string,adapter:TrackerAdapter,snapshot:ProviderSnapshot,rows:readonly CreditRow[]):Promise<{changed:boolean}> {
 if(env.TRACKER_CREDIT_FILL_ENABLED!=='true')return {changed:false};
 const jobs=await backendRpc<CreditJob[]>(env,'ar_tracker_credit_jobs',{p_actor:actor,p_region:region,p_lock:lock});
 if(!Array.isArray(jobs)||jobs.length>20||new Set(jobs.map(j=>j?.id)).size!==jobs.length||jobs.some(j=>!j||typeof j.id!=='string'||!j.id||typeof j.rowKey!=='string'||!['pending','uncertain'].includes(j.state)))throw Error('tracker_credit_invalid');
 const record=(job:CreditJob,state:'uncertain'|'written'|'conflict'|'held')=>backendRpc<{state?:string}>(env,'ar_tracker_credit_result',{p_actor:actor,p_region:region,p_lock:lock,p_id:job.id,p_state:state});
 const eligible:CreditJob[]=[],counts=new Map<string,number>();for(const job of jobs)counts.set(job.rowKey,(counts.get(job.rowKey)??0)+1);
 for(const job of jobs){
  const row=rows.find(r=>r.rowKey===job.rowKey),identityMatches=!!row&&trackerIdentityMatches(row,job.identity)&&!row.holdReason&&!row.ambiguous;
  const safe=identityMatches&&!row.formulaFields?.includes('S')&&!row.blockedWriteFields?.includes('S')&&!row.fieldHolds?.includes('S')&&!row.issues?.includes('S_invalid')&&validTrackerCredit(job.value);
  if(job.state==='uncertain'){await record(job,safe&&row.fields.S===job.value?'written':'uncertain');continue;}
  if(!identityMatches){await record(job,'conflict');continue;}
  if(!safe){await record(job,'held');continue;}
  // A nonempty employee value, even equal to the planned default, never
  // becomes proof that our unattempted command was published.
  if((row.fields.S??null)!==null){await record(job,'conflict');continue;}
  if(!adapter.writeBatch||(region==='khao-lak'?env.TRACKER_NATIVE_BEST_EFFORT_ENABLED!=='true'||snapshot.capabilities.writeAssurance!=='best-effort':snapshot.capabilities.conditionalWrite!=='proven')){await record(job,'held');continue;}
  eligible.push(job);
 }
 if(!eligible.length)return {changed:false};
 // Conflicting or duplicate journal rows must not publish the same S twice.
 const attempted:CreditJob[]=[];for(const job of eligible){if(counts.get(job.rowKey)!==1){await record(job,'conflict');continue;}attempted.push(job);}
 if(!attempted.length)return {changed:false};
 for(const job of attempted){const receipt=await record(job,'uncertain');if(receipt.state!=='uncertain')throw Error('tracker_intent_not_confirmed');}
 const inputs:ProviderWrite[]=attempted.map(job=>({version:snapshot.version,rowKey:job.rowKey,expectedIdentity:job.identity,locator:job.locator,changes:[{field:'S',value:job.value,expected:null}]}));
 let result:Awaited<ReturnType<NonNullable<TrackerAdapter['writeBatch']>>>;
 try{result=await adapter.writeBatch!(env,owner,region,fileId,inputs);}catch{result={status:'uncertain'};}
 // A CAS conflict with a returned version happened after upload and may
 // reflect a collaborator changing readback. Preserve the durable fence:
 // treating that outcome as terminal could queue a second publication.
 const state=result.status==='conflict'&&result.version!==undefined?'uncertain':result.status;
 for(const job of attempted)await record(job,state);
 // XLSX may report a conflict after upload when a collaborator changed the
 // readback; a returned version proves another observation must be imported.
 return {changed:result.status!=='conflict'||result.version!==undefined};
}
