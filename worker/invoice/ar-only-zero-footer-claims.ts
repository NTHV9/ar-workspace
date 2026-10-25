import {canonical} from './ar-tax';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {verifyArOnlyDirectZeroCandidateSource,verifyArOnlyDirectZeroSourceClosure} from './ar-only-zero-vat-net-proof';
import {verifyDirectZeroTaxExplicitCandidate} from './direct-zero-tax';
import {directNonVatProvenance} from './direct-nonvat-policy';
import type {EmbeddedNonVatGroup} from './embedded-generates';
import type {InvoicePacket} from './model';
export type ExcludedFooterProvenance='tsan-current-ar-manual-nonrevenue-footer-exclusion';
export interface ExcludedFooterGroup {kind:'excluded-tax-footer';postingId:string;rules:unknown;rulesAfter:unknown;provenance:ExcludedFooterProvenance}
export type CurrentArZeroFooterGroup=ExcludedFooterGroup|({kind:'explicit-nonvat'}&EmbeddedNonVatGroup);
export interface CurrentArZeroFooterComponent {kind:'current-ar-zero-footer';groups:CurrentArZeroFooterGroup[]}
export interface CurrentArZeroFooterClaim {role:'excluded-tax-footer'|'nonvat';signedCents:number;component:'current-ar-zero-footer'}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_current_ar_zero_footer_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const only=(v:Row,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))fail();};
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&!v.length;
/** Named TSAN current-AR empirical report policy. It neither classifies other
 * hotels nor accepts native footer differences as runtime evidence. */
export function excludedFooterProvenance(rules:unknown,hotel:string,code:string,source:Row):ExcludedFooterProvenance|undefined{
 if(directNonVatProvenance(rules,hotel,code,source))return;
 const d=object(object(rules).transactionCode),c=object(d.classification),kind=object(c.transactionType),s=object(d.trxSetup),g=object(d.generatesSetup),flags=object(g.addBaseAmtTo);
 if(hotel!=='TSAN'||d.hotelId!==hotel||d.code!==code||source.hotelId!==hotel||source.transactionCode!==code||source.transactionGroup!=='MISC'||c.type!=='Revenue'||kind.code!=='NonRevenue'||Object.hasOwn(kind,'taxCode')||object(c.group).code!=='MISC'||s.revenue!==false||s.manualPosting!==true||s.nonTaxable!==false||s.taxInclusive!==false||s.useForPaidout!==false||s.depositPostingOnly!==false||s.generatesType!==undefined||d.compTransaction!==false||!empty(d.associatedTransactionCodes)||!empty(d.transactionAdjustments)||!empty(g.generates)||Object.keys(g).some(k=>!['addBaseAmtTo','generates'].includes(k))||Object.keys(flags).some(k=>!['bucket1','bucket2','bucket3'].includes(k))||[1,2,3].some(n=>flags['bucket'+n]!==false))return;
 return 'tsan-current-ar-manual-nonrevenue-footer-exclusion';
}
export function verifyCurrentArZeroFooterClaims(packet:InvoicePacket,evidence:CurrentArZeroFooterComponent):Map<string,CurrentArZeroFooterClaim>{
 only(object(evidence),['kind','groups']);if(evidence.kind!=='current-ar-zero-footer'||'nativeTaxControls'in packet)fail();const plan=inspectArOnlyNonVat(packet),ids=new Set(plan.candidates.map(g=>g.id));if(!ids.size||!Array.isArray(evidence.groups)||evidence.groups.length!==ids.size||new Set(evidence.groups.map(e=>e.postingId)).size!==ids.size)fail();verifyArOnlyDirectZeroSourceClosure(packet);
 const definitions=new Map<string,string>();for(const g of plan.candidates){const e=evidence.groups.find(e=>e.postingId===g.id)??fail(),key=JSON.stringify([packet.manifest.hotel,String(g.posting.transactionCode)]),fingerprint=canonical(e.rules);if(fingerprint!==canonical(e.rulesAfter)||definitions.has(key)&&definitions.get(key)!==fingerprint)fail();definitions.set(key,fingerprint);}
 const claims=new Map<string,CurrentArZeroFooterClaim>();let excluded=0;
 for(const g of plan.candidates){const e=evidence.groups.find(e=>e.postingId===g.id)??fail(),code=String(g.posting.transactionCode),nonvat=directNonVatProvenance(e.rules,packet.manifest.hotel,code,g.definition);
  if(nonvat){if(e.kind!=='explicit-nonvat')return fail();if(e.provenance!==nonvat)fail();only(object(e),['kind','postingId','rules','rulesAfter','calculation','calculationAfter','provenance']);verifyDirectZeroTaxExplicitCandidate(g,e,packet.manifest.hotel);claims.set(g.id,{role:'nonvat',signedCents:g.signedCents,component:'current-ar-zero-footer'});continue;}
  const provenance=excludedFooterProvenance(e.rules,packet.manifest.hotel,code,g.definition);if(e.kind!=='excluded-tax-footer'||g.signedCents<=0||!provenance||provenance!==e.provenance||canonical(e.rules)!==canonical(e.rulesAfter))fail();only(object(e),['kind','postingId','rules','rulesAfter','provenance']);verifyArOnlyDirectZeroCandidateSource(packet,g);const selected=object(packet.postings).invoicePostingsDetails;const selectedRows=Array.isArray(selected)?selected.map(object):fail();const s=selectedRows.find(s=>String(s.transactionNo)===g.id)??fail();if(s.transactionType!==undefined&&s.transactionType!=='Revenue')fail();claims.set(g.id,{role:'excluded-tax-footer',signedCents:g.signedCents,component:'current-ar-zero-footer'});excluded++;
 }
 if(!excluded)fail();return claims;
}

/** Planning reads scopes only, never claims an ID or supplies footer money. */
export function canPlanCurrentArZeroFooter(packet:InvoicePacket,rules:ReadonlyMap<string,unknown>):boolean{let excluded=0;for(const g of inspectArOnlyNonVat(packet).candidates){const code=String(g.posting.transactionCode),r=rules.get(code);if(directNonVatProvenance(r,packet.manifest.hotel,code,g.definition))continue;if(g.signedCents<=0||!excludedFooterProvenance(r,packet.manifest.hotel,code,g.definition))return false;excluded++;}return excluded>0;}
