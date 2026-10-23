import {OperaError,type OperaReader} from '../opera/client';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import type {InvoicePacket} from './model';
import type {PosDisplayContext} from './pos-display-proof';
import {readPosDisplayPages} from './pos-display-read';
import {discoverEmbeddedCancellationContexts,inspectEmbeddedCancellationMembership,verifyArEmbeddedCancellationDisplayProof,type ArEmbeddedCancellationDisplayProof} from './embedded-cancellation-display-proof';
export interface EmbeddedCancellationDisplayReadResult {proof?:ArEmbeddedCancellationDisplayProof;gap?:'embedded-cancellation-profile'|'embedded-cancellation-capability'|'embedded-cancellation-evidence'|'embedded-cancellation-provider'}
export interface EmbeddedCancellationDisplayRead {finish:(fresh:InvoicePacket)=>Promise<EmbeddedCancellationDisplayReadResult>}
const changed=():never=>{throw Error('document_source_changed');};
const gap=(reason:EmbeddedCancellationDisplayReadResult['gap']):EmbeddedCancellationDisplayRead=>({finish:async()=>({gap:reason})});
const reason=(error:unknown):EmbeddedCancellationDisplayReadResult['gap']=>error instanceof OperaError?'embedded-cancellation-provider':'embedded-cancellation-evidence';
/** Source-only discovery grants read scopes, never financial admission. */
export async function beginEmbeddedCancellationDisplayRead(reader:Partial<Pick<OperaReader,'invoicePosDisplayFolios'>>,initial:InvoicePacket):Promise<EmbeddedCancellationDisplayRead>{
 const sourceBefore=structuredClone(arOnlyTaxSource(initial));let contexts:PosDisplayContext[];try{contexts=discoverEmbeddedCancellationContexts(initial);}catch(error){return gap(reason(error));}if(!contexts.length)return gap('embedded-cancellation-profile');if(!reader.invoicePosDisplayFolios)return gap('embedded-cancellation-capability');const read=reader.invoicePosDisplayFolios.bind(reader),before:unknown[][]=[];
 try{for(const context of contexts)before.push(await readPosDisplayPages(read,context));inspectEmbeddedCancellationMembership(initial,contexts.map((c,i)=>({...c,pages:before[i]})));}catch(error){return gap(reason(error));}
 let finished=false;return {finish:async fresh=>{
  if(finished)return changed();finished=true;const sourceAfter=structuredClone(arOnlyTaxSource(fresh));if(canonical(sourceBefore)!==canonical(sourceAfter))return changed();if(fresh.arOnlySourceClaimsProof?.version!==5)return {gap:'embedded-cancellation-profile'};
  if(canonical(contexts)!==canonical(discoverEmbeddedCancellationContexts(fresh)))return changed();const after:unknown[][]=[];try{for(const context of contexts)after.push(await readPosDisplayPages(read,context));inspectEmbeddedCancellationMembership(fresh,contexts.map((c,i)=>({...c,pages:after[i]})));}catch(error){if(error instanceof OperaError)return {gap:reason(error)};return changed();}if(canonical(before)!==canonical(after))return changed();const proof:ArEmbeddedCancellationDisplayProof={version:1,kind:'ar-selected-embedded-cancellation-display',sourceBefore,sourceAfter,contexts:contexts.map((c,i)=>({...c,before:before[i],after:after[i]}))};verifyArEmbeddedCancellationDisplayProof(fresh,proof);return {proof};
 }};
}
