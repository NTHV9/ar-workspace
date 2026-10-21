import {it,expect} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {packet,money} from './fixtures/invoice-packet';
function paymentInvoice(amount=1000){
 const p=packet(1),net=3315-amount;
 return {...p,manifest:{...p.manifest,open:net},invoice:{...p.invoice,amount:money(net),balance:money(net)},
  postings:{invoicePostingsDetails:[...p.postings.invoicePostingsDetails,{transactionNo:60001,transactionCode:'PAY',transactionDate:'2026-01-03',checkNo:'',reference:'',debitAmount:money(-amount)}],trxCodesInfo:[...p.postings.trxCodesInfo,{hotelId:'KAT',transactionCode:'PAY',description:'Deposit Transfer',transactionGroup:'INPM'}]},
  taxRows:[...p.taxRows,{posting:{hotelId:'KAT',folioNo:88,guestInfo:{reservationId:{id:'777'}},transactionNo:60001,transactionCode:'PAY',transactionType:'Payment',postedAmount:money(Math.abs(amount)),creditAmount:money(amount)}}]};
}
it('keeps prior payment out of revenue and VAT and prints it in the source credit column',()=>{
 const m=invoiceModel(paymentInvoice());expect(m.gross).toBe(331500);expect(m.debit).toBe(331500);expect(m.credit).toBe(100000);expect(m.outstanding).toBe(231500);
 expect(m.vat).toBe(21687);expect(m.nonTaxable).toBe(0);expect(m.taxableNet).toBe(309813);expect(m.lines.at(-1)).toMatchObject({debit:0,credit:100000});
});
it('preserves a reversed payment sign without changing the underlying charge VAT',()=>{
 const m=invoiceModel(paymentInvoice(-100));expect(m.gross).toBe(331500);expect(m.credit).toBe(-10000);expect(m.outstanding).toBe(341500);expect(m.vat).toBe(21687);expect(m.lines.at(-1)).toMatchObject({debit:0,credit:-10000});
});
it.each(['amount','code','folio','reservation','currency','both-sides'] as const)('refuses a payment whose ledger evidence differs from the AR line (%s)',kind=>{
 const p=paymentInvoice(),last=p.taxRows.at(-1)!;if(!('creditAmount' in last.posting))throw Error('Fixture');const pay=last.posting;
 if(kind==='amount')pay.creditAmount=money(999);if(kind==='code')pay.transactionCode='OTHER';if(kind==='folio')pay.folioNo=89;if(kind==='reservation')pay.guestInfo.reservationId.id='999';if(kind==='currency')pay.postedAmount.currencyCode='USD';
 const taxRows=kind==='both-sides'?[...p.taxRows.slice(0,-1),{posting:{...pay,debitAmount:money(1),creditAmount:money(1001)}}]:p.taxRows;
 expect(()=>invoiceModel({...p,taxRows})).toThrow();
});
it('does not silently discard tax information attached to a Payment',()=>{
 const p=paymentInvoice(),last=p.taxRows.at(-1)!;const taxRows=[...p.taxRows.slice(0,-1),{...last,postingBreakdown:{grossAmount:money(1000),netAmount:money(1000)}}];
 expect(()=>invoiceModel({...p,taxRows})).toThrow('payment_tax_unsupported');
});
