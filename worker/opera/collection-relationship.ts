import { OperaError } from './client';
import { amountCents,type AccountSnapshot } from './normalize';
/** History rows have already passed exact hotel/account scoping and pagination checks. */
export function resolveCollectionRelationships(snapshot:AccountSnapshot,history:Record<string,unknown>[]) {
  for(const invoice of snapshot.invoices){
    invoice.collection_role='unverified';invoice.parent_invoice_id=null;invoice.parent_open=null;
    const matches=history.filter(r=>String(r.transactionNo)===invoice.id);
    if(matches.length!==1)continue;
    const row=matches[0];const ref=row.parentInvoiceNo==null?null:String(row.parentInvoiceNo);
    if(invoice.parent_invoice_no!==null&&invoice.parent_invoice_no!==ref)throw new OperaError('invalid_response',undefined,'compression_conflict');
    if(invoice.compressed!==null&&typeof row.compressed==='boolean'&&invoice.compressed!==row.compressed)throw new OperaError('invalid_response',undefined,'compression_conflict');
    invoice.parent_invoice_no=ref;
    if(typeof row.compressed!=='boolean')continue;
    invoice.compressed=row.compressed;
    if(ref!==null){
      const parents=history.filter(p=>p.compressed===true&&p.parentInvoiceNo==null&&String(p.invoiceNo)===ref&&String(p.transactionNo)!==invoice.id);
      if(parents.length!==1||row.compressed)continue;
      invoice.collection_role='child';invoice.parent_invoice_id=String(parents[0].transactionNo);invoice.parent_open=amountCents(parents[0].balance,'THB')/100;
    }else invoice.collection_role=row.compressed?'parent':'standalone';
  }
}
