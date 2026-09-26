import {it,expect} from 'vitest';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {syntheticInvoice} from './browser/fixtures/invoice-pdf';
import {readVoucherFields} from '../src/pdf/voucher-metadata';
it('fits a long voucher in the original single header row without dropping characters',async()=>{
 const value='VOUCHER-ABCDEFGH-1234567890123';
 const pdf=await PDFDocument.load(await syntheticInvoice(10,value,'A',true));
 const field=readVoucherFields(pdf.getPage(0))[0],font=await pdf.embedFont(StandardFonts.HelveticaBold);
 expect(field.text).toBe(value);expect(field.fontSize).toBeGreaterThanOrEqual(6);expect(field.fontSize).toBeLessThan(8);
 expect(font.widthOfTextAtSize(value,field.fontSize)).toBeLessThanOrEqual(field.width-6);
 expect(pdf.getPageCount()).toBe(1);
});
it('keeps ordinary vouchers at the existing size',async()=>{const doc=await PDFDocument.load(await syntheticInvoice());expect(readVoucherFields(doc.getPage(0))[0].fontSize).toBe(8);});
