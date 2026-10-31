import {it,expect} from 'vitest';
import {reviewedInvoiceIds,draftMatchesReviewedScope} from '../src/email/invoice-scope';
import {assertCombinedBatch,createBatch,initialCombined} from '../src/batch/state';

it('derives the canonical exported union independently of filenames and duplicate invoice appearances',()=>{
 expect(reviewedInvoiceIds(['a','b','c','d'],[{invoice_ids:['c','b']},{invoice_ids:['d','b']}])).toEqual(['b','c','d']);
 expect(reviewedInvoiceIds(['a'],[{}])).toBeNull();
 expect(()=>reviewedInvoiceIds(['a'],[{invoice_ids:['foreign']}])).toThrow();
 expect(()=>reviewedInvoiceIds(['a'],[{invoice_ids:['a','a']}])).toThrow();
});
it('accepts a server-confirmed covered subset in a combined batch but rejects foreign, empty and duplicate identities',()=>{
 const batch=createBatch('actor','phuket',[{hotel:'KAT',accountId:'A',accountName:'Synthetic',key:'synthetic',stage:'Billing',purpose:'billing',amount:100,ids:['a','b','c','d']}],{content:'invoices',layout:'combined'});
 batch.combined=initialCombined(batch);batch.entries[0].jobId=crypto.randomUUID();
 const saved={id:batch.combined.id,mailbox:'phuket',members:[{memberId:batch.entries[0].commandKey,documentJobId:batch.entries[0].jobId,hotel:'KAT',accountId:'A',invoiceIds:['b','c','d']}]} as any;
 expect(()=>assertCombinedBatch(batch,saved)).not.toThrow();
 for(const ids of [['foreign'],[],['b','b']]){saved.members[0].invoiceIds=ids;expect(()=>assertCombinedBatch(batch,saved)).toThrow();}
});
it('accepts a batch draft bound to reviewed coverage and rejects a same-sized wrong subset',()=>{
 const job={id:'job',owner:'owner',revision:2,hotel:'KAT',account_id:'account',invoice_ids:['a','b','c','d'],exports:[{name:'Renamed.pdf',storage_key:'key',sha256:'digest',byte_count:100,invoice_ids:['b','c','d']}]};
 const draft={owner:'owner',document_job_id:'job',document_revision:2,hotel:'KAT',account_id:'account',invoice_ids:['b','c','d']};
 expect(draftMatchesReviewedScope(job,draft)).toBe(true);
 expect(draftMatchesReviewedScope(job,{...draft,invoice_ids:['a','c','d']})).toBe(false);
 expect(draftMatchesReviewedScope(job,{...draft,document_revision:1})).toBe(false);
});
