import type {PdfLayer,PdfRowEdit} from './types';
type Rect={x:number;y:number;width:number;height:number};
export function inside(a:Rect,b:Rect){return a.x>=b.x-.5&&a.y>=b.y-.5&&a.x+a.width<=b.x+b.width+.5&&a.y+a.height<=b.y+b.height+.5;}
export function overlaps(a:Rect,b:Rect){return a.x<b.x+b.width-.5&&a.x+a.width>b.x+.5&&a.y<b.y+b.height-.5&&a.y+a.height>b.y+.5;}

/** Source coordinates remain immutable; overlays follow the ordered page edits. */
export function mapSourceRect<T extends Rect>(rect:T,edits:PdfRowEdit[]):T|null {
 let r={...rect};
 for(const e of edits){
  if(e.kind==='move'){
   if(inside(r,e)){r={...r,x:r.x+e.dx,y:r.y+e.dy};}
   else if(overlaps(r,e))return null;
  }else if(e.kind==='insert'){
   if(r.y>=e.y-.5)r={...r,y:r.y+e.height};
   else if(r.y+r.height>e.y+.5)return null;
  }else{
   if(r.y>=e.y+e.height-.5)r={...r,y:r.y-e.height};
   else if(r.y+r.height>e.y+.5)return null;
  }
 }
 return r;
}

/** Text boxes contain font descent/padding; row ownership follows the baseline. */
export function mapSourceTextRect<T extends Rect>(rect:T,edits:PdfRowEdit[],anchorOffset=rect.height*.65):T|null {
 let r={...rect};
 for(const edit of edits){
  if(edit.kind==='move'){const mapped=mapSourceRect(r,[edit]);if(!mapped)return null;r=mapped;continue;}
  const anchor=r.y+anchorOffset;
  if(edit.kind==='insert'){if(anchor>=edit.y-.01)r={...r,y:r.y+edit.height};}
  else if(anchor>=edit.y+edit.height-.01)r={...r,y:r.y-edit.height};
  else if(anchor>=edit.y-.01)return null;
 }
 return r;
}

export function transformLayers(layers:PdfLayer[],edit:PdfRowEdit):PdfLayer[]{
 const result:PdfLayer[]=[];
 for(const layer of layers){
  const next=layer.sourceText?mapSourceTextRect(layer,[edit],Math.min(layer.height*.65,layer.fontSize*.85)):mapSourceRect(layer,[edit]);
  if(next){
   if(layer.textFlow){
    const flow=layer.textFlow,end=flow.at+flow.height;
    if(edit.kind==='move'){
     if(next.x!==layer.x||next.y!==layer.y||(edit.y<end&&edit.y+edit.height>flow.at)||(edit.y+edit.dy<end&&edit.y+edit.dy+edit.height>flow.at))delete next.textFlow;
    }else if(edit.kind==='insert'){
     if(edit.y<flow.at-.01)next.textFlow={...flow,at:flow.at+edit.height};
     else if(edit.y<end+.01)delete next.textFlow;
    }else{
     if(edit.y+edit.height<=flow.at+.01)next.textFlow={...flow,at:flow.at-edit.height};
     else if(edit.y<end-.01)delete next.textFlow;
    }
   }
   result.push(next);continue;
  }
  if(edit.kind==='delete'&&(layer.sourceText||layer.y>=edit.y-.5&&layer.y+layer.height<=edit.y+edit.height+.5))continue;
  throw Error('The selection crosses a text box or another edit. Select the whole object, or adjust the row boundary.');
 }
 return result;
}
