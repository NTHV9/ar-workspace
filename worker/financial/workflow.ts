import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runFinancialHistory,type FinancialIngestionEnv} from './refresh';
import type {RefreshParams} from '../refresh/backend';
/** A single background-history slot cannot occupy the interactive document/refresh queue. */
export class ArFinancialWorkflow extends WorkflowEntrypoint<FinancialIngestionEnv,RefreshParams>{
 async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep){
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  if(typeof payload.actorId!=='string'||typeof payload.runId!=='string'||!['KAT','TSK'].includes(payload.hotel))throw Error('financial_invalid');
  return runFinancialHistory(this.env,{actor:payload.actorId,runId:payload.runId},step);
 }
}
