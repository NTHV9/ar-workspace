import {useEffect,useRef,useState} from 'react';
import {loadSources,renderPage} from './engine';
import {displayScale} from './display';
import type {PdfExportFile} from './types';

export type PreviewZoom='fit-page'|'fit-width'|number;
type Loaded=Awaited<ReturnType<typeof loadSources>>;
export function FinalPdfPreview({file,zoom,onRendered,onRendering}:{file:PdfExportFile;zoom:PreviewZoom;onRendered:()=>void;onRendering:()=>void}){
 const viewport=useRef<HTMLDivElement>(null),canvasHost=useRef<HTMLDivElement>(null);
 const [loadedFile,setLoadedFile]=useState<PdfExportFile|null>(null),[drawn,setDrawn]=useState<{file:PdfExportFile;index:number}|null>(null);
 const [loaded,setLoaded]=useState<Loaded|null>(null),[index,setIndex]=useState(0),[size,setSize]=useState({width:0,height:0}),[error,setError]=useState(''),[rendered,setRendered]=useState(false),[reviewed,setReviewed]=useState(0);
 const visits=useRef(new WeakMap<PdfExportFile,Set<number>>());
 const ready=useRef(onRendered),starting=useRef(onRendering);ready.current=onRendered;starting.current=onRendering;
 useEffect(()=>{const element=viewport.current;if(!element)return;const update=()=>setSize({width:Math.max(1,element.clientWidth-24),height:Math.max(1,element.clientHeight-24)});update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let current=true,result:Loaded|undefined;setLoaded(null);setIndex(0);setError('');setRendered(false);setReviewed(visits.current.get(file)?.size??0);starting.current();
  loadSources([{id:'final-preview',name:file.name,kind:'statement',bytes:file.bytes}]).then(value=>{result=value;if(current){setLoadedFile(file);setLoaded(value);}else value.dispose();}).catch(()=>{if(current)setError('This PDF could not be opened. Close Preview and try again.');});
  return()=>{current=false;result?.dispose();};
 },[file]);
 const page=loadedFile===file?loaded?.project.pages[index]:undefined;
 const isCurrent=rendered&&drawn?.file===file&&drawn.index===index;
 const fit=page?Math.min(size.width/page.width,size.height/page.height):1;
 const factor=page?(zoom==='fit-page'?fit:zoom==='fit-width'?size.width/page.width:zoom/100*96/72):1;
 const width=page?page.width*factor:0,height=page?page.height*factor:0;
 useEffect(()=>{
  if(!loaded||!page||!size.width||!size.height)return;
  let current=true;const canvas=document.createElement('canvas');setRendered(false);setError('');starting.current();
  void renderPage(page,loaded.documents,canvas,displayScale(page,width,devicePixelRatio)).then(()=>{
   if(!current){canvas.width=canvas.height=0;return;}
   canvas.style.width='100%';canvas.style.height='100%';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Final PDF page ${index+1}`);canvasHost.current?.replaceChildren(canvas);setDrawn({file,index});setRendered(true);
   const seen=visits.current.get(file)??new Set<number>();seen.add(index);visits.current.set(file,seen);setReviewed(seen.size);
   if(seen.size===loaded.project.pages.length)ready.current();
  }).catch(()=>{if(current){setError('This page could not be rendered. Try another page or reopen Preview. Confirmation remains disabled.');setRendered(false);}});
  return()=>{current=false;};
 },[loaded,page,index,file,width,size.width,size.height]);
 const count=loaded?.project.pages.length??0;
 function navigate(next:number){if(next===index)return;setRendered(false);starting.current();setIndex(next);viewport.current?.scrollTo(0,0);}
 return <div className="pdf-final-viewer" data-page-index={index} data-drawn-index={drawn?.index} data-viewed={reviewed} data-count={count}>
  <div className="pdf-final-navigation">
   <button aria-label="Previous PDF page" disabled={!loaded||index===0} onClick={()=>navigate(index-1)}>Previous</button>
   <label>Page <select aria-label="PDF page" disabled={!loaded} value={index} onChange={event=>navigate(Number(event.target.value))}>{loaded?.project.pages.map((p,i)=><option value={i} key={p.id}>{i+1}</option>)}</select> of {count||'…'}</label>
   <button aria-label="Next PDF page" disabled={!loaded||index>=count-1} onClick={()=>navigate(index+1)}>Next</button>
   <span role="status">{error?'Page unavailable':!isCurrent?'Rendering page…':`${reviewed} of ${count} pages viewed`}</span>
  </div>
  <div className="pdf-final-viewport" ref={viewport} data-fit={zoom}>
   {error?<p className="pdf-error" role="alert">{error}</p>:<div className="pdf-final-positioner" style={{width:Math.max(size.width,width),height:Math.max(size.height,height)}}>
    <div className="pdf-final-sheet" style={{width,height,visibility:isCurrent?'visible':'hidden'}} ref={canvasHost} data-render-state={isCurrent?'ready':'rendering'}/>
   </div>}
  </div>
 </div>;
}
