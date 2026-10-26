import {verifiedExitJob} from '../preparation/exit-outbox';
import type {DocumentJob} from '../../worker/documents/jobs';
import {assertBatchJob,type BatchEntry,type BatchRecord} from './state';
export const batchHasEdits=(active:boolean,sessions:Iterable<{editor?:{dirty:boolean;past:unknown[]}}>)=>active||[...sessions].some(s=>s.editor?.dirty||s.editor?.past.length);
type JobIdentity=Pick<DocumentJob,'id'|'owner'|'hotel'|'account_id'|'invoice_ids'>;
export async function abandonVerifiedEntry<T extends {job:{id:string}&Partial<JobIdentity>;outcome:string;currentJob?:JobIdentity}>(batch:BatchRecord,entry:BatchEntry,read:()=>Promise<JobIdentity>,abandon:()=>Promise<T>,canContinue:()=>boolean=()=>true):Promise<T&{currentJob:JobIdentity}>{
 const before=await read();assertBatchJob(batch,entry,before);
 if(!canContinue())throw Error('The current session changed. No cleanup request was made.');
 const result=await abandon(),currentJob=verifiedExitJob(before,result);assertBatchJob(batch,entry,currentJob);return {...result,currentJob};
}
