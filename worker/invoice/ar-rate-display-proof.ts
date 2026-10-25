import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import type {InvoicePacket} from './model';

export interface ArRateDisplayHeader {ratePlanCode:string;before:unknown;after:unknown}
export interface ArRateDisplayProof {version:1;kind:'kat-current-ar-english-rate-display'|'current-ar-english-rate-display';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;reservationBefore:unknown;reservationAfter:unknown;headers:ArRateDisplayHeader[]}
export interface ArRateDisplayBinding {postingId:string;date:string;transactionCode:string;ratePlanCode:string}
// Property report policies are qualified against actual native controls. This
// selects a report profile, never a rate-code or invoice exception. TSAN's
// routed wrappers stay outside its qualified domain, regardless of rate code.
export const qualifiedArRateDisplayHotel=(hotel:string)=>['KAT','TLFO','TLKL','TSK','WAKL','TSAN'].includes(hotel);
const fail=():never=>{throw Error('document_invoice_ar_rate_display_unverified');};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
const rows=(value:unknown)=>{if(!Array.isArray(value)||value.length>4000)return fail();return value.map(object);};
const text=(value:unknown,max=2000)=>{if(value===undefined)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))return fail();return value.trim();};
const id=(value:unknown)=>{const result=typeof value==='number'&&Number.isSafeInteger(value)?String(value):text(value,16);return /^[1-9][0-9]{0,15}$/.test(result)?result:fail();};
const code=(value:unknown)=>{const result=text(value,20);return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/.test(result)?result:fail();};
const date=(value:unknown)=>{const result=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(Date.parse(result+'T00:00:00Z'))||new Date(result+'T00:00:00Z').toISOString().slice(0,10)!==result)return fail();return result;};
export function arRateDisplayReservationSource(packet:InvoicePacket,raw:unknown){
 const m=packet.manifest,container=object(object(raw).reservations),reservations=rows(container.reservation);
 if(!qualifiedArRateDisplayHotel(m.hotel)||!m.reservation_id||container.hasMore===true||reservations.length!==1)return fail();
 const reservation=reservations[0],identities=rows(reservation.reservationIdList).filter(row=>row.type==='Reservation');
 if(reservation.hotelId!==m.hotel||identities.length!==1||id(identities[0].id)!==m.reservation_id)return fail();
 return rows(object(reservation.roomStay).roomRates).map(rate=>{const start=date(rate.start),end=date(rate.end);if(start>end)return fail();return {start,end,ratePlanCode:code(rate.ratePlanCode)};});
}
const deferredRoutedWrapper=(hotel:string,selected:Record<string,unknown>,source:Record<string,unknown>)=>hotel==='TSAN'&&[selected.reference,source.reference].some(value=>/\bRouted\s+From\b/i.test(text(value)));
/** Partial TSAN qualification retains an internal gap for routed wrappers. */
export function arRateDisplayHasDeferredRoutedWrappers(packet:InvoicePacket):boolean{
 if(packet.manifest.hotel!=='TSAN')return false;
 const selected=rows(object(packet.postings).invoicePostingsDetails),sources=packet.taxRows.map(entry=>object(object(entry).posting));
 return selected.some(row=>sources.some(source=>source.transactionType==='Wrapper'&&id(source.transactionNo)===id(row.transactionNo)&&deferredRoutedWrapper(packet.manifest.hotel,row,source)));
}
/** Discovery uses actual reservation dates and selected AR/source identity only.
 * It never selects a rate code by its description or by native PDF content. */
export function inspectArRateDisplayBindings(packet:InvoicePacket,reservation:unknown):ArRateDisplayBinding[]{
 if(!qualifiedArRateDisplayHotel(packet.manifest.hotel)||'nativeTaxControls'in packet||packet.arTransfer)return fail();
 const rates=arRateDisplayReservationSource(packet,reservation),selected=rows(object(packet.postings).invoicePostingsDetails),sources=packet.taxRows.map(entry=>object(object(entry).posting));
 const seen=new Set<string>(),bindings:ArRateDisplayBinding[]=[];
 for(const row of selected){
  const postingId=id(row.transactionNo);if(seen.has(postingId))return fail();seen.add(postingId);
  const matches=sources.filter(source=>id(source.transactionNo)===postingId);if(matches.length>1)return fail();if(!matches.length||matches[0].transactionType!=='Wrapper')continue;
  const source=matches[0],day=date(row.transactionDate),transactionCode=code(row.transactionCode);
  if(source.hotelId!==packet.manifest.hotel||id(object(object(source.guestInfo).reservationId).id)!==packet.manifest.reservation_id||String(source.folioNo)!==packet.manifest.folio_no||date(source.transactionDate)!==day||code(source.transactionCode)!==transactionCode)return fail();
  if(deferredRoutedWrapper(packet.manifest.hotel,row,source))continue;
  const actual=rates.filter(rate=>rate.start<=day&&day<=rate.end);if(actual.length!==1)return fail();
  bindings.push({postingId,date:day,transactionCode,ratePlanCode:actual[0].ratePlanCode});
 }
 if(!bindings.length||bindings.length>1000||new Set(bindings.map(binding=>binding.ratePlanCode)).size>20)return fail();
 return bindings;
}
function defaultEnglishText(raw:unknown):string{
 if(raw===undefined)return '';
 const value=object(raw),defaultText=text(value.defaultText);
 // No language selector is present in this empirically qualified English
 // profile. Nonempty translations require a separately proven resolver.
 if(value.translatedTexts!==undefined&&rows(value.translatedTexts).some(row=>{text(row.language,20);return !!text(row.value);}))return fail();
 return defaultText;
}
function headerDescription(raw:unknown,hotel:string,ratePlanCode:string,transactionCode:string){
 const headers=rows(object(raw).ratePlans);if(headers.length!==1)return fail();const header=headers[0];
 if(header.hotelId!==hotel||header.ratePlanCode!==ratePlanCode)return fail();
 const details=object(header.transactionDetails);if(details.packageTransactionCode!==transactionCode)return fail();
 const explicit=defaultEnglishText(details.folioText);
 return explicit||defaultEnglishText(object(header.primaryDetails).description)||fail();
}
/** Property-qualified current-AR English empirical policy: explicit folio
 * default, otherwise the primary default. Each property has source-bound
 * native controls; TSAN's domain excludes explicitly routed wrappers only.
 * This is not a universal Oracle precedence contract or tax proof. */
export function verifyArRateDisplayProof(packet:InvoicePacket,proof:ArRateDisplayProof):Map<string,string>{
 if(!proof||proof.version!==1||!['kat-current-ar-english-rate-display','current-ar-english-rate-display'].includes(proof.kind)||proof.kind==='kat-current-ar-english-rate-display'&&packet.manifest.hotel!=='KAT')return fail();
 const current=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==current||canonical(proof.sourceAfter)!==current)return fail();
 const bindings=inspectArRateDisplayBindings(packet,proof.reservationBefore),after=inspectArRateDisplayBindings(packet,proof.reservationAfter);
 if(canonical(bindings)!==canonical(after)||canonical(arRateDisplayReservationSource(packet,proof.reservationBefore))!==canonical(arRateDisplayReservationSource(packet,proof.reservationAfter)))return fail();
 const codes=new Set(bindings.map(binding=>binding.ratePlanCode));if(!Array.isArray(proof.headers)||proof.headers.length!==codes.size)return fail();
 const headers=new Map<string,ArRateDisplayHeader>();for(const header of proof.headers){if(!codes.has(header.ratePlanCode)||headers.has(header.ratePlanCode)||canonical(header.before)!==canonical(header.after))return fail();headers.set(header.ratePlanCode,header);}
 const result=new Map<string,string>();for(const binding of bindings){const header=headers.get(binding.ratePlanCode)??fail();result.set(binding.postingId,headerDescription(header.before,packet.manifest.hotel,binding.ratePlanCode,binding.transactionCode));}
 return result;
}
