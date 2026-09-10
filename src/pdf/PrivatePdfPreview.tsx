import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './private-pdf-preview.css';
GlobalWorkerOptions.workerSrc=workerUrl;
/** Canvas-only preview. No annotation links, actions or document scripting are executed. */
export function PrivatePdfPreview({jobId,fileId,token,maxBytes,onClose}:{jobId:string;fileId:string;token:string;maxBytes:number;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null),auth=useRef(token);auth.current=token;
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState(''),[rendering,setRendering]=useState(false);
 useEffect(()=>{const prior=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{prior?.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();let active=true,destroy:(()=>Promise<void>)|undefined;setPdf(null);setError('');
  void(async()=>{try{
   const response=await fetch(`/api/documents/${jobId}/files/${fileId}`,{headers:{Authorization:`Bearer ${auth.current}`},signal:controller.signal});
   if(!response.ok||!response.body)throw Error();if(Number(response.headers.get('content-length'))>maxBytes){await response.body.cancel();throw Error();}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes){await reader.cancel();throw Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
   const data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
   const loading=getDocument({data,enableXfa:false});destroy=()=>loading.destroy();const document=await loading.promise;if(active)setPdf(document);
  }catch{if(active)setError('Private PDF preview is unavailable. No replacement document is shown.');}})();
  return()=>{active=false;controller.abort();void destroy?.();};
 },[jobId,fileId,maxBytes]);
 useEffect(()=>{if(!pdf)return;let active=true;let task:RenderTask|undefined;setRendering(true);setError('');
  void(async()=>{try{const source=await pdf.getPage(page);if(!active||!canvas.current)return;const original=source.getViewport({scale:1});const scale=Math.min(1.5,1200/original.width,Math.sqrt(8_000_000/(original.width*original.height)));const viewport=source.getViewport({scale});canvas.current.width=Math.ceil(viewport.width);canvas.current.height=Math.ceil(viewport.height);task=source.render({canvas:canvas.current,viewport});await task.promise;}catch{if(active)setError('This page could not be rendered. Choose another page or retry the document.');}finally{if(active)setRendering(false);}})();return()=>{active=false;task?.cancel();};
 },[pdf,page]);
 return <dialog ref={dialog} className="private-pdf-preview" aria-label="Read-only PDF preview" onCancel={onClose}><header><div><h2>PDF preview</h2><p>Read only · saved source file</p></div><button onClick={onClose} aria-label="Close PDF preview">Close</button></header>{error&&<p role="alert" className="error-message">{error}</p>}{!pdf&&!error&&<p role="status">Loading private PDF…</p>}{pdf&&<><nav aria-label="PDF preview pages"><button disabled={page<=1||rendering} onClick={()=>setPage(n=>n-1)}>Previous page</button><span>Page {page} of {pdf.numPages}</span><button disabled={page>=pdf.numPages||rendering} onClick={()=>setPage(n=>n+1)}>Next page</button></nav>{rendering&&<p role="status">Rendering page…</p>}<canvas ref={canvas} role="img" aria-label={`PDF page ${page}`}/></>}</dialog>;
}
