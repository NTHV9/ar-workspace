import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,verifyArOnlyPosDefinition,type ArOnlyPosDefinition,type ArOnlyPosAtom,type PosRole} from './ar-only-pos-proof';
import {posFeeCandidate} from './ar-only-pos-fee-proof';
import {verifyMappedFeeCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {InvoicePacket} from './model';
export interface ArOnlyPosSignedMultiVatProof {version:1;kind:'ar-only-pos-signed-multi-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[];interfaces?:PosInterfaceEvidence}
const fail=():never=>{throw Error('document_invoice_ar_only_pos_signed_multi_vat_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const abs=(n:bigint)=>n<0n?-n:n;
const limit=BigInt(Number.MAX_SAFE_INTEGER);
const scopes=(atoms:ArOnlyPosAtom[])=>{const groups=new Map<string,ArOnlyPosAtom[]>();for(const a of atoms){const group=groups.get(a.group)??[];group.push(a);groups.set(a.group,group);}return groups;};
/** Only a repeated-VAT sign partition outside a wholly positive check selects
 * this strategy. Unrelated established fee scopes are never classified here. */
export function canPlanArOnlyPosSignedMultiVat(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string):boolean{
 for(const group of scopes(atoms).values()){
  if(group.every(a=>a.signedCents>0))continue;
  for(const sign of [1,-1]){const vats=group.filter(a=>{if(Math.sign(a.signedCents)!==sign)return false;const e=evidence.find(e=>object(object(e.before).transactionCode).code===a.code)??fail(),d=object(object(e.before).transactionCode);return object(object(d.classification).transactionType).code==='Tax'&&/\bVAT\b/i.test(String(object(d.description).defaultText));});
   if(vats.length>1){for(const a of vats){const e=evidence.find(e=>object(object(e.before).transactionCode).code===a.code)??fail();if(verifyArOnlyPosDefinition(a,e,hotel)!=='vat')fail();}return true;}
  }
 }
 return false;
}
export function inspectArOnlyPosSignedMultiVat(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code)),definitions=new Map<string,ArOnlyPosDefinition>();if(!Array.isArray(evidence)||evidence.length!==codes.size)fail();
 for(const e of evidence){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
 const result=new Map<string,{role:PosRole;signedCents:number}>(),fees=new Set<string>();for(const a of atoms){const evidence=definitions.get(a.code)??fail(),fee=posFeeCandidate(a,evidence,hotel),role=fee?'fee':verifyArOnlyPosDefinition(a,evidence,hotel);if(!['base','service','vat','fee'].includes(role))fail();if(fee)fees.add(a.code);result.set(a.id,{role,signedCents:a.signedCents});}
 let exceptions=0;
 for(const group of scopes(atoms).values()){
  if(group.some(a=>result.get(a.id)!.role==='fee')){const check=group[0].selected.checkNo;if(group.some(a=>a.signedCents<=0)||group.filter(a=>result.get(a.id)!.role==='vat').length!==1||typeof check!=='string'||!check.trim()||group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check))fail();}
  let repeated=false;
  for(const sign of [1,-1]){const partition=group.filter(a=>Math.sign(a.signedCents)===sign);if(!partition.length)continue;const bases=partition.filter(a=>result.get(a.id)!.role==='base'),vats=partition.filter(a=>result.get(a.id)!.role==='vat');
   if(!bases.length||!vats.length)fail();if(vats.length>1)repeated=true;
   const vat=vats.reduce((n,a)=>n+BigInt(a.signedCents),0n),base=partition.filter(a=>result.get(a.id)!.role!=='vat').reduce((n,a)=>n+BigInt(a.signedCents),0n);if(abs(base)>limit||abs(vat)>limit||abs(vat*100n-base*7n)>100n)fail();
  }
  if(repeated){const check=group[0].selected.checkNo;if(typeof check!=='string'||!check.trim()||group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check))fail();if(!group.every(a=>a.signedCents>0))exceptions++;}
 }
 if(!exceptions)fail();return {result,fees};
}
export function verifyArOnlyPosSignedMultiVatProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosSignedMultiVatProof??fail(),hotel=packet.manifest.hotel;
 if(proof.version!==1||proof.kind!=='ar-only-pos-signed-multi-vat7'||'receipts'in proof||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPosMultiVatProof||packet.arOnlyPosDiscountProof||packet.arOnlyPosFeeProof||packet.arOnlyPosServiceProof||packet.arOnlyPostedProof||packet.arOnlyNonVatProof||packet.arOnlyWrapperNetVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source)fail();const {result,fees}=inspectArOnlyPosSignedMultiVat(inspectArOnlyPos(packet),proof.definitions,hotel);if(fees.size){const interfaces=proof.interfaces??fail();if(interfaces.hotel!==hotel)fail();for(const code of fees)verifyMappedFeeCode(interfaces,code);}else if(proof.interfaces!==undefined)fail();return result;
}
