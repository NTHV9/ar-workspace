import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,verifyArOnlyPosMetadata,verifyArOnlyPosDefinition,verifyArOnlyPosPartitions,arOnlyPosPartitionFailure,type ArOnlyPosDefinition,type ArOnlyPosAtom,type PosRole} from './ar-only-pos-proof';
import {verifyMappedDiscountCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {InvoicePacket} from './model';
export interface ArOnlyPosDiscountProof {version:1;kind:'ar-only-pos-mapped-discount-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[];interfaces:PosInterfaceEvidence}
const fail=():never=>{throw Error('document_invoice_ar_only_pos_discount_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&v.length===0;
const abs=(n:bigint)=>n<0n?-n:n;
function metadata(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code)),definitions=new Map<string,ArOnlyPosDefinition>();if(!Array.isArray(evidence)||evidence.length!==codes.size)fail();
 for(const e of evidence){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
 const roles=new Map<string,PosRole>(),eligible=new Set<string>(),groups=new Map<string,ArOnlyPosAtom[]>();
 for(const atom of atoms){const e=definitions.get(atom.code)??fail(),{definition,group,type}=verifyArOnlyPosMetadata(atom,e,hotel);roles.set(atom.id,verifyArOnlyPosDefinition(atom,e,hotel));
  if(atom.signedCents<0&&type==='FoodAndBeverage'&&group==='F&B'&&object(definition.trxSetup).manualPosting===false&&definition.compTransaction===false&&empty(definition.transactionAdjustments))eligible.add(atom.id);
  const members=groups.get(atom.group)??[];members.push(atom);groups.set(atom.group,members);
 }
 return {roles,eligible,groups};
}
function discountScope(group:ArOnlyPosAtom[],roles:ReadonlyMap<string,PosRole>,eligible:ReadonlySet<string>):boolean{
 return group.some(a=>eligible.has(a.id))&&group.some(a=>a.signedCents>0&&roles.get(a.id)==='base')&&group.some(a=>a.signedCents>0&&roles.get(a.id)==='service')&&group.filter(a=>roles.get(a.id)==='vat').length===1&&group.every(a=>a.signedCents>0||eligible.has(a.id));
}
/** Strategy selection is based on complete source shape and explicit metadata,
 * before mapping requests. It never guesses a discount from a negative sign. */
export function canPlanArOnlyPosDiscount(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string):boolean{
 const scopes=new Map<string,ArOnlyPosAtom[]>();for(const atom of atoms){const group=scopes.get(atom.group)??[];group.push(atom);scopes.set(atom.group,group);}
 for(const group of scopes.values()){
  // Whole sign partitions and unrelated fee scopes belong to their existing
  // strategy. Only classify a potentially mixed discount scope here; the final
  // selected proof still validates every source atom and definition.
  if(!group.some(a=>a.signedCents<0)||!group.some(a=>a.signedCents>0))continue;
  const codes=new Set(group.map(a=>a.code)),scopedEvidence=evidence.filter(e=>codes.has(String(object(object(e.before).transactionCode).code))),{roles,eligible}=metadata(group,scopedEvidence,hotel);
  if(discountScope(group,roles,eligible))return true;
 }
 return false;
}
/** Only mapped negative DC atoms may offset their own closed taxable base.
 * Ordinary groups retain the original independent sign partitions. */
function discountFacts(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 let valid=true;const {roles,eligible,groups}=metadata(atoms,evidence,hotel),result=new Map<string,{role:PosRole;signedCents:number}>(),discounts=new Set<string>(),ordinary:ArOnlyPosAtom[]=[];
 for(const group of groups.values()){
  const negatives=group.filter(a=>a.signedCents<0),hasDiscount=discountScope(group,roles,eligible);
  if(!hasDiscount){ordinary.push(...group);for(const a of group)result.set(a.id,{role:roles.get(a.id)!,signedCents:a.signedCents});continue;}
  const check=group[0].selected.checkNo;
  if(typeof check!=='string'||!check.trim()||group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check)||negatives.some(a=>!eligible.has(a.id))||!group.some(a=>roles.get(a.id)==='service'&&a.signedCents>0)||group.filter(a=>roles.get(a.id)==='vat').length!==1||group.some(a=>roles.get(a.id)==='vat'&&a.signedCents<=0))valid=false;
  let base=0n,discount=0n,service=0n,vat=0n;
  for(const a of group){const role:PosRole=eligible.has(a.id)?'discount':roles.get(a.id)!;result.set(a.id,{role,signedCents:a.signedCents});if(role==='discount'){discount+=BigInt(a.signedCents);discounts.add(a.code);}else if(role==='base')base+=BigInt(a.signedCents);else if(role==='service')service+=BigInt(a.signedCents);else if(role==='vat')vat+=BigInt(a.signedCents);else valid=false;}
  if(base<=0n||discount>=0n||base+discount<=0n||service<=0n||vat<=0n||abs(vat*100n-(base+discount+service)*7n)>100n)valid=false;
 }
 if(!discounts.size||atoms.some(a=>discounts.has(a.code)&&a.signedCents>=0))valid=false;const ordinaryResult=new Map(ordinary.map(a=>[a.id,result.get(a.id)!]));return {result,discounts,ordinary,ordinaryResult,valid};
}
/** Preserve the legacy discount strategy only when its entire native remainder
 * fits that verifier; one discount-shaped scope does not certify other scopes. */
export function canPlanCompleteArOnlyPosDiscount(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string):boolean{
 if(!canPlanArOnlyPosDiscount(atoms,evidence,hotel))return false;
 for(const a of atoms){const e=evidence.find(e=>object(object(e.before).transactionCode).code===a.code)??fail(),d=object(object(e.before).transactionCode),c=object(d.classification),type=object(c.transactionType).code,group=object(c.group).code;if(!(type==='Tax'&&['TAX','F&B'].includes(String(group))&&/\bVAT\b/i.test(String(object(d.description).defaultText))||type==='NonRevenue'&&group==='SVC'||type==='FoodAndBeverage'&&['F&B','RM'].includes(String(group))))return false;}
 const facts=discountFacts(atoms,evidence,hotel);return facts.valid&&!arOnlyPosPartitionFailure(facts.ordinary,facts.ordinaryResult);
}
export function inspectArOnlyPosDiscount(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){const facts=discountFacts(atoms,evidence,hotel);if(!facts.valid)fail();verifyArOnlyPosPartitions(facts.ordinary,facts.ordinaryResult);return {result:facts.result,discounts:facts.discounts};}

export function verifyArOnlyPosDiscountProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosDiscountProof??fail(),hotel=packet.manifest.hotel;
 if(proof.version!==1||proof.kind!=='ar-only-pos-mapped-discount-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPosFeeProof||packet.arOnlyPosServiceProof||packet.arOnlyPostedProof||packet.arOnlyNonVatProof||packet.arOnlyWrapperNetVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source||proof.interfaces.hotel!==hotel)fail();
 const {result,discounts}=inspectArOnlyPosDiscount(inspectArOnlyPos(packet),proof.definitions,hotel);for(const code of discounts)verifyMappedDiscountCode(proof.interfaces,code);return result;
}
