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
     await backendRpc(env,'ar_stage_account',{p_run_id:runId,p_snapshot:snapshot});return true;
    }catch(error){
     if(error instanceof OperaError&&['invalid_response','pagination_changed','pagination_incomplete','duplicate_member'].includes(error.code))return false;
     throw error;
    }
   });
   return {invalidAccounts:outcomes.filter(ok=>!ok).length};
  });
  invalidAccounts+=result.invalidAccounts;
 }
 return invalidAccounts;
}
