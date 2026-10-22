import {it,expect,vi} from 'vitest';
import {readInvoiceModel} from '../worker/invoice/read';
import {invoiceModel} from '../worker/invoice/model';
import {embeddedGeneratePacket} from './fixtures/invoice-embedded-generates';
import {money} from './fixtures/invoice-packet';
function fixture(){
 const {embeddedGenerateProof:_,...p}=embeddedGeneratePacket(),extra=structuredClone(p.taxRows[0]);extra.posting.transactionNo=10002;extra.posting.transactionCode='DIRECT';extra.posting.debitAmount=extra.posting.postedAmount=money(50);extra.postingBreakdown={grossAmount:money(50),netAmount:money(50),taxes:[]};p.taxRows.push(extra);p.postings.invoicePostingsDetails.push({...p.postings.invoicePostingsDetails[0],transactionNo:10002,transactionCode:'DIRECT',debitAmount:money(50),checkNo:'DIRECT'});p.postings.trxCodesInfo.push({...p.postings.trxCodesInfo[0],transactionCode:'DIRECT'});p.manifest.open=p.invoice.balance.amount=p.invoice.amount.amount=167.7;
 return {...p,nativeTaxControls:{vat:770,nonTaxable:0,fullTotals:{currency:'THB' as const,gross:16770,net:16000,vat:770,nonTaxable:0}}};
}
it('uses reconciled native NonVAT aggregate without rewriting actual posted VAT or source outstanding',()=>{
 const p=fixture();p.manifest.open=p.invoice.balance.amount=100;
 expect(invoiceModel(p)).toMatchObject({gross:16770,taxableNet:16000,vat:770,nonTaxable:0,outstanding:10000});
});
it('accepts a whole-charge signed subset without assigning individual exemptions',()=>{
 const p=fixture(),row=structuredClone(p.taxRows[1]);row.posting.transactionNo=10003;row.posting.debitAmount=row.posting.postedAmount=money(20);row.postingBreakdown.grossAmount=row.postingBreakdown.netAmount=money(20);p.taxRows.push(row);p.postings.invoicePostingsDetails.push({...p.postings.invoicePostingsDetails[1],transactionNo:10003,debitAmount:money(20),checkNo:'DIRECT'});p.manifest.open=p.invoice.amount.amount=p.invoice.balance.amount=187.7;p.nativeTaxControls.nonTaxable=2000;Object.assign(p.nativeTaxControls.fullTotals,{gross:18770,nonTaxable:2000});
 expect(invoiceModel(p)).toMatchObject({gross:18770,taxableNet:16000,vat:770,nonTaxable:2000});
});
it.each(['gross','vat','net','split-charge','missing-full','date','amount','posted','type','wrapper','scope','code'] as const)('refuses unqualified aggregate replacement (%s)',kind=>{
 const p=fixture(),raw=p.taxRows[1].posting;
 if(kind==='gross')p.nativeTaxControls.fullTotals.gross++;
 if(kind==='vat')p.nativeTaxControls.fullTotals.vat++;
 if(kind==='net')p.nativeTaxControls.fullTotals.net++;
 if(kind==='split-charge'){p.nativeTaxControls.nonTaxable=p.nativeTaxControls.fullTotals.nonTaxable=100;p.nativeTaxControls.fullTotals.net-=100;}
 if(kind==='missing-full')Reflect.deleteProperty(p.nativeTaxControls,'fullTotals');
 if(kind==='date')raw.transactionDate='2026-01-03';
 if(kind==='amount')raw.debitAmount.amount=49;
 if(kind==='posted')raw.postedAmount.amount=49;
 if(kind==='type')raw.transactionType='Payment';
 if(kind==='wrapper'){raw.transactionType='Wrapper';Object.assign(raw,{referencePackageTransactionNo:90002});const child=structuredClone(p.taxRows[1]);child.posting.transactionNo=10003;child.posting.transactionType='Revenue';p.taxRows.push(child);}
 if(kind==='scope')raw.folioNo=999;
 if(kind==='code')raw.transactionCode='OTHER';
 expect(()=>invoiceModel(p)).toThrow();
});

it('extracts full native totals from the first print and retains the current API outstanding and source fences',async()=>{
 const p=fixture();p.manifest.open=p.invoice.balance.amount=100;
 const current={...p.invoice,reservationId:{id:'777'}},detail={details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[current]}]};
 const {PDFDocument,StandardFonts}=await import('pdf-lib'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([612,792]);
 for(const [label,value,y] of [['Folio No.','88',650],['Total Amount Before VAT 7%','160.00',400],['Total VAT 7%','7.70',380],['Total Non VAT Amount','0.00',360],['Total Amount','167.70',340],['Total Outstanding Balance','167.70',320]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});if(y<500)page.drawText('THB',{x:570,y,size:9,font});}
 const bytes=await pdf.save(),reader={account:vi.fn().mockResolvedValue({accountDetails:{...p.account,invoices:[current]}}),invoiceHistory:vi.fn(),reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}}),financialTransactionDetail:vi.fn().mockResolvedValue(detail),invoiceReservation:vi.fn().mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}}),invoicePostings:vi.fn().mockResolvedValue(p.postings),invoicePostingBreakdown:vi.fn().mockImplementation(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:p.taxRows,offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn().mockResolvedValue({trxCodesInfo:p.taxCodes}),invoiceTransactionCodeRules:vi.fn(),folioTypeName:vi.fn().mockResolvedValue({details:{hotelId:'KAT',folioReportName:'kat_folio'}}),folioReport:vi.fn().mockResolvedValue({folio:{hotelId:'KAT',reservationId:{id:'777'},folio:Buffer.from(bytes).toString('base64')}})},onPrint=vi.fn();
 expect(await readInvoiceModel(reader,p.manifest,undefined,onPrint)).toMatchObject({gross:16770,vat:770,nonTaxable:0,taxableNet:16000,outstanding:10000});expect(reader.folioReport).toHaveBeenCalledOnce();expect(onPrint).toHaveBeenCalledOnce();expect(reader.invoiceTransactionCodeRules).not.toHaveBeenCalled();expect(reader.invoicePostings).toHaveBeenCalledTimes(2);
});
