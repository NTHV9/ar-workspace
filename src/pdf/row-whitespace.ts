import {applyFlowEdit,pageCanvasHeight,sourceFragments} from './flow';
import type {DetectedText,PdfProjectPage,PdfRowEdit} from './types';
type Rect={x:number;y:number;width:number;height:number};
export type WhitespaceProof={raster:{data:Uint8ClampedArray;width:number;height:number};scale:number;runs:DetectedText[];barriers:Rect[]};
/** Consume only a whole-width, strictly white source band. Geometry protects
 * invisible text, image bounds and empty editor cells as well as visible ink. */
export function insertRowUsingWhitespace(page:PdfProjectPage,edit:Extract<PdfRowEdit,{kind:'insert'|'delete'}>,excluded:string[],proof?:WhitespaceProof):PdfProjectPage{
 const flowed=applyFlowEdit(page,edit,excluded);
 if(edit.kind!=='insert'||!proof)return flowed;
 const {raster,scale}=proof,extent=pageCanvasHeight(page);
 if(!Number.isFinite(scale)||scale<2||raster.width!==Math.ceil(page.width*scale)||raster.height!==Math.ceil(extent*scale)||raster.data.length!==raster.width*raster.height*4)return flowed;
 const white=(row:number)=>{for(let x=0;x<raster.width;x++){const i=(row*raster.width+x)*4;if(raster.data[i]!==255||raster.data[i+1]!==255||raster.data[i+2]!==255||raster.data[i+3]!==255)return false;}return true;};
 let paintedBottom=raster.height;while(paintedBottom>0&&white(paintedBottom-1))paintedBottom--;
 // Do not compact an existing continuation, or whitespace that would not cause
 // overflow. There is no template/footer heuristic and no export-only rewrite.
 if(paintedBottom/scale>page.height+.01||paintedBottom/scale+edit.height<=page.height)return flowed;
 const source=sourceFragments(page),mapped=sourceFragments(page,[...proof.runs,...proof.barriers].map(r=>({...r,sx:r.x,sy:r.y})));
 const occupied:Rect[]=[...mapped,...page.layers];
 const margin=4,needed=Math.ceil((edit.height+margin*2)*scale),last=Math.floor((page.height-edit.height)*scale);
 let start=-1,best:{y:number;length:number}|undefined;
 for(let row=Math.ceil((edit.y+margin)*scale);row<last;row++){
  const top=row/scale,bottom=(row+1)/scale;
  if(!white(row)||occupied.some(r=>r.y<bottom&&r.y+r.height>top)){start=-1;continue;}
  if(start<0)start=row;
  if(row-start+1<needed)continue;
  const y=(row+1-needed)/scale+margin;
  // Inserted spacers and fragmented/moved areas are not original whitespace.
  if(!source.some(f=>!f.fill&&f.x<=0&&f.width>=page.width&&f.y<=y-margin&&f.y+f.height>=y+edit.height+margin))continue;
  const length=row-start+1;
  if(!best||length>best.length)best={y,length};
 }
 return best?applyFlowEdit(flowed,{id:crypto.randomUUID(),kind:'delete',y:best.y+edit.height,height:edit.height,spaceFor:edit.id}):flowed;
}

/** Restore an owned white band before reclaiming its row. Later moves can make
 * the boundary ambiguous, so retain the row's space rather than split artwork. */
export function restoreConsumedRowSpace(page:PdfProjectPage,rowId:string):PdfProjectPage|null{
 let next=page;
 const edits=page.rowEdits??[],owned=edits.flatMap((e,index)=>e.kind==='delete'&&e.spaceFor===rowId?[{edit:e,index}]:[]);
 for(const {edit,index} of owned.reverse()){
  let y=edit.y;
  for(const later of edits.slice(index+1)){
   if(later.kind==='move')return null;
   if(later.kind==='insert'){if(later.y<=y)y+=later.height;}
   else if(later.y<y)y-=Math.min(later.height,y-later.y);
  }
  try{next=applyFlowEdit(next,{id:crypto.randomUUID(),kind:'insert',y,height:edit.height});}catch{return null;}
 }
 return next;
}
