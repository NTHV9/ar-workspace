import {documentJob,uploadPrivate} from './jobs';
import {makeReader} from '../opera/probe';
import {asObject} from '../refresh/read-snapshot';
import {amountCents} from '../opera/normalize';
import {readScopedInvoiceHistory} from '../opera/printed-invoices';
import type {RefreshEnv} from '../refresh/backend';
/** Explicit GET inclFolios trial only. No postStatements or native generation command. */
export async function auditCombinedStatement(env:RefreshEnv,jobId:string){
 const job=await documentJob(env,jobId);if(!job)throw new Error('document_job_missing');
 if(job.manifest.some(i=>!i.invoice_no))throw new Error('invoice_number_missing');
 const reader=makeReader(env,job.hotel),history=await readScopedInvoiceHistory(reader,job.hotel,job.account_id,[...new Set(job.manifest.map(i=>i.invoice_no!))]);
 const wanted=new Set(job.invoice_ids),selected=history.filter(i=>wanted.has(String(i.transactionNo)));
 if(selected.length!==wanted.size||selected.some(i=>i.parentInvoiceNo!=null||amountCents(i.balance,'THB')<=0))throw new Error('selection_not_verified');
 const raw=asObject(await reader.statementSelection(job.account_id,job.invoice_ids,true));
 const statements=Array.isArray(raw.aRStatements)?raw.aRStatements.map(asObject):[],rows=statements.flatMap(s=>Array.isArray(s.invoices)?s.invoices.map(asObject):[]);
 const exactScope=statements.length===1&&statements[0].hotelId===job.hotel&&asObject(statements[0].accountId).id===job.account_id&&rows.length===wanted.size&&new Set(rows.map(i=>String(i.transactionNo))).size===wanted.size&&rows.every(i=>wanted.has(String(i.transactionNo)));
 const balancesMatch=exactScope&&rows.every(i=>amountCents(i.balance,'THB')===amountCents(selected.find(h=>String(h.transactionNo)===String(i.transactionNo))!.balance,'THB'))&&amountCents(statements[0].balance,'THB')===selected.reduce((n,i)=>n+amountCents(i.balance,'THB'),0);
 let pdfStrings=0,linkCount=0;
 const inspect=(v:unknown):void=>{if(typeof v==='string'){if(v.startsWith('JVBERi0')||v.startsWith('%PDF-'))pdfStrings++;}else if(Array.isArray(v))v.forEach(inspect);else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(k==='links'&&Array.isArray(x))linkCount+=x.length;inspect(x);}};inspect(raw);
 const keys=(v:Record<string,unknown>)=>Object.keys(v).filter(k=>/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(k));
 const summary={hotel:job.hotel,requested:wanted.size,returned:rows.length,exactScope,balancesMatch,includeFoliosRequested:true,includeFoliosReturned:statements.map(s=>s.inclFolios??null),responseKeys:keys(raw),statementKeys:[...new Set(statements.flatMap(keys))],invoiceKeys:[...new Set(rows.flatMap(keys))],pdfStrings,linkCount,nativeStatementPdfVerified:false};
 await uploadPrivate(env,`jobs/${job.id}/trial/combined-selection-${crypto.randomUUID()}.json`,new TextEncoder().encode(JSON.stringify({summary,response:raw})),'application/json');
 return summary;
}
