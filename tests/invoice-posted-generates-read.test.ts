import {expect,it,vi} from 'vitest';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {postedGeneratePacket} from './fixtures/invoice-posted-generates';
import {readArTaxEvidence} from '../worker/invoice/ar-tax-read';
import {invoiceModel} from '../worker/invoice/model';
async function fixture(){
 const p=postedGeneratePacket(),e=p.arPostedGenerates[0],pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([612,792]);
 for(const [label,value,y] of [['Folio No.','88',650],['Total VAT 7%','224.57',380],['Total Non VAT Amount','0.00',366]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});if(y<400)page.drawText('THB',{x:570,y,size:9,font});}
 const bytes=await pdf.save(),rules=new Map<string,unknown>([['POST-BASE',e.rules],...e.generatedRules.map(r=>[r.transactionCode.code,r] as [string,unknown])]);
 const reader={account:vi.fn().mockResolvedValue({accountDetails:{...p.account,invoices:[{...p.invoice,reservationId:{id:'777'}}]}}),reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}}),folioTypeName:vi.fn().mockResolvedValue({details:{hotelId:'KAT',folioReportName:'kat_folio'}}),folioReport:vi.fn().mockResolvedValue({folio:{hotelId:'KAT',reservationId:{id:'777'},folio:Buffer.from(bytes).toString('base64')}}),invoiceTransactionCodeRules:vi.fn(async(code:string)=>{if(!rules.has(code))throw Error('Unexpected code');return structuredClone(rules.get(code));}),invoiceChargeSimulation:vi.fn<(code:string,amount:number)=>Promise<unknown>>(async()=>{throw Error('Posted generates must not be simulated');})};
 return {p,reader,rules};
}
it('reads stable explicit graph evidence without simulating posted parent or children',async()=>{
 const {p,reader}=await fixture(),evidence=await readArTaxEvidence(reader,p.manifest,p.account,p.postings,p.arDetails);
 expect(invoiceModel({...p,...evidence})).toMatchObject({vat:22457,gross:343270,nonTaxable:0});expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();expect(reader.folioReport).toHaveBeenCalledOnce();
 expect(reader.invoiceTransactionCodeRules).toHaveBeenCalledTimes(6);
});
it('refuses a changed child definition across native-control printing',async()=>{
 const {p,reader,rules}=await fixture(),original=reader.folioReport.getMockImplementation()!;
 reader.folioReport.mockImplementation(async()=>{const changed=structuredClone(p.arPostedGenerates[0].generatedRules[1]);changed.transactionCode.description.defaultText='OTHER TAX';rules.set('POST-VAT',changed);return original();});
 await expect(readArTaxEvidence(reader,p.manifest,p.account,p.postings,p.arDetails)).rejects.toThrow('document_invoice_ar_tax_unverified');expect(reader.folioReport).toHaveBeenCalledOnce();
});
it('simulates only standalone inclusive roots in a mixed posted/simulated invoice, including both cancellation signs',async()=>{
 const {p,reader,rules}=await fixture(),root=p.arDetails[0].response.transactions[0];
 for(const [n,amount] of [[0,100],[1,-100]]){
  const extra={...structuredClone(root),transactionNo:70001+n,transactionCode:'INCLUSIVE',debitAmount:{amount,currencyCode:'THB'},postedAmount:{amount,currencyCode:'THB'},transactionAmount:amount,subPostings:[]};
  p.arDetails[0].ids.push(String(extra.transactionNo));p.arDetails[0].response.transactions.push(extra);p.postings.invoicePostingsDetails.push({...extra,reference:'',checkNo:''});
 }
 const definition={hotelId:'KAT',transactionCode:'INCLUSIVE',transactionGroup:'RM',description:'Inclusive adjustment'};p.arDetails[0].response.trxCodesInfo.push(definition);p.postings.trxCodesInfo.push(definition);
 const rootRules=structuredClone(p.arPostedGenerates[0].rules);rootRules.transactionCode.code='INCLUSIVE';rootRules.transactionCode.classification.group.code='RM';rootRules.transactionCode.trxSetup.generatesType='INCLUSIVE';rootRules.transactionCode.trxSetup.taxInclusive=true;rootRules.transactionCode.generatesSetup.generates=[{code:'SIM-VAT',rule:{percentage:{amount:7,calculatedOn:'Base',useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:{bucket1:false,bucket2:false,bucket3:false}}];
 rules.set('INCLUSIVE',rootRules);rules.set('SIM-VAT',{transactionCode:{hotelId:'KAT',code:'SIM-VAT',classification:{group:{code:'TAX'}},description:{defaultText:'VAT'}}});
 reader.invoiceChargeSimulation.mockImplementation(async(code,amount)=>({result:{totalAmount:amount,charges:[{transactionCode:code,amount,sequence:0,basePosting:true},{transactionCode:code,amount:amount/1.07,sequence:0,basePosting:false},{transactionCode:'SIM-VAT',amount:amount*7/107,sequence:1,basePosting:false}]}}));
 const evidence=await readArTaxEvidence(reader,p.manifest,p.account,p.postings,p.arDetails),m=invoiceModel({...p,...evidence});
 expect(reader.invoiceChargeSimulation.mock.calls).toEqual([['INCLUSIVE',100],['INCLUSIVE',-100]]);expect(reader.folioReport).toHaveBeenCalledOnce();expect(m).toMatchObject({vat:22457,gross:343270});expect(m.lines).toHaveLength(6);
});
import {readInvoiceModel} from '../worker/invoice/read';
async function fullReader(){
 const {p,reader}=await fixture(),invoice={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'};
 return {p,reader:{...reader,invoiceHistory:vi.fn(),invoiceReservation:vi.fn().mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{id:'777',type:'Reservation'}]}]}}),financialTransactionDetail:vi.fn().mockResolvedValue({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[invoice]}]}),invoicePostings:vi.fn().mockResolvedValue(p.postings),invoicePostingBreakdown:vi.fn(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:p.taxRows,offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn(async(ids:string[])=>ids.includes('60001')?p.arDetails[0].response:{trxCodesInfo:p.taxCodes})}};
}
it('runs posted-generate qualification through the normal reader with final posting and balance fences',async()=>{
 const {p,reader}=await fullReader();expect((await readInvoiceModel(reader,p.manifest)).vat).toBe(22457);expect(reader.invoicePostings).toHaveBeenCalledTimes(2);expect(reader.financialTransactionDetail).toHaveBeenCalledTimes(2);expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();expect(reader.folioReport).toHaveBeenCalledOnce();
});
it('refuses same-total posting changes after native posted-generate control extraction',async()=>{
 const {p,reader}=await fullReader(),changed=structuredClone(p.postings);changed.invoicePostingsDetails[0].debitAmount.amount++;changed.invoicePostingsDetails[1].debitAmount.amount--;
 reader.invoicePostings.mockResolvedValueOnce(p.postings).mockResolvedValueOnce(changed);await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.folioReport).toHaveBeenCalledOnce();
});
import {OperaError} from '../worker/opera/client';
it('never restarts a posted-graph read after printing when the final rule read fails',async()=>{
 const {p,reader}=await fullReader(),before=reader.invoiceTransactionCodeRules.getMockImplementation()!,started=vi.fn();
 reader.invoiceTransactionCodeRules.mockImplementation(async(code)=>{if(reader.folioReport.mock.calls.length)throw new OperaError('pagination_changed');return before(code);});
 await expect(readInvoiceModel(reader,p.manifest,undefined,started)).rejects.toMatchObject({code:'pagination_changed'});expect(started).toHaveBeenCalledOnce();expect(reader.folioReport).toHaveBeenCalledOnce();
});
