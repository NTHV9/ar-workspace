import type {WorkflowStep} from 'cloudflare:workers';
import {sweepRetention} from '../operations/retention-sweep';
import type {DriveEnv} from '../drive/shared';
import type {FinancialIngestionEnv} from '../financial/refresh';
import {backendRpc,type RefreshEnv,type RefreshParams} from './backend';
import {isHotelId} from '../../src/domain/hotels';
export async function postPublicationMaintenance(runtime:RefreshEnv&FinancialIngestionEnv&DriveEnv,payload:RefreshParams,step:WorkflowStep){
 const {hotel,accountId}=payload;
 // Current/open/manual runs release their scarce slots at publication.
 // Historical report jobs are retired; monthly cleanup stays daily.
 if(payload.refreshReason!=='scheduled')return;
 if(!isHotelId(hotel))throw Error('invalid_workflow_parameters');
      if(!accountId&&runtime.RETENTION_ENABLED==='true')try{await step.do('completed-file-retention',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},async()=>{
        try{return await sweepRetention(runtime);}catch{return {enabled:true,error:'retention_unavailable'};}
      });}catch{/* Monthly criteria/receipts are unchanged; the next daily sweep retries. */}
}

/** A daily request that joined another run must wait for verified publication. */
export async function joinedScheduledMaintenance(runtime:RefreshEnv&FinancialIngestionEnv&DriveEnv,payload:RefreshParams,step:WorkflowStep){
 for(let attempt=0;attempt<240;attempt++){
  const job=await step.do(`await-publication-${attempt}`,()=>backendRpc<{hotel:string;account_id:string|null;status:string}>(runtime,'ar_refresh_job',{p_run_id:payload.runId}));
  if(job.hotel!==payload.hotel||job.account_id)throw Error('refresh_scope');
  if(job.status==='succeeded'){await postPublicationMaintenance(runtime,{...payload,refreshReason:'scheduled'},step);return {status:'complete'};}
  if(job.status==='failed')return {status:'source_failed'};
  if(!['queued','running'].includes(job.status))throw Error('invalid_refresh_status');
  await step.sleep(`publication-wait-${attempt}`,'30 seconds');
 }
 throw Error('scheduled_publication_timeout');
}
