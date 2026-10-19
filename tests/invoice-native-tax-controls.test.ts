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
