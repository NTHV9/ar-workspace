import {mapSourceRect,mapSourceTextRect} from './row-layout';
import {createReplacementLayer,measureLayerText,sourceEditingStyle} from './source-text';
import type {DetectedText,PdfLayer,PdfProjectPage} from './types';
type Rect={x:number;y:number;width:number;height:number};

/** A table row can contain multiple physical text lines in one or more cells. */
export function rowGeometry(page:PdfProjectPage,layer:PdfLayer,runs:DetectedText[],barriers:Rect[]=[]){
 const shown=runs.flatMap(run=>{
  const style=sourceEditingStyle(createReplacementLayer(run,'measure'));
  const rect=mapSourceTextRect(run,page.rowEdits??[],style.baseline);
  return rect?[{run,rect,baseline:rect.y+style.baseline}]:[];
 });
 const baseline=layer.y+sourceEditingStyle(layer).baseline,tolerance=Math.max(1,layer.fontSize*.25);
 const bands:typeof shown[]=[];
 for(const cell of [...shown].sort((a,b)=>a.baseline-b.baseline)){
  const last=bands.at(-1);if(last&&Math.abs(last[0].baseline-cell.baseline)<tolerance)last.push(cell);else bands.push([cell]);
 }
 const graphics=barriers.flatMap(rect=>{const mapped=mapSourceRect(rect,page.rowEdits??[]);return mapped?[mapped]:[];});
 const rowGraphics=graphics.filter(r=>r.width>Math.max(40,layer.width)&&r.height<page.height*.5);
 const cutBetween=(a:number,b:number)=>rowGraphics.some(r=>r.y>a+.1&&r.y<b-.1||r.y+r.height>a+.1&&r.y+r.height<b-.1);
 let index=bands.findIndex(b=>Math.abs(b[0].baseline-baseline)<tolerance);
 // A continuation has fewer columns, matches the source type, and stays under
 // the same column span. It must not jump over a rule or a filled header/total.
 const continues=(base:typeof shown,other:typeof shown)=>{
  if(base.length<2||!other.length||other.length>=base.length)return false;
  const baseY=base[0].baseline,otherY=other[0].baseline;
  if(otherY-baseY>Math.max(...base.map(c=>c.run.fontSize))*1.6||cutBetween(baseY,otherY))return false;
  const columns=[...base].sort((a,b)=>a.rect.x-b.rect.x);
  return other.every(c=>columns.some((b,i)=>{
   const left=i?Math.min(b.rect.x,columns[i-1].rect.x+columns[i-1].rect.width+2):b.rect.x;
   const right=columns[i+1]?.rect.x??b.rect.x+b.rect.width+6;
   return (i>0||columns.length<3)&&b.run.bold===c.run.bold&&Math.abs(b.run.fontSize-c.run.fontSize)<.1&&c.rect.x>=left-2&&c.rect.x+c.rect.width<=right-2;
  }));
 };
 if(!layer.tableRow&&index>0){
  for(let p=index-1;p>=0;p--){
   if(bands[index][0].baseline-bands[p][0].baseline>layer.fontSize*12)break;
   const base=bands[p];if(base.length<=bands[index].length)continue;
   if(bands.slice(p+1,index+1).every((b,n)=>continues(base.map(c=>({...c,baseline:bands[p+n][0].baseline})),b))){index=p;break;}
   break;
  }
 }
 const physical=index>=0&&!layer.tableRow?[bands[index]]:[];
 if(physical.length){
  for(let n=index+1;n<bands.length;n++){
   const prev=physical.at(-1)!;
   const shiftedBase=physical[0].map(c=>({...c,baseline:prev[0].baseline}));
   if(!continues(shiftedBase,bands[n]))break;
   physical.push(bands[n]);
  }
 }
 const cells=physical.flat();
 const firstBaseline=cells.length?Math.min(...cells.map(c=>c.baseline)):baseline;
 const lastBaseline=Math.max(baseline,...cells.map(c=>c.baseline));
 const members=page.layers.filter(l=>l.id===layer.id||(layer.tableRow?l.tableRow===layer.tableRow:l.y+sourceEditingStyle(l).baseline>=firstBaseline-tolerance&&l.y+sourceEditingStyle(l).baseline<=lastBaseline+tolerance));
 const visualTop=Math.min(layer.y,...cells.map(c=>c.rect.y),...members.map(l=>l.y));
 const inkBottom=Math.max(layer.y+measureLayerText(layer).height,...cells.map(c=>c.rect.y+measureLayerText(createReplacementLayer(c.run,'measure')).height),...members.map(l=>l.y+measureLayerText(l).height));
 const later=shown.filter(c=>!cells.includes(c)&&c.baseline>lastBaseline+tolerance);
 const nextTextTop=Math.min(Infinity,...later.map(c=>c.rect.y-.5),...page.layers.filter(l=>!members.includes(l)&&l.y>lastBaseline+tolerance).map(l=>l.y-.5));
 const nextRule=Math.min(Infinity,...rowGraphics.filter(r=>r.y>lastBaseline+.1).map(r=>r.y));
 const lower=Math.min(nextTextTop,nextRule);
 const previous=shown.filter(c=>!cells.includes(c)&&c.baseline<firstBaseline-tolerance);
 const previousInk=Math.max(0,...previous.map(c=>c.rect.y+measureLayerText(createReplacementLayer(c.run,'measure')).height),...rowGraphics.filter(r=>r.y+r.height<firstBaseline).map(r=>r.y+r.height));
 const top=Math.max(0,visualTop-layer.fontSize*.5,previousInk<visualTop-.5?(previousInk+visualTop-.5)/2:visualTop-.5);
 // Use the gap, never the next text box's top (which can cut through its ink),
 // and never the middle of a filled Balance Due rectangle.
 const end=Number.isFinite(lower)&&lower>inkBottom?(inkBottom+lower)/2:inkBottom+.5;
 const spacing=Math.max(layer.fontSize*1.25,end-top);
 return {shown,cells,template:physical[0]??[],members,top,end,height:Math.max(.5,end-top),spacing,firstBaseline,lastBaseline,separable:lower>inkBottom+.1};
}
