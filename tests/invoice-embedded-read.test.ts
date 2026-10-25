import {it,expect,vi} from 'vitest';
import {readInvoiceModel} from '../worker/invoice/read';
import {embeddedGeneratePacket} from './fixtures/invoice-embedded-generates';
function fixture(){
 const p=embeddedGeneratePacket(),current={...p.invoice,reservationId:{id:'777'}},detail={details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[current]}]},proof=p.embeddedGenerateProof,g=proof.groups[0],rules=[g.rules,...g.generatedRules];
 const reader={account:vi.fn().mockImplementation(async()=>({accountDetails:{...p.account,invoices:[current]}})),invoiceHistory:vi.fn(),reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88},{invoiceNo:100,folioNo:88}]}]}}),financialTransactionDetail:vi.fn().mockImplementation(async()=>structuredClone(detail)),invoiceReservation:vi.fn().mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}}),invoicePostings:vi.fn().mockImplementation(async()=>structuredClone(p.postings)),invoicePostingBreakdown:vi.fn().mockImplementation(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:structuredClone(p.taxRows),offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn().mockImplementation(async()=>({trxCodesInfo:structuredClone(p.taxCodes)})),invoiceTransactionCodeRules:vi.fn().mockImplementation(async(code:string)=>structuredClone(rules.find(r=>r.transactionCode.code===code))),folioTypeName:vi.fn().mockResolvedValue({details:{hotelId:'KAT',folioReportName:'kat_folio'}}),folioReport:vi.fn().mockRejectedValue(Error('PRINT MUST NOT RUN'))};
 return {p,reader,rules,detail,current};
}
it('qualifies full posted components with two bounded rule/source reads despite ambiguous whole folio, without printing',async()=>{
 const {p,reader}=fixture(),onPrint=vi.fn();p.taxCodes[0].description='Non-tax generate';
 expect(await readInvoiceModel(reader,p.manifest,undefined,onPrint)).toMatchObject({gross:11770,vat:770,nonTaxable:0,taxableNet:11000});
 expect(reader.invoiceTransactionCodeRules.mock.calls.map(c=>c[0])).toEqual(['FOOD','NONREV','VAT','FOOD','NONREV','VAT']);expect(reader.invoicePostingBreakdown).toHaveBeenCalledTimes(2);expect(reader.invoicePostings).toHaveBeenCalledTimes(2);expect(reader.financialTransactionDetail).toHaveBeenCalledTimes(4);expect(reader.folioReport).not.toHaveBeenCalled();expect(onPrint).not.toHaveBeenCalled();
});
it.each(['tax','selected','balance','rules','leaf-role','reservation','window'] as const)('rejects a source change while gathering posted proof (%s)',async kind=>{
 const {p,reader,rules}=fixture();let calls=0;
 if(kind==='rules'||kind==='leaf-role')reader.invoiceTransactionCodeRules.mockImplementation(async code=>{const r=structuredClone(rules.find(r=>r.transactionCode.code===code)!);if(++calls>3){if(kind==='rules')Object.assign(r.transactionCode,{description:{defaultText:'CHANGED'}});else r.transactionCode.trxSetup.nonTaxable=true;}return r;});
 else reader.account.mockImplementation(async()=>{const current={...p.invoice,reservationId:{id:'777'}};if(++calls===2){
  if(kind==='tax'){p.taxRows[0].postingBreakdown.taxes[0].amount.amount+=1;p.taxRows[0].postingBreakdown.netAmount.amount-=1;}
  if(kind==='selected')p.postings.invoicePostingsDetails[0].checkNo='CHANGED';
  if(kind==='balance')current.balance={amount:1,currencyCode:'THB'};
  if(kind==='reservation')current.reservationId.id='888';
  if(kind==='window')current.internalFolioWindowID='999';
 }return {accountDetails:{...p.account,invoices:[current]}};});
 if(kind==='window'){reader.financialTransactionDetail.mockImplementation(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[{...p.invoice,reservationId:{id:'777'},internalFolioWindowID:calls>=2?'999':'456'}]}]}));}
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.folioReport).not.toHaveBeenCalled();
});
it('preserves ambiguous-native refusal when a root has no posted VAT even with current nonTaxable false',async()=>{
 const {p,reader}=fixture();const other=structuredClone(p.taxRows[0]);other.posting.transactionNo=10002;other.posting.transactionCode='DIRECT';other.postingBreakdown.netAmount.amount=other.postingBreakdown.grossAmount.amount;other.postingBreakdown.taxes=[];p.taxRows.push(other);p.postings.invoicePostingsDetails.push({...p.postings.invoicePostingsDetails[0],transactionNo:10002,transactionCode:'DIRECT'});p.postings.trxCodesInfo.push({...p.postings.trxCodesInfo[0],transactionCode:'DIRECT'});p.invoice.amount.amount*=2;p.invoice.balance.amount*=2;p.manifest.open*=2;
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow();expect(reader.invoiceTransactionCodeRules).not.toHaveBeenCalled();expect(reader.invoicePostingBreakdown).toHaveBeenCalledOnce();expect(reader.folioReport).not.toHaveBeenCalled();
});

it.each(['rules-before','rules-after','source'] as const)('propagates provider failures without native fallback or retries (%s)',async kind=>{
 const {p,reader,rules}=fixture(),error=Error('provider-unavailable');let calls=0;
 if(kind==='source')reader.invoicePostingBreakdown.mockRejectedValueOnce(error);
 else reader.invoiceTransactionCodeRules.mockImplementation(async code=>{if(++calls>(kind==='rules-before'?0:3))throw error;return structuredClone(rules.find(r=>r.transactionCode.code===code));});
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toBe(error);expect(reader.folioReport).not.toHaveBeenCalled();
});
it('keeps existing native fallback exactly once for a statically unsupported profile',async()=>{
 const {p,reader,rules}=fixture();rules[1].transactionCode.trxSetup.nonTaxable=true;
 reader.reservationFolios.mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}});
 const timeout=Error('uncertain-print');reader.folioReport.mockRejectedValue(timeout);const onPrint=vi.fn();
 await expect(readInvoiceModel(reader,p.manifest,undefined,onPrint)).rejects.toBe(timeout);expect(reader.folioReport).toHaveBeenCalledOnce();expect(onPrint).toHaveBeenCalledOnce();expect(reader.invoicePostingBreakdown).toHaveBeenCalledOnce();
});
