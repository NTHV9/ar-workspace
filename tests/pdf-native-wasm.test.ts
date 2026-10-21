import {readFile} from 'node:fs/promises';
import {describe,it,expect,beforeAll} from 'vitest';
import {PDFDocument,StandardFonts,rgb,PDFName,PDFRawStream} from 'pdf-lib';
import init,{inventory,replace} from '../src/pdf/native/wasm/ar_native_text.js';
let moduleBytes:Uint8Array;
beforeAll(async()=>{moduleBytes=new Uint8Array(await readFile('src/pdf/native/wasm/ar_native_text_bg.wasm'));await init({module_or_path:moduleBytes});});
async function fixture(extra=''){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.HelveticaBold),page=doc.addPage([400,300]);
 page.drawRectangle({x:0,y:220,width:400,height:80,color:rgb(.05,.2,.5)});
 page.drawText('INVOICE',{x:20,y:250,size:20,font,color:rgb(1,1,1)});
 page.drawText('UNCHANGED 123',{x:20,y:120,size:12,font,color:rgb(0,0,0)});
 if(extra)page.node.addContentStream(doc.context.register(doc.context.flateStream(extra)));
 return doc.save();
}
describe('actual qualified native WASM',()=>{
 it('clears only the selected page when contents and resources are shared',async()=>{
  const pdf=await PDFDocument.load(await fixture()),original=pdf.getPage(0),shared=pdf.addPage([400,300]);
  shared.node.set(PDFName.of('Contents'),original.node.get(PDFName.of('Contents'))!);shared.node.set(PDFName.of('Resources'),original.node.get(PDFName.of('Resources'))!);
  const bytes=await pdf.save(),target=JSON.parse(inventory(bytes,0)).find((l:any)=>l.style.text==='INVOICE'),other=JSON.parse(inventory(bytes,1));
  const output=replace(bytes,0,JSON.stringify(target.style),'');
  expect(JSON.parse(inventory(output,0)).map((l:any)=>l.style.text)).toEqual(['UNCHANGED 123']);expect(JSON.parse(inventory(output,1))).toEqual(other);
 });
 it.each(['gs','text','unbalanced'])('refuses an image block with %s',async(kind)=>{
  const pdf=await PDFDocument.load(await fixture()),png=await pdf.embedPng('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg=='),page=pdf.getPage(0);
  page.drawImage(png,{x:250,y:20,width:90,height:60});const objects=page.node.Resources()!.lookup(PDFName.of('XObject')) as import('pdf-lib').PDFDict,name=objects.keys()[0].toString();
  const extra=kind==='gs'?`q 1 0 0 1 0 0 cm ${name} Do /GS1 gs Q`:kind==='text'?`q 2 0 0 2 0 0 cm ${name} Do BT (UNQUALIFIED) Tj ET Q`:`q 2 0 0 2 0 0 cm ${name} Do`;
  page.node.addContentStream(pdf.context.register(pdf.context.flateStream(extra)));const bytes=await pdf.save();expect(()=>inventory(bytes,0)).toThrow();
 });
 it('edits and clears text on a page with isolated image blocks while preserving images and other text',async()=>{
  const pdf=await PDFDocument.load(await fixture()),png=await pdf.embedPng('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==');
  pdf.getPage(0).drawImage(png,{x:250,y:20,width:90,height:60});
  const bytes=await pdf.save(),lines=JSON.parse(inventory(bytes,0)),target=lines.find((l:any)=>l.style.text==='INVOICE');
  const images=async(value:Uint8Array)=>{const d=await PDFDocument.load(value);return d.context.enumerateIndirectObjects().flatMap(([,o])=>o instanceof PDFRawStream&&o.dict.get(PDFName.of('Subtype'))===PDFName.of('Image')?[Array.from(o.contents)]:[]);};
  for(const text of ['BILL','']){const output=replace(bytes,0,JSON.stringify(target.style),text),after=JSON.parse(inventory(output,0));expect(after.map((l:any)=>l.style.text)).toEqual(text?[text,'UNCHANGED 123']:['UNCHANGED 123']);expect(after.at(-1).style).toEqual(lines.at(-1).style);expect(await images(output)).toEqual(await images(bytes));}
  expect(JSON.parse(inventory(bytes,0)).map((l:any)=>l.style.text)).toEqual(['INVOICE','UNCHANGED 123']);
 });
 it('retains white BILL and untouched text/style on a blue header without mutating input',async()=>{const bytes=await fixture(),original=bytes.slice(),lines=JSON.parse(inventory(bytes,0)),target=lines.find((l:any)=>l.style.text==='INVOICE');const result=replace(bytes,0,JSON.stringify(target.style),'BILL'),after=JSON.parse(inventory(result,0));expect(after.map((l:any)=>l.style.text)).toEqual(['BILL','UNCHANGED 123']);expect(after[0].style.color).toEqual([1,1,1]);expect(after[0].style.baseFont).toBe(target.style.baseFont);expect(after[1]).toEqual(lines[1]);expect(bytes).toEqual(original);const output=await PDFDocument.load(result);expect(output.getPageCount()).toBe(1);expect(output.getPage(0).node.get(PDFName.of('Contents'))).toBeTruthy();});
 it.each(['3 Tr','1 Tr','/GS1 gs','0 0 20 20 re W n','2 0 0 2 0 0 cm','/Fm1 Do','/Span << /ActualText (INVOICE) >> BDC EMC'])('refuses unqualified operator %s',async(op)=>{const bytes=await fixture(op),copy=bytes.slice();expect(()=>inventory(bytes,0)).toThrow();expect(bytes).toEqual(copy);});
 it('refuses interactive forms and signatures',async()=>{const doc=await PDFDocument.load(await fixture());doc.getForm().createTextField('field');const formBytes=await doc.save();expect(()=>inventory(formBytes,0)).toThrow();const bytes=await fixture();const marker=new TextEncoder().encode('/ByteRange');const signed=new Uint8Array(bytes.length+marker.length);signed.set(bytes);signed.set(marker,bytes.length);expect(()=>inventory(signed,0)).toThrow();});
 it('refuses stale geometry/style and unsupported substitution without changing source',async()=>{const bytes=await fixture(),target=JSON.parse(inventory(bytes,0))[0].style;expect(()=>replace(bytes,0,JSON.stringify({...target,font:'Other'}),'BILL')).toThrow();expect(()=>replace(bytes,0,JSON.stringify(target),'ไทย')).toThrow();expect(()=>replace(bytes,0,JSON.stringify(target),'BILL\nLINE')).toThrow();expect(JSON.parse(inventory(bytes,0))[0].style.text).toBe('INVOICE');});
});
