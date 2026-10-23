import {OperaError,type OperaReader} from '../opera/client';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {arPosDisplayContexts,inspectPosDisplayPages,inspectPosDisplayMembership,posDisplayPageView,type ArPosDisplayProof,type PosDisplayContext} from './pos-display-proof';
import type {InvoicePacket} from './model';
type ReadPort=(reservationId:string,window:number,offset:number,limit:number)=>Promise<unknown>;
type Reader=Partial<Pick<OperaReader,'invoicePosDisplayFolios'>>;
export interface ArPosDisplayReadResult {proof?:ArPosDisplayProof;gap?:'pos-display-profile'|'pos-display-capability'|'pos-display-provider'|'pos-display-evidence'}
export interface ArPosDisplayRead {finish:(fresh:InvoicePacket)=>Promise<ArPosDisplayReadResult>}
const changed=():never=>{throw Error('document_source_changed');};
const fail=():never=>{throw Error('document_invoice_ar_pos_display_unverified');};
const gap=(reason:ArPosDisplayReadResult['gap']):ArPosDisplayRead=>({finish:async()=>({gap:reason})});
const gapFor=(error:unknown):ArPosDisplayReadResult['gap']=>error instanceof OperaError?'pos-display-provider':'pos-display-evidence';
/** Bounded fixed-selector collector. No URL following or financial qualification.
 * Provider offset is the next cursor and totalResults excludes expanded children. */
export async function readPosDisplayPages(read:ReadPort,context:PosDisplayContext):Promise<unknown[]>{
 const pages:unknown[]=[];let offset=0,pageCount:number|undefined,totalResults:number|undefined;
 for(let index=0;index<20;index++){
  const page=structuredClone(await read(context.reservationId,context.folioWindowNo,offset,200)),view=posDisplayPageView(context,page,index);
  if(pageCount!==undefined&&(view.pageCount!==pageCount||view.totalResults!==totalResults))return fail();pageCount=view.pageCount;totalResults=view.totalResults;pages.push(page);
  if(pages.length===pageCount){inspectPosDisplayPages(context,pages);return pages;}offset=view.nextOffset;
 }
 return fail();
}
/** Reads metadata on both sides of the caller's existing AR financial fence.
 * No cross-invoice cache or duplicate financial fetch is created here. */
export async function beginArPosDisplayRead(reader:Reader,packet:InvoicePacket):Promise<ArPosDisplayRead>{
 if(!reader.invoicePosDisplayFolios)return gap('pos-display-capability');
 const read=reader.invoicePosDisplayFolios.bind(reader),sourceBefore=structuredClone(arOnlyTaxSource(packet));let contexts:PosDisplayContext[],before:unknown[][];
 try{
  contexts=arPosDisplayContexts(packet);if(!contexts.length)return gap('pos-display-profile');before=[];
  for(const context of contexts)before.push(await readPosDisplayPages(read,context));
  inspectPosDisplayMembership(packet,contexts.map((context,index)=>({...context,pages:before[index]})));
 }catch(error){return gap(gapFor(error));}
 let finished=false;
 return {finish:async fresh=>{
  if(finished)return changed();finished=true;const sourceAfter=structuredClone(arOnlyTaxSource(fresh));if(canonical(sourceBefore)!==canonical(sourceAfter))return changed();
  const after:unknown[][]=[];
  try{
   if(canonical(contexts)!==canonical(arPosDisplayContexts(fresh)))return changed();
   for(const context of contexts)after.push(await readPosDisplayPages(read,context));
   inspectPosDisplayMembership(fresh,contexts.map((context,index)=>({...context,pages:after[index]})));
  }catch(error){if(error instanceof OperaError)return {gap:gapFor(error)};return changed();}
  if(canonical(before)!==canonical(after))return changed();
  return {proof:{version:1,kind:'ar-pos-checkno-source-display',sourceBefore,sourceAfter,contexts:contexts.map((context,index)=>({...context,before:before[index],after:after[index]}))}};
 }};
}
