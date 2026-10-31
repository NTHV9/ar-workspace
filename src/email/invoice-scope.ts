import type {DocumentJob} from '../../worker/documents/jobs';
import type {EmailDraft} from '../../worker/email/shared';
export function hasReviewedInvoiceScope(exports:readonly unknown[]):boolean{
 return exports.length>0&&exports.every(f=>!!f&&typeof f==='object'&&'invoice_ids' in f&&Array.isArray(f.invoice_ids));
}
/** Source IDs carried with reviewed bytes; null means a legacy, unknown scope. */
export function reviewedInvoiceIds(selected:readonly string[],exports:readonly {invoice_ids?:readonly string[]}[]):string[]|null{
 const covered=new Set<string>();let unknown=false;
 for(const file of exports){
  const ids=file.invoice_ids;if(ids===undefined){unknown=true;continue;}
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!selected.includes(id)))throw Error('email_package_changed');
  for(const id of ids)covered.add(id);
 }
 return unknown||!exports.length?null:selected.filter(id=>covered.has(id));
}
export function documentInvoiceIds(job:Pick<DocumentJob,'invoice_ids'|'exports'>):string[]{return reviewedInvoiceIds(job.invoice_ids,job.exports)??job.invoice_ids;}
export function draftMatchesReviewedScope(job:Pick<DocumentJob,'id'|'owner'|'revision'|'hotel'|'account_id'|'invoice_ids'|'exports'>,draft:Pick<EmailDraft,'owner'|'document_job_id'|'document_revision'|'hotel'|'account_id'|'invoice_ids'>):boolean{
 const ids=documentInvoiceIds(job);
 return draft.owner===job.owner&&draft.document_job_id===job.id&&draft.document_revision===job.revision&&draft.hotel===job.hotel&&draft.account_id===job.account_id&&draft.invoice_ids.length>0&&draft.invoice_ids.length===ids.length&&new Set(draft.invoice_ids).size===ids.length&&draft.invoice_ids.every(id=>ids.includes(id));
}
