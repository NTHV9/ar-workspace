import type {RefreshEnv} from '../refresh/backend';
import {asObject} from '../refresh/read-snapshot';
import {amountCents} from '../opera/normalize';
import {collectPages,verifiedNextCursor} from '../opera/pagination';
import {historyRootCount} from '../opera/history-count';
import {makeReader} from '../opera/probe';
import {documentJob,uploadPrivate} from './jobs';

/** Bounded administrative read-only audit. Does not publish snapshots or process reports. */
export async function auditPrintedVisibility(env:RefreshEnv,jobId:string){
 const job=await documentJob(env,jobId);if(!job)throw new Error('document_job_missing');
 const reader=makeReader(env,job.hotel);
 const normal=asObject(asObject(await reader.account(job.account_id)).accountDetails);
 const statement=asObject(asObject(await reader.account(job.account_id,true)).accountDetails);
 for(const a of [normal,statement])if(a.hotelId!==job.hotel||asObject(a.accountId).id!==job.account_id||!Array.isArray(a.invoices))throw new Error('audit_scope');
 const history=await collectPages(async(offset,limit)=>{
  const p=asObject(await reader.history(job.account_id,offset,limit));if(!Array.isArray(p.details))throw new Error('audit_history_shape');
  const rows:{kind:string;value:Record<string,unknown>}[]=[];
  for(const raw of p.details){const g=asObject(raw);if(g.hotelId!==job.hotel||asObject(g.accountId).id!==job.account_id)throw new Error('audit_scope');
   for(const [field,kind]of [['invoices','invoice'],['payments','payment']])for(const v of (g[field]??[]) as unknown[])rows.push({kind,value:asObject(v)});
  }
  return {rows,hasMore:p.hasMore as boolean|undefined,totalResults:p.totalResults as number|undefined,logicalCount:historyRootCount(rows),nextOffset:rows.length===0&&p.totalResults===0&&p.hasMore===false?undefined:verifiedNextCursor(p,offset,limit)};
 },r=>r.kind+':'+String(r.value.transactionNo),20);
 const normalRows=(normal.invoices as unknown[]).map(asObject),statementRows=(statement.invoices as unknown[]).map(asObject),openHistory=history.filter(r=>r.kind==='invoice'&&amountCents(r.value.balance,'THB')!==0).map(r=>r.value);
 const id=(r:Record<string,unknown>)=>String(r.transactionNo),normalIds=new Set(normalRows.map(id)),statementIds=new Set(statementRows.map(id));
 const missing=openHistory.filter(r=>!normalIds.has(id(r))),added=statementRows.filter(r=>!normalIds.has(id(r)));
 const equalRows=(a:Record<string,unknown>[],b:Record<string,unknown>[])=>a.length===b.length&&a.every(r=>{const matches=b.filter(v=>id(v)===id(r));return matches.length===1&&amountCents(matches[0].balance,'THB')===amountCents(r.balance,'THB');});
 const sum=(rows:Record<string,unknown>[])=>rows.reduce((n,r)=>n+amountCents(r.balance,'THB'),0);
 const summary={hotel:job.hotel,normalInvoices:normalRows.length,statementInvoices:statementRows.length,historyRows:history.length,openHistory:openHistory.length,historyOnly:missing.length,historyOnlyPrinted:missing.filter(r=>r.printed===true).length,historyOnlyUnknownPrinted:missing.filter(r=>typeof r.printed!=='boolean').length,statementAdded:added.length,statementAddsEveryMissing:missing.every(r=>statementIds.has(id(r))),statementMatchesOpenHistory:equalRows(statementRows.filter(r=>amountCents(r.balance,'THB')!==0),openHistory),normalMatchesOpenHistory:equalRows(normalRows.filter(r=>amountCents(r.balance,'THB')!==0),openHistory),accountBalanceStable:amountCents(normal.balance,'THB')===amountCents(statement.balance,'THB'),normalSumMatchesAccount:sum(normalRows)===amountCents(normal.balance,'THB'),historySumMatchesAccount:sum(openHistory)===amountCents(normal.balance,'THB'),selectedInNormal:job.invoice_ids.filter(v=>normalIds.has(v)).length,selectedInStatement:job.invoice_ids.filter(v=>statementIds.has(v)).length};
 await uploadPrivate(env,`jobs/${job.id}/trial/visibility-${crypto.randomUUID()}.json`,new TextEncoder().encode(JSON.stringify({summary,normal,statement,history})),'application/json');
 return summary;
}
