import {it,expect} from 'vitest';
import {PDFDocument,StandardFonts,PDFRawStream,PDFContentStream,decodePDFRawStream} from 'pdf-lib';
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
it('keeps a wide left guest name fixed and places the right date below it without overlap',async()=>{
 const guest='C'.repeat(60),doc=await PDFDocument.load(await syntheticInvoice(3,'VCH-'+'12345678901'.repeat(5),'A',true,{guest}));
 const commands=doc.getPage(0).node.normalizedEntries().Contents!.asArray().map(ref=>doc.context.lookup(ref)).map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n');
 const texts=[...commands.matchAll(/BT\n([\s\S]*?)ET/g)].map(block=>({text:Buffer.from(block[1].match(/<([\dA-F]+)> Tj/)?.[1]??'','hex').toString(),top:792-Number(block[1].match(/1 0 0 1 [\d.]+ ([\d.]+) Tm/)![1])-Number(block[1].match(/ ([\d.]+) Tf/)![1])}));
 expect(texts.find(t=>t.text===guest)!.top).toBe(254);
 expect(texts.find(t=>t.text==='Date/Time')!.top).toBeGreaterThanOrEqual(265);
 expect(texts.find(t=>t.text==='DATE')!.top).toBeGreaterThan(texts.find(t=>t.text==='Date/Time')!.top+8);
});
it('keeps routed reference continuations together across a page break and preserves an eleven-line address',async()=>{
 const address=Array.from({length:11},(_,i)=>`ADDRESS-${i+1}`),lines=Array.from({length:20},(_,i)=>({id:String(i+1),date:'01/09/26',description:`CHARGE-${i+1}`,reference:i===19?'ROUTE-REF\nvia ROUTED-GUEST':`REF-${i+1}`,debit:321000,credit:0}));
 const doc=await PDFDocument.load(await syntheticInvoice(20,'VCH-001','A',false,{address,lines}));expect(doc.getPageCount()).toBeGreaterThan(1);
 const references:string[][]=[],descriptions:string[]=[];
 for(const page of doc.getPages()){
  const commands=page.node.normalizedEntries().Contents!.asArray().map(ref=>doc.context.lookup(ref)).map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n');
  const texts=[...commands.matchAll(/BT\n([\s\S]*?)ET/g)].map(block=>({text:Buffer.from(block[1].match(/<([\dA-F]+)> Tj/)?.[1]??'','hex').toString(),bottom:792-Number(block[1].match(/1 0 0 1 [\d.]+ ([\d.]+) Tm/)![1])}));
  expect(texts.filter(item=>item.text.startsWith('ADDRESS-')).map(item=>item.text)).toEqual(address);
  expect(Math.max(...texts.filter(item=>item.text.startsWith('ADDRESS-')).map(item=>item.bottom))).toBeLessThanOrEqual(230);
  const signature=commands.match(/q\n1 0 0 1 0 ([\d.]+) cm\n1 0 0 1 0 0 cm\n612 0 0 35 0 0 cm/)!;expect(signature).not.toBeNull();const signatureTop=792-35-Number(signature[1]);
  expect(signatureTop+35).toBeLessThanOrEqual(679);expect(texts.filter(item=>item.text==='Synthetic Cashier')).toHaveLength(1);expect(commands).toContain('612 0 0 105 0 0 cm');
  for(const item of texts.filter(item=>/^(CHARGE-|REF-|ROUTE-REF|via ROUTED-GUEST)/.test(item.text))){expect(item.bottom).toBeGreaterThanOrEqual(293);expect(item.bottom).toBeLessThanOrEqual(signatureTop-8);}
  descriptions.push(...texts.filter(item=>item.text.startsWith('CHARGE-')).map(item=>item.text));references.push(texts.filter(item=>/^(REF-|ROUTE-REF|via ROUTED-GUEST)/.test(item.text)).map(item=>item.text));
 }
 expect(descriptions).toEqual(lines.map(line=>line.description));expect(references.flat()).toEqual([...Array.from({length:19},(_,i)=>`REF-${i+1}`),'ROUTE-REF','via ROUTED-GUEST']);
 expect(references[0]).not.toContain('ROUTE-REF');expect(references[1]).toEqual(['ROUTE-REF','via ROUTED-GUEST']);
});
it.each([21,60])('repeats signature and cashier on every page while keeping %i charge rows above them',async count=>{
 const doc=await PDFDocument.load(await syntheticInvoice(count));expect(doc.getPageCount()).toBeGreaterThan(1);
 const hex=(text:string)=>Buffer.from(text).toString('hex').toUpperCase();let rows=0;
 for(const [index,page]of doc.getPages().entries()){
  const commands=page.node.normalizedEntries().Contents!.asArray().map(ref=>doc.context.lookup(ref)).map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n');
  const images=[...commands.matchAll(/q\n1 0 0 1 0 ([\d.]+) cm\n1 0 0 1 0 0 cm\n612 0 0 ([\d.]+) 0 0 cm/g)];
  const signature=images.filter(image=>Number(image[2])===35);expect(signature).toHaveLength(1);
  const signatureTop=792-35-Number(signature[0][1]);expect(signatureTop+35).toBeLessThanOrEqual(679);
  if(index<doc.getPageCount()-1)expect(signatureTop).toBe(540);
  expect(commands.match(new RegExp(`<${hex('Synthetic Cashier')}> Tj`,'g'))).toHaveLength(1);
  for(const block of commands.matchAll(/BT\n([\s\S]*?)ET/g)){
   const bottom=792-Number(block[1].match(/1 0 0 1 [\d.]+ ([\d.]+) Tm/)![1]);
   if(block[1].includes(`<${hex('Accommodation charge')}>`)){expect(bottom).toBeLessThanOrEqual(signatureTop-8);rows++;}
   if(block[1].includes(`<${hex('Synthetic Cashier')}>`)){expect(bottom).toBeGreaterThan(signatureTop);expect(bottom).toBeLessThanOrEqual(679);}
   if(block[1].includes(hex('*** ')))expect(bottom).toBeLessThan(signatureTop-32);
  }
  const closing=images.filter(image=>Number(image[2])===94);expect(closing).toHaveLength(index===doc.getPageCount()-1?1:0);
  if(closing.length)expect(792-Number(closing[0][1])).toBeLessThan(signatureTop-32);
  expect(commands).toContain('612 0 0 105 0 0 cm');
 }
 expect(rows).toBe(count);
});

it.each([44,59,120])('renders a %i-character voucher completely without overlapping the following header rows',async length=>{
 const voucher='VCH-'+Array.from({length:length-4},(_,i)=>String(i%10)).join('');
 const doc=await PDFDocument.load(await syntheticInvoice(25,voucher,'LONG',true));
 for(const page of doc.getPages()){
  const field=readVoucherFields(page)[0];expect(field.text).toBe(voucher);expect(field.fontSize).toBeGreaterThanOrEqual(6);expect(field.height).toBeGreaterThan(12);
  const commands=page.node.normalizedEntries().Contents!.asArray().map(ref=>doc.context.lookup(ref)).map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n');
  const texts=[...commands.matchAll(/BT\n([\s\S]*?)ET/g)].map(block=>({text:Buffer.from(block[1].match(/<([\dA-F]+)> Tj/)?.[1]??'','hex').toString(),top:792-Number(block[1].match(/1 0 0 1 [\d.]+ ([\d.]+) Tm/)![1])-Number(block[1].match(/ ([\d.]+) Tf/)![1])}));
  const printed=texts.filter(t=>t.top>=field.y&&t.top<field.y+field.height&&/^(VCH-|[0-9]{5,})/.test(t.text));
  expect(printed.map(t=>t.text).join('')).toBe(voucher);
  expect(texts.find(t=>t.text==='101')!.top).toBeGreaterThan(printed.at(-1)!.top+field.fontSize);
  expect(texts.find(t=>t.text==='Example Guest')!.top).toBe(254);
  expect(texts.find(t=>t.text==='SYNTHETIC TRAVEL')!.top).toBe(130);
  expect(texts.find(t=>t.text==='DATE')!.top).toBeGreaterThan(texts.find(t=>t.text==='Example Guest')!.top+8);
 }
});
