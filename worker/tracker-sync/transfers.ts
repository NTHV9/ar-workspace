import {backendRpc} from '../refresh/backend';
import type {RegionId} from '../../src/domain/hotels';
import type {TrackerAdapter,TrackerEnv,ProviderSnapshot} from './service';
import {transferWasWritten,validateTransferBatch,type TransferWrite,type TransferOutcome} from './transfer-model';

interface TransferJob {id:string;state:'pending'|'uncertain';write:Omit<TransferWrite,'version'>}
export async function syncAccountTransfers(env:TrackerEnv,actor:string,owner:string,region:RegionId,lock:string,file:string,adapter:TrackerAdapter,snapshot:ProviderSnapshot):Promise<{changed:boolean}>{
 if(env.TRACKER_TRANSFER_IDENTITY_ENABLED!=='true'||!adapter.writeTransfers)return {changed:false};
 const jobs=await backendRpc<TransferJob[]>(env,'ar_tracker_transfer_jobs',{p_actor:actor,p_region:region,p_lock:lock});
 if(!Array.isArray(jobs)||jobs.length>10||new Set(jobs.map(j=>j.id)).size!==jobs.length)throw Error('tracker_transfer_invalid');
 const record=(j:TransferJob,state:string)=>backendRpc<{state:string}>(env,'ar_tracker_transfer_result',{p_actor:actor,p_region:region,p_lock:lock,p_id:j.id,p_state:state});
 const batch:{job:TransferJob;input:TransferWrite}[]=[];
 for(const job of jobs){
  if(!job||!['pending','uncertain'].includes(job.state)||!job.write)throw Error('tracker_transfer_invalid');
  const input={...job.write,version:snapshot.version};
  if(job.state==='uncertain'){
   if(snapshot.transferGroupsCorrect!==false&&transferWasWritten(snapshot,input))await record(job,'written');
   continue;
  }
  try{validateTransferBatch(snapshot,[input]);}catch{await record(job,'defer');continue;}
  if(region==='khao-lak'?snapshot.capabilities.writeAssurance!=='best-effort':snapshot.capabilities.conditionalWrite!=='proven'){await record(job,'defer');continue;}
  batch.push({job,input});
 }
 if(!batch.length)return {changed:false};
 try{validateTransferBatch(snapshot,batch.map(b=>b.input));}catch{return {changed:false};}
 const admitted:typeof batch=[];
 for(const item of batch){const result=await record(item.job,'uncertain');if(result.state==='uncertain')admitted.push(item);}
 if(!admitted.length)return {changed:false};
 let result:TransferOutcome;
 try{result=await adapter.writeTransfers(env,owner,region,file,admitted.map(b=>b.input));}catch{result={status:'uncertain',mutationStarted:true};}
 for(const {job} of admitted)await record(job,result.status==='written'?'written':result.status==='conflict'&&!result.mutationStarted?'retry':'uncertain');
 return {changed:result.mutationStarted||result.status==='written'};
}
