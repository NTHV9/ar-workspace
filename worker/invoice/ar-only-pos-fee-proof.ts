import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,verifyArOnlyPosMetadata,verifyArOnlyPosDefinition,verifyArOnlyPosPartitions,type ArOnlyPosDefinition,type ArOnlyPosAtom,type PosRole} from './ar-only-pos-proof';
import {verifyMappedFeeCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {InvoicePacket} from './model';
export interface ArOnlyPosFeeProof {version:1;kind:'ar-only-pos-mapped-fee-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[];interfaces:PosInterfaceEvidence}
const fail=():never=>{throw Error('document_invoice_ar_only_pos_fee_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&v.length===0;
export function posFeeCandidate(atom:ArOnlyPosAtom,e:ArOnlyPosDefinition,hotel:string){
 const {definition,group,type}=verifyArOnlyPosMetadata(atom,e,hotel);if(type!=='NonRevenue'||group!=='F&B')return false;
 const setup=object(definition.trxSetup);
 if(setup.manualPosting!==false||definition.compTransaction!==false||!empty(definition.transactionAdjustments)||!empty(definition.associatedTransactionCodes))fail();
 return true;
}
/** Select an evidence strategy from source metadata, before provider requests.
 * Ineligibility here preserves the independent existing receipt profile. */
export function canPlanArOnlyPosFee(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string):boolean{
 let candidates=0,eligible=true;
 for(const atom of atoms){const e=evidence.find(e=>object(object(e.before).transactionCode).code===atom.code)??fail(),{definition,group,type}=verifyArOnlyPosMetadata(atom,e,hotel);
  if(type==='NonRevenue'&&group==='F&B'){candidates++;eligible=eligible&&object(definition.trxSetup).manualPosting===false&&definition.compTransaction===false&&empty(definition.transactionAdjustments);}
 }
 return candidates>0&&eligible;
}
/** A mapped fee remains a fee. Its amount need not be ten percent and no receipt
 * allocation is substituted for the exact selected source postings. */
export function inspectArOnlyPosFee(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code)),definitions=new Map<string,ArOnlyPosDefinition>();
 if(!Array.isArray(evidence)||evidence.length!==codes.size)fail();
 for(const e of evidence){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
 const result=new Map<string,{role:PosRole;signedCents:number}>(),groups=new Map<string,ArOnlyPosAtom[]>(),fees=new Set<string>();
 for(const atom of atoms){const e=definitions.get(atom.code)??fail(),candidate=posFeeCandidate(atom,e,hotel);if(candidate)fees.add(atom.code);result.set(atom.id,{role:candidate?'fee':verifyArOnlyPosDefinition(atom,e,hotel),signedCents:atom.signedCents});const group=groups.get(atom.group)??[];group.push(atom);groups.set(atom.group,group);}
 if(!fees.size)fail();
 for(const group of groups.values())if(group.some(a=>result.get(a.id)!.role==='fee')){
  const check=group[0].selected.checkNo;
  if(typeof check!=='string'||!check.trim()||group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check||a.signedCents<=0)||!group.some(a=>result.get(a.id)!.role==='base')||group.filter(a=>result.get(a.id)!.role==='vat').length!==1)fail();
 }
 verifyArOnlyPosPartitions(atoms,result);return {result,fees};
}
export function verifyArOnlyPosFeeProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosFeeProof??fail(),hotel=packet.manifest.hotel;
 if(proof.version!==1||proof.kind!=='ar-only-pos-mapped-fee-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPosServiceProof||packet.arOnlyPostedProof||packet.arOnlyNonVatProof||packet.arOnlyWrapperNetVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source||proof.interfaces.hotel!==hotel)fail();
 const {result,fees}=inspectArOnlyPosFee(inspectArOnlyPos(packet),proof.definitions,hotel);
 for(const code of fees)verifyMappedFeeCode(proof.interfaces,code);return result;
}
