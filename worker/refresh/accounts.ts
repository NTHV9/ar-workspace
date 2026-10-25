import type {WorkflowStep} from 'cloudflare:workers';
import {makeReader} from '../opera/probe';
import {OperaError} from '../opera/client';
import {backendRpc,previousInvoices,type RefreshEnv} from './backend';
import {readVerifiedAccount} from './read-snapshot';
import type {OperaReader} from '../opera/client';
import {mapFinancialReads} from '../opera/bounded-read';

/** Stage verified accounts privately. The caller publishes only after every
 * account succeeds and the hotel's complete membership is checked again. */
export async function stageRefreshAccounts(env:RefreshEnv,runId:string,hotel:string,ids:readonly string[],businessDate:string,step:Pick<WorkflowStep,'do'>,reader:OperaReader=makeReader(env,hotel)):Promise<number>{
 let invalidAccounts=0;
 for(let offset=0;offset<ids.length;offset+=2){
  const outcomes=await Promise.allSettled(ids.slice(offset,offset+2).map(async(_id,relative)=>{
   const index=offset+relative;
   return step.do(`account-${index}`,{retries:{limit:3,delay:'5 seconds',backoff:'exponential'},timeout:'8 minutes'},async()=>{
   if(!await backendRpc<boolean>(env,'ar_renew_refresh',{p_run_id:runId}))throw Error('refresh_lease_expired');
   try{
    const previous=await previousInvoices(env,hotel,ids[index]);
    const snapshot=await readVerifiedAccount(reader,hotel,ids[index],businessDate,previous);
    await backendRpc(env,'ar_stage_account',{p_run_id:runId,p_snapshot:snapshot});
    return {ok:true,invoices:snapshot.invoices.length,code:'',stage:'',diagnostics:null};
   }catch(error){
    if(error instanceof OperaError&&['invalid_response','pagination_changed','pagination_incomplete','duplicate_member'].includes(error.code))return {ok:false,invoices:0,code:error.code,stage:error.stage??'',diagnostics:error.diagnostics??null};
    throw error;
   }
   });
  }));
  // Drain both steps before reporting failure; no late staging can race failure cleanup.
  for(const outcome of outcomes){if(outcome.status==='rejected')throw outcome.reason;if(!outcome.value.ok)invalidAccounts++;}
 }
 return invalidAccounts;
}

/** Version 2: bounded count-only checkpoints; staged identities survive partial retries. */
export async function stageRefreshAccountBatches(env:RefreshEnv,runId:string,hotel:string,ids:readonly string[],businessDate:string,step:Pick<WorkflowStep,'do'>,reader:OperaReader=makeReader(env,hotel)):Promise<number>{
 if(new Set(ids).size!==ids.length||ids.some(id=>!id))throw new OperaError('invalid_response');
 let invalidAccounts=0;
 for(let offset=0;offset<ids.length;offset+=10){
  const group=ids.slice(offset,offset+10);
  const result=await step.do(`account-batch-v2-${offset/10}`,{retries:{limit:3,delay:'5 seconds',backoff:'exponential'},timeout:'20 minutes'},async()=>{
   if(!await backendRpc<boolean>(env,'ar_renew_refresh',{p_run_id:runId}))throw Error('refresh_lease_expired');
   const staged=await backendRpc<unknown>(env,'ar_refresh_staged_accounts',{p_run_id:runId,p_ids:group});
   if(!Array.isArray(staged)||staged.some(id=>typeof id!=='string'||!group.includes(id))||new Set(staged).size!==staged.length)throw new OperaError('invalid_response');
   const completed=new Set(staged);
   const outcomes=await mapFinancialReads(group.filter(id=>!completed.has(id)),async id=>{
    if(!await backendRpc<boolean>(env,'ar_renew_refresh',{p_run_id:runId}))throw Error('refresh_lease_expired');
    try{
     const previous=await previousInvoices(env,hotel,id);
     const snapshot=await readVerifiedAccount(reader,hotel,id,businessDate,previous);
     await backendRpc(env,'ar_stage_account',{p_run_id:runId,p_snapshot:snapshot});return {ok:true as const};
    }catch(error){
     if(error instanceof OperaError&&['invalid_response','pagination_changed','pagination_incomplete','duplicate_member'].includes(error.code))return {ok:false as const,code:error.code,stage:error.stage&&/^[a-z_]{1,80}$/.test(error.stage)?error.stage:''};
     throw error;
    }
   });
   // Persist only static reason labels and counts. No source values or account IDs
   // enter the checkpoint, and a validation failure still blocks the whole publish.
   const failures:{code:string;stage:string;count:number}[]=[];
   for(const outcome of outcomes)if(!outcome.ok){
    const existing=failures.find(f=>f.code===outcome.code&&f.stage===outcome.stage);
    if(existing)existing.count++;else failures.push({code:outcome.code,stage:outcome.stage,count:1});
   }
   return {invalidAccounts:outcomes.filter(outcome=>!outcome.ok).length,failures};
  });
  invalidAccounts+=result.invalidAccounts;
 }
 return invalidAccounts;
}
