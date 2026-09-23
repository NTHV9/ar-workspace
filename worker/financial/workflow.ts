import {warmPeriodSummaries} from '../dashboard/precompute';
import {acceptanceEnvironment} from '../acceptance/context';
import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runFinancialHistory,type FinancialIngestionEnv} from './refresh';
import type {RefreshParams} from '../refresh/backend';
import {isHotelId} from '../../src/domain/hotels';
/** Two background-history slots stay separate from interactive document/refresh work. */
export class ArFinancialWorkflow extends WorkflowEntrypoint<FinancialIngestionEnv,RefreshParams>{
 async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep){
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  const runtime=payload.acceptanceId?await acceptanceEnvironment(this.env,payload.actorId??'',payload.acceptanceId):this.env;
  if(typeof payload.actorId!=='string'||typeof payload.runId!=='string'||!isHotelId(payload.hotel))throw Error('financial_invalid');
  const result=await runFinancialHistory(runtime,{actor:payload.actorId,runId:payload.runId},step);
  if(result.status==='succeeded'){try{await step.do('period-summary-precompute',{retries:{limit:0,delay:'5 seconds'},timeout:'10 minutes'},()=>warmPeriodSummaries(runtime));}catch{/* Published source data remains successful; maintenance retries this optional cache. */}}
  return result;
 }
}
