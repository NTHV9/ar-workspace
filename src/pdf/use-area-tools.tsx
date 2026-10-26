import {useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {containedAreaTextTargets,rectFromPoints,type AreaRect,type AreaTextTarget} from './area-tools';
import {pageCanvasHeight} from './flow';
import type {PdfProjectPage} from './types';

type Props={page?:PdfProjectPage;tool:string;zoom:number;revision:number;sourceSession:unknown;disabled:boolean;targets:AreaTextTarget[];excludedVoucherRects:AreaRect[];onWhiteout:(rect:AreaRect)=>void};
type Gesture={paper:HTMLDivElement;pointer:number;frame:DOMRect;start:{x:number;y:number};client:{x:number;y:number};scope:unknown[];cleanup:()=>void};
const intersects=(a:AreaRect,b:AreaRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function useAreaTools(props:Props){
 const latest=useRef(props);latest.current=props;
 const current=useRef<Gesture|null>(null);
 const [active,setActive]=useState(false),[rect,setRect]=useState<AreaRect|null>(null),[selection,setSelection]=useState<AreaTextTarget[]>([]),[excludedVoucherTouched,setExcluded]=useState(false);
 const scope=[props.page?.id,props.tool,props.zoom,props.revision,props.sourceSession,props.disabled];
 function stop(){const g=current.current;current.current=null;g?.cleanup();setActive(false);setRect(null);}
 function clear(){setSelection([]);setExcluded(false);}
 function cancel(){stop();clear();}
 useLayoutEffect(()=>{cancel();return()=>{const g=current.current;current.current=null;g?.cleanup();};},scope);
 function onPaperPointerDown(event:ReactPointerEvent<HTMLDivElement>){
  const p=latest.current;if(p.disabled||!p.page||!['select','draw-whiteout'].includes(p.tool)||event.button!==0||current.current)return;
  if(p.tool==='select'&&event.target instanceof Element&&event.target.closest('button,input,textarea,select,a,.pdf-layer-target,.pdf-native-area,.pdf-native-line,.pdf-area-picker'))return;
  const paper=event.currentTarget,frame=paper.getBoundingClientRect();if(!frame.width||!frame.height)return;
  event.preventDefault();event.stopPropagation();clear();
  const page=p.page,width=page.width,height=pageCanvasHeight(page),start={x:(event.clientX-frame.left)/frame.width*width,y:(event.clientY-frame.top)/frame.height*height};
  const frozen=[page.id,p.tool,p.zoom,p.revision,p.sourceSession,p.disabled];
  const valid=()=>{const now=latest.current,values=[now.page?.id,now.tool,now.zoom,now.revision,now.sourceSession,now.disabled],b=paper.getBoundingClientRect();return values.every((v,i)=>v===frozen[i])&&Math.abs(b.left-frame.left)<.25&&Math.abs(b.top-frame.top)<.25&&Math.abs(b.width-frame.width)<.25&&Math.abs(b.height-frame.height)<.25;};
  const area=(e:globalThis.PointerEvent)=>rectFromPoints(start,{x:(e.clientX-frame.left)/frame.width*width,y:(e.clientY-frame.top)/frame.height*height},{width,height});
  const moved=(e:globalThis.PointerEvent)=>Math.max(Math.abs(e.clientX-event.clientX),Math.abs(e.clientY-event.clientY))>=3;
  const update=(r:AreaRect|null)=>{setRect(r);if(p.tool==='select'){setSelection(r?containedAreaTextTargets(latest.current.targets,r):[]);setExcluded(!!r&&latest.current.excludedVoucherRects.some(b=>intersects(r,b)));}};
  const move=(e:globalThis.PointerEvent)=>{if(e.pointerId!==event.pointerId)return;if(!valid()){cancel();return;}if(moved(e))update(area(e));};
  const up=(e:globalThis.PointerEvent)=>{if(e.pointerId!==event.pointerId)return;if(!valid()){cancel();return;}const r=area(e),ok=moved(e)&&!!r&&r.width>=.1&&r.height>=.1;stop();if(!ok){clear();return;}if(p.tool==='draw-whiteout'){clear();latest.current.onWhiteout(r!);}else update(r);setRect(null);};
  const interrupted=(e:globalThis.PointerEvent)=>{if(e.pointerId===event.pointerId)cancel();};
  const scroll=()=>cancel(),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();cancel();}};
  const cleanup=()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',interrupted,true);paper.removeEventListener('lostpointercapture',interrupted);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);window.removeEventListener('keydown',key,true);if(paper.hasPointerCapture(event.pointerId))paper.releasePointerCapture(event.pointerId);};
  current.current={paper,pointer:event.pointerId,frame,start,client:{x:event.clientX,y:event.clientY},scope:frozen,cleanup};setActive(true);
  window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',interrupted,true);paper.addEventListener('lostpointercapture',interrupted);window.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);window.addEventListener('keydown',key,true);paper.setPointerCapture(event.pointerId);
 }
 const style=(r:AreaRect)=>({left:`${r.x/(props.page?.width??1)*100}%`,top:`${r.y/(props.page?pageCanvasHeight(props.page):1)*100}%`,width:`${r.width/(props.page?.width??1)*100}%`,height:`${r.height/(props.page?pageCanvasHeight(props.page):1)*100}%`});
 const overlay=<>{selection.map(t=><div key={t.key} className="pdf-area-text-highlight" style={style(t.rect)}/>)}{rect&&<div className={`pdf-area-marquee ${props.tool==='draw-whiteout'?'pdf-whiteout-preview':''}`} style={style(rect)}/>}{props.tool==='draw-whiteout'&&<div className="pdf-whiteout-draw-surface" aria-label="Draw whiteout on page"/>}</>;
 return {overlay,selection,excludedVoucherTouched,active,isActive:()=>!!current.current,clear,cancel,onPaperPointerDown};
}
