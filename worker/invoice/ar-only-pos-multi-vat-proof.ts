import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,verifyArOnlyPosDefinition,verifyArOnlyPosPartitions,type ArOnlyPosDefinition,type ArOnlyPosAtom,type PosRole} from './ar-only-pos-proof';
import {posFeeCandidate} from './ar-only-pos-fee-proof';
import {verifyMappedFeeCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {InvoicePacket} from './model';
export interface ArOnlyPosMultiVatProof {version:1;kind:'ar-only-pos-positive-multi-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[];interfaces?:PosInterfaceEvidence}
const fail=():never=>{throw Error('document_invoice_ar_only_pos_multi_vat_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const abs=(n:bigint)=>n<0n?-n:n;
const groups=(atoms:ArOnlyPosAtom[])=>{const groups=new Map<string,ArOnlyPosAtom[]>();for(const a of atoms){const g=groups.get(a.group)??[];g.push(a);groups.set(a.group,g);}return groups;};
/** Only a wholly positive source scope can request multiple-VAT evidence.
 * Explicit current Tax metadata is inspected without classifying unrelated fees. */
export function canPlanArOnlyPosMultiVat(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string):boolean{
 for(const group of groups(atoms).values()){
  if(group.some(a=>a.signedCents<=0))continue;
  const vats=group.filter(a=>{const e=evidence.find(e=>object(object(e.before).transactionCode).code===a.code)??fail(),d=object(object(e.before).transactionCode),classification=object(d.classification);return object(classification.transactionType).code==='Tax'&&/\bVAT\b/i.test(String(object(d.description).defaultText));});
  if(vats.length>1){for(const a of vats){const e=evidence.find(e=>object(object(e.before).transactionCode).code===a.code)??fail();if(verifyArOnlyPosDefinition(a,e,hotel)!=='vat')fail();}return true;}
 }
 return false;
}
export function inspectArOnlyPosMultiVat(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code)),definitions=new Map<string,ArOnlyPosDefinition>();if(!Array.isArray(evidence)||evidence.length!==codes.size)fail();
 for(const e of evidence){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
 const result=new Map<string,{role:PosRole;signedCents:number}>(),fees=new Set<string>(),ordinary:ArOnlyPosAtom[]=[];let exceptions=0;
 for(const a of atoms){const e=definitions.get(a.code)??fail(),fee=posFeeCandidate(a,e,hotel);if(fee)fees.add(a.code);result.set(a.id,{role:fee?'fee':verifyArOnlyPosDefinition(a,e,hotel),signedCents:a.signedCents});}
 for(const group of groups(atoms).values()){
  const vatAtoms=group.filter(a=>result.get(a.id)!.role==='vat'),positive=group.every(a=>a.signedCents>0),exception=vatAtoms.length>1&&positive,hasFee=group.some(a=>result.get(a.id)!.role==='fee');
  if(exception||hasFee){const check=group[0].selected.checkNo;if(!positive||typeof check!=='string'||!check.trim()||group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check)||!group.some(a=>result.get(a.id)!.role==='base'))fail();}
  if(!exception){ordinary.push(...group);continue;}exceptions++;
  const vat=vatAtoms.reduce((n,a)=>n+BigInt(a.signedCents),0n),base=group.filter(a=>result.get(a.id)!.role!=='vat').reduce((n,a)=>n+BigInt(a.signedCents),0n);
  if(base<=0n||vat<=0n||abs(vat*100n-base*7n)>100n)fail();
 }
 if(!exceptions)fail();verifyArOnlyPosPartitions(ordinary,new Map(ordinary.map(a=>[a.id,result.get(a.id)!])));return {result,fees};
}
export function verifyArOnlyPosMultiVatProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosMultiVatProof??fail(),hotel=packet.manifest.hotel;
 if(proof.version!==1||proof.kind!=='ar-only-pos-positive-multi-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPosDiscountProof||packet.arOnlyPosFeeProof||packet.arOnlyPosServiceProof||packet.arOnlyPostedProof||packet.arOnlyNonVatProof||packet.arOnlyWrapperNetVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source)fail();const {result,fees}=inspectArOnlyPosMultiVat(inspectArOnlyPos(packet),proof.definitions,hotel);
 if(fees.size){const interfaces=proof.interfaces??fail();if(interfaces.hotel!==hotel)fail();for(const code of fees)verifyMappedFeeCode(interfaces,code);}else if(proof.interfaces!==undefined)fail();return result;
}
