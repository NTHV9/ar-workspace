import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
export default function PdfValidation({runId,hotel,token}:{runId:string;hotel:string;token:string}){
 const pages=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState('Loading private PDF…');
 const [checks,setChecks]=useState<{pages:number;invoice:boolean;folio:boolean}|null>(null);
 useEffect(()=>{
  let cancelled=false;const controller=new AbortController();let destroy:(()=>Promise<void>)|undefined;
  setStatus('Loading private PDF…');setChecks(null);pages.current?.replaceChildren();
  void(async()=>{try{
   if(!/^[0-9a-f-]{36}$/.test(runId)||!['KAT','TSK'].includes(hotel))throw new Error();
   const base=`/api/pdf-validation/${runId}/${hotel}`;
   const responses=await Promise.all(['pdf','json'].map(ext=>fetch(`${base}/${ext}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})));
   if(responses.some(r=>!r.ok))throw new Error();
   const expected=await responses[1].json();if(!expected||typeof expected!=='object'||!('invoiceNo'in expected)||!('folioNo'in expected))throw new Error();const data=new Uint8Array(await responses[0].arrayBuffer());
   const task=getDocument({data});destroy=()=>task.destroy();const pdf=await task.promise;
   if(cancelled)return;
   if(pdf.numPages>30)throw new Error();
   let text='';
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n);if(cancelled)return;
    const content=await page.getTextContent();text+=content.items.map(i=>'str'in i?i.str:'').join(' ')+'\n';
    const viewport=page.getViewport({scale:1.25}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-label',`PDF page ${n}`);pages.current?.appendChild(canvas);
    await page.render({canvas,viewport}).promise;
   }
   const has=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)&&new RegExp(`(^|\\D)${value}(\\D|$)`).test(text);
   if(!cancelled){setChecks({pages:pdf.numPages,invoice:has(expected.invoiceNo),folio:has(expected.folioNo)});setStatus('Native PDF loaded from private storage');}
  }catch{if(!cancelled)setStatus('PDF validation unavailable. No substitute document is shown.');}})();
  return()=>{cancelled=true;controller.abort();void destroy?.();};
 },[runId,hotel,token]);
 return <main className="page"><a href="/">Back to portfolio</a><h1>Native PDF validation · {hotel}</h1><p role="status">{status}</p>{checks&&<div className="information-note">Pages: {checks.pages} · Invoice number text: {checks.invoice?'found':'not found'} · Folio number text: {checks.folio?'found':'not found'}<br/>Text matches are a screening check. Review the visible document identity before approving it. Sending is not enabled.</div>}<div ref={pages} className="native-pdf-pages"/></main>;
}
