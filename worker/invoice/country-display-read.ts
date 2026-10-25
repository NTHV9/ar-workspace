import {OperaError,type OperaReader} from '../opera/client';
import {canonical} from './ar-tax';
import {countryDisplayAccountSource,countryDisplayCode,verifyArCountryDisplayProof,type ArCountryDisplayProof} from './country-display-proof';
import type {InvoicePacket} from './model';
type Reader=Partial<Pick<OperaReader,'invoiceCountryDisplayMetadata'>>;
export interface CountryDisplayReadResult {proof?:ArCountryDisplayProof;gap?:'country-display-profile'|'country-display-capability'|'country-display-provider'|'country-display-evidence'}
export interface CountryDisplayRead {finish:(fresh:InvoicePacket)=>Promise<CountryDisplayReadResult>}
const changed=():never=>{throw Error('document_source_changed');};
const gapFor=(error:unknown):CountryDisplayReadResult['gap']=>error instanceof OperaError?'country-display-provider':'country-display-evidence';
export async function beginArCountryDisplayRead(reader:Reader,initial:InvoicePacket):Promise<CountryDisplayRead>{
 const sourceBefore=structuredClone(countryDisplayAccountSource(initial)),code=countryDisplayCode(sourceBefore);let metadataBefore:unknown,gap:CountryDisplayReadResult['gap'];
 if(!code)gap='country-display-profile';else if(!reader.invoiceCountryDisplayMetadata)gap='country-display-capability';else try{metadataBefore=structuredClone(await reader.invoiceCountryDisplayMetadata([code]));verifyArCountryDisplayProof(initial,{version:1,kind:'ar-property-country-name-display',hotel:initial.manifest.hotel,countryCode:code,sourceBefore,sourceAfter:sourceBefore,metadataBefore,metadataAfter:metadataBefore});}catch(error){gap=gapFor(error);}
 let finished=false;return {finish:async fresh=>{
  if(finished)return changed();finished=true;let sourceAfter:typeof sourceBefore;try{sourceAfter=countryDisplayAccountSource(fresh);}catch{return changed();}if(canonical(sourceBefore)!==canonical(sourceAfter))return changed();if(gap)return {gap};
  let metadataAfter:unknown;try{metadataAfter=structuredClone(await reader.invoiceCountryDisplayMetadata!([code!]));}catch(error){return {gap:gapFor(error)};}if(canonical(metadataBefore)!==canonical(metadataAfter))return changed();const proof:ArCountryDisplayProof={version:1,kind:'ar-property-country-name-display',hotel:fresh.manifest.hotel,countryCode:code!,sourceBefore,sourceAfter,metadataBefore,metadataAfter};try{verifyArCountryDisplayProof(fresh,proof);return {proof};}catch{return changed();}
 }};
}
