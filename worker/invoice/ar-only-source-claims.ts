import {verifyPostedEmbeddedRevenueClaims,type PostedEmbeddedRevenueComponent,type PostedEmbeddedRevenueClaim} from './ar-only-posted-embedded-revenue-claims';
import {verifyCurrentArRuleWitnesses} from './ar-current-rule-witness';
import {verifyCurrentArZeroFooterClaims,type CurrentArZeroFooterComponent,type CurrentArZeroFooterClaim} from './ar-only-zero-footer-claims';
import {verifyExplicitOthersRevenuePosClaims,type ExplicitOthersRevenuePosEvidence} from './ar-only-explicit-others-revenue-pos-claims';
import {verifyPostedEmbeddedVatClaims,type PostedEmbeddedVatComponent,type PostedEmbeddedRootClaim} from './ar-only-posted-wrapper-claims';
import {verifyExplicitNetNonRevenuePosClaims,type ExplicitNetNonRevenuePosEvidence} from './ar-only-explicit-net-nonrevenue-pos-claims';
import {verifyExclusiveNonRevenuePosClaims,type ExclusiveNonRevenuePosEvidence} from './ar-only-exclusive-nonrevenue-pos-claims';
import {verifyExplicitRevenuePosClaims,type ExplicitRevenuePosEvidence} from './ar-only-explicit-revenue-pos-claims';
import {verifyPostedPosFeeClaims,type PostedPosFeeEvidence} from './ar-only-posted-pos-fee-claims';
import {verifyTransferredCurrentArRuleClaims,type TransferredCurrentArRuleComponent,type CurrentArRuleClaim} from './ar-only-transferred-current-rule-claims';
import {verifyPostedPosClaims} from './ar-only-posted-tax-claims';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {verifyArOnlyDirectZeroClaims,readVerifiedDirectZeroClaims,type ArOnlyZeroVatNetGroup} from './ar-only-zero-vat-net-proof';
import {inspectArOnlyPos,inspectArOnlyPosRemainder,verifyArOnlyPosDefinition,verifyArOnlyPosPartitions,type ArOnlyPosAtom,type ArOnlyPosDefinition,type PosRole} from './ar-only-pos-proof';
import {amountCents} from '../opera/normalize';
import type {InvoicePacket} from './model';
export interface ArOnlyReservationSourceClaim {role:'vat'|'nonvat'|'taxable';signedCents:number;component:'direct-zero'|'ordinary-pos'|'posted-pos-vat'|'posted-pos-mapped-fee'|'posted-pos-explicit-revenue-base'|'posted-pos-exclusive-nonrevenue'|'posted-pos-explicit-net-nonrevenue'|'posted-pos-explicit-others-revenue'}
export interface ArOnlySourceClaimsProofV1 {version:1;kind:'ar-only-source-claims';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;directZero:{groups:ArOnlyZeroVatNetGroup[]};ordinaryPos:{definitions:ArOnlyPosDefinition[]}}
export type SourceClaimComponentEvidence={kind:'direct-zero';groups:ArOnlyZeroVatNetGroup[]}|{kind:'ordinary-pos-vat7'|'posted-pos-vat';definitions:ArOnlyPosDefinition[]}|({kind:'posted-pos-mapped-fee'}&PostedPosFeeEvidence)|({kind:'posted-pos-explicit-revenue-base'}&ExplicitRevenuePosEvidence)|({kind:'posted-pos-exclusive-nonrevenue'}&ExclusiveNonRevenuePosEvidence)|({kind:'posted-pos-explicit-net-nonrevenue'}&ExplicitNetNonRevenuePosEvidence)|({kind:'posted-pos-explicit-others-revenue'}&ExplicitOthersRevenuePosEvidence);
export interface ArOnlySourceClaimsProofV2 {version:2;kind:'ar-only-source-claims';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;components:SourceClaimComponentEvidence[]}
export interface ArOnlySourceClaimsProofV3 {version:3;kind:'ar-only-source-claims';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;components:[TransferredCurrentArRuleComponent]}
export interface ArOnlySourceClaimsProofV4 {version:4;kind:'ar-only-source-claims';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;components:[PostedEmbeddedVatComponent]}
export interface ArOnlySourceClaimsProofV5 {version:5;kind:'ar-only-source-claims';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;components:[CurrentArZeroFooterComponent]}
export interface ArOnlySourceClaimsProofV6 {version:6;kind:'ar-only-source-claims';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;components:({kind:'direct-zero';groups:ArOnlyZeroVatNetGroup[]}|PostedEmbeddedRevenueComponent)[]}
export type ArOnlySourceClaimsProof=ArOnlySourceClaimsProofV1|ArOnlySourceClaimsProofV2|ArOnlySourceClaimsProofV3|ArOnlySourceClaimsProofV4|ArOnlySourceClaimsProofV5|ArOnlySourceClaimsProofV6;
export type ArOnlySourceClaim=ArOnlyReservationSourceClaim|CurrentArRuleClaim|PostedEmbeddedRootClaim|CurrentArZeroFooterClaim|PostedEmbeddedRevenueClaim;
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_ar_only_source_claims_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const only=(v:Row,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))fail();};
/** Component claims are created only by their pure full-source verifiers.
 * Evidence carries no replacement amounts or caller-controlled exclusion IDs. */
function verifySourceClaims(packet:InvoicePacket,withRegion:boolean):{claims:Map<string,ArOnlySourceClaim>;posRegion?:VerifiedSourceClaimsPosRegion}{
 const proof=packet.arOnlySourceClaimsProof??fail();
 if(proof.kind!=='ar-only-source-claims'||'nativeTaxControls'in packet||packet.arOnlyZeroVatNetProof||packet.arOnlyNonVatProof||packet.directZeroTaxProof||packet.embeddedGenerateProof||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPosServiceProof||packet.arOnlyPosFeeProof||packet.arOnlyPosDiscountProof||packet.arOnlyPosMultiVatProof||packet.arOnlyPosSignedMultiVatProof||packet.arOnlyPosSalesProof||packet.arOnlyWrapperNetVatProof||packet.arOnlyPostedProof||packet.arTransfer||packet.arDetails?.length&&proof.version!==3||packet.arSimulations?.length||packet.arPostedGenerates?.length)fail();
 const fingerprint=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==fingerprint||canonical(proof.sourceAfter)!==fingerprint)fail();
 if(proof.version===6){only(object(proof),['version','kind','sourceBefore','sourceAfter','components']);if(!Array.isArray(proof.components)||!proof.components.length||proof.components.length>2)fail();let embedded:PostedEmbeddedRevenueComponent|undefined,zeroComponent:{kind:'direct-zero';groups:ArOnlyZeroVatNetGroup[]}|undefined;for(const c of proof.components){if(c.kind==='posted-embedded-revenue-vat'){if(embedded)fail();only(object(c),['kind','roots']);embedded=c;}else if(c.kind==='direct-zero'){if(zeroComponent)fail();only(object(c),['kind','groups']);zeroComponent=c;}else fail();}if(!embedded||!Array.isArray(embedded.roots)||zeroComponent&&!Array.isArray(zeroComponent.groups))return fail();if(!!inspectArOnlyNonVat(packet).candidates.length!==!!zeroComponent)fail();verifyCurrentArRuleWitnesses(packet.manifest.hotel,[...(zeroComponent?.groups??[]).map(g=>({before:g.rules,after:g.rulesAfter})),...embedded.roots.flatMap(e=>[{before:e.rules,after:e.rulesAfter},...e.generatedRules.map((before,n)=>({before,after:e.generatedRulesAfter[n]}))])]);const token=zeroComponent?verifyArOnlyDirectZeroClaims(packet,zeroComponent.groups):undefined,zero=token?readVerifiedDirectZeroClaims(packet,token):new Map(),claims=new Map<string,ArOnlySourceClaim>();for(const [id,c]of zero)claims.set(id,{role:c.role==='nonvat'?'nonvat':'taxable',signedCents:c.signedCents,component:'direct-zero'});for(const [id,c]of verifyPostedEmbeddedRevenueClaims(packet,embedded)){if(claims.has(id))fail();claims.set(id,c);}return {claims};}
 if(proof.version===5){only(object(proof),['version','kind','sourceBefore','sourceAfter','components']);if(!Array.isArray(proof.components)||proof.components.length!==1||proof.components[0].kind!=='current-ar-zero-footer')fail();return {claims:verifyCurrentArZeroFooterClaims(packet,proof.components[0])};}
 if(proof.version===4){only(object(proof),['version','kind','sourceBefore','sourceAfter','components']);if(!Array.isArray(proof.components)||proof.components.length!==1||proof.components[0].kind!=='posted-embedded-vat')fail();return {claims:verifyPostedEmbeddedVatClaims(packet,proof.components[0])};}
 if(proof.version===3){only(object(proof),['version','kind','sourceBefore','sourceAfter','components']);if(!Array.isArray(proof.components)||proof.components.length!==1||proof.components[0].kind!=='transferred-current-ar-rules-vat7')fail();const claims=verifyTransferredCurrentArRuleClaims(packet,proof.components[0]),selected=new Map(rows(object(packet.postings).invoicePostingsDetails).map(s=>[String(s.transactionNo),s])),reservation=new Set(packet.taxRows.map(e=>String(object(object(e).posting).transactionNo))),ar=new Map((packet.arDetails??[]).flatMap(page=>rows(object(page.response).transactions)).map(p=>[String(p.transactionNo),p]));
  for(const [id,claim]of claims){const chosen=selected.get(id)??fail(),posted=ar.get(id)??fail(),signed=(p:Row)=>(p.debitAmount==null?0:amountCents(p.debitAmount,'THB'))-(p.creditAmount==null?0:amountCents(p.creditAmount,'THB'));if(claim.sourceKind!=='ar-detail'||reservation.has(id)||signed(chosen)!==claim.signedCents||signed(posted)!==claim.signedCents)fail();}return {claims};
 }
 let components:SourceClaimComponentEvidence[];
 if(proof.version===1){only(object(proof),['version','kind','sourceBefore','sourceAfter','directZero','ordinaryPos']);only(object(proof.directZero),['groups']);only(object(proof.ordinaryPos),['definitions']);components=[{kind:'direct-zero',groups:proof.directZero.groups},{kind:'ordinary-pos-vat7',definitions:proof.ordinaryPos.definitions}];}
 else if(proof.version===2){only(object(proof),['version','kind','sourceBefore','sourceAfter','components']);if(!Array.isArray(proof.components)||!proof.components.length||proof.components.length>2)fail();components=proof.components;}
 else return fail();
 const kinds=new Set<string>();for(const component of components){const c=object(component);if(!['direct-zero','ordinary-pos-vat7','posted-pos-vat','posted-pos-mapped-fee','posted-pos-explicit-revenue-base','posted-pos-exclusive-nonrevenue','posted-pos-explicit-net-nonrevenue','posted-pos-explicit-others-revenue'].includes(String(c.kind))||kinds.has(String(c.kind)))fail();kinds.add(String(c.kind));only(c,c.kind==='direct-zero'?['kind','groups']:['posted-pos-mapped-fee','posted-pos-explicit-revenue-base'].includes(String(c.kind))?['kind','definitions','interfaces']:['kind','definitions']);}
 const zeroEvidence=components.find(c=>c.kind==='direct-zero'),posEvidence=components.filter(c=>c.kind!=='direct-zero');if(posEvidence.length!==1)fail();
 if(zeroEvidence?.kind==='direct-zero'&&!Array.isArray(zeroEvidence.groups)||!Array.isArray(posEvidence[0].definitions))fail();
 verifyCurrentArRuleWitnesses(packet.manifest.hotel,[...(zeroEvidence?.kind==='direct-zero'?zeroEvidence.groups.map(g=>({before:g.rules,after:g.rulesAfter})):[]),...posEvidence[0].definitions]);
 const candidateCount=inspectArOnlyNonVat(packet).candidates.length;if(!!candidateCount!==!!zeroEvidence)fail();
 const token=zeroEvidence&&zeroEvidence.kind==='direct-zero'?verifyArOnlyDirectZeroClaims(packet,zeroEvidence.groups):undefined,zero=token?readVerifiedDirectZeroClaims(packet,token):new Map();
 const pos=posEvidence[0];let native:Map<string,{role:'vat'|'taxable';signedCents:number;component:'ordinary-pos'|'posted-pos-vat'|'posted-pos-mapped-fee'|'posted-pos-explicit-revenue-base'|'posted-pos-exclusive-nonrevenue'|'posted-pos-explicit-net-nonrevenue'|'posted-pos-explicit-others-revenue'}>;
 if(pos.kind==='posted-pos-explicit-others-revenue')native=verifyExplicitOthersRevenuePosClaims(packet,{definitions:pos.definitions},token);
 else if(pos.kind==='posted-pos-explicit-net-nonrevenue')native=verifyExplicitNetNonRevenuePosClaims(packet,{definitions:pos.definitions},token);
 else if(pos.kind==='posted-pos-exclusive-nonrevenue')native=verifyExclusiveNonRevenuePosClaims(packet,{definitions:pos.definitions},token);
 else if(pos.kind==='posted-pos-explicit-revenue-base')native=verifyExplicitRevenuePosClaims(packet,{definitions:pos.definitions,...pos.interfaces?{interfaces:pos.interfaces}:{}},token);
 else if(pos.kind==='posted-pos-mapped-fee')native=verifyPostedPosFeeClaims(packet,{definitions:pos.definitions,interfaces:pos.interfaces},token);
 else if(pos.kind==='posted-pos-vat')native=verifyPostedPosClaims(packet,{definitions:pos.definitions},token);
 else{
  const atoms=token?inspectArOnlyPosRemainder(packet,token):inspectArOnlyPos(packet),codes=new Set(atoms.map(a=>a.code));if(!atoms.length||!Array.isArray(pos.definitions)||pos.definitions.length!==codes.size)fail();
  const definitions=new Map<string,ArOnlyPosDefinition>();for(const e of pos.definitions){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
  const roles=new Map<string,{role:PosRole;signedCents:number}>();for(const a of atoms){const role=verifyArOnlyPosDefinition(a,definitions.get(a.code)??fail(),packet.manifest.hotel);if(!['base','service','vat'].includes(role))fail();roles.set(a.id,{role,signedCents:a.signedCents});}verifyArOnlyPosPartitions(atoms,roles);
  native=new Map([...roles].map(([id,c])=>[id,{role:c.role==='vat'?'vat':'taxable',signedCents:c.signedCents,component:'ordinary-pos'}]));
 }
 const selected=new Map(rows(object(packet.postings).invoicePostingsDetails).map(s=>[String(s.transactionNo),s])),posted=new Map(packet.taxRows.map(raw=>{const p=object(object(raw).posting);return [String(p.transactionNo),p] as const;})),result=new Map<string,ArOnlySourceClaim>();
 const signed=(p:Row)=>(p.debitAmount==null?0:amountCents(p.debitAmount,'THB'))-(p.creditAmount==null?0:amountCents(p.creditAmount,'THB'));
 const add=(id:string,claim:ArOnlySourceClaim)=>{const s=selected.get(id)??fail(),p=posted.get(id)??fail();if(result.has(id)||!Number.isSafeInteger(claim.signedCents)||!claim.signedCents||signed(s)!==claim.signedCents||signed(p)!==claim.signedCents)fail();result.set(id,claim);};
 for(const [id,claim]of zero)add(id,{role:claim.role==='nonvat'?'nonvat':'taxable',signedCents:claim.signedCents,component:'direct-zero'});
 for(const [id,claim]of native)add(id,claim);
 if(!withRegion)return {claims:result};
 const atoms=token?inspectArOnlyPosRemainder(packet,token):inspectArOnlyPos(packet);if(atoms.length!==native.size||atoms.some(a=>{const claim=native.get(a.id);return !claim||claim.signedCents!==a.signedCents||!['taxable','vat'].includes(claim.role);}))fail();
 const region=Object.freeze({}) as VerifiedSourceClaimsPosRegion,identities=new Map([...native].map(([id,c])=>[id,Object.freeze({role:c.role,signedCents:c.signedCents})]));
 registeredPosRegions.set(region,{source:canonical(arOnlyTaxSource(packet)),proof:canonical(packet.arOnlySourceClaimsProof),atoms:freezeDetached(structuredClone(atoms)),identities});
 return {claims:result,posRegion:region};
}

/** Ephemeral financial ownership authority. No caller ID set or serialized flag
 * can create a POS exclusion or grant display membership. */
declare const posRegionBrand:unique symbol;
export interface VerifiedSourceClaimsPosRegion {readonly [posRegionBrand]:true}
interface RegisteredPosRegion {source:string;proof:string;atoms:readonly ArOnlyPosAtom[];identities:ReadonlyMap<string,{readonly role:'taxable'|'vat';readonly signedCents:number}>}
const registeredPosRegions=new WeakMap<VerifiedSourceClaimsPosRegion,RegisteredPosRegion>();
function freezeDetached<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeDetached(child);Object.freeze(value);}return value;}
export function verifyArOnlySourceClaimsProof(packet:InvoicePacket):Map<string,ArOnlySourceClaim>{return verifySourceClaims(packet,false).claims;}
export function verifyArOnlySourceClaimsWithDisplayRegion(packet:InvoicePacket):{claims:Map<string,ArOnlySourceClaim>;posRegion?:VerifiedSourceClaimsPosRegion}{return verifySourceClaims(packet,true);}
export function readVerifiedSourceClaimsPosRegion(packet:InvoicePacket,region:VerifiedSourceClaimsPosRegion):{atoms:readonly ArOnlyPosAtom[];identities:ReadonlyMap<string,{role:'taxable'|'vat';signedCents:number}>}{
 const saved=region&&typeof region==='object'?registeredPosRegions.get(region):undefined;
 if(!saved||saved.source!==canonical(arOnlyTaxSource(packet))||saved.proof!==canonical(packet.arOnlySourceClaimsProof))return fail();
 return {atoms:structuredClone(saved.atoms),identities:new Map([...saved.identities].map(([id,c])=>[id,{...c}]))};
}
