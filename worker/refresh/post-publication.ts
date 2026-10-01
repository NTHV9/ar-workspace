import type {WorkflowStep} from 'cloudflare:workers';
import {warmPeriodSummaries} from '../dashboard/precompute';
import {sweepRetention} from '../operations/retention-sweep';
import type {DriveEnv} from '../drive/shared';
import {financialWorkflow,requestFinancialHistory,type FinancialIngestionEnv} from '../financial/refresh';
import {backendRpc,type RefreshEnv,type RefreshParams} from './backend';
export async function postPublicationMaintenance(runtime:RefreshEnv&FinancialIngestionEnv&DriveEnv,payload:RefreshParams,step:WorkflowStep){
 const {runId,hotel,accountId}=payload;
 // Current/open/manual runs release their scarce slots at publication. Preset
 // warming also has the existing maintenance cron; monthly cleanup stays daily.
 if(payload.refreshReason!=='scheduled')return;
      {try{await step.do('period-summary-precompute',{retries:{limit:0,delay:'5 seconds'},timeout:'10 minutes'},()=>warmPeriodSummaries(runtime));}catch{/* Published source data remains successful; maintenance retries this optional cache. */}}
      if(payload.refreshReason==='scheduled'&&!accountId&&runtime.FINANCIAL_HISTORY_ENABLED==='true')await step.do('enqueue-financial-history',{retries:{limit:1,delay:'5 seconds'},timeout:'2 minutes'},async()=>{
        try{const actor=await backendRpc<string|null>(runtime,'ar_financial_service_actor',{});if(!actor)return {status:'actor_unavailable'};
          const next=await requestFinancialHistory(runtime,actor,{commandId:runId,hotel,reason:'scheduled'});
          const workflow=financialWorkflow(runtime,next.stepsVersion);
          if(next.id&&['queued','running'].includes(next.status)&&workflow){try{await workflow.create({id:next.id,params:{runId:next.id,hotel,actorId:actor,financialHistory:true}});}catch{await(await workflow.get(next.id)).status();}}
          return {status:next.status};
        }catch{return {status:'financial_queue_unavailable'};}
      });
      if(!accountId&&runtime.RETENTION_ENABLED==='true')try{await step.do('completed-file-retention',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},async()=>{
        try{return await sweepRetention(runtime);}catch{return {enabled:true,error:'retention_unavailable'};}
      });}catch{/* Monthly criteria/receipts are unchanged; the next daily sweep retries. */}
}
