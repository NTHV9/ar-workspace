import {acceptanceEnvironment} from '../acceptance/context';
import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runFinancialHistory,type FinancialIngestionEnv} from './refresh';
import type {RefreshParams} from '../refresh/backend';
/** A single background-history slot cannot occupy the interactive document/refresh queue. */
export class ArFinancialWorkflow extends WorkflowEntrypoint<FinancialIngestionEnv,RefreshParams>{
 async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep){
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  const runtime=payload.acceptanceId?await acceptanceEnvironment(this.env,payload.actorId??'',payload.acceptanceId):this.env;
  if(typeof payload.actorId!=='string'||typeof payload.runId!=='string'||!['KAT','TSK'].includes(payload.hotel))throw Error('financial_invalid');
  return runFinancialHistory(runtime,{actor:payload.actorId,runId:payload.runId},step);
 }
}
