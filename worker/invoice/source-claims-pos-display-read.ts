import {OperaError,type OperaReader} from '../opera/client';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {discoverSourceClaimsPosDisplayContexts} from './ar-only-source-claims-read';
import {arPosDisplayContexts,inspectPosDisplayMembership,type PosDisplayContext,type PosDisplayRegion} from './pos-display-proof';
import {readPosDisplayPages,type ArPosDisplayReadResult} from './pos-display-read';
import type {InvoicePacket} from './model';
type Reader=Partial<Pick<OperaReader,'invoicePosDisplayFolios'>>;
export interface SourceClaimsPosDisplayRead {finish:(fresh:InvoicePacket,region:PosDisplayRegion)=>Promise<ArPosDisplayReadResult>}
const changed=():never=>{throw Error('document_source_changed');};
const gapFor=(error:unknown):ArPosDisplayReadResult['gap']=>error instanceof OperaError?'pos-display-provider':'pos-display-evidence';
const gap=(reason:ArPosDisplayReadResult['gap']):SourceClaimsPosDisplayRead=>({finish:async()=>({gap:reason})});
/** Before finance this plans read scopes and checks metadata's own closure.
 * It cannot mint exclusions or certify membership. The final financial owner
 * supplies an opaque source-bound POS region after the existing fresh read. */
export async function beginArSourceClaimsPosDisplayRead(reader:Reader,initial:InvoicePacket):Promise<SourceClaimsPosDisplayRead>{
 const sourceBefore=structuredClone(arOnlyTaxSource(initial));let contexts:PosDisplayContext[];
 try{contexts=discoverSourceClaimsPosDisplayContexts(initial);}catch(error){return gap(gapFor(error));}
 if(!contexts.length)return gap('pos-display-profile');if(!reader.invoicePosDisplayFolios)return gap('pos-display-capability');
 const read=reader.invoicePosDisplayFolios.bind(reader),before:unknown[][]=[];
 try{for(const context of contexts)before.push(await readPosDisplayPages(read,context));}catch(error){return gap(gapFor(error));}
 let finished=false;
 return {finish:async(fresh,region)=>{
  if(finished)return changed();finished=true;const sourceAfter=structuredClone(arOnlyTaxSource(fresh));if(canonical(sourceBefore)!==canonical(sourceAfter))return changed();
  let actual:PosDisplayContext[];try{actual=arPosDisplayContexts(fresh,region);}catch{return changed();}
  if(canonical(actual)!==canonical(contexts))return {gap:'pos-display-evidence'};
  try{inspectPosDisplayMembership(fresh,contexts.map((context,index)=>({...context,pages:before[index]})),region);}catch{return {gap:'pos-display-evidence'};}
  const after:unknown[][]=[];
  try{for(const context of contexts)after.push(await readPosDisplayPages(read,context));inspectPosDisplayMembership(fresh,contexts.map((context,index)=>({...context,pages:after[index]})),region);}
  catch(error){if(error instanceof OperaError)return {gap:gapFor(error)};return changed();}
  if(canonical(before)!==canonical(after))return changed();
  return {proof:{version:1,kind:'ar-pos-checkno-source-display',sourceBefore,sourceAfter,contexts:contexts.map((context,index)=>({...context,before:before[index],after:after[index]}))}};
 }};
}
