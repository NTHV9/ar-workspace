import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {EmailAttachment} from '../worker/email/shared';
GlobalWorkerOptions.workerSrc=workerUrl;

export default function SupplementalPreview({draftId,file,token,onClose}:{draftId:string;file:EmailAttachment;token:string;onClose:()=>void}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[image,setImage]=useState(''),[page,setPage]=useState(1),[status,setStatus]=useState('Loading private attachment…'),[error,setError]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null),region=useRef<HTMLElement>(null);
 useEffect(()=>{region.current?.focus();let active=true;let imageUrl='';let destroy:()=>Promise<void>=async()=>{};const controller=new AbortController();setError('');setStatus('Loading private attachment…');setPdf(null);setImage('');setPage(1);
  void(async()=>{try{
   const r=await fetch(`/api/email/${draftId}/attachments/${file.id}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});if(!r.ok)throw Error();
   const bytes=new Uint8Array(await r.arrayBuffer());if(!active)return;
   if(file.mime==='application/pdf'){const task=getDocument({data:bytes,enableXfa:false,maxImageSize:8_000_000});destroy=()=>task.destroy();const doc=await task.promise;if(active)setPdf(doc);}
   else{imageUrl=URL.createObjectURL(new Blob([bytes],{type:file.mime}));setImage(imageUrl);}
  }catch{if(active){setError('This attachment could not be loaded or rendered. Close and try again.');setStatus('');}}})();
  return()=>{active=false;controller.abort();if(imageUrl)URL.revokeObjectURL(imageUrl);void destroy();};
 },[draftId,file.id,file.mime,token]);
 useEffect(()=>{if(!pdf||!canvas.current)return;let active=true;let cancel=()=>{};setStatus('Rendering page…');setError('');
  void(async()=>{try{const source=await pdf.getPage(page);if(!active||!canvas.current)return;const initial=source.getViewport({scale:1});if(!Number.isFinite(initial.width)||!Number.isFinite(initial.height)||initial.width<=0||initial.height<=0)throw Error();const viewport=source.getViewport({scale:Math.min(1.4,1000/initial.width,1400/initial.height)});const target=canvas.current;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);const render=source.render({canvas:target,viewport});cancel=()=>render.cancel();await render.promise;if(active)setStatus(`Page ${page} of ${pdf.numPages}`);}catch{if(active){setError('This PDF page could not be rendered.');setStatus('');}}})();
  return()=>{active=false;cancel();};
 },[pdf,page]);
 return <section ref={region} tabIndex={-1} className="email-attachment-preview" aria-label="Attachment preview"><header><div><h2>{file.name}</h2><p>Supplemental file · {(file.byte_count/1024).toFixed(0)} KiB · Read-only preview</p></div><button onClick={onClose}>Close attachment preview</button></header>{status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}{pdf&&<><div className="attachment-page-controls"><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous page</button><span>{page} / {pdf.numPages}</span><button disabled={page>=pdf.numPages} onClick={()=>setPage(n=>n+1)}>Next page</button></div><canvas ref={canvas} aria-label={`Supplemental PDF page ${page}`}/></>}{image&&<img src={image} alt={`Preview of ${file.name}`} onLoad={()=>setStatus('Image loaded')} onError={()=>{setStatus('');setError('This image could not be rendered.');}}/>}</section>;
}
