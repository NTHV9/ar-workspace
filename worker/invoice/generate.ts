import {PDFDocument} from 'pdf-lib';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {makeReader} from '../opera/probe';
import type {DocumentJob} from '../documents/jobs';
import type {DocumentInvoice} from '../documents/native-invoice';
import {readInvoiceModel} from './read';
import {renderInvoice} from './render';
import {supportedInvoiceTemplate,type InvoiceAssets} from './types';

export async function workspaceInvoice(env:RefreshEnv,job:DocumentJob,invoice:DocumentInvoice){
 if(job.invoice_source!=='workspace'||!supportedInvoiceTemplate(job.invoice_template_version))throw Error('document_invoice_source_invalid');
 if(invoice.hotel!==job.hotel||invoice.account_id!==job.account_id||!job.invoice_ids.includes(invoice.id))throw Error('document_invoice_scope_invalid');
 const assets=await backendRpc<InvoiceAssets|null>(env,'ar_invoice_template',{p_hotel:job.hotel,p_version:job.invoice_template_version});
 if(!assets)throw Error('document_invoice_template_missing');
 if(assets.version!==job.invoice_template_version)throw Error('document_invoice_template_invalid');
 const model=await readInvoiceModel(makeReader(env,job.hotel),invoice),bytes=await renderInvoice(model,assets);
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
 return {bytes,pages:(await PDFDocument.load(bytes)).getPageCount(),sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
}
