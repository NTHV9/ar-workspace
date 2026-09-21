import {applyFlowEdit,sourceBandIsEmpty} from './flow';
import {measureLayerInk,sourceAppearanceUnchanged,sourceStyle} from './source-text';
import {mapSourceTextRect} from './row-layout';
import type {PdfProjectPage} from './types';

type Band={y:number;height:number};
const epsilon=1e-6;
function joined(bands:Band[]):Band[]{
 const result:Band[]=[];
 for(const band of bands.filter(b=>b.height>epsilon).sort((a,b)=>a.y-b.y)){
  const last=result.at(-1);
  if(last&&band.y<=last.y+last.height+epsilon)last.height=Math.max(last.y+last.height,band.y+band.height)-last.y;
  else result.push({...band});
 }
 return result;
}

/** Track space allocated by a row's insertion, independently of its font/ink.
 * Moving cells does not move their full-page spacer. Native source moved into
 * that spacer is checked before any space is reclaimed.
 */
export function insertedRowBands(page:PdfProjectPage,rowId:string):Band[]{
 const edits=page.rowEdits??[],start=edits.findIndex(e=>e.kind==='insert'&&e.id===rowId);
 if(start<0)return [];
 let bands:Band[]=[];
 for(const edit of edits.slice(start)){
  if(edit.kind==='move')continue;
  bands=bands.flatMap(b=>{
   const end=b.y+b.height;
   if(edit.kind==='insert'){
    if(edit.y<=b.y+epsilon)return [{...b,y:b.y+edit.height}];
    if(edit.y>=end-epsilon)return [b];
    return [{y:b.y,height:edit.y-b.y},{y:edit.y+edit.height,height:end-edit.y}];
   }
   const tail=edit.y+edit.height,result:Band[]=[];
   if(b.y<edit.y)result.push({y:b.y,height:Math.min(end,edit.y)-b.y});
   if(end>tail)result.push({y:Math.max(b.y,tail)-edit.height,height:end-Math.max(b.y,tail)});
   return result;
  });
  if(edit.kind==='insert'&&(edit.id===rowId||edit.rowId===rowId))bands.push({y:edit.y,height:edit.height});
 }
 // Older projects record a typing spacer on a cell, without edit ownership.
 const legacy=page.layers.filter(l=>l.tableRow===rowId&&l.textFlow).map(l=>({y:l.textFlow!.at,height:l.textFlow!.height}));
 return joined([...bands,...legacy]);
}

/** Remove only this row's cells; reclaim only proven empty owned space.
 * If a user has placed unrelated content there, that content and its space stay.
 */
export function deleteInsertedRow(page:PdfProjectPage,rowId:string):{page:PdfProjectPage;keptSpace:boolean}{
 const members=page.layers.filter(l=>l.tableRow===rowId);
 if(!members.length)return {page,keptSpace:false};
 if(members.some(l=>l.original&&l.maskOriginal!==false))throw Error('This row contains a source-text edit. Restore its row grouping before deleting it.');
 const bands=insertedRowBands(page,rowId);
 let next={...page,layers:page.layers.filter(l=>l.tableRow!==rowId)},keptSpace=!bands.length;
 for(const band of bands.reverse()){
  const overlaps=(r:Band)=>r.y<band.y+band.height-epsilon&&r.y+r.height>band.y+epsilon;
  const occupied=next.layers.some(l=>{
   const native=sourceStyle(l);
   if(native&&sourceAppearanceUnchanged(l,native.run,mapSourceTextRect(native.run,next.rowEdits??[],native.baseline)))return false;
   return overlaps(l.sourceText||l.deleted?measureLayerInk(l):l);
  });
  if(occupied||!sourceBandIsEmpty(next,band.y,band.height)){keptSpace=true;continue;}
  try{next=applyFlowEdit(next,{id:crypto.randomUUID(),kind:'delete',...band});}
  catch{keptSpace=true;}
 }
 return {page:next,keptSpace};
}
