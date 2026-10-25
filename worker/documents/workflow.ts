import {acceptanceEnvironment} from '../acceptance/context';
import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {runDocumentJob,uuidPattern} from './jobs';
import type {RefreshEnv,RefreshParams} from '../refresh/backend';
import {isHotelId} from '../../src/domain/hotels';
import {cleanupUnusedPreparation} from './unused-cleanup';
type DocumentWorkflowParams=RefreshParams&{unusedPreparationCleanup?:boolean};
/** Dedicated capacity: current AR/history imports cannot occupy PDF slots. */
export class ArDocumentWorkflow extends WorkflowEntrypoint<RefreshEnv,DocumentWorkflowParams>{
 async run(event:WorkflowEvent<DocumentWorkflowParams>,step:WorkflowStep){
  const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  if(payload&&typeof payload==='object'&&'unusedPreparationCleanup' in payload)return cleanupUnusedPreparation(this.env,payload,step);
  const runtime=payload.acceptanceId?await acceptanceEnvironment(this.env,payload.actorId??'',payload.acceptanceId):this.env;
  if(payload.documentJob!==true||!uuidPattern.test(payload.runId??'')||!isHotelId(payload.hotel))throw Error('document_request_invalid');
  return runDocumentJob(runtime,payload.runId,step);
 }
}
