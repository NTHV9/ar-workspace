import { expect,it } from 'vitest';
import { resolveCollectionRelationships } from '../worker/opera/collection-relationship';
import { normalizeAccount } from '../worker/opera/normalize';
const money=(amount:number)=>({amount,currencyCode:'THB'});
const raw=(id:number,open:number,extra={})=>({transactionNo:id,invoiceNo:String(id),balance:money(open),originalAmount:money(100),amount:money(100),payments:money(100-open),transactionDate:'2026-09-01',compressed:false,...extra});
function snapshot(rows:unknown[]){return normalizeAccount({accountDetails:{hotelId:'KAT',accountId:{id:'sample'},accountName:'Synthetic',type:'Agent',summary:{debit:money(100),credit:money(0),total:money(100)},agingInfo:{aging:[]},invoices:rows}},'KAT','2026-09-09');}
it('blocks a positive child even when its parent is explicitly zero; preserves source amount',()=>{
 const child=raw(2,100,{parentInvoiceNo:1}),parent=raw(1,0,{compressed:true});const s=snapshot([child]);
 resolveCollectionRelationships(s,[parent,child]);
 expect(s.invoices[0]).toMatchObject({open:100,collection_role:'child',parent_invoice_id:'1',parent_open:0});
});
it('does not resolve by balance or an ambiguous invoice number',()=>{
 const child=raw(2,100,{parentInvoiceNo:1});const s=snapshot([child]);resolveCollectionRelationships(s,[child]);
 expect(s.invoices[0].collection_role).toBe('unverified');
 const a=snapshot([child]);resolveCollectionRelationships(a,[child,raw(1,0,{compressed:true}),raw(3,0,{invoiceNo:'1',compressed:true})]);expect(a.invoices[0].collection_role).toBe('unverified');
});
it('distinguishes standalone and parent and rejects conflicting source relationships',()=>{
 const s=snapshot([raw(1,100,{compressed:true}),raw(2,100)]);resolveCollectionRelationships(s,[raw(1,100,{compressed:true}),raw(2,100)]);
 expect(s.invoices.map(i=>i.collection_role)).toEqual(['parent','standalone']);
 expect(()=>resolveCollectionRelationships(snapshot([raw(2,100,{parentInvoiceNo:1})]),[raw(2,100,{parentInvoiceNo:3})])).toThrow();
});
