import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,verifyArOnlyPosMetadata,verifyArOnlyPosDefinition,verifyArOnlyPosPartitions,type ArOnlyPosDefinition,type ArOnlyPosAtom,type PosRole} from './ar-only-pos-proof';
import {verifyMappedSalesCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {InvoicePacket} from './model';
export interface ArOnlyPosSalesProof {version:1;kind:'ar-only-pos-mapped-sales-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[];interfaces:PosInterfaceEvidence}
const fail=():never=>{throw Error('document_invoice_ar_only_pos_sales_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&v.length===0;
export function posSalesCandidate(atom:ArOnlyPosAtom,e:ArOnlyPosDefinition,hotel:string):boolean{
 const {definition,group,type}=verifyArOnlyPosMetadata(atom,e,hotel);if(type!=='Others'||group!=='MISC')return false;
 if(object(definition.trxSetup).manualPosting!==false||definition.compTransaction!==false||!empty(definition.transactionAdjustments))fail();return true;
}
/** Inspect only source-shaped positive candidate scopes. Unrelated established
 * fee/discount roles are not forced through a legacy classifier by this planner. */
export function canPlanArOnlyPosSales(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string):boolean{
 const groups=new Map<string,ArOnlyPosAtom[]>();for(const a of atoms){const group=groups.get(a.group)??[];group.push(a);groups.set(a.group,group);}
 for(const group of groups.values()){if(group.some(a=>a.signedCents<=0))continue;for(const a of group){const e=evidence.find(e=>object(object(e.before).transactionCode).code===a.code)??fail(),classification=object(object(object(e.before).transactionCode).classification);if(object(classification.transactionType).code==='Others'&&object(classification.group).code==='MISC'&&posSalesCandidate(a,e,hotel))return true;}}
 return false;
}
export function inspectArOnlyPosSales(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code)),definitions=new Map<string,ArOnlyPosDefinition>();if(!Array.isArray(evidence)||evidence.length!==codes.size)fail();for(const e of evidence){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
 const result=new Map<string,{role:PosRole;signedCents:number}>(),mapped=new Set<string>(),groups=new Map<string,ArOnlyPosAtom[]>();
 for(const a of atoms){const e=definitions.get(a.code)??fail(),candidate=posSalesCandidate(a,e,hotel);if(candidate)mapped.add(a.code);result.set(a.id,{role:candidate?'base':verifyArOnlyPosDefinition(a,e,hotel),signedCents:a.signedCents});const group=groups.get(a.group)??[];group.push(a);groups.set(a.group,group);}
 if(!mapped.size)fail();for(const group of groups.values())if(group.some(a=>mapped.has(a.code))){const check=group[0].selected.checkNo;if(typeof check!=='string'||!check.trim()||group.some(a=>a.signedCents<=0||a.selected.checkNo!==check||a.posting.checkNo!==check)||group.filter(a=>result.get(a.id)!.role==='vat').length!==1)fail();}
 verifyArOnlyPosPartitions(atoms,result);return {result,mapped};
}
export function verifyArOnlyPosSalesProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosSalesProof??fail(),hotel=packet.manifest.hotel;
 if(proof.version!==1||proof.kind!=='ar-only-pos-mapped-sales-vat7'||'receipts'in proof||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPosSignedMultiVatProof||packet.arOnlyPosMultiVatProof||packet.arOnlyPosDiscountProof||packet.arOnlyPosFeeProof||packet.arOnlyPosServiceProof||packet.arOnlyPostedProof||packet.arOnlyNonVatProof||packet.arOnlyWrapperNetVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source||proof.interfaces.hotel!==hotel)fail();const {result,mapped}=inspectArOnlyPosSales(inspectArOnlyPos(packet),proof.definitions,hotel);for(const code of mapped)verifyMappedSalesCode(proof.interfaces,code);return result;
}
