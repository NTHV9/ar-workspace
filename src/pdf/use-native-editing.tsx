import {rowGeometry} from './row-geometry';
import {applyFlowEdit,pageCanvasHeight,MAX_FLOW_HEIGHT} from './flow';
import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {detectLines,detectRowBarriers,type GraphicTarget} from './native-graphics';
import {inside,mapSourceRect,mapSourceTextRect,overlaps} from './row-layout';
import {createReplacementLayer} from './source-text';
import {renderPage} from './engine';
import type {DetectedText,PdfLayer,PdfProjectPage,PdfRowEdit} from './types';

type Area={x:number;y:number;width:number;height:number};
type Props={page?:PdfProjectPage;documents:Map<string,PDFDocumentProxy>;runs:DetectedText[];layer?:PdfLayer;tool:string;setTool:(tool:string)=>void;busy:boolean;setBusy:(busy:boolean)=>void;onChange:(page:PdfProjectPage)=>void;onError:(message:string)=>void};
export function useNativeEditing({page,documents,runs,layer,tool,setTool,busy,setBusy,onChange,onError}:Props){
 const [lines,setLines]=useState<GraphicTarget[]>([]),[area,setArea]=useState<Area|null>(null);
 const [barriers,setBarriers]=useState<GraphicTarget[]>([]),[geometryReady,setGeometryReady]=useState(false);
 const [moving,setMoving]=useState(false);
 const ownedEdits=useRef(page?.rowEdits);
 useEffect(()=>{if(page?.rowEdits!==ownedEdits.current)setArea(null);ownedEdits.current=page?.rowEdits;},[page?.rowEdits]);
 const gesture=useRef<{start:{x:number;y:number};before:Area;pick:boolean;current:Area}|null>(null),alive=useRef(true),currentPage=useRef(page?.id);currentPage.current=page?.id;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let current=true;setArea(null);gesture.current=null;setLines([]);setBarriers([]);setGeometryReady(false);if(page)Promise.all([detectLines(page,documents),detectRowBarriers(page,documents)]).then(([value,bounds])=>{if(current){setLines(value);setBarriers(bounds);setGeometryReady(true);}}).catch(()=>{if(current)onError('The page boundaries could not be read. Reopen the document before adding or deleting rows.');});return()=>{current=false;};},[page?.id,documents]);
 const shown=runs.flatMap(run=>{const rect=mapSourceTextRect(run,page?.rowEdits??[],run.fontSize*.72);return rect?[{run,rect}]:[];});
 const anchor=layer&&(layer.sourceText||layer.tableRow)?layer:undefined;
 const row=anchor&&page?rowGeometry(page,anchor,runs,barriers):null;
 const rowTop=row?.top??0,rowHeight=row?.height??0;
 const extent=page?pageCanvasHeight(page):1;
 const scope=useRef(page);scope.current=page;
 async function apply(edit:PdfRowEdit,extra:PdfLayer[]=[],removeIds:string[]=[],excluded:string[]=[]){
  if(!page||busy)return false;const before=page;
  setBusy(true);onError('');
  try{
   if((before.rowEdits?.length??0)>=500)throw Error('This page has reached the editing limit. Undo an earlier edit before continuing.');
   const flowed=applyFlowEdit({...before,layers:before.layers.filter(l=>!removeIds.includes(l.id))},edit,excluded);
   const changed={...flowed,layers:[...flowed.layers,...extra]};
   if(changed.layers.some(l=>l.x<0||l.y<0||l.x+l.width>before.width+.5||l.y+l.height>MAX_FLOW_HEIGHT))throw Error('Keep edited objects within the document width.');
   const probe=document.createElement('canvas');try{await renderPage(changed,documents,probe,1,{tolerant:true});}finally{probe.width=probe.height=0;}
   if(!alive.current||currentPage.current!==before.id||scope.current!==before)return false;
   ownedEdits.current=changed.rowEdits;onChange(changed);return true;
  }catch(error){if(alive.current)onError(error instanceof Error?error.message:'The page edit could not be applied.');return false;}
  finally{if(alive.current)setBusy(false);}
 }
 async function insertRow(){
  if(!page||!anchor||!geometryReady)return;const y=row!.end,tableRow=crypto.randomUUID();
  if(!row!.separable){onError('This row overlaps the next text or border. Move the overlapping object before adding a row.');return;}
  const originals=row!.template.map(c=>({run:c.run,rect:c.rect}));
  const blank:PdfLayer[]=originals.length?originals.map(({run,rect})=>({...createReplacementLayer(run,crypto.randomUUID()),x:rect.x,y:y+(rect.y-rowTop),text:'',maskOriginal:false,tableRow})):page.layers.filter(l=>(l.maskOriginal===false||l.tableRow===anchor.tableRow&&!!anchor.tableRow)&&Math.abs(l.y-anchor.y)<Math.max(2,anchor.fontSize*.35)).map(l=>({...l,id:crypto.randomUUID(),y:y+(l.y-rowTop),text:'',tableRow}));
  const okay=await apply({id:tableRow,kind:'insert',y,height:row!.spacing},blank,[],row!.members.map(l=>l.id));
  if(okay){setTool('replace');setArea(null);}
 }
 async function deleteRow(){if(!page||!anchor||!geometryReady)return;if(!row!.separable){onError('This row overlaps the next text or border. Move the overlapping object before deleting the row.');return;}const okay=await apply({id:crypto.randomUUID(),kind:'delete',y:rowTop,height:rowHeight},[],row!.members.map(l=>l.id));if(okay)setArea(null);}
 function point(event:PointerEvent<HTMLElement>){const paper=event.currentTarget.closest('.pdf-paper')!.getBoundingClientRect();return {x:Math.max(0,Math.min(page!.width,(event.clientX-paper.left)/paper.width*page!.width)),y:Math.max(0,Math.min(extent,(event.clientY-paper.top)/paper.height*extent))};}
 function begin(event:PointerEvent<HTMLElement>,rect?:Area){
  if(!page||busy)return;if(rect&&shown.some(c=>overlaps(c.rect,rect)&&!inside(c.rect,rect))){onError('This line overlaps text. Use Move table / area to select the whole group.');return;}event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
  const start=point(event),before=rect??{...start,width:0,height:0};gesture.current={start,before,pick:!rect,current:before};setArea(before);setMoving(true);onError('');
 }
 function move(event:PointerEvent<HTMLElement>){
  const g=gesture.current;if(!g||!page)return;const now=point(event);
  const current=g.pick?{x:Math.min(g.start.x,now.x),y:Math.min(g.start.y,now.y),width:Math.abs(now.x-g.start.x),height:Math.abs(now.y-g.start.y)}:{...g.before,x:Math.max(0,Math.min(page.width-g.before.width,g.before.x+now.x-g.start.x)),y:Math.max(0,Math.min(extent-g.before.height,g.before.y+now.y-g.start.y))};
  g.current=current;setArea(current);
 }
 async function finish(){
  const g=gesture.current;gesture.current=null;setMoving(false);if(!g||!page)return;
  if(g.pick){
   if(g.current.width<2||g.current.height<2){setArea(null);return;}
   if(shown.some(c=>overlaps(c.rect,g.current)&&!inside(c.rect,g.current))){setArea(null);onError('Select the whole text or table, without cutting through a text line.');return;}
   setTool('objects');return;
  }
  const dx=g.current.x-g.before.x,dy=g.current.y-g.before.y;
  if(Math.abs(dx)+Math.abs(dy)<.1)return;
  const okay=await apply({id:crypto.randomUUID(),kind:'move',...g.before,dx,dy});if(!okay)setArea(g.before);
 }
 function cancel(){const g=gesture.current;gesture.current=null;setMoving(false);setArea(g?.pick?null:g?.before??null);}
 async function nudge(dx:number,dy:number){if(!area||!page||busy)return;const destination={...area,x:area.x+dx,y:area.y+dy};if(destination.x<0||destination.y<0||destination.x+area.width>page.width||destination.y+area.height>extent)return;if(await apply({id:crypto.randomUUID(),kind:'move',...area,dx,dy}))setArea(destination);}
 const position=(rect:Area)=>({left:`${rect.x/page!.width*100}%`,top:`${rect.y/extent*100}%`,width:`${rect.width/page!.width*100}%`,height:`${rect.height/extent*100}%`});
 const overlay=page&&<>
  {tool==='objects'&&lines.map(line=>{const rect=mapSourceRect(line,page.rowEdits??[]);return rect?<button key={line.id} className="pdf-native-line" aria-label={'Move line '+line.id} title="Drag this line" style={position(rect)} onPointerDown={event=>begin(event,rect)} onPointerMove={move} onPointerUp={()=>void finish()} onPointerCancel={cancel}/>:null;})}
  {tool==='area'&&<div className="pdf-area-picker" aria-label="Select table or area" onPointerDown={event=>begin(event)} onPointerMove={move} onPointerUp={()=>void finish()} onPointerCancel={cancel}/>}
  {area&&(tool==='objects'||tool==='area')&&<button className={'pdf-native-area '+(moving?'moving':'')} aria-label="Move selected table or area" title="Drag the selected area, or use arrow keys" onKeyDown={event=>{if(event.repeat)return;const step=event.shiftKey?10:1,delta=({ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]} as Record<string,number[]>)[event.key];if(delta){event.preventDefault();void nudge(delta[0],delta[1]);}}} style={position(area)} onPointerDown={event=>begin(event,area)} onPointerMove={move} onPointerUp={()=>void finish()} onPointerCancel={cancel}/>}
 </>;
 const controls=<>
  {anchor&&<section className="pdf-row-controls"><h3>Row tools</h3><p>{anchor.tableRow?page?.layers.filter(l=>l.tableRow===anchor.tableRow).length:row?.template.length||1} fields on this row</p><div><button disabled={busy||!geometryReady} onClick={()=>void insertRow()}>Add row below</button><button disabled={busy||!geometryReady} onClick={()=>void deleteRow()}>Delete row</button></div></section>}
  {(tool==='objects'||tool==='area')&&<div className="pdf-object-help"><p>{tool==='area'?'Drag around the whole table or area, then drag it to a new position.':area?'Drag the outlined area to move it. Undo restores its previous position.':'Drag a highlighted line, or use Move table / area for a group.'}</p>{area&&<button disabled={busy} onClick={()=>setArea(null)}>Clear area selection</button>}</div>}
 </>;
 return {overlay,controls};
}
