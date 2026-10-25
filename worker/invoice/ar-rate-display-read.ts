import {OperaError,type OperaReader} from '../opera/client';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {qualifiedArRateDisplayHotel,arRateDisplayHasDeferredRoutedWrappers,arRateDisplayReservationSource,inspectArRateDisplayBindings,verifyArRateDisplayProof,type ArRateDisplayProof} from './ar-rate-display-proof';
import type {InvoicePacket} from './model';

type Reader=Pick<OperaReader,'invoiceReservation'>&Partial<Pick<OperaReader,'invoiceRatePlanFolioText'>>;
export interface ArRateDisplayResult {proof?:ArRateDisplayProof;gap?:'rate-display-profile'|'rate-display-capability'|'rate-display-evidence'|'rate-display-provider'}
export interface ArRateDisplayRead {finish:(fresh:InvoicePacket)=>Promise<ArRateDisplayResult>}
const gap=(reason:ArRateDisplayResult['gap']):ArRateDisplayRead=>({finish:async()=>({gap:reason})});
const changed=():never=>{throw Error('document_source_changed');};
const evidenceGap=(error:unknown):ArRateDisplayResult=>({gap:error instanceof OperaError?'rate-display-provider':'rate-display-evidence'});
/** Begin before the caller's existing financial source fence, finish after it.
 * Each rate header is read once per phase, never cached between invoices.
 * Missing display evidence preserves the existing descriptor; source mutation
 * still rejects the attempted invoice rather than crossing a stale fence. */
export async function beginArRateDisplayRead(reader:Reader,packet:InvoicePacket):Promise<ArRateDisplayRead>{
 if(!qualifiedArRateDisplayHotel(packet.manifest.hotel))return gap('rate-display-profile');
 if(!reader.invoiceRatePlanFolioText)return gap('rate-display-capability');
 const readHeader=reader.invoiceRatePlanFolioText.bind(reader),sourceBefore=structuredClone(arOnlyTaxSource(packet));
 let reservationBefore:unknown,reservationSource:unknown,codes:string[],headers:Map<string,unknown>;
 try{
  reservationBefore=structuredClone(await reader.invoiceReservation(packet.manifest.reservation_id!));
  const bindings=inspectArRateDisplayBindings(packet,reservationBefore);reservationSource=arRateDisplayReservationSource(packet,reservationBefore);
  codes=[...new Set(bindings.map(binding=>binding.ratePlanCode))].sort();headers=new Map();
  for(const code of codes)headers.set(code,structuredClone(await readHeader(code)));
 }catch(error){return gap(evidenceGap(error).gap);}
 let finished=false;
 return {finish:async fresh=>{
  if(finished)return changed();finished=true;
  const sourceAfter=structuredClone(arOnlyTaxSource(fresh));if(canonical(sourceBefore)!==canonical(sourceAfter))return changed();
  let reservationAfter:unknown,afterHeaders:Map<string,unknown>;
  try{
   reservationAfter=structuredClone(await reader.invoiceReservation(fresh.manifest.reservation_id!));
   let afterSource:unknown;try{afterSource=arRateDisplayReservationSource(fresh,reservationAfter);inspectArRateDisplayBindings(fresh,reservationAfter);}catch{return changed();}
   if(canonical(reservationSource)!==canonical(afterSource))return changed();
   afterHeaders=new Map();for(const code of codes)afterHeaders.set(code,structuredClone(await readHeader(code)));
  }catch(error){if(error instanceof Error&&error.message==='document_source_changed')throw error;return evidenceGap(error);}
  for(const code of codes)if(canonical(headers.get(code))!==canonical(afterHeaders.get(code)))return changed();
  const proof:ArRateDisplayProof={version:1,kind:packet.manifest.hotel==='KAT'?'kat-current-ar-english-rate-display':'current-ar-english-rate-display',sourceBefore,sourceAfter,reservationBefore,reservationAfter,headers:codes.map(ratePlanCode=>({ratePlanCode,before:headers.get(ratePlanCode),after:afterHeaders.get(ratePlanCode)}))};
  try{verifyArRateDisplayProof(fresh,proof);return {proof,...arRateDisplayHasDeferredRoutedWrappers(fresh)?{gap:'rate-display-evidence' as const}:{}};}catch(error){return evidenceGap(error);}
 }};
}
