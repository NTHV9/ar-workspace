import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { makeReader } from '../opera/probe';
import { OperaError } from '../opera/client';
import { backendRpc,previousInvoices, type RefreshEnv, type RefreshParams } from './backend';
import { discoverAccountIds, readBusinessDate, readVerifiedAccount } from './read-snapshot';

export class ArRefreshWorkflow extends WorkflowEntrypoint<RefreshEnv,RefreshParams> {
  async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep) {
    const {runId,hotel,accountId}=event.payload;
    try {
      const reader=makeReader(this.env,hotel);
      let acquired=false;
      for(let attempt=0;attempt<120&&!acquired;attempt++){
        acquired=await step.do(`claim-${attempt}`,async()=>{
          const ok=await backendRpc<boolean>(this.env,'ar_claim_refresh',{p_run_id:runId});
          if(ok)return true;
          // Cloudflare enforces one instance for runId. Resume after an ambiguous claim
          // response may renew only this instance's own still-active database lease.
          const job=await backendRpc<{status:string}>(this.env,'ar_refresh_job',{p_run_id:runId});
          if(job.status==='running')return backendRpc<boolean>(this.env,'ar_renew_refresh',{p_run_id:runId});
          if(job.status==='succeeded')return false;
          if(job.status==='failed')throw new Error('refresh_run_failed');
          return false;
        });
        if(!acquired)await step.sleep(`wait-${attempt}`,'15 seconds');
      }
      if(!acquired)throw new Error('refresh_queue_timeout');
      const businessDate=await step.do('business-date',{retries:{limit:1,delay:'5 seconds',backoff:'constant'}},()=>readBusinessDate(reader,hotel));
      const ids=await step.do('discovery',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'},async()=>{
        if(accountId)return [accountId];
        return discoverAccountIds(reader,hotel);
      });
      for(let index=0;index<ids.length;index++){
        await step.do(`account-${index}`,{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'},async()=>{
          if(!await backendRpc<boolean>(this.env,'ar_renew_refresh',{p_run_id:runId}))throw new Error('refresh_lease_expired');
          const previous=await previousInvoices(this.env,hotel,ids[index]);
          const snapshot=await readVerifiedAccount(reader,hotel,ids[index],businessDate,previous);
          await backendRpc(this.env,'ar_stage_account',{p_run_id:runId,p_snapshot:snapshot});
          // Financial payloads remain only in private Supabase staging, not step output.
          return {invoices:snapshot.invoices.length};
        });
      }
      await step.do('verify-membership-and-publish',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'},async()=>{
        const job=await backendRpc<{status:string}>(this.env,'ar_refresh_job',{p_run_id:runId});
        if(job.status==='succeeded')return {accounts:ids.length};
        if(!await backendRpc<boolean>(this.env,'ar_renew_refresh',{p_run_id:runId}))throw new Error('refresh_lease_expired');
        if(!accountId){const after=await discoverAccountIds(reader,hotel);const expected=new Set(ids);if(after.length!==ids.length||after.some(id=>!expected.has(id)))throw new OperaError('pagination_changed');}
        await backendRpc(this.env,'ar_publish_refresh',{p_run_id:runId,p_expected_accounts:ids.length});return {accounts:ids.length};
      });
      return {hotel,status:'succeeded',accounts:ids.length};
    }catch(error){
      const serialized=error instanceof Error?error.message.match(/^OperaError: ([a-z_]+)(?::([a-z_]+))?$/):null;
      const code=error instanceof OperaError?`${error.code}${error.stage?'_'+error.stage:''}`:serialized?`${serialized[1]}${serialized[2]?'_'+serialized[2]:''}`:'refresh_failed';
      await step.do('record-failure',async()=>{await backendRpc(this.env,'ar_fail_refresh',{p_run_id:runId,p_error_code:code});return {status:'failed'};});
      throw new Error(code);
    }
  }
}
