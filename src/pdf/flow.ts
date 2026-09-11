import type { PdfProjectPage, PdfRowEdit } from './types';
import { transformLayers } from './row-layout';

export const MAX_FLOW_HEIGHT = 14400;
export function pageCanvasHeight(page: PdfProjectPage): number {
 let extent=page.height;
 for(const edit of page.rowEdits??[]) if(edit.kind!=='move') extent+=edit.kind==='insert'?edit.height:-edit.height;
 const result=Math.max(page.height,extent,page.flowHeight??0,...page.layers.map(l=>l.y+l.height));
 if(!Number.isFinite(result)||result>MAX_FLOW_HEIGHT)throw Error('Document content exceeds the supported editing extent.');
 return result;
}
export function applyFlowEdit(page: PdfProjectPage, edit: PdfRowEdit, excludedLayerIds: string[]=[]): PdfProjectPage {
 const before=pageCanvasHeight(page);
 if(!Number.isFinite(edit.y)||!Number.isFinite(edit.height)||edit.y<0||edit.height<=0||edit.y>before||edit.height>MAX_FLOW_HEIGHT||edit.kind!=='insert'&&edit.y+edit.height>before)throw Error('Choose a valid content area.');
 if(edit.kind==='move'&&(![edit.x,edit.width,edit.dx,edit.dy].every(Number.isFinite)||edit.width<=0||edit.x<0||edit.x+edit.width>page.width||edit.x+edit.dx<0||edit.x+edit.dx+edit.width>page.width||edit.y+edit.dy<0||edit.y+edit.dy+edit.height>before))throw Error('Keep the moved area inside the content extent.');
 const excluded=new Set(excludedLayerIds);
 const transformed=transformLayers(page.layers.filter(l=>!excluded.has(l.id)),edit);
 const byId=new Map(transformed.map(l=>[l.id,l]));
 const layers=page.layers.flatMap(l=>excluded.has(l.id)?[l]:byId.has(l.id)?[byId.get(l.id)!]:[]);
 const flowHeight=Math.max(page.height,before+(edit.kind==='insert'?edit.height:edit.kind==='delete'?-edit.height:0));
 const next={...page,layers,rowEdits:[...(page.rowEdits??[]),edit],flowHeight};pageCanvasHeight(next);return next;
}

export type SourceFragment={x:number;y:number;width:number;height:number;sx:number;sy:number;fill?:string};
function split(f:SourceFragment,rect:{x:number;y:number;width:number;height:number}):{inside:SourceFragment[];outside:SourceFragment[]} {
 const x=Math.max(f.x,rect.x),y=Math.max(f.y,rect.y),r=Math.min(f.x+f.width,rect.x+rect.width),b=Math.min(f.y+f.height,rect.y+rect.height);
 if(r<=x||b<=y)return {inside:[],outside:[f]};
 const part=(px:number,py:number,w:number,h:number):SourceFragment=>({...f,x:px,y:py,width:w,height:h,sx:f.sx+px-f.x,sy:f.sy+py-f.y});
 return {inside:[part(x,y,r-x,b-y)],outside:[part(f.x,f.y,f.width,y-f.y),part(f.x,b,f.width,f.y+f.height-b),part(f.x,y,x-f.x,b-y),part(r,y,f.x+f.width-r,b-y)].filter(p=>p.width>0&&p.height>0)};
}
/** Ordered opaque source fragments retain native pixels without a giant canvas. */
export function sourceFragments(page:PdfProjectPage,initial?:SourceFragment[]):SourceFragment[]{
 let fragments:SourceFragment[]=initial??[{x:0,y:0,width:page.width,height:page.height,sx:0,sy:0}];
 for(const edit of page.rowEdits??[]){
  if(edit.kind==='move'){
   const selected:SourceFragment[]=[],rest:SourceFragment[]=[];
   for(const f of fragments){const p=split(f,edit);selected.push(...p.inside);rest.push(...p.outside);}
   const destination={...edit,x:edit.x+edit.dx,y:edit.y+edit.dy};
   fragments=[...rest.flatMap(f=>split(f,destination).outside),...selected.map(f=>({...f,x:f.x+edit.dx,y:f.y+edit.dy}))];
  }else{
   const boundary=edit.kind==='insert'?edit.y:edit.y+edit.height;
   fragments=fragments.flatMap(f=>{
    const kept=edit.kind==='delete'?split(f,{x:0,y:edit.y,width:page.width,height:edit.height}).outside:[f];
    return kept.flatMap(p=>{const parts=split(p,{x:0,y:boundary,width:page.width,height:MAX_FLOW_HEIGHT});return [...parts.outside,...parts.inside.map(q=>({...q,y:q.y+(edit.kind==='insert'?edit.height:-edit.height)}))];});
   });
  }
  if(fragments.length>20000)throw Error('Too many overlapping source edits.');
 }
 return fragments;
}
export type FlowSheet={top:number;height:number};
export function paginateFlow(page:PdfProjectPage,protectedAreas:{y:number;height:number}[]=[]):FlowSheet[]{
 const extent=pageCanvasHeight(page),sheets:FlowSheet[]=[];
 let top=0;
 while(top<extent-.01){
  let bottom=Math.min(top+page.height,extent);
  if(bottom<extent){
   // Move a boundary above any intersecting line/object, until it is a gap.
   for(let n=0;n<=protectedAreas.length;n++){
    const crossing=protectedAreas.filter(r=>r.y<bottom-.01&&r.y+r.height>bottom+.01&&r.height<page.height);
    if(!crossing.length)break;
    const next=Math.min(...crossing.map(r=>r.y));if(next<=top+.01)break;bottom=next;
   }
  }
  if(bottom<=top)throw Error('Unable to paginate this content.');
  sheets.push({top,height:bottom-top});top=bottom;
 }
 return sheets;
}

/** An owned spacer can shrink only while no original source fragment occupies it. */
export function sourceBandIsEmpty(page:PdfProjectPage,at:number,height:number):boolean {
 return Number.isFinite(at+height)&&height>0&&!sourceFragments(page).some(f=>f.y<at+height-.01&&f.y+f.height>at+.01);
}
