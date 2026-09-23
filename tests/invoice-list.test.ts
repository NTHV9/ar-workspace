import {it,expect} from 'vitest';
import {filterSortInvoices,invoiceColumns,type InvoiceSortKey} from '../src/dashboard/invoice-list';
import type {AgingInvoice} from '../src/dashboard/aging-model';
const base:AgingInvoice={status:'Not billed',id:'a',hotel:'KAT',accountId:'A',invoiceNo:'10',folioNo:'100',guest:'Zulu',date:'2026-09-02',age:null,open:100,role:'standalone',verified:true,parentId:null};
const rows=[base,{...base,status:'Billed',id:'b',hotel:'TSK',invoiceNo:'2',folioNo:'20',guest:'Anna',date:'2026-09-01',age:3,open:-20}];
it.each(invoiceColumns)('sorts %s both directions with missing values last',(key:InvoiceSortKey)=>{
 const asc=filterSortInvoices(rows,'',key,false),desc=filterSortInvoices(rows,'',key,true);
 if(key==='age'){expect(asc.map(r=>r.id)).toEqual(['b','a']);expect(desc.map(r=>r.id)).toEqual(['b','a']);}
 else expect(asc.map(r=>r.id)).toEqual(desc.map(r=>r.id).reverse());
});
it('sorts invoice identifiers naturally and filters across searchable fields without mutating the input',()=>{
 expect(filterSortInvoices(rows,'','invoiceNo',false).map(r=>r.invoiceNo)).toEqual(['2','10']);
 for(const query of ['anna','TSK','20'])expect(filterSortInvoices(rows,query,'open',false).map(r=>r.id)).toEqual(['b']);
 expect(rows[0]).toBe(base);
});
