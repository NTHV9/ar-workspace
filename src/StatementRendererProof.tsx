import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
export default function StatementRendererProof({token}:{token:string}){
 const target=useRef<HTMLDivElement>(null);const [status,setStatus]=useState('Loading synthetic renderer proof…');
 useEffect(()=>{let stopped=false;const abort=new AbortController();let destroy:(()=>Promise<void>)|undefined;
 void(async()=>{try{
  const response=await fetch('/api/statement-renderer-proof',{headers:{Authorization:`Bearer ${token}`},signal:abort.signal});if(!response.ok)throw Error();
  const task=getDocument({data:new Uint8Array(await response.arrayBuffer())});destroy=()=>task.destroy();const pdf=await task.promise;
  if(stopped)return;target.current?.replaceChildren();const page=await pdf.getPage(1);const viewport=page.getViewport({scale:1.4});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;canvas.setAttribute('aria-label','Synthetic Thai font proof');target.current?.appendChild(canvas);await page.render({canvas,viewport}).promise;
  if(!stopped)setStatus(`Cloudflare PDF response rendered · ${pdf.numPages} page · synthetic text only`);
 }catch{if(!stopped)setStatus('Renderer proof unavailable.');}})();return()=>{stopped=true;abort.abort();void destroy?.();};},[token]);
 return <main className="page"><a href="/">Back to portfolio</a><h1>Statement renderer verification</h1><p role="status">{status}</p><p>This diagnostic tests fonts and Worker execution. It is not a customer Statement.</p><div ref={target}/></main>;
}
