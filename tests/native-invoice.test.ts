import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {nativeFolioSelector,getNativeInvoicePdf,type DocumentInvoice} from '../worker/documents/native-invoice';
const invoice:DocumentInvoice={id:'1',hotel:'KAT',account_id:'A',invoice_no:'100',folio_no:'200',reservation_id:'300',folio_date:'2026-09-01',open:100,collection_role:'standalone'};
const printedRow={transactionNo:1,invoiceNo:100,folioNo:200,reservationId:{id:'300'},folioDate:'2026-09-01',balance:{amount:100,currencyCode:'THB'},printed:true,compressed:false};
function printedPage(rows=[printedRow],hotel='KAT'){return {details:[{hotelId:hotel,accountId:{id:'A'},invoices:rows}],totalResults:rows.length,hasMore:false,offset:20,limit:20};}
it('renders a printed invoice absent from Current only after exact scoped history verification',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();let renders=0;
 const reader={account:async()=>({accountDetails:{hotelId:'KAT',accountId:{id:'A'},invoices:[]}}),invoiceHistory:async()=>printedPage(),reservationFolios:async()=>history(),folioReport:async()=>{renders++;return {folio:{hotelId:'KAT',reservationId:{id:'300'},folio:btoa(String.fromCharCode(...bytes))}};}};
 const result=await getNativeInvoicePdf(reader,invoice);expect(result.pages).toBe(1);expect(renders).toBe(1);
});
it.each([
 {...printedRow,hotelId:'TSK'},
 {...printedRow,printed:false},
 {...printedRow,balance:{amount:99,currencyCode:'THB'}},
 {...printedRow,folioNo:201},
 {...printedRow,reservationId:{id:'301'}},
 {...printedRow,parentInvoiceNo:900},
])('never renders an unverified or conflicting historical candidate %#',async row=>{
 let renders=0;const reader={account:async()=>({accountDetails:{hotelId:'KAT',accountId:{id:'A'},invoices:[]}}),invoiceHistory:async()=>printedPage([row]),reservationFolios:async()=>history(),folioReport:async()=>{renders++;return {};}};
 await expect(getNativeInvoicePdf(reader,invoice)).rejects.toThrow();expect(renders).toBe(0);
});
it('rejects history from another hotel before native render',async()=>{
 let renders=0;const reader={account:async()=>({accountDetails:{hotelId:'KAT',accountId:{id:'A'},invoices:[]}}),invoiceHistory:async()=>printedPage([printedRow],'TSK'),reservationFolios:async()=>history(),folioReport:async()=>{renders++;return {};}};
 await expect(getNativeInvoicePdf(reader,invoice)).rejects.toThrow();expect(renders).toBe(0);
});
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
