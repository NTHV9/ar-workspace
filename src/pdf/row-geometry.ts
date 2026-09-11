import {mapSourceTextRect} from './row-layout';
import {createReplacementLayer,measureLayerText,sourceEditingStyle} from './source-text';
import type {DetectedText,PdfLayer,PdfProjectPage} from './types';

export function rowGeometry(page:PdfProjectPage,layer:PdfLayer,runs:DetectedText[]){
 const shown=runs.flatMap(run=>{const rect=mapSourceTextRect(run,page.rowEdits??[],run.fontSize*.72);return rect?[{run,rect}]:[];});
 const baseline=layer.y+sourceEditingStyle(layer).baseline,tolerance=Math.max(2,layer.fontSize*.35);
 const cells=shown.filter(({rect,run})=>Math.abs(rect.y+run.fontSize*.72-baseline)<tolerance);
 const members=page.layers.filter(l=>l.id===layer.id||Math.abs(l.y+sourceEditingStyle(l).baseline-baseline)<tolerance&&(!layer.tableRow||l.tableRow===layer.tableRow));
 const top=Math.max(0,Math.min(layer.y,...cells.map(c=>c.rect.y),...members.map(l=>l.y))-.1);
 const lower=[...shown.filter(c=>!cells.includes(c)).map(c=>c.rect.y),...page.layers.filter(l=>!members.includes(l)).map(l=>l.y)].filter(y=>y>baseline+layer.fontSize*.2).sort((a,b)=>a-b)[0];
 const previous=shown.map(c=>c.rect.y+c.run.fontSize*.72).filter(y=>y<baseline-layer.fontSize*.7).sort((a,b)=>b-a)[0];
 const guessed=previous===undefined?layer.fontSize*1.25:baseline-previous;
 const spacing=Math.max(layer.fontSize,Math.min(layer.fontSize*1.5,guessed));
 const inkBottom=Math.max(layer.y+measureLayerText(layer).height,...cells.map(c=>c.rect.y+measureLayerText(createReplacementLayer(c.run,'measure')).height),...members.map(l=>l.y+measureLayerText(l).height));
 const end=lower!==undefined&&lower-top<inkBottom-top+spacing*1.5?lower-.1:Math.max(inkBottom+.2,top+spacing);
 return {shown,cells,members,top,end,height:Math.max(.5,end-top),spacing};
}
