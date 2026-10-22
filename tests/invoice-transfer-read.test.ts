import {expect,it,vi} from 'vitest';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {arAdjustmentPacket,money} from './fixtures/invoice-packet';
import {readInvoiceModel,readInvoicePacket} from '../worker/invoice/read';
import {invoiceModel} from '../worker/invoice/model';
async function fixture(amount=100){
 const base=arAdjustmentPacket(),gross=3315+amount,vat=Math.round(gross*7/107*100);
 base.postings.invoicePostingsDetails[1].debitAmount=money(amount);const root=base.arDetails[0].response.transactions[0];root.debitAmount=root.postedAmount=money(amount);root.aRInfo.accountNumber='SYN-SOURCE';
 const current={...base.invoice,transactionDate:'2026-01-15',reservationId:{id:'777',type:'Reservation'},internalFolioWindowID:'456',amount:money(gross),balance:money(3000),transferredIn:true,transferredOut:false,compressed:false};
 const p={...base,manifest:{...base.manifest,open:3000},account:{...base.account,accountId:{id:'101',type:'AccountId'},accountNo:'SYN-DEST',invoices:[current]},invoice:current};
 const source={hotelId:'KAT',accountId:{id:'202',type:'AccountId'},accountNo:'SYN-SOURCE'},positive={...current,transactionNo:700,amount:money(gross),balance:money(0),transferredIn:false,transferredOut:true},negative={...positive,transactionNo:701,amount:money(-gross)};
 const accounts={accountsDetails:[source],offset:20,limit:20,totalResults:1,hasMore:false},history={details:[{...source,invoices:[negative,positive]}],offset:20,limit:20,totalResults:2,hasMore:false};
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([612,792]);
 for(const [label,value,y] of [['Folio No.','88',650],['Total VAT 7%',(vat/100).toFixed(2),380],['Total Non VAT Amount','0.00',366],['Total Outstanding Balance',gross.toFixed(2),350]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});if(y<400)page.drawText('THB',{x:570,y,size:9,font});}
 const bytes=await pdf.save(),code='AR-ADJUSTMENT',rules={transactionCode:{hotelId:'KAT',code,classification:{type:'Revenue',group:{code:'RM'}},trxSetup:{generatesType:'INCLUSIVE',taxInclusive:true,nonTaxable:false},generatesSetup:{addBaseAmtTo:{bucket1:true,bucket2:false,bucket3:false},generates:[{code:'VAT',rule:{percentage:{amount:7,calculatedOn:'Base',useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:{bucket1:false,bucket2:false,bucket3:false}}]},associatedTransactionCodes:[]}};
 const reader={account:vi.fn(async()=>({accountDetails:structuredClone(p.account)})),accountsByNumber:vi.fn(async()=>structuredClone(accounts)),invoiceHistory:vi.fn(async()=>structuredClone(history)),invoiceReservation:vi.fn().mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}}),reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}}),financialTransactionDetail:vi.fn(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[structuredClone(current)]}]})),invoicePostings:vi.fn(async(_scope:{accountId:string})=>structuredClone(p.postings)),invoicePostingBreakdown:vi.fn(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:p.taxRows,offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn(async(ids:string[])=>ids.includes('60001')?structuredClone(p.arDetails[0].response):{trxCodesInfo:p.taxCodes}),folioTypeName:vi.fn().mockResolvedValue({details:{hotelId:'KAT',folioReportName:'kat_folio'}}),folioReport:vi.fn().mockResolvedValue({folio:{hotelId:'KAT',reservationId:{id:'777'},folio:Buffer.from(bytes).toString('base64')}}),invoiceTransactionCodeRules:vi.fn(async(c:string)=>c===code?structuredClone(rules):{transactionCode:{hotelId:'KAT',code:c,classification:{group:{code:'TAX'}},description:{defaultText:'VAT'}}}),invoiceChargeSimulation:vi.fn(async(_code:string,value:number)=>({result:{totalAmount:value,charges:[{transactionCode:code,amount:value,sequence:0,basePosting:true},{transactionCode:code,amount:value/1.07,sequence:0,basePosting:false},{transactionCode:'VAT',amount:value*7/107,sequence:1,basePosting:false}]}}))};
 return {p,reader,accounts,history,current,vat};
}
it.each([100,-100])('qualifies the exact full-transfer proof and keeps current API outstanding independent of printed gross (%s)',async amount=>{
 const {p,reader,vat}=await fixture(amount),m=await readInvoiceModel(reader,p.manifest);expect(m).toMatchObject({gross:Math.round((3315+amount)*100),vat,nonTaxable:0,outstanding:300000});
 expect(reader.accountsByNumber.mock.calls).toEqual([['SYN-SOURCE'],['SYN-SOURCE']]);expect(reader.invoiceHistory.mock.calls).toEqual([['202',['99'],0,20],['202',['99'],0,20]]);expect(reader.folioReport).toHaveBeenCalledOnce();expect(reader.invoicePostings.mock.calls.filter(([s])=>s.accountId==='202')).toHaveLength(2);
});
it('does not fetch transfer proof for ordinary postings already belonging to the current account',async()=>{
 const {p,reader}=await fixture();p.arDetails[0].response.transactions[0].aRInfo.accountNumber='SYN-DEST';await readInvoiceModel(reader,p.manifest);expect(reader.accountsByNumber).not.toHaveBeenCalled();expect(reader.invoiceHistory).not.toHaveBeenCalled();
});
it('model rechecks current packet values instead of trusting the retained transfer summary',async()=>{
 const {p,reader}=await fixture(),packet=await readInvoicePacket(reader,p.manifest,true);expect(invoiceModel(packet).outstanding).toBe(300000);const changed=structuredClone(packet);(changed.account as typeof p.account).invoices[0].transferredIn=false;expect(()=>invoiceModel(changed)).toThrow('document_invoice_ar_transfer_unverified');
});
it.each(['lookup','history','source-postings','destination','balance','posted-account','posted-tax-shape','posted-invoice-missing','posted-folio-missing'] as const)('refuses changed proof after native printing without a second print (%s)',async kind=>{
 const {p,reader,history,current}=await fixture(),print=reader.folioReport.getMockImplementation()!,sourceRead=reader.invoicePostings.getMockImplementation()!;
 reader.folioReport.mockImplementation(async()=>{
  if(kind==='lookup')reader.accountsByNumber.mockResolvedValue({accountsDetails:[],offset:20,limit:20,totalResults:0,hasMore:false});
  if(kind==='history')history.details[0].invoices[0].balance=money(1);
  if(kind==='source-postings')reader.invoicePostings.mockImplementation(async scope=>{const data=await sourceRead(scope);if(scope.accountId==='202')data.invoicePostingsDetails[0].reference='CHANGED';return data;});
  if(kind==='destination')current.transferredIn=false;
  if(kind==='balance')current.balance=money(3001);
  if(kind==='posted-account')p.arDetails[0].response.transactions[0].aRInfo.accountNumber='OTHER';
  if(kind==='posted-tax-shape')p.arDetails[0].response.transactions[0].deferredTax=true;
  if(kind==='posted-invoice-missing')Reflect.deleteProperty(p.arDetails[0].response.transactions[0].aRInfo,'invoiceNo');
  if(kind==='posted-folio-missing')Reflect.deleteProperty(p.arDetails[0].response.transactions[0],'folioNo');
  return print();
 });
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_transfer_unverified');expect(reader.folioReport).toHaveBeenCalledOnce();
});
it.each(['missing-native','forged-summary','new-account','changed-row-tax'] as const)('keeps model transfer permission bound to current complete packet facts (%s)',async kind=>{
 const {p,reader}=await fixture(),packet=await readInvoicePacket(reader,p.manifest,true);
 if(kind==='missing-native')delete packet.nativeTaxControls;
 if(kind==='forged-summary')packet.arTransfer!.sourceAccountNumber='OTHER';
 if(kind==='new-account')(packet.arDetails![0].response as typeof p.arDetails[0]['response']).transactions[0].aRInfo.accountNumber='OTHER';
 if(kind==='changed-row-tax')(packet.arDetails![0].response as typeof p.arDetails[0]['response']).transactions[0].deferredTax=true;
 expect(()=>invoiceModel(packet)).toThrow(/document_invoice_ar_(?:transfer|tax)_unverified/);
});
it('refuses an account mismatch without explicit destination transfer flags before source lookup',async()=>{
 const {p,reader,current}=await fixture();current.transferredIn=false;await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_transfer_unverified');expect(reader.accountsByNumber).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
import {postedGeneratePacket} from './fixtures/invoice-posted-generates';
import {readArTaxEvidence} from '../worker/invoice/ar-tax-read';
it('does not extend transfer permission to nested posted-generate graphs',async()=>{
 const {reader}=await fixture(),p=postedGeneratePacket();p.account.accountNo='SYN-DEST';for(const root of p.arDetails[0].response.transactions)root.aRInfo.accountNumber='SYN-SOURCE';
 await expect(readArTaxEvidence(reader,p.manifest,p.account,p.invoice,p.postings,p.arDetails)).rejects.toThrow('document_invoice_ar_tax_unverified');expect(reader.accountsByNumber).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
import {OperaError} from '../worker/opera/client';
it('never repeats native printing after a failed fresh transfer read',async()=>{
 const {p,reader}=await fixture(),history=reader.invoiceHistory.getMockImplementation()!,started=vi.fn();
 reader.invoiceHistory.mockImplementation(async()=>{if(reader.folioReport.mock.calls.length)throw new OperaError('pagination_changed');return history();});
 await expect(readInvoiceModel(reader,p.manifest,undefined,started)).rejects.toMatchObject({code:'pagination_changed'});expect(started).toHaveBeenCalledOnce();expect(reader.folioReport).toHaveBeenCalledOnce();
});
