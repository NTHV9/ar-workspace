import {linkedVoucher,type VoucherBindings} from './linked-vouchers';
import {voucherKey,type VoucherField} from './voucher-metadata';
import {createReplacementLayer,measureLayerText} from './source-text';
import {mapSourceTextRect} from './row-layout';
import {applyFlowEdit,sourceBandIsEmpty} from './flow';
import {reflowRightHeader,type HeaderInk} from './right-header';
import type {DetectedText,PdfProject} from './types';

/** All linked pages are updated atomically; Statements retain their table-row flow. */
export function editLinkedVoucher(project:PdfProject,field:VoucherField,text:string,bindings:VoucherBindings,sourceRuns:Map<string,DetectedText[]>,headerInk:Map<string,HeaderInk>=new Map()):PdfProject{
 return {...project,pages:project.pages.map(page=>{
  const key=`${page.sourceId}:${page.sourcePage}`,f=bindings.get(key)?.find(v=>voucherKey(v)===voucherKey(field));if(!f)return page;
  const runs=sourceRuns.get(key);if(!runs)throw Error('Wait for the linked PDF pages to finish loading.');
  const run=runs.find(r=>r.field==='voucher-number'&&Math.abs(r.x-f.x)<.01&&Math.abs(r.y-f.y)<.01);if(!run)throw Error('The linked Voucher field could not be verified.');
  const position=mapSourceTextRect(run,page.rowEdits??[],f.fontSize*.85);if(!position)return page;
  const old=[...page.layers].reverse().find(l=>linkedVoucher(page,l,bindings)===f);
  const before=old??{...createReplacementLayer(run,crypto.randomUUID()),x:position.x,y:position.y};
  let next={...before,text,deleted:undefined,width:f.width};
  const metrics=measureLayerText(next);next={...next,height:Math.max(11,next.fontSize*1.25+1)+Math.max(0,metrics.lines.length-1)*next.fontSize*1.25};
  const base=old?page:{...page,layers:[...page.layers,before]};
  let changed=reflowRightHeader(base,before,next,runs,headerInk.get(key));
  if(!changed){
   next={...next,height:Math.max(f.height,next.height)};changed=base;const delta=next.height-before.height;
   if(delta>.1){const at=before.textFlow?before.textFlow.at+before.textFlow.height:before.y+before.height;changed=applyFlowEdit(base,{id:crypto.randomUUID(),kind:'insert',y:at,height:delta},[before.id]);next={...next,textFlow:{at:before.textFlow?.at??at,height:(before.textFlow?.height??0)+delta}};}
   else if(delta<-.1&&before.textFlow){const remove=Math.min(-delta,before.textFlow.height),at=before.textFlow.at+before.textFlow.height-remove;if(sourceBandIsEmpty(base,at,remove)){changed=applyFlowEdit(base,{id:crypto.randomUUID(),kind:'delete',y:at,height:remove},[before.id]);next={...next,textFlow:before.textFlow.height-remove>.1?{at:before.textFlow.at,height:before.textFlow.height-remove}:undefined};}}
   if(f.align==='center'){next.width=Math.max(8,Math.min(f.width,metrics.naturalWidth||f.width));next.x=position.x+(f.width-next.width)/2;}
  }
  return {...changed,layers:changed.layers.map(l=>l.id===before.id?next:l)};
 })};
}
