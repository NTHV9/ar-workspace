import {invoiceModel,type InvoicePacket} from './model';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {arOnlyPosGroupKey,type ArOnlyPosAtom} from './ar-only-pos-proof';
import {readVerifiedSourceClaimsPosRegion,type VerifiedSourceClaimsPosRegion} from './ar-only-source-claims';
import {amountCents} from '../opera/normalize';
type Row=Record<string,unknown>;
declare const displayMembershipBrand:unique symbol;
export interface VerifiedSourceClaimsDisplayMembership {readonly [displayMembershipBrand]:true}
export interface SourceClaimsDisplayMembershipView {atoms:ArOnlyPosAtom[];originalPosIds:string[];identities:Map<string,{role:'taxable'|'vat';signedCents:number}>;provenance:Map<string,'verified-pos'|'selected-embedded-revenue'>}
interface SavedMembership {source:string;financial:string;view:SourceClaimsDisplayMembershipView}
const registered=new WeakMap<VerifiedSourceClaimsDisplayMembership,SavedMembership>();
export class SourceClaimsDisplayMembershipUnsupported extends Error{constructor(){super('document_invoice_source_claims_display_membership_unverified');}}
const fail=():never=>{throw new SourceClaimsDisplayMembershipUnsupported();};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)&&v.length<=4000?v.map(object):fail();
const text=(v:unknown,max=2000)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)?v.trim():fail();
const id=(v:unknown)=>{const s=typeof v==='number'&&Number.isSafeInteger(v)?String(v):text(v,16);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const amount=(v:unknown)=>v===undefined?0:amountCents(v,'THB');
const columns=(p:Row)=>({debit:amount(p.debitAmount),credit:amount(p.creditAmount)});
const cashier=(p:Row)=>{const value=object(p.cashierInfo).cashierId;return Number.isSafeInteger(value)&&Number(value)>=0?Number(value):fail();};
export function sourceClaimsDisplayFinancialPacket(packet:InvoicePacket):InvoicePacket{
 const value={...packet};for(const key of ['arRateDisplayProof','arRateDisplayGap','arPosDisplayProof','arPosDisplayGap','arPaymentOffsetDisplayProof','arPaymentOffsetDisplayGap','arCountryDisplayProof','arCountryDisplayGap','arEmbeddedCancellationDisplayProof','arEmbeddedCancellationDisplayGap'] as const)delete value[key];return value;
}
function copy(view:SourceClaimsDisplayMembershipView):SourceClaimsDisplayMembershipView{return {atoms:structuredClone(view.atoms),originalPosIds:[...view.originalPosIds],identities:new Map([...view.identities].map(([key,v])=>[key,{...v}])),provenance:new Map(view.provenance)};}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
/** Display authority only. Revalidate the unchanged financial source first;
 * no caller roles, exclusions, source slices or replacement amounts exist. */
export function verifySourceClaimsDisplayMembership(packet:InvoicePacket,posRegion:VerifiedSourceClaimsPosRegion):VerifiedSourceClaimsDisplayMembership{
 const pos=readVerifiedSourceClaimsPosRegion(packet,posRegion),financial=sourceClaimsDisplayFinancialPacket(packet),model=invoiceModel(financial),m=packet.manifest,data=object(packet.postings),selected=rows(data.invoicePostingsDetails),entries=packet.taxRows.map(object),definitions=rows(data.trxCodesInfo),selectedIds=new Set<string>(),entryIds=new Set<string>();
 for(const s of selected){const key=id(s.transactionNo);if(selectedIds.has(key))return fail();selectedIds.add(key);}for(const e of entries){const key=id(object(e.posting).transactionNo);if(entryIds.has(key))return fail();entryIds.add(key);}
 const atoms=[...pos.atoms],posIds=new Set(atoms.map(a=>a.id)),groups=new Set(atoms.map(a=>a.group)),provenance=new Map<string,'verified-pos'|'selected-embedded-revenue'>(atoms.map(a=>[a.id,'verified-pos']));
 for(const s of selected){
  const key=id(s.transactionNo);if(posIds.has(key))continue;const matches=entries.filter(e=>id(object(e.posting).transactionNo)===key);if(matches.length!==1)continue;const entry=matches[0],p=object(entry.posting);if(p.transactionType!=='Revenue'||entry.postingBreakdown===undefined)continue;const breakdown=object(entry.postingBreakdown),taxes=breakdown.taxes===undefined?[]:rows(breakdown.taxes);if(!taxes.length||!groups.has(arOnlyPosGroupKey(p)))continue;
  const debit=columns(s),posted=columns(p),signed=debit.debit-debit.credit,window=p.folioWindowNo,reference=text(s.reference??''),check=text(s.checkNo,80),day=text(s.transactionDate,10),code=text(s.transactionCode,20),line=model.lines.find(l=>l.id===key);
  if(!signed||debit.debit&&debit.credit||debit.debit!==posted.debit||debit.credit!==posted.credit||!line||line.debit!==debit.debit||line.credit!==debit.credit||p.hotelId!==m.hotel||id(object(object(p.guestInfo).reservationId).id)!==m.reservation_id||String(p.folioNo)!==m.folio_no||!Number.isSafeInteger(window)||Number(window)<1||Number(window)>999||!check||s.checkNo!==check||p.checkNo!==check||p.transactionCode!==code||p.transactionDate!==day||text(p.reference??'')!==reference||cashier(s)!==cashier(p)||amount(breakdown.grossAmount)!==signed)return fail();
  for(const value of [s,p]){
   if(value.hotelId!==undefined&&value.hotelId!==m.hotel||value.folioNo!==undefined&&String(value.folioNo)!==m.folio_no||value.folioWindowNo!==undefined&&value.folioWindowNo!==window||value.guestInfo!==undefined&&id(object(object(value.guestInfo).reservationId).id)!==m.reservation_id||value.transactionType!==undefined&&value.transactionType!=='Revenue'||value.postedAmount!==undefined&&amount(value.postedAmount)!==signed||value.transactionAmount!==undefined&&value.transactionAmount!==signed/100||value.paidOut!==undefined&&value.paidOut!==false||value.deferredTax!==undefined&&value.deferredTax!==false||value.referenceTransactionNo!==undefined||value.referencePackageTransactionNo!==undefined||value.financialTransactionIdList!==undefined||value.groupTypeInfo!==undefined||value.subPostings!==undefined&&rows(value.subPostings).length)return fail();
  }
  for(const value of [entry,breakdown])if(value.financialTransactionIdList!==undefined||value.groupTypeInfo!==undefined||value.subPostings!==undefined&&rows(value.subPostings).length)return fail();
  const childIds=new Set<string>();for(const tax of taxes){const child=id(tax.transactionNo);if(childIds.has(child)||selectedIds.has(child)||entryIds.has(child)||tax.referenceTransactionNo!==undefined&&id(tax.referenceTransactionNo)!==key||tax.referencePackageTransactionNo!==undefined||tax.financialTransactionIdList!==undefined||tax.groupTypeInfo!==undefined||tax.postingBreakdown!==undefined||tax.subPostings!==undefined&&rows(tax.subPostings).length)return fail();childIds.add(child);}
  for(const e of entries){const other=object(e.posting);if(['referenceTransactionNo','referencePackageTransactionNo'].some(field=>other[field]!==undefined&&id(other[field])===key))return fail();}
  const matching=definitions.filter(d=>d.hotelId===m.hotel&&d.transactionCode===code);if(matching.length!==1)return fail();atoms.push({id:key,code,selected:s,posting:p,definition:matching[0],signedCents:signed,group:arOnlyPosGroupKey(p)});provenance.set(key,'selected-embedded-revenue');
 }
 // Added roots must not also be claimed by any financial member list in the
 // unchanged selected/reservation/embedded graph. Follow only known structural
 // fields, with the same scalar/unique-ID formats as the existing POS guard.
 const added=new Set([...provenance].filter(([,value])=>value==='selected-embedded-revenue').map(([key])=>key));let budget=0;
 const inspectReverseMembership=(raw:unknown,depth=0):void=>{
  if(++budget>20000||depth>8)return fail();if(raw==null)return;if(Array.isArray(raw)){for(const value of raw)inspectReverseMembership(value,depth+1);return;}const value=object(raw);
  if(value.financialTransactionIdList!==undefined){const members=Array.isArray(value.financialTransactionIdList)?value.financialTransactionIdList:[value.financialTransactionIdList];if(members.length>4000)return fail();for(const member of members){if(++budget>20000)return fail();const key=id(member&&typeof member==='object'&&!Array.isArray(member)?object(member).id:member);if(added.has(key))return fail();}}
  for(const field of ['posting','postingBreakdown','taxes','subPostings'])if(value[field]!==undefined)inspectReverseMembership(value[field],depth+1);
 };
 if(added.size){inspectReverseMembership(selected);inspectReverseMembership(entries);}
 const token=Object.freeze({}) as VerifiedSourceClaimsDisplayMembership,view={atoms,originalPosIds:[...posIds].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0),identities:new Map(pos.identities),provenance};registered.set(token,{source:canonical(arOnlyTaxSource(packet)),financial:canonical(financial),view:freeze(copy(view))});return token;
}
export function hasVerifiedSourceClaimsDisplayMembership(value:unknown):value is VerifiedSourceClaimsDisplayMembership{return !!value&&typeof value==='object'&&registered.has(value as VerifiedSourceClaimsDisplayMembership);}
export function readVerifiedSourceClaimsDisplayMembership(packet:InvoicePacket,token:VerifiedSourceClaimsDisplayMembership):SourceClaimsDisplayMembershipView{
 const saved=token&&typeof token==='object'?registered.get(token):undefined;if(!saved||saved.source!==canonical(arOnlyTaxSource(packet))||saved.financial!==canonical(sourceClaimsDisplayFinancialPacket(packet)))throw Error('document_invoice_source_claims_display_membership_unverified');return copy(saved.view);
}
