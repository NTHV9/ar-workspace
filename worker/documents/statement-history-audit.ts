import {documentJob,uploadPrivate} from './jobs';
import {makeReader} from '../opera/probe';
import {asObject} from '../refresh/read-snapshot';
import type {RefreshEnv} from '../refresh/backend';
/** Private administrative reads only; no report generation, accounting write or UI credential reuse. */
export async function auditStatementHistory(env:RefreshEnv,jobId:string,observedBatch?:string){
 if(observedBatch!==undefined&&!/^BATCH_[0-9]{1,20}$/.test(observedBatch))throw new Error('invalid_batch_reference');
 const job=await documentJob(env,jobId);if(!job)throw new Error('document_job_missing');
 const reader=makeReader(env,job.hotel),account=asObject(asObject(await reader.account(job.account_id,true)).accountDetails);
 if(account.hotelId!==job.hotel||asObject(account.accountId).id!==job.account_id)throw new Error('statement_history_scope');
 const profile=asObject(account.profileId);if(typeof profile.id!=='string'||!profile.id)throw new Error('statement_history_profile_missing');
 const history=asObject(await reader.statementHistory(job.account_id,profile.id));
 if(!Array.isArray(history.aRStatementHistory))throw new Error('statement_history_shape');
 const rows=history.aRStatementHistory.map(asObject),last=account.lastStatementInfo?asObject(account.lastStatementInfo):{};
 const names=rows.map(r=>r.reportFileName).filter((v):v is string=>typeof v==='string'&&v.length>0);
 const summary={hotel:job.hotel,historyEntries:rows.length,withFileName:names.length,withStatementNumber:rows.filter(r=>typeof r.statementNo==='number').length,batchFileReferences:names.filter(n=>/BATCH_[0-9]+/.test(n)).length,observedBatchMatched:observedBatch?names.some(n=>n===observedBatch||n.endsWith('/'+observedBatch)||n.endsWith('/'+observedBatch+'.pdf')||n===observedBatch+'.pdf'):null,historyLinks:Array.isArray(history.links)?history.links.length:0,lastStatementFilePresent:typeof last.reportFileName==='string'&&!!last.reportFileName,lastStatementNumberPresent:typeof last.statementNo==='number',nativePdfTransportVerified:false};
 await uploadPrivate(env,`jobs/${job.id}/trial/statement-history-${crypto.randomUUID()}.json`,new TextEncoder().encode(JSON.stringify({summary,lastStatementInfo:last,history})),'application/json');
 return summary;
}
