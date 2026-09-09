import {makeReader} from '../opera/probe';
import {readVerifiedAccount,readBusinessDate,asObject} from '../refresh/read-snapshot';
import {readScopedInvoiceHistory} from '../opera/printed-invoices';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import type {DocumentJob} from '../documents/jobs';
import {statementModel} from './model';
import {renderStatement,type StatementAssets} from './render';
import {PDFDocument} from 'pdf-lib';
export async function workspaceStatement(env:RefreshEnv,job:DocumentJob){
 if(job.statement_source!=='workspace'||job.template_version!=='rtf-20260909-v3')throw Error('document_statement_source_invalid');
 const reader=makeReader(env,job.hotel);const businessDate=await readBusinessDate(reader,job.hotel);
 const verified=await readVerifiedAccount(reader,job.hotel,job.account_id,businessDate);
 for(const m of job.manifest){const row=verified.invoices.find(i=>i.id===m.id);if(!row||!['standalone','parent'].includes(row.collection_role)||row.open!==m.open||row.invoice_no!==m.invoice_no||row.folio_no!==m.folio_no)throw Error('document_source_changed');}
 const raw=await reader.account(job.account_id),account=asObject(asObject(raw).accountDetails);
 if(!Array.isArray(account.invoices))throw Error('document_statement_data_invalid');
 const missing=job.manifest.filter(m=>!(account.invoices as unknown[]).some(i=>String(asObject(i).transactionNo)===m.id));
 if(missing.length){const history=await readScopedInvoiceHistory(reader,job.hotel,job.account_id,missing.map(m=>m.invoice_no??''));account.invoices.push(...history.filter(i=>missing.some(m=>m.id===String(i.transactionNo))&&i.printed===true));}
 const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'}),model=statementModel(raw,job.manifest,date);
 if(model.aging.some((b,i)=>b.cents!==Math.round(verified.account.agingBuckets[i]?.amount*100)))throw Error('document_source_changed');
 const assets=await backendRpc<StatementAssets>(env,'ar_statement_template',{p_hotel:job.hotel,p_version:job.template_version});
 if(!assets)throw Error('document_statement_template_missing');const bytes=await renderStatement(model,assets);
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));return {bytes,pages:(await PDFDocument.load(bytes)).getPageCount(),sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
}
