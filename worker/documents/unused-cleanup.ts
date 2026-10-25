import type {WorkflowStep} from 'cloudflare:workers';
import {isHotelId} from '../../src/domain/hotels';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {cleanupTransientDocument} from '../operations/retention-sweep';
import {writesHeld} from '../operations/write-hold';
import {uuidPattern} from './jobs';

/** CLI maintenance on one backed retirement; no caller-supplied authority or keys. */
export async function cleanupUnusedPreparation(env:RefreshEnv,input:unknown,step:WorkflowStep){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('document_request_invalid');
 const p=input as Record<string,unknown>;
 if(p.unusedPreparationCleanup!==true||typeof p.runId!=='string'||!uuidPattern.test(p.runId)||!isHotelId(p.hotel)
  ||Object.keys(p).some(k=>!['runId','hotel','unusedPreparationCleanup'].includes(k)))throw Error('document_request_invalid');
 const jobId=p.runId,hotel=p.hotel,counts={passes:0,checked:0,deleted:0,errors:0};
 const result=(status:'complete'|'bounded'|'attention'|'paused')=>({status,jobId,hotel,...counts});
 if(writesHeld(env)||env.RETENTION_ENABLED!=='true')return result('paused');
 const options={retries:{limit:0,delay:'5 seconds' as const},timeout:'15 minutes' as const};
 const actor=await step.do('authorize-unused-preparation-cleanup',options,async()=>{
  const owner=await backendRpc<string|null>(env,'ar_financial_service_actor',{});
  if(typeof owner!=='string'||!uuidPattern.test(owner))throw Error('document_forbidden');
  const job=await backendRpc<Record<string,unknown>|null>(env,'ar_document_get',{p_job_id:jobId});
  if(!job||job.id!==jobId||job.hotel!==hotel||job.owner!==owner||job.retired!==true||job.closed_reason!=='discarded'
   ||typeof job.closed_at!=='string'||!Number.isFinite(Date.parse(job.closed_at)))throw Error('document_forbidden');
  return owner;
 });
 // SQL rotates at most ten exact receipt-pinned objects per pass. Every provider
 // operation rechecks ownership, references, hashes and acknowledged readback.
 for(let pass=0;pass<8;pass++){
  const outcome=await step.do(`unused-preparation-cleanup-${pass}`,options,()=>cleanupTransientDocument(env,actor,jobId));
  counts.passes++;
  if(outcome.enabled!==true)return result('paused');
  if(!('checked' in outcome)||!('deleted' in outcome)||!('errors' in outcome))throw Error('document_cleanup_invalid');
  const {checked,deleted,errors}=outcome;
  if(![checked,deleted,errors].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10)||deleted>checked)throw Error('document_cleanup_invalid');
  counts.checked+=checked;counts.deleted+=deleted;counts.errors+=errors;
  // Any item without a confirmed deletion may be blocked or uncertain. Preserve
  // its durable receipt and stop rather than repeatedly dispatching provider work.
  if(errors||deleted!==checked)return result('attention');
  if(!checked)return result('complete');
 }
 return result('bounded');
}
