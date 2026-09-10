import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runDocumentJob,uuidPattern} from './jobs';
import type {RefreshEnv,RefreshParams} from '../refresh/backend';
/** Dedicated capacity: current AR/history imports cannot occupy PDF slots. */
export class ArDocumentWorkflow extends WorkflowEntrypoint<RefreshEnv,RefreshParams>{
 async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep){
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  if(payload.documentJob!==true||!uuidPattern.test(payload.runId??'')||!['KAT','TSK'].includes(payload.hotel))throw Error('document_request_invalid');
  return runDocumentJob(this.env,payload.runId,step);
 }
}
