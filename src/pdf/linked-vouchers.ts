import type {DetectedText,PdfLayer,PdfProject,PdfProjectPage} from './types';
import {createReplacementLayer,measureLayerText,registerSourceStyle,sourceStyle} from './source-text';
import {mapSourceTextRect} from './row-layout';
import {voucherKey,type VoucherField} from './voucher-metadata';
export type VoucherBindings=Map<string,VoucherField[]>;
const matches=(layer:PdfLayer,f:VoucherField)=>!!layer.original&&Math.abs(layer.original.x-f.x)<.01&&Math.abs(layer.original.y-f.y)<.01&&Math.abs(layer.original.width-f.width)<.01;
export const linkedVoucher=(page:PdfProjectPage,layer:PdfLayer,bindings:VoucherBindings)=>(bindings.get(`${page.sourceId}:${page.sourcePage}`)??[]).find(f=>matches(layer,f));
const run=(f:VoucherField):DetectedText=>({...f,rotated:false,color:'#000000',field:'voucher-number',fontLabel:f.bold?'Arial Bold':'Arial'});
export function voucherRuns(runs:DetectedText[],fields:VoucherField[]):DetectedText[]{
 if(!fields.length)return runs;
 let index=Math.max(-1,...runs.map(r=>r.sourceText?.runIndex??-1))+1;
 // Text boxes can overlap the next compact header line; glyph baselines own rows.
 const inside=(r:DetectedText,f:VoucherField)=>{const baseline=r.y+(sourceStyle(createReplacementLayer(r,'voucher-row'))?.baseline??r.fontSize*.85);return r.x>=f.x-.5&&r.x+r.width<=f.x+f.width+1&&baseline>=f.y&&baseline<f.y+f.height;};
 const result=runs.filter(r=>!fields.some(f=>inside(r,f)));
 for(const f of fields){
  const r=run(f),base=runs.find(r=>inside(r,f)&&r.sourceText)??runs.filter(r=>!r.rotated&&r.sourceText&&Math.abs(r.fontSize-f.fontSize)<.1&&!!r.bold===f.bold).sort((a,b)=>Math.abs(a.y-f.y)-Math.abs(b.y-f.y))[0];
  const style=base?sourceStyle(createReplacementLayer(base,'voucher-style')):undefined;
  if(style&&base?.sourceText){r.sourceText={...base.sourceText,runIndex:index++};registerSourceStyle(r.sourceText,{...style,baseline:base.y+style.baseline-f.y,run:r,sequence:[...f.text].flatMap(c=>style.glyphs.get(c)?[style.glyphs.get(c)!]:[])});}
  result.push(r);
 }
 return result;
}
export function syncVouchers(before:PdfProject,next:PdfProject,bindings:VoucherBindings):PdfProject{
 const changes=new Map<string,string>();
 const current=(page:PdfProjectPage,f:VoucherField)=>{const layer=[...page.layers].reverse().find(l=>matches(l,f));return layer?(layer.deleted?'':layer.text):f.text;};
 for(const page of next.pages){const prior=before.pages.find(p=>p.id===page.id);if(!prior)continue;
  for(const f of bindings.get(`${page.sourceId}:${page.sourcePage}`)??[]){if(!mapSourceTextRect(f,page.rowEdits??[],f.fontSize*.85))continue;const value=current(page,f);if(value===current(prior,f))continue;
   if(changes.has(voucherKey(f))&&changes.get(voucherKey(f))!==value)throw Error('Conflicting Voucher edits. Undo and edit one field at a time.');changes.set(voucherKey(f),value);
  }
 }
 if(!changes.size)return next;
 return {...next,pages:next.pages.map(page=>{
  let layers=page.layers;
  for(const f of bindings.get(`${page.sourceId}:${page.sourcePage}`)??[]){const text=changes.get(voucherKey(f));if(text===undefined)continue;
   const position=mapSourceTextRect(f,page.rowEdits??[],f.fontSize*.85);if(!position)continue;
   const old=[...layers].reverse().find(l=>matches(l,f));let layer=createReplacementLayer(run(f),old?.id??crypto.randomUUID());
   layer={...layer,x:position.x,y:position.y,text,height:Math.max(12,f.height)};
   while(layer.fontSize>5&&measureLayerText(layer).naturalWidth>f.width)layer.fontSize-=.25;
   const size=measureLayerText(layer);if(size.width>f.width+.1||size.height>layer.height+.1)throw Error('Voucher is too long for this field.');
   layer.width=Math.max(8,Math.min(f.width,size.naturalWidth||f.width));layer.x=position.x+(f.align==='center'?(f.width-layer.width)/2:0);
   layers=[...layers.filter(l=>!matches(l,f)),layer];
  }
  return layers===page.layers?page:{...page,layers};
 })};
}
