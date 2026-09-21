import {describe,it,expect} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {invoiceAmountWords} from '../worker/invoice/render';

const money=(amount:number)=>({amount,currencyCode:'THB'});
export function packet(count=2){
 const total=count*3315,scope={hotelId:'KAT',folioNo:88,guestInfo:{reservationId:{id:'777',type:'Reservation'}}};
 const roots=Array.from({length:count},(_,n)=>({posting:{...scope,transactionNo:10001+n,referencePackageTransactionNo:90001+n,transactionType:'Wrapper'}}));
 const parts=roots.flatMap((root,n)=>[2715,600].map((gross,k)=>{const id=30001+n*10+k,net=gross/1.177;return {posting:{...scope,transactionNo:id,referencePackageTransactionNo:root.posting.referencePackageTransactionNo,transactionType:'Revenue'},postingBreakdown:{grossAmount:money(gross),netAmount:money(net),taxes:[{transactionNo:id*10+1,referenceTransactionNo:id,transactionCode:'SVC',amount:money(net*.1)},{transactionNo:id*10+2,referenceTransactionNo:id,transactionCode:'VAT',amount:money(gross*7/107)}]}};}));
 const taxRows:Array<(typeof roots)[number]|(typeof parts)[number]>=[...roots,...parts];
 return {manifest:{id:'500',hotel:'KAT',account_id:'101',invoice_no:'99',folio_no:'88',reservation_id:'777',folio_date:'2026-01-15',open:total,collection_role:'standalone'},account:{hotelId:'KAT',accountId:{id:'101'},accountName:'Synthetic Travel',address:{address:{addressLine:['Example Road']}}},invoice:{hotelId:'KAT',transactionNo:500,invoiceNo:99,folioNo:88,folioDate:'2026-01-15',balance:money(total),amount:money(total),reference:'VOUCHER-1',guestName:'Example Guest',cashierInfo:{cashierId:1,cashierName:'Cashier'}},reservation:{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'},{type:'Confirmation',id:'123456'}],roomStay:{arrivalDate:'2026-01-01',departureDate:'2026-01-15',adultCount:2,childCount:0,roomId:'101'}},postings:{invoicePostingsDetails:roots.map((r,n)=>({transactionNo:r.posting.transactionNo,transactionCode:'ROOM',transactionDate:'2026-01-02',checkNo:'PRINTED-'+(n+1),reference:'different internal reference',debitAmount:money(3315)})),trxCodesInfo:[{hotelId:'KAT',transactionCode:'ROOM',description:'Accommodation charge'}]},taxRows,taxCodes:[{hotelId:'KAT',transactionCode:'VAT',transactionGroup:'TAX',description:'Room VAT'},{hotelId:'KAT',transactionCode:'SVC',transactionGroup:'SVC',description:'Service charge'}]};
}
const now=new Date('2026-09-21T10:00:00Z');
describe('workspace invoice financial model',()=>{
 it('uses AR outstanding, printed check references and actual VAT excluding service charge',()=>{
  const p=packet(14),m=invoiceModel(p,now);expect(m.gross).toBe(4641000);expect(m.vat).toBe(303617);expect(m.taxableNet).toBe(4337383);expect(m.nonTaxable).toBe(0);expect(m.outstanding).toBe(m.gross);
  expect(m.lines).toHaveLength(14);expect(m.lines[0].reference).toBe('PRINTED-1');expect(m.printDate).toBe('21/09/26');expect(m.printTime).toBe('17:00');
 });
 it('keeps a partial payment out of gross/tax and uses the smaller current AR balance',()=>{
  const p=packet();p.manifest.open-=500;p.invoice.balance=money(p.manifest.open);const m=invoiceModel(p,now);expect(m.gross).toBe(663000);expect(m.outstanding).toBe(613000);expect(m.vat).toBe(43374);
 });
 it('does not add settlement or another invoice tax components into the footer',()=>{
  const p=packet(),extra=structuredClone(p.taxRows.at(-1)!);extra.posting.transactionNo=70000;if(!('referencePackageTransactionNo' in extra.posting))throw Error('Fixture');extra.posting.referencePackageTransactionNo=80000;p.taxRows.push(extra);
  expect(invoiceModel(p,now).gross).toBe(663000);expect(invoiceModel(p,now).vat).toBe(43374);
 });
 it.each(['hotel','folio','reservation'] as const)('rejects %s mismatch in a linked component',kind=>{
  const p=packet();const part=p.taxRows.at(-1)!;if(kind==='hotel')part.posting.hotelId='WAKL';if(kind==='folio')part.posting.folioNo=89;if(kind==='reservation')part.posting.guestInfo.reservationId.id='888';expect(()=>invoiceModel(p,now)).toThrow('tax_scope_invalid');
 });
 it('rejects a wrapper with a missing component instead of inventing VAT',()=>{const p=packet();p.taxRows.pop();expect(()=>invoiceModel(p,now)).toThrow('tax_reconciliation_failed');});
 it('rejects missing and duplicated tax coverage',()=>{const p=packet();p.taxRows=[];expect(()=>invoiceModel(p,now)).toThrow('tax_coverage_missing');const q=packet();q.taxRows.push(q.taxRows[0]);expect(()=>invoiceModel(q,now)).toThrow('tax_duplicate');});
 it('rejects unknown taxes and a changed tax rate rather than labelling them VAT 7%',()=>{const p=packet();p.taxCodes[0].description='Local tourism tax';expect(()=>invoiceModel(p,now)).toThrow('tax_code_unsupported');const q=packet();const last=q.taxRows.at(-1)!;('postingBreakdown' in last?last.postingBreakdown:undefined)!.taxes[1].amount=money(50);expect(()=>invoiceModel(q,now)).toThrow('tax_reconciliation_failed');});
 it('rejects a stale AR balance or incomplete line total',()=>{const p=packet();p.invoice.balance.amount-=1;expect(()=>invoiceModel(p,now)).toThrow('document_source_changed');const q=packet();q.postings.invoicePostingsDetails.pop();expect(()=>invoiceModel(q,now)).toThrow('document_source_changed');});
 it('rejects duplicate AR postings and a foreign currency',()=>{const p=packet();p.postings.invoicePostingsDetails.push(p.postings.invoicePostingsDetails[0]);expect(()=>invoiceModel(p,now)).toThrow('posting_duplicate');const q=packet();q.invoice.balance.currencyCode='USD';expect(()=>invoiceModel(q,now)).toThrow();});
 it('requires complete source dates',()=>{const p=packet();p.reservation.roomStay.arrivalDate='2026-02-30';expect(()=>invoiceModel(p,now)).toThrow('date_invalid');});
 it('supports explicit non-taxable breakdowns without replacing missing taxes with zero',()=>{const p=packet(1);for(const row of p.taxRows)if('postingBreakdown' in row){row.postingBreakdown.netAmount=row.postingBreakdown.grossAmount;row.postingBreakdown.taxes=[];}const m=invoiceModel(p,now);expect(m.nonTaxable).toBe(331500);expect(m.vat).toBe(0);expect(m.taxableNet).toBe(0);});
 it('does not duplicate the currency suffix and spells satang independently',()=>{expect(invoiceAmountWords(963000)).toBe('NINE THOUSAND SIX HUNDRED THIRTY BAHT ONLY');expect(invoiceAmountWords(963051)).toBe('NINE THOUSAND SIX HUNDRED THIRTY BAHT AND FIFTY ONE SATANG');});
});
