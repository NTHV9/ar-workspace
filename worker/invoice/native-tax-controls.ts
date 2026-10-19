import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
// The backend uses the pinned parser in-process, without worker URLs or network fetches.
// @ts-expect-error PDF.js publishes this runtime module without TypeScript declarations.
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
const fail=():never=>{throw Error('document_invoice_ar_tax_unverified');};
export async function readNativeTaxControls(bytes:Uint8Array,folio:string):Promise<{vat:number;nonTaxable:number}>{
 if(bytes.length>1_000_000||bytes.length<5||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail();
 (globalThis as typeof globalThis&{pdfjsWorker:unknown}).pdfjsWorker={WorkerMessageHandler};
 const task=getDocument({data:bytes.slice(),disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,enableXfa:false,stopAtErrors:true,verbosity:0});
 try{
  const pdf=await task.promise;if(pdf.numPages!==1)fail();
  const page=await pdf.getPage(1),content=await page.getTextContent();if(content.items.length>4000)fail();
  const items=content.items.filter(i=>'str' in i).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5],width:i.width}));
  const field=(label:string,currency:boolean)=>{
   const labels=items.filter(i=>i.text===label);if(labels.length!==1)fail();const l=labels[0];
   const values=items.filter(i=>Math.abs(i.y-l.y)<1&&i.x>l.x+l.width-1&&i.text&&i.text!==':'&&i.text!=='THB');
   if(values.length!==1)fail();if(currency&&items.filter(i=>Math.abs(i.y-l.y)<1&&i.x>values[0].x&&i.text==='THB').length!==1)fail();
   return values[0].text;
  };
  if(field('Folio No.',false)!==folio)fail();
  const amount=(s:string)=>{if(!/^-?(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)\.\d{2}$/.test(s))fail();const n=Number(s.replaceAll(',',''))*100,r=Math.round(n);if(!Number.isSafeInteger(r)||Math.abs(n-r)>1e-5)fail();return r;};
  return {vat:amount(field('Total VAT 7%',true)),nonTaxable:amount(field('Total Non VAT Amount',true))};
 }catch{ return fail(); }finally{await task.destroy();}
}

