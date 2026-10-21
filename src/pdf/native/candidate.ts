import {sourceStyle,measureLayerText} from '../source-text';
import {mapSourceTextRect} from '../row-layout';
import {sourceFragments} from '../flow';
import type {PdfProjectPage} from '../types';
import type {NativeRequest,NativeResult} from './protocol';
import {runNativeWorker} from './worker-pool';
/** Isolated per transaction: hard timeout terminates WASM, no persistent handles. */
export function nativeTextCandidate(bytes:Uint8Array,page:PdfProjectPage,signal?:AbortSignal):Promise<NativeResult|undefined>{
 if(signal?.aborted)return Promise.resolve(undefined);
 if(typeof Worker==='undefined'||!page.sourcePage||bytes.length>32*1024*1024)return Promise.resolve(undefined);
 const edits:NativeRequest['edits']=[];
 const fragments=sourceFragments(page);
 for(const [index,l] of page.layers.entries()){if(l.deleted&&l.text!=='')continue;const s=sourceStyle(l),r=l.original,text=l.text,metrics=measureLayerText(l),position=r&&mapSourceTextRect(r,page.rowEdits??[],s?.baseline);
  if(l.sourceText?.sourceId!==page.sourceId||l.sourceText?.sourcePage!==page.sourcePage||!s?.supported||!r||!position||metrics.unsupported||(text!==''&&metrics.lines.length!==1)||metrics.width>l.width+.5||metrics.height>l.height+.5||l.kind!=='replacement'||l.maskOriginal===false||l.formField||text===r.text||/[\r\n]/.test(text)||Math.abs(l.x-position.x)>.01||Math.abs(l.y-position.y)>.01||l.fontSize!==s.fontSize||l.bold!==!!s.run.bold||l.italic!==!!s.run.italic||l.color.toLowerCase()!==s.color.toLowerCase()||l.fill.toLowerCase()!=='#ffffff')continue;
  if(page.layers.filter(other=>other.original?.text===r.text&&Math.abs(other.original.x-r.x)<.01&&Math.abs(other.original.y-r.y)<.01&&other.maskOriginal!==false).length!==1)continue;
  // Baseline ownership alone can span a split row. Every source pixel of the
  // original text box must still map together to this overlay's destination.
  if(!fragments.some(f=>r.x>=f.sx-1e-6&&r.y>=f.sy-1e-6&&r.x+r.width<=f.sx+f.width+1e-6&&r.y+r.height<=f.sy+f.height+1e-6&&Math.abs(f.x+r.x-f.sx-position.x)<1e-6&&Math.abs(f.y+r.y-f.sy-position.y)<1e-6))continue;
  // Native text is painted with the source, below editor overlays. Preserve the
  // requested z-order if a preceding edit paints/masks over this source field.
  const target={x:position.x-2,y:position.y-2,width:position.width+4,height:position.height+4};
  const touches=(a:{x:number;y:number;width:number;height:number})=>a.x<target.x+target.width&&a.x+a.width>target.x&&a.y<target.y+target.height&&a.y+a.height>target.y;
  if(page.layers.slice(0,index).some(other=>{
   if((!other.deleted&&other.text.trim()||['image','shape','whiteout','note','stamp'].includes(other.kind))&&touches(other))return true;
   if(other.original&&other.maskOriginal!==false){const mask=mapSourceTextRect(other.original,page.rowEdits??[],sourceStyle(other)?.baseline);return !mask||touches(mask);}
   return false;
  }))continue;
  edits.push({id:l.id,expectedText:r.text,text,x:r.x,baseline:page.height-r.y-s.baseline,fontSize:s.fontSize,fontLabel:s.run.fontLabel??'',color:s.color,bold:l.bold,italic:l.italic});
 }
 if(!edits.length)return Promise.resolve(undefined);
 const scope=page.layers.find(l=>l.id===edits[0].id)?.sourceText?.scope??'';
 return runNativeWorker(JSON.stringify([scope,page.sourceId,page.sourcePage,page.id]),{bytes,page:page.sourcePage-1,edits},signal);
}
