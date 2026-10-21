import {applyFlowEdit,sourceBandIsEmpty,sourceFragments} from './flow';
import {mapSourceTextRect,overlaps} from './row-layout';
import {sourceMaskBounds} from './source-text';
import {replacementForRun} from './source-edits';
import {assertMoveDestinationClear,subtractRect} from './layout-safety';
import type {DetectedText,PdfLayer,PdfProjectPage,PdfRowEdit} from './types';

export type HeaderInk={x:number;y:number;width:number;height:number;pixels:Uint8Array;scale?:number};
function verifyInk(page:PdfProjectPage,edit:Extract<PdfRowEdit,{kind:'move'}>,ink:HeaderInk,before:PdfLayer,runs:DetectedText[]){
 const scale=ink.scale??1,destination={...edit,y:edit.y+edit.dy,x:edit.x+edit.dx};
 const erased=[...page.layers,before].flatMap(l=>{const mask=sourceMaskBounds(l,runs);return mask?[mask]:[];});
 for(const part of subtractRect(destination,edit))for(const fragment of sourceFragments(page)){
  const x=Math.max(part.x,fragment.x),y=Math.max(part.y,fragment.y),right=Math.min(part.x+part.width,fragment.x+fragment.width),bottom=Math.min(part.y+part.height,fragment.y+fragment.height);
  for(let py=Math.floor(y*scale);py<Math.ceil(bottom*scale);py++)for(let px=Math.floor(x*scale);px<Math.ceil(right*scale);px++){
   const sx=Math.floor((fragment.sx+px/scale-fragment.x)*scale),sy=Math.floor((fragment.sy+py/scale-fragment.y)*scale);
   if(erased.some(r=>sx>=Math.floor(r.x*scale)&&sx<Math.ceil((r.x+r.width)*scale)&&sy>=Math.floor(r.y*scale)&&sy<Math.ceil((r.y+r.height)*scale)))continue;
   if(sx<ink.x||sy<ink.y||sx>=ink.x+ink.width||sy>=ink.y+ink.height)throw Error('The right header destination is outside the verified area.');
   if(ink.pixels[(sy-ink.y)*ink.width+sx-ink.x])throw Error('The right header would cover artwork. Move it to a blank area first.');
  }
 }
}

/** Move the complete downstream right column as source pixels, preserving its typography. */
export function reflowRightHeader(page:PdfProjectPage,before:PdfLayer,next:PdfLayer,runs:DetectedText[],ink?:HeaderInk):PdfProjectPage|null{
 const visible=(p:PdfProjectPage)=>runs.flatMap(run=>{const old=replacementForRun(p,run);if(old?.deleted)return [];const rect=old??mapSourceTextRect(run,p.rowEdits??[],run.fontSize*.72);return rect?[{run,rect,layerId:old?.id}]:[];});
 const shown=visible(page),title=shown.find(t=>/^(?:COPY OF )?INVOICE$/i.test(t.run.text.trim())&&t.rect.x>page.width*.55);
 const table=shown.find(t=>t.run.text.trim().toUpperCase()==='DATE'&&t.rect.y>before.y&&shown.some(s=>s.run.text.trim().toUpperCase()==='DESCRIPTION'&&Math.abs(s.rect.y-t.rect.y)<3));
 if(!title||!table||before.x<title.rect.x-1||before.y<title.rect.y-1||before.y>=table.rect.y)return null;
 if(!ink)throw Error('The right header artwork has not been verified. Keep the current layout or use a smaller PDF package.');
 const owner=`rh:${before.id}:`,owned=(page.rowEdits??[]).filter(e=>e.id.startsWith(owner));
 let delta=next.height-before.height;
 if(delta<0){const originalExtra=Math.max(0,(before.original?.height??before.height)-11);const moved=owned.reduce((n,e)=>n+(e.kind==='move'?e.dy:0),0);delta=-Math.min(-delta,Math.max(0,originalExtra+moved));}
 if(Math.abs(delta)<.1)return page;
 const group=shown.filter(t=>t.rect.x>=title.rect.x-1&&t.rect.y>before.y+before.fontSize*.8&&t.rect.y<table.rect.y-5&&t.layerId!==before.id);
 if(!group.length)return page;
 const others=shown.filter(t=>!group.includes(t)&&t.layerId!==before.id&&!(before.original&&t.run.text===before.original.text&&t.run.x===before.original.x&&t.run.y===before.original.y));
 if(others.some(t=>t.rect.y<table.rect.y-5&&overlaps(next,t.rect)))throw Error('The right header would overlap another field. Adjust its text before continuing.');
 const left=title.rect.x-.25,top=Math.min(...group.map(t=>t.rect.y))-.25,right=Math.min(page.width,Math.max(...group.map(t=>t.rect.x+t.rect.width),before.x+before.width+1,next.x+next.width+1))+.01,bottom=Math.max(...group.map(t=>t.rect.y+t.rect.height))+.25;
 let changed=page;const boundary=table.rect.y-6,extra=Math.max(0,bottom+delta+4-boundary);
 if(extra>.1){if(others.some(t=>t.rect.y<boundary&&t.rect.y+t.rect.height>boundary))throw Error('The header is too close to another field to move the table safely.');changed=applyFlowEdit(changed,{id:owner+crypto.randomUUID(),kind:'insert',y:boundary,height:extra},[before.id]);}
 const edit:Extract<PdfRowEdit,{kind:'move'}>={id:owner+crypto.randomUUID(),kind:'move',x:left,y:top,width:right-left,height:bottom-top,dx:0,dy:delta};
 if(others.some(t=>overlaps(t.rect,edit)))throw Error('The right header boundary crosses another field.');
 assertMoveDestinationClear({...changed,layers:changed.layers.map(l=>l.id===before.id?{...l,text:'',deleted:true}:l)},edit,runs,[]);
 verifyInk(changed,edit,ink,before,runs);
 changed=applyFlowEdit(changed,edit,[before.id]);
 if(delta<0){
  const edits=page.rowEdits??[],first=edits.findIndex(e=>e.id.startsWith(owner)),safe=first>=0&&edits.slice(first).every(e=>e.id.startsWith(owner));
  const spacing=safe?owned.reduce((n,e)=>n+(e.kind==='insert'?e.height:e.kind==='delete'?-e.height:0),0):0;
  const remove=Math.min(-delta,spacing),at=boundary-remove;
  if(remove>.1&&sourceBandIsEmpty(changed,at,remove)&&!changed.layers.some(l=>l.id!==before.id&&!l.deleted&&l.y<at+remove&&l.y+l.height>at))changed=applyFlowEdit(changed,{id:owner+crypto.randomUUID(),kind:'delete',y:at,height:remove},[before.id]);
 }
 return changed;
}
