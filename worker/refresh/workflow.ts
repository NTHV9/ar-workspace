import {postPublicationMaintenance,joinedScheduledMaintenance} from './post-publication';
import {acceptanceEnvironment} from '../acceptance/context';
import {assertWritesEnabled} from '../operations/write-hold';
import type {DriveEnv} from '../drive/shared';
import type {FinancialIngestionEnv} from '../financial/refresh';
import {runFinancialDiagnostic} from '../opera/financial-diagnostic';
import {runMailReconcile} from '../email/reconcile';
import type {ReconcileEnv} from '../email/reconcile';
import {runDocumentJob} from '../documents/jobs';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { makeReader } from '../opera/probe';
import { OperaError } from '../opera/client';
import {assertStatementWorkflowPolicy,assertInvoiceWorkflowPolicy} from '../documents/source-policy';
import { auditHistory, auditHistoryWindow } from '../opera/history-audit';
import { backendRpc, type RefreshEnv, type RefreshParams } from './backend';
import { discoverAccountIds, readBusinessDate } from './read-snapshot';
import {stageRefreshAccounts,stageRefreshAccountBatches} from './accounts';
import {isHotelId} from '../../src/domain/hotels';

export class ArRefreshWorkflow extends WorkflowEntrypoint<RefreshEnv & ReconcileEnv & FinancialIngestionEnv & DriveEnv,RefreshParams> {
  async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep) {
    const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  assertInvoiceWorkflowPolicy(payload);
  const runtime=payload.acceptanceId?await acceptanceEnvironment(this.env,payload.actorId??'',payload.acceptanceId):this.env;
  assertWritesEnabled(runtime);
    const {runId,hotel,accountId}=payload as RefreshParams;
    assertStatementWorkflowPolicy(payload);
    if(payload.mailReconcile){if(!/^[0-9a-f-]{36}$/.test(runId??''))throw Error('invalid_workflow_parameters');return runMailReconcile(runtime,runId,step);}
    if(!/^[0-9a-f-]{36}$/.test(runId??'')||!isHotelId(hotel))throw new Error('invalid_workflow_parameters');
    // Retire diagnostic control windows without entering an unregistered financial run.
    if(payload.currentTickerStart!==undefined)return {status:'retired'};
    if(payload.scheduledMaintenance)return joinedScheduledMaintenance(runtime,payload,step);
    if(payload.financialHistory)return {status:'retired'};
    if(payload.financialProbe)return step.do('financial-read-diagnostic',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>runFinancialDiagnostic(runtime,hotel));
    if(payload.documentJob)return runDocumentJob(runtime,runId,step);
    if(payload.historyAudit){
      if(!accountId)throw new Error('audit_account_required');
      if(payload.historyAuditOffset!==undefined){const offset=payload.historyAuditOffset;return step.do('history-window-audit',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>auditHistoryWindow(makeReader(runtime,hotel),hotel,accountId,offset));}
      return step.do('history-count-audit',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>auditHistory(makeReader(runtime,hotel),hotel,accountId,payload.historyAuditLimit));
    }
    try {
      const reader=makeReader(runtime,hotel);
      let acquired=false;
      for(let attempt=0;attempt<120&&!acquired;attempt++){
        acquired=await step.do(`claim-${attempt}`,async()=>{
          const ok=await backendRpc<boolean>(runtime,'ar_claim_refresh',{p_run_id:runId});
          if(ok)return true;
          // Cloudflare enforces one instance for runId. Resume after an ambiguous claim
          // response may renew only this instance's own still-active database lease.
          const job=await backendRpc<{status:string}>(runtime,'ar_refresh_job',{p_run_id:runId});
          if(job.status==='running')return backendRpc<boolean>(runtime,'ar_renew_refresh',{p_run_id:runId});
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
      const stageAccounts=payload.accountBatchVersion===2?stageRefreshAccountBatches:stageRefreshAccounts;
      const invalidAccounts=await stageAccounts(runtime,runId,hotel,ids,businessDate,step,reader);
      if(payload.validateOnly){
        await step.do('finish-validation-only',async()=>{await backendRpc(runtime,'ar_fail_refresh',{p_run_id:runId,p_error_code:'validation_only_finished'});return {validated:invalidAccounts===0};});
        return {hotel,status:invalidAccounts?'validation_failed':'validated',accounts:ids.length};
      }
      if(invalidAccounts)throw new OperaError('invalid_response',undefined,'account_validation');
      await step.do('verify-membership-and-publish',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'},async()=>{
        const job=await backendRpc<{status:string}>(runtime,'ar_refresh_job',{p_run_id:runId});
        if(job.status==='succeeded')return {accounts:ids.length};
        if(!await backendRpc<boolean>(runtime,'ar_renew_refresh',{p_run_id:runId}))throw new Error('refresh_lease_expired');
        if(!accountId){const after=await discoverAccountIds(reader,hotel);const expected=new Set(ids);if(after.length!==ids.length||after.some(id=>!expected.has(id)))throw new OperaError('pagination_changed');}
        await backendRpc(runtime,'ar_publish_refresh',{p_run_id:runId,p_expected_accounts:ids.length});return {accounts:ids.length};
      });
      await postPublicationMaintenance(runtime,payload,step);
      return {hotel,status:'succeeded',accounts:ids.length};
    }catch(error){
      const serialized=error instanceof Error?error.message.match(/^OperaError: ([a-z_]+)(?::([a-z_]+))?$/):null;
      const code=error instanceof OperaError?`${error.code}${error.stage?'_'+error.stage:''}`:serialized?`${serialized[1]}${serialized[2]?'_'+serialized[2]:''}`:'refresh_failed';
      await step.do('record-failure',async()=>{await backendRpc(runtime,'ar_fail_refresh',{p_run_id:runId,p_error_code:code});return {status:'failed'};});
      throw new Error(code);
    }
  }
}
