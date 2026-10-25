import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import type {FinancialIngestionEnv} from './refresh';
import type {RefreshParams} from '../refresh/backend';
import {isHotelId} from '../../src/domain/hotels';
/** Keep registered workflows compatible with queued IDs without importing history. */
export class ArFinancialWorkflow extends WorkflowEntrypoint<FinancialIngestionEnv,RefreshParams>{
 async run(event:WorkflowEvent<RefreshParams>,_step:WorkflowStep){
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  if(typeof payload.actorId!=='string'||typeof payload.runId!=='string'||!isHotelId(payload.hotel))throw Error('financial_invalid');
  return {status:'retired'};
 }
}
