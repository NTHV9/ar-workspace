import {expect,it} from 'vitest';
import {nativeFolioSelector,getNativeInvoicePdf,type DocumentInvoice} from '../worker/documents/native-invoice';
const invoice:DocumentInvoice={id:'1',hotel:'KAT',account_id:'A',invoice_no:'100',folio_no:'200',reservation_id:'300',folio_date:'2026-09-01',open:100,collection_role:'standalone'};
function history(folios=[{invoiceNo:100,folioNo:200}]){return {reservationFolioInformation:{reservationInfo:{hotelId:'KAT',reservationIdList:[{id:'300',type:'Reservation'}]},folioHistory:[{folioWindowNo:2,folios}]}};}
it('uses verified window rather than internal ID or default1',()=>{expect(nativeFolioSelector(history(),invoice)).toBe(2);});
it('rejects ambiguous window, wrong folio and cross-hotel history',()=>{
 expect(()=>nativeFolioSelector(history([{invoiceNo:100,folioNo:200},{invoiceNo:101,folioNo:201}]),invoice)).toThrow();
 expect(()=>nativeFolioSelector(history([{invoiceNo:100,folioNo:201}]),invoice)).toThrow();
 expect(()=>nativeFolioSelector(history(),{...invoice,hotel:'TSK'})).toThrow();
});
it('does not render after source balance changes or child selection',async()=>{
 let renders=0;const reader={account:async()=>({accountDetails:{hotelId:'KAT',accountId:{id:'A'},invoices:[{transactionNo:1,balance:{amount:99,currencyCode:'THB'}}]}}),reservationFolios:async()=>history(),folioReport:async()=>{renders++;return {};}};
 await expect(getNativeInvoicePdf(reader,invoice)).rejects.toThrow();
 await expect(getNativeInvoicePdf(reader,{...invoice,collection_role:'child'})).rejects.toThrow();expect(renders).toBe(0);
});
