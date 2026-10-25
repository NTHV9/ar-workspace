import {it,expect} from 'vitest';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {readNativeTaxControls} from '../worker/invoice/native-tax-controls';
async function fixture({folio='88',vat='88.32',duplicate=false,pages=1}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);const page=pdf.addPage([612,792]);
 for(const [label,value,y] of [['Folio No.',folio,650],['Total VAT 7%',vat,380],['Total Non VAT Amount','0.00',366]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});if(y<400)page.drawText('THB',{x:570,y,size:9,font});}
 if(duplicate)page.drawText('Total VAT 7%',{x:320,y:350,size:9,font});
 if(pages>1)pdf.addPage([612,792]);return pdf.save();
}
it('extracts only uniquely scoped native tax controls, not historical gross or outstanding',async()=>{expect(await readNativeTaxControls(await fixture(),'88')).toEqual({vat:8832,nonTaxable:0});});
it.each(['folio','duplicate','pages','number'] as const)('rejects ambiguous native control evidence (%s)',async kind=>{await expect(readNativeTaxControls(await fixture({folio:kind==='folio'?'89':'88',duplicate:kind==='duplicate',pages:kind==='pages'?2:1,vat:kind==='number'?'88,32':'88.32'}),'88')).rejects.toThrow('document_invoice_ar_tax_unverified');});

async function multipage({otherFolio=false,missingPage=false,duplicateTotals=false,split=false}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let n=1;n<=2;n++){
  const page=pdf.addPage([612,792]);
  for(const [label,value,y] of [['Folio No.',otherFolio&&n===2?'89':'88',650],['Page No.',`${n} of ${missingPage?3:2}`,630]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});}
  const fields=n===1?[['Total VAT 7%','88.32',380],...split?[]:[['Total Non VAT Amount','0.00',366]]]:[...duplicateTotals?[['Total VAT 7%','88.32',380]]:[],...split?[['Total Non VAT Amount','0.00',366]]:[]];
  for(const [label,value,y] of fields){page.drawText(String(label),{x:320,y:Number(y),size:9,font});page.drawText(String(value),{x:520,y:Number(y),size:9,font});page.drawText('THB',{x:570,y:Number(y),size:9,font});}
 }
 return pdf.save();
}
it('reads the unique tax footer before an OPERA outstanding-only continuation page',async()=>{expect(await readNativeTaxControls(await multipage(),'88')).toEqual({vat:8832,nonTaxable:0});});
it('reads a tax footer split over two consistently identified pages',async()=>{expect(await readNativeTaxControls(await multipage({split:true}),'88')).toEqual({vat:8832,nonTaxable:0});});
it.each(['otherFolio','missingPage','duplicateTotals'] as const)('rejects mixed or incomplete multipage controls (%s)',async key=>{await expect(readNativeTaxControls(await multipage({[key]:true}),'88')).rejects.toThrow('document_invoice_ar_tax_unverified');});
it('rejects a one-page file whose printed page count says a second page is missing',async()=>{const original=await PDFDocument.load(await multipage()),truncated=await PDFDocument.create();const [first]=await truncated.copyPages(original,[0]);truncated.addPage(first);await expect(readNativeTaxControls(await truncated.save(),'88')).rejects.toThrow('document_invoice_ar_tax_unverified');});

async function fullFooter(kind='valid'){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),pages=[pdf.addPage([612,792]),pdf.addPage([612,792])];
 for(const [n,page] of pages.entries())for(const [label,value,y] of [['Folio No.',kind==='wrong-folio'&&n===1?'89':'88',650],['Page No.',`${n+1} of ${kind==='wrong-pages'?3:2}`,630]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});}
 const fields=[['Total Amount Before VAT 7%',kind==='malformed-net'?'1,00.00':'100.00',410],['Total VAT 7%','7.00',396],['Total Non VAT Amount','0.00',382],['Total Amount',kind==='wrong-arithmetic'?'108.00':'107.00',368],['Total Outstanding Balance','50.00',354]] as const;
 for(const [label,value,y] of fields){
  if(kind==='missing-net'&&label==='Total Amount Before VAT 7%'||kind==='missing-gross'&&label==='Total Amount')continue;
  const page=pages[kind==='split-footer'&&label==='Total Amount'?0:1];page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});
  if(!(kind==='missing-currency'&&label==='Total Amount'))page.drawText(kind==='wrong-currency'&&label==='Total Amount'?'USD':'THB',{x:570,y,size:9,font});
 }
 if(kind==='duplicate-gross')pages[1].drawText('Total Amount',{x:320,y:320,size:9,font});
 return pdf.save();
}
it('keeps the default two-field API even when a complete footer is present',async()=>{expect(await readNativeTaxControls(await fullFooter(),'88')).toEqual({vat:700,nonTaxable:0});});
it('opts into uniquely scoped same-page full totals and never substitutes outstanding for gross',async()=>{
 expect(await readNativeTaxControls(await fullFooter(),'88',{includeFullTotals:true})).toEqual({vat:700,nonTaxable:0,fullTotals:{currency:'THB',gross:10700,net:10000,vat:700,nonTaxable:0}});
});
it.each(['missing-net','missing-gross','duplicate-gross','split-footer','malformed-net','wrong-currency','missing-currency','wrong-arithmetic'])('does not invent full evidence or disrupt legacy controls when full totals are unavailable (%s)',async kind=>{
 expect(await readNativeTaxControls(await fullFooter(kind),'88',{includeFullTotals:true})).toEqual({vat:700,nonTaxable:0});
});
it.each(['wrong-folio','wrong-pages'])('full totals cannot bypass document identity (%s)',async kind=>{
 await expect(readNativeTaxControls(await fullFooter(kind),'88',{includeFullTotals:true})).rejects.toThrow('document_invoice_ar_tax_unverified');
});
