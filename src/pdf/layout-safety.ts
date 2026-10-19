import type {DetectedText,PdfLayer,PdfProjectPage,PdfRowEdit} from './types';
import {applyFlowEdit,sourceFragments} from './flow';
import {overlaps,mapSourceTextRect} from './row-layout';
import {replacementForRun} from './source-edits';
type Rect={x:number;y:number;width:number;height:number};
type Move=Extract<PdfRowEdit,{kind:'move'}>;
/** Only the newly covered destination can replace unrelated source content. */
export function subtractRect(rect:Rect,source:Rect):Rect[]{
 const x=Math.max(rect.x,source.x),y=Math.max(rect.y,source.y),right=Math.min(rect.x+rect.width,source.x+source.width),bottom=Math.min(rect.y+rect.height,source.y+source.height);
 if(right<=x||bottom<=y)return [rect];
 return [{x:rect.x,y:rect.y,width:rect.width,height:y-rect.y},{x:rect.x,y:bottom,width:rect.width,height:rect.y+rect.height-bottom},{x:rect.x,y,width:x-rect.x,height:bottom-y},{x:right,y,width:rect.x+rect.width-right,height:bottom-y}].filter(r=>r.width>0&&r.height>0);
}
function textTargets(page:PdfProjectPage,runs:DetectedText[]):(Rect&{text:string;layerId?:string})[]{
 return [...runs.flatMap(run=>{if(replacementForRun(page,run))return [];const rect=mapSourceTextRect(run,page.rowEdits??[],run.fontSize*.72);return rect&&run.text.trim()?[{...rect,text:run.text}]:[];}),...page.layers.filter(l=>!l.deleted&&(l.text.trim()||['image','shape','note','stamp','whiteout'].includes(l.kind))).map(l=>({...l,layerId:l.id}))];
}
function graphicTargets(page:PdfProjectPage,graphics:Rect[]):Rect[]{return graphics.flatMap(g=>sourceFragments(page,[{...g,sx:g.x,sy:g.y}])).filter(r=>!r.fill);}
export function assertMoveDestinationClear(page:PdfProjectPage,edit:Move,runs:DetectedText[],graphics:Rect[]):void {
 const destination={...edit,x:edit.x+edit.dx,y:edit.y+edit.dy};
 const occupied=[...textTargets(page,runs),...graphicTargets(page,graphics)];
 if(occupied.some(rect=>subtractRect(rect,edit).some(part=>overlaps(part,destination))))throw Error('The destination is occupied and would overlap text or artwork. Choose a blank area; the move was not applied.');
}
/** Inspect actual visible artwork, allowing blank parts of full-page scan images. */
export function assertRasterDestinationClear(edit:Move,raster:{data:Uint8ClampedArray;width:number;height:number},rendered:{scale:number}):void {
 const {scale}=rendered;
 if(!Number.isFinite(scale)||scale<=0)throw Error('The destination scale could not be checked. Reopen the document before moving this area.');
 const destination={...edit,x:edit.x+edit.dx,y:edit.y+edit.dy};
 for(const part of subtractRect(destination,edit)){
  for(let y=Math.max(0,Math.floor(part.y*scale));y<Math.min(raster.height,Math.ceil((part.y+part.height)*scale));y++){
   for(let x=Math.max(0,Math.floor(part.x*scale));x<Math.min(raster.width,Math.ceil((part.x+part.width)*scale));x++){
    const i=(y*raster.width+x)*4;
    if(raster.data[i+3]>20&&Math.min(raster.data[i],raster.data[i+1],raster.data[i+2])<240)throw Error('The destination is occupied by visible artwork. Choose a blank area; the move was not applied.');
   }
  }
 }
}
/** Spacing for a bounded stationery column, using ordinary reversible source moves. */
export function reflowStationery(page:PdfProjectPage,before:PdfLayer,next:PdfLayer,runs:DetectedText[],graphics:Rect[]):PdfProjectPage {
 let delta=next.height-before.height;
 // Ownership lives in the existing command ID; never compact arbitrary manual space.
 const owner=`column:${before.id.length}:${before.id}:`,edits=page.rowEdits??[];
 if(delta<0){
  const first=edits.findIndex(e=>e.id.startsWith(owner));
  const owned=first<0||edits.slice(first).some(e=>!e.id.startsWith(owner))?0:edits.reduce((sum,e)=>sum+(e.kind==='move'&&e.id.startsWith(owner)?e.dy:0),0);
  delta=-Math.min(-delta,Math.max(0,owned));
 }
 if(Math.abs(delta)<.1)return page;
 const targets=textTargets(page,runs).filter(t=>t.layerId!==before.id),group:typeof targets=[];
 const gap=Math.max(24,Math.min(36,before.fontSize*2.5));let bottom=before.y+before.height;
 for(const target of targets.filter(t=>t.y>before.y+before.fontSize*.8&&Math.abs(t.x-before.x)<=12).sort((a,b)=>a.y-b.y)){
  if(target.y-bottom>gap||/^(DATE|DESCRIPTION|BALANCE DUE|TOTAL(?:\s.*)?|AGING SUMMARY)$/i.test(target.text.trim()))break;
  group.push(target);bottom=Math.max(bottom,target.y+target.height);
 }
 const others=targets.filter(t=>!group.includes(t));
 if(others.some(t=>overlaps(next,t)))throw Error('The text would overlap another column or field. Choose more space before adding a line.');
 if(graphicTargets(page,graphics).some(t=>subtractRect(next,before).some(part=>overlaps(part,t))))throw Error('The text would overlap artwork. Choose more space before adding a line.');
 if(!group.length)return page;
 const x=Math.max(0,Math.min(...group.map(t=>t.x))-.25),y=Math.min(...group.map(t=>t.y))-.25;
 const right=Math.min(page.width,Math.max(...group.map(t=>t.x+t.width))+.25),end=Math.max(...group.map(t=>t.y+t.height))+.25;
 const id=owner+crypto.randomUUID();if(id.length>200)throw Error('This text box cannot safely add column spacing. Move the fields explicitly.');
 const edit:Move={id,kind:'move',x,y,width:right-x,height:end-y,dx:0,dy:delta};
 // Partial membership means the detected column boundary is ambiguous.
 if(others.some(t=>overlaps(t,edit))||graphicTargets(page,graphics).some(t=>overlaps(t,edit)))throw Error('This column overlaps another field or artwork. Adjust the text box before adding a line.');
 assertMoveDestinationClear({...page,layers:page.layers.map(l=>l.id===before.id?{...l,text:'',deleted:true}:l)},edit,runs,graphics);
 if(group.some(t=>overlaps({...t,y:t.y+delta},next)))throw Error('There is not enough space in this column.');
 return applyFlowEdit(page,edit,[before.id]);
}
