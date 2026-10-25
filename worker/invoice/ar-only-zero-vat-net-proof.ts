import {exclusiveNonRevenueZeroVatNetProvenance} from './exclusive-nonrevenue-zero-vat-net';
import {verifyCurrentArRuleWitnesses} from './ar-current-rule-witness';
import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {verifyDirectZeroTaxExplicitCandidate,type DirectZeroTaxPlan} from './direct-zero-tax';
import {directNonVatProvenance} from './direct-nonvat-policy';
import {verifyZeroVatNetCalculation,type ZeroVatNetProvenance} from './zero-vat-net-calculation';
import {amountCents} from '../opera/normalize';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
export interface ArOnlyZeroVatNetGroup {postingId:string;rules:unknown;rulesAfter:unknown;calculation:unknown;calculationAfter:unknown;provenance:ZeroVatNetProvenance}
export interface ArOnlyZeroVatNetProof {version:1;kind:'ar-only-direct-zero-vat-net';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;groups:ArOnlyZeroVatNetGroup[]}
const fail=():never=>{throw Error('document_invoice_ar_only_zero_vat_net_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const text=(v:unknown)=>v==null?'':String(v);
const check=(v:unknown)=>v==null||v===''?'':typeof v==='string'&&v.length<=2000?v:fail();
const windowKnown=(p:Row)=>Number.isSafeInteger(p.folioWindowNo)&&Number(p.folioWindowNo)>0;
export function zeroVatNetProvenance(rules:unknown,hotel:string,code:string,source:Row):'ordinary-revenue-zero-vat-net'|undefined{
 if(directNonVatProvenance(rules,hotel,code,source))return;
 const d=object(object(rules).transactionCode),classification=object(d.classification),kind=object(classification.transactionType),group=object(classification.group),setup=object(d.trxSetup),generates=object(d.generatesSetup),flags=object(generates.addBaseAmtTo);
 if(d.hotelId!==hotel||d.code!==code||source.hotelId!==hotel||source.transactionCode!==code||classification.type!=='Revenue'||!['FoodAndBeverage','Others'].includes(String(kind.code))||Object.hasOwn(kind,'taxCode')||typeof group.code!=='string'||!group.code||group.code==='TAX'||group.code!==source.transactionGroup||setup.revenue!==true||setup.nonTaxable!==false||typeof setup.taxInclusive!=='boolean'||setup.generatesType!==undefined||setup.useForPaidout!==false||setup.depositPostingOnly!==false||d.compTransaction!==false||!Array.isArray(d.associatedTransactionCodes)||d.associatedTransactionCodes.length||d.transactionAdjustments!==undefined&&(!Array.isArray(d.transactionAdjustments)||d.transactionAdjustments.length)||generates.generates!==undefined&&(!Array.isArray(generates.generates)||generates.generates.length)||Object.keys(generates).some(k=>!['generates','addBaseAmtTo'].includes(k))||Object.keys(flags).some(k=>!['bucket1','bucket2','bucket3'].includes(k))||[1,2,3].some(n=>flags['bucket'+n]!==false))return;
 return 'ordinary-revenue-zero-vat-net';
}
/** Exact source proof for new before-VAT atoms; legacy explicit NonVAT keeps its
 * existing source/policy contract and is classified before this path. */
export function verifyArOnlyDirectZeroCandidateSource(packet:InvoicePacket,g:DirectZeroTaxPlan['candidates'][number]){
 const m=packet.manifest,data=object(packet.postings),selected=rows(data.invoicePostingsDetails),s=selected.find(s=>text(s.transactionNo)===g.id)??fail(),p=g.posting,amount=g.signedCents/100;
 if(!windowKnown(p)||s.folioWindowNo!==undefined&&s.folioWindowNo!==p.folioWindowNo||check(s.checkNo)!==check(p.checkNo)||amountCents(p.postedAmount,'THB')!==g.signedCents)fail();
 for(const view of [s,p]){if(view.hotelId!==undefined&&view.hotelId!==m.hotel||view.folioNo!==undefined&&text(view.folioNo)!==m.folio_no||view.currencyCode!==undefined&&view.currencyCode!=='THB'||view.paidOut!==undefined&&view.paidOut!==false||view.transactionAmount!==undefined&&view.transactionAmount!==amount||view.postedAmount!==undefined&&amountCents(view.postedAmount,'THB')!==g.signedCents)fail();if(view.guestInfo!==undefined&&text(object(object(view.guestInfo).reservationId).id)!==m.reservation_id)fail();}
 if(s.cashierInfo!==undefined&&p.cashierInfo!==undefined&&canonical(object(s.cashierInfo).cashierId)!==canonical(object(p.cashierInfo).cashierId))fail();
 const selectedIds=new Set(selected.map(s=>text(s.transactionNo)));
 for(const entry of packet.taxRows){const other=object(object(entry).posting);if(selectedIds.has(text(other.transactionNo))||!['Revenue','Tax'].includes(String(other.transactionType)))continue;
  if(check(p.checkNo)&&other.hotelId===m.hotel&&text(object(object(other.guestInfo).reservationId).id)===m.reservation_id&&text(other.folioNo)===m.folio_no&&other.transactionDate===p.transactionDate&&check(other.checkNo)===check(p.checkNo)&&(!windowKnown(other)||other.folioWindowNo===p.folioWindowNo))fail();
 }
}
function completeClosure(packet:InvoicePacket,ids:Set<string>){
 let budget=20000;
 const visit=(p:Row,depth:number,embedded=false)=>{if(--budget<0||depth>8)fail();if(ids.has(text(p.referenceTransactionNo))||ids.has(text(p.referencePackageTransactionNo))||embedded&&ids.has(text(p.transactionNo)))fail();if(p.subPostings!==undefined)for(const child of rows(p.subPostings))visit(child,depth+1,true);};
 for(const s of rows(object(packet.postings).invoicePostingsDetails))visit(s,0);
 for(const raw of packet.taxRows){const entry=object(raw);visit(object(entry.posting),0);if(entry.postingBreakdown!==undefined){const b=object(entry.postingBreakdown);if(b.taxes!==undefined)for(const tax of rows(b.taxes))visit(tax,0,true);}}
}
export interface DirectZeroClaim {readonly role:'nonvat'|'zero-vat-net';readonly signedCents:number}
const directZeroTokenBrand=Symbol('verified-direct-zero-claims');
export interface VerifiedDirectZeroClaims {readonly [directZeroTokenBrand]:true}
const verifiedDirectZero=new WeakMap<VerifiedDirectZeroClaims,{fingerprint:string;claims:ReadonlyMap<string,DirectZeroClaim>}>();
/** Component verification never edits or filters the original source packet.
 * Only this verifier can register an exclusion token. */
export function verifyArOnlyDirectZeroClaims(packet:InvoicePacket,groups:ArOnlyZeroVatNetGroup[]):VerifiedDirectZeroClaims{
 if('nativeTaxControls'in packet||packet.arTransfer||packet.arDetails?.length||packet.arSimulations?.length||packet.arPostedGenerates?.length)fail();
 const plan=inspectArOnlyNonVat(packet),ids=new Set(plan.candidates.map(g=>g.id));if(!ids.size||!Array.isArray(groups)||groups.length!==ids.size||new Set(groups.map(g=>g.postingId)).size!==ids.size)fail();completeClosure(packet,ids);verifyCurrentArRuleWitnesses(packet.manifest.hotel,groups.map(g=>({before:g.rules,after:g.rulesAfter})));
 const result=new Map<string,{role:'nonvat'|'zero-vat-net';signedCents:number}>();
 for(const g of plan.candidates){const e=groups.find(e=>e.postingId===g.id)??fail(),code=text(g.posting.transactionCode),nonvat=directNonVatProvenance(e.rules,packet.manifest.hotel,code,g.definition);if(nonvat){if(e.provenance!==nonvat)fail();verifyDirectZeroTaxExplicitCandidate(g,{...e,provenance:nonvat},packet.manifest.hotel);result.set(g.id,{role:'nonvat',signedCents:g.signedCents});continue;}
  const provenance=zeroVatNetProvenance(e.rules,packet.manifest.hotel,code,g.definition)??exclusiveNonRevenueZeroVatNetProvenance(e.rules,packet.manifest.hotel,code,g.definition);if(!provenance||e.provenance!==provenance||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.calculation)!==canonical(e.calculationAfter))fail();verifyArOnlyDirectZeroCandidateSource(packet,g);if(provenance==='exclusive-nonrevenue-zero-vat-net'){const selected=rows(object(packet.postings).invoicePostingsDetails).find(s=>text(s.transactionNo)===g.id)??fail();if(selected.transactionType!==undefined&&selected.transactionType!=='Revenue')fail();}verifyZeroVatNetCalculation(e.calculation,packet.manifest.hotel,code,g.signedCents,object(object(e.rules).transactionCode).trxSetup!==undefined&&object(object(object(e.rules).transactionCode).trxSetup).taxInclusive===true);result.set(g.id,{role:'zero-vat-net',signedCents:g.signedCents});
 }

 const token:VerifiedDirectZeroClaims=Object.freeze({[directZeroTokenBrand]:true as const});
 verifiedDirectZero.set(token,{fingerprint:canonical(arOnlyTaxSource(packet)),claims:new Map([...result].map(([id,claim])=>[id,Object.freeze({...claim})]))});return token;
}
/** Defensive access is source-bound; serialized/forged tokens cannot hide IDs. */
export function readVerifiedDirectZeroClaims(packet:InvoicePacket,token:VerifiedDirectZeroClaims):ReadonlyMap<string,DirectZeroClaim>{
 const registered=verifiedDirectZero.get(token)??fail();if(registered.fingerprint!==canonical(arOnlyTaxSource(packet)))fail();return new Map([...registered.claims].map(([id,claim])=>[id,{...claim}]));
}
export function verifyArOnlyZeroVatNetProof(packet:InvoicePacket):Map<string,{role:'nonvat'|'zero-vat-net';signedCents:number}>{
 const proof=packet.arOnlyZeroVatNetProof??fail();if(proof.version!==1||proof.kind!=='ar-only-direct-zero-vat-net'||'nativeTaxControls'in packet||packet.arOnlySourceClaimsProof||packet.currentArTaxProof||packet.arOnlyNonVatProof||packet.directZeroTaxProof||packet.embeddedGenerateProof||packet.arOnlyPosProof||packet.arOnlyPosServiceProof||packet.arOnlyPosFeeProof||packet.arOnlyPosDiscountProof||packet.arOnlyPosMultiVatProof||packet.arOnlyPosSignedMultiVatProof||packet.arOnlyPosSalesProof||packet.arOnlyWrapperNetVatProof||packet.arOnlyPostedProof||packet.arTransfer||packet.arDetails?.length||packet.arSimulations?.length||packet.arPostedGenerates?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source)fail();const claims=readVerifiedDirectZeroClaims(packet,verifyArOnlyDirectZeroClaims(packet,proof.groups));if(![...claims.values()].some(claim=>claim.role==='zero-vat-net'))fail();return new Map(claims);
}

/** Complete source closure only; this does not mint an exclusion token. */
export function verifyArOnlyDirectZeroSourceClosure(packet:InvoicePacket):void{completeClosure(packet,new Set(inspectArOnlyNonVat(packet).candidates.map(g=>g.id)));}
