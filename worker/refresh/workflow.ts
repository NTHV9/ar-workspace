import {runFinancialDiagnostic} from '../opera/financial-diagnostic';
import {runMailReconcile} from '../email/reconcile';
import type {ReconcileEnv} from '../email/reconcile';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { makeReader,probeOpera } from '../opera/probe';
import { OperaError } from '../opera/client';
import {assertStatementWorkflowPolicy} from '../documents/source-policy';
import {runDocumentJob} from '../documents/jobs';
import { auditHistory, auditHistoryWindow } from '../opera/history-audit';
import { backendRpc,previousInvoices, type RefreshEnv, type RefreshParams } from './backend';
import { discoverAccountIds, readBusinessDate, readVerifiedAccount } from './read-snapshot';

export class ArRefreshWorkflow extends WorkflowEntrypoint<RefreshEnv & ReconcileEnv,RefreshParams> {
  async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep) {
    const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
    const {runId,hotel,accountId}=payload as RefreshParams;
    assertStatementWorkflowPolicy(payload);
    if(payload.mailReconcile){if(!/^[0-9a-f-]{36}$/.test(runId??''))throw Error('invalid_workflow_parameters');return runMailReconcile(this.env,runId,step);}
    if(!/^[0-9a-f-]{36}$/.test(runId??'')||!['KAT','TSK'].includes(hotel))throw new Error('invalid_workflow_parameters');
    if(payload.financialProbe)return step.do('financial-read-diagnostic',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>runFinancialDiagnostic(this.env,hotel as 'KAT'|'TSK'));
    if(payload.documentJob)return runDocumentJob(this.env,runId,step);
    if(payload.pdfProbe)return step.do('pdf-probe',{retries:{limit:0,delay:'5 seconds'},timeout:'5 minutes'},async()=>JSON.stringify(await probeOpera(this.env,hotel,accountId,async(bytes,expected)=>{
      if(!this.env.SUPABASE_URL||!this.env.SUPABASE_SECRET_KEY)throw new Error('private_storage_unavailable');
      for(const [extension,body,type]of [['pdf',new Uint8Array(bytes).buffer,'application/pdf'],['json',JSON.stringify(expected),'application/json']] as const){
        const response=await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/ar-working-files/validation/${runId}/${hotel}.${extension}`,{method:'POST',headers:{apikey:this.env.SUPABASE_SECRET_KEY,'Content-Type':type,'x-upsert':'false'},body,redirect:'manual',signal:AbortSignal.timeout(30000)});
        if(!response.ok){await response.body?.cancel();throw new Error('private_storage_write_failed');}
        await response.body?.cancel();
      }
    })));
    if(payload.historyAudit){
      if(!accountId)throw new Error('audit_account_required');
      if(payload.historyAuditOffset!==undefined){const offset=payload.historyAuditOffset;return step.do('history-window-audit',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>auditHistoryWindow(makeReader(this.env,hotel),hotel,accountId,offset));}
      return step.do('history-count-audit',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>auditHistory(makeReader(this.env,hotel),hotel,accountId,payload.historyAuditLimit));
    }
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
      let invalidAccounts=0;
      for(let index=0;index<ids.length;index++){
        const outcome=await step.do(`account-${index}`,{retries:{limit:3,delay:'5 seconds',backoff:'exponential'},timeout:'8 minutes'},async()=>{
          if(!await backendRpc<boolean>(this.env,'ar_renew_refresh',{p_run_id:runId}))throw new Error('refresh_lease_expired');
          try {
            const previous=await previousInvoices(this.env,hotel,ids[index]);
            const snapshot=await readVerifiedAccount(reader,hotel,ids[index],businessDate,previous);
            await backendRpc(this.env,'ar_stage_account',{p_run_id:runId,p_snapshot:snapshot});
            // Financial payloads remain only in private Supabase staging, not step output.
            return {ok:true,invoices:snapshot.invoices.length,code:'',stage:'',diagnostics:null};
          }catch(error){
            if(error instanceof OperaError&&['invalid_response','pagination_changed','pagination_incomplete','duplicate_member'].includes(error.code))return {ok:false,invoices:0,code:error.code,stage:error.stage??'',diagnostics:error.diagnostics??null};
            throw error;
          }
        });
        if(!outcome.ok)invalidAccounts++;
      }
      if(payload.validateOnly){
        await step.do('finish-validation-only',async()=>{await backendRpc(this.env,'ar_fail_refresh',{p_run_id:runId,p_error_code:'validation_only_finished'});return {validated:invalidAccounts===0};});
        return {hotel,status:invalidAccounts?'validation_failed':'validated',accounts:ids.length};
      }
      if(invalidAccounts)throw new OperaError('invalid_response',undefined,'account_validation');
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
