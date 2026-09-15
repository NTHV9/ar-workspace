import {createReplacementLayer,registerSourceStyle,sourceStyle} from './source-text';
import type {DetectedText,PdfProjectPage} from './types';

const label=(run:DetectedText,pattern:RegExp)=>!run.rotated&&pattern.test(run.text.trim());
const sameRow=(a:DetectedText,b:DetectedText)=>Math.abs(a.y-b.y)<Math.max(a.fontSize,b.fontSize)*.65;
/** OPERA's header can omit the Voucher value entirely. Its adjacent Folio value
 * supplies the native numeric face; paired colons preserve the value baseline. */
export function voucherFields(page:PdfProjectPage,runs:DetectedText[]):DetectedText[]{
 const result=[...runs];let nextIndex=Math.max(-1,...runs.map(r=>r.sourceText?.runIndex??-1))+1;
 for(const voucher of runs.filter(r=>label(r,/^Voucher\s+No\.?$/i))){
  if(voucher.y>page.height*.5||!runs.some(r=>label(r,/^COPY\s+OF\s+INVOICE$/i)&&r.y<voucher.y&&voucher.y-r.y<60&&Math.abs(r.x-voucher.x)<10))continue;
  const folios=runs.filter(r=>label(r,/^Folio\s+No\.?$/i)&&r.y>voucher.y&&r.y-voucher.y<110&&Math.abs(r.x-voucher.x)<3);
  if(folios.length!==1)continue;const folio=folios[0];
  const values=runs.filter(r=>!r.rotated&&/^\d+$/.test(r.text.trim())&&r.x>folio.x+folio.width+5&&sameRow(r,folio));
  if(values.length!==1)continue;const value=values[0];
  const existing=runs.filter(r=>r!==voucher&&!r.rotated&&r.text.trim()&&r.x>=value.x-2&&sameRow(r,voucher));
  if(existing.length){const first=existing.sort((a,b)=>a.x-b.x)[0];result[result.indexOf(first)]={...first,field:'voucher-number'};continue;}
  const colon=(anchor:DetectedText)=>runs.filter(r=>label(r,/^[:：]$/)&&r.x>anchor.x+anchor.width&&r.x<value.x&&sameRow(r,anchor));
  const voucherColons=colon(voucher),folioColons=colon(folio);
  if(voucherColons.length!==1||folioColons.length!==1||Math.abs(voucherColons[0].x-folioColons[0].x)>2)continue;
  const style=sourceStyle(createReplacementLayer(value,'voucher-style'));
  if(!style||!value.sourceText||nextIndex>1_000_000)continue;
  const width=Math.min(100,page.width-value.x-12);
  const y=Number((voucherColons[0].y+value.y-folioColons[0].y).toFixed(6));
  if(width<value.fontSize*4||y<0||y+value.height>page.height)continue;
  const ref={...value.sourceText,runIndex:nextIndex++};
  const field:DetectedText={...value,text:'',x:value.x,y,width,maskOriginal:false,field:'voucher-number',sourceText:ref};
  registerSourceStyle(ref,{...style,run:field,sequence:[]});result.push(field);
 }
 return result;
}
