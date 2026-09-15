import type {WorkflowStep} from 'cloudflare:workers';
import {makeReader} from '../opera/probe';
import {OperaError} from '../opera/client';
import {backendRpc,previousInvoices,type RefreshEnv} from './backend';
import {readVerifiedAccount} from './read-snapshot';

/** Stage verified accounts privately. The caller publishes only after every
 * account succeeds and the hotel's complete membership is checked again. */
export async function stageRefreshAccounts(env:RefreshEnv,runId:string,hotel:string,ids:readonly string[],businessDate:string,step:Pick<WorkflowStep,'do'>):Promise<number>{
 let invalidAccounts=0;
 for(let offset=0;offset<ids.length;offset+=2){
  const outcomes=await Promise.allSettled(ids.slice(offset,offset+2).map(async(_id,relative)=>{
   const index=offset+relative;
   return step.do(`account-${index}`,{retries:{limit:3,delay:'5 seconds',backoff:'exponential'},timeout:'8 minutes'},async()=>{
   if(!await backendRpc<boolean>(env,'ar_renew_refresh',{p_run_id:runId}))throw Error('refresh_lease_expired');
   try{
    const previous=await previousInvoices(env,hotel,ids[index]);
    const snapshot=await readVerifiedAccount(makeReader(env,hotel),hotel,ids[index],businessDate,previous);
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
