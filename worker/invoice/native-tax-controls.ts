import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
// The backend uses the pinned parser in-process, without worker URLs or network fetches.
// @ts-expect-error PDF.js publishes this runtime module without TypeScript declarations.
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
const fail=():never=>{throw Error('document_invoice_ar_tax_unverified');};
export async function readNativeTaxControls(bytes:Uint8Array,folio:string):Promise<{vat:number;nonTaxable:number}>{
 if(bytes.length>4_000_000||bytes.length<5||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail();
 (globalThis as typeof globalThis&{pdfjsWorker:unknown}).pdfjsWorker={WorkerMessageHandler};
 const task=getDocument({data:bytes.slice(),disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,enableXfa:false,stopAtErrors:true,verbosity:0});
 let timeout:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('document_invoice_ar_tax_unverified')),15000);});
 const extract=async()=>{
  const pdf=await task.promise;if(pdf.numPages<1||pdf.numPages>10)fail();
  type Item={text:string;x:number;y:number;width:number;page:number};
  const all:Item[]=[];
  const field=(items:Item[],label:string,currency:boolean)=>{
   const labels=items.filter(i=>i.text===label);if(labels.length!==1)fail();const l=labels[0];
   const values=items.filter(i=>i.page===l.page&&Math.abs(i.y-l.y)<1&&i.x>l.x+l.width-1&&i.text&&i.text!==':'&&i.text!=='THB');
   if(values.length!==1)fail();if(currency&&items.filter(i=>i.page===l.page&&Math.abs(i.y-l.y)<1&&i.x>values[0].x&&i.text==='THB').length!==1)fail();
   return values[0].text;
  };
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),content=await page.getTextContent();if(content.items.length>4000)fail();
   const items=content.items.filter(i=>'str' in i).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5],width:i.width,page:n}));
   if(field(items,'Folio No.',false)!==folio)fail();
   if((pdf.numPages>1||items.some(i=>i.text==='Page No.'))&&field(items,'Page No.',false)!==`${n} of ${pdf.numPages}`)fail();
   all.push(...items);page.cleanup();
  }
  const amount=(s:string)=>{if(!/^-?(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)\.\d{2}$/.test(s))fail();const n=Number(s.replaceAll(',',''))*100,r=Math.round(n);if(!Number.isSafeInteger(r)||Math.abs(n-r)>1e-5)fail();return r;};
  return {vat:amount(field(all,'Total VAT 7%',true)),nonTaxable:amount(field(all,'Total Non VAT Amount',true))};
 };
 try{return await Promise.race([extract(),deadline]);}catch{return fail();}
 finally{
  clearTimeout(timeout);let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
  const cleanup=Promise.resolve().then(()=>task.destroy()).catch(()=>{});
  try{await Promise.race([cleanup,new Promise<void>(resolve=>{cleanupTimer=setTimeout(resolve,250);})]);}
  finally{clearTimeout(cleanupTimer);}
 }
}

