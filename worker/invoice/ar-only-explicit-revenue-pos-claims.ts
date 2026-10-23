import {canonical} from './ar-tax';
import {inspectArOnlyPos,inspectArOnlyPosRemainder,verifyArOnlyPosDefinition,type ArOnlyPosAtom,type ArOnlyPosDefinition,type PosRole} from './ar-only-pos-proof';
import {canPlanArOnlyPosFee,posFeeCandidate} from './ar-only-pos-fee-proof';
import {verifyMappedFeeCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {VerifiedDirectZeroClaims} from './ar-only-zero-vat-net-proof';
import type {InvoicePacket} from './model';
export interface ExplicitRevenuePosEvidence {definitions:ArOnlyPosDefinition[];interfaces?:PosInterfaceEvidence}
export interface ExplicitRevenuePosClaim {role:'taxable'|'vat';signedCents:number;component:'posted-pos-explicit-revenue-base'}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_explicit_revenue_pos_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&v.length===0;
/** Independent Revenue flag certificate. It never fills in a missing subtype
 * or interprets a description/itemizer as a tax or discount identity. */
export function explicitRevenueBaseCandidate(a:ArOnlyPosAtom,e:ArOnlyPosDefinition,hotel:string):boolean{
 if(canonical(e.before)!==canonical(e.after))return false;const d=object(object(e.before).transactionCode),c=object(d.classification),s=object(d.trxSetup);
 if(Object.hasOwn(c,'transactionType')||d.hotelId!==hotel||d.code!==a.code||c.type!=='Revenue'||object(c.group).code!=='F&B'||a.definition.transactionGroup!=='F&B'||s.revenue!==true||s.nonTaxable!==false||s.taxInclusive!==false||s.manualPosting!==false||s.useForPaidout!==false||s.depositPostingOnly!==false||d.compTransaction!==false||s.generatesType!==undefined||!empty(d.transactionAdjustments)||!empty(d.associatedTransactionCodes)||d.adjustmentCode!==undefined) return false;
 if(d.generatesSetup!==undefined){const g=object(d.generatesSetup);if(!empty(g.generates))return false;if(g.addBaseAmtTo!==undefined){const flags=object(g.addBaseAmtTo);if(Object.keys(flags).some(k=>!['bucket1','bucket2','bucket3'].includes(k))||Object.values(flags).some(v=>v!==false))return false;}}
 return true;
}
function rolesFor(atoms:ArOnlyPosAtom[],definitions:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code));if(!Array.isArray(definitions)||definitions.length!==codes.size)return undefined;const byCode=new Map<string,ArOnlyPosDefinition>();for(const e of definitions){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||byCode.has(code)||Object.keys(object(e)).some(k=>!['before','after'].includes(k)))return undefined;byCode.set(code,e);}
 const roles=new Map<string,{role:PosRole;signedCents:number}>(),newBases=new Set<string>(),fees=new Set<string>(),scopes=new Map<string,ArOnlyPosAtom[]>();
 for(const a of atoms){const e=byCode.get(a.code)??fail(),d=object(object(e.before).transactionCode),c=object(d.classification);let role:PosRole;
  if(!Object.hasOwn(c,'transactionType')){if(!explicitRevenueBaseCandidate(a,e,hotel))return undefined;role='base';newBases.add(a.id);}
  else{const rawType=c.transactionType;if(!rawType||typeof rawType!=='object'||Array.isArray(rawType))return undefined;const type=object(rawType).code,group=object(c.group).code;
   if(type==='NonRevenue'&&group==='F&B'){if(!canPlanArOnlyPosFee([a],[e],hotel)||!posFeeCandidate(a,e,hotel))return undefined;role='fee';fees.add(a.code);}
   else{if(!(type==='Tax'&&['TAX','F&B'].includes(String(group))&&/\bVAT\b/i.test(String(object(d.description).defaultText))||type==='NonRevenue'&&group==='SVC'||type==='FoodAndBeverage'&&['F&B','RM'].includes(String(group))))return undefined;role=verifyArOnlyPosDefinition(a,e,hotel);}
  }
  roles.set(a.id,{role,signedCents:a.signedCents});const group=scopes.get(a.group)??[];group.push(a);scopes.set(a.group,group);
 }
 if(!newBases.size||![...roles.values()].some(r=>r.role==='vat'))return undefined;
 for(const group of scopes.values()){const newScope=group.some(a=>newBases.has(a.id)),feeScope=group.some(a=>roles.get(a.id)!.role==='fee');if(newScope||feeScope){const check=group[0].selected.checkNo;if(typeof check!=='string'||!check.trim()||group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check))return undefined;}if((newScope||feeScope)&&!group.some(a=>roles.get(a.id)!.role==='vat')||feeScope&&!group.some(a=>roles.get(a.id)!.role==='base'))return undefined;}
 return {roles,newBases,fees};
}
/** Source/metadata strategy selection only, before any interface effects. */
export function canPlanExplicitRevenuePos(atoms:ArOnlyPosAtom[],definitions:ArOnlyPosDefinition[],hotel:string){
 if(!atoms.some(a=>{const e=definitions.find(e=>object(object(e.before).transactionCode).code===a.code);return e&&explicitRevenueBaseCandidate(a,e,hotel);} ))return undefined;const facts=rolesFor(atoms,definitions,hotel);return facts?{fees:facts.fees}:undefined;
}
export function verifyExplicitRevenuePosClaims(packet:InvoicePacket,evidence:ExplicitRevenuePosEvidence,zeroToken?:VerifiedDirectZeroClaims):Map<string,ExplicitRevenuePosClaim>{
 if(Object.keys(object(evidence)).some(k=>!['definitions','interfaces'].includes(k)))fail();const atoms=zeroToken?inspectArOnlyPosRemainder(packet,zeroToken):inspectArOnlyPos(packet),planned=rolesFor(atoms,evidence.definitions,packet.manifest.hotel)??fail();
 if(planned.fees.size){const interfaces=evidence.interfaces??fail();if(interfaces.hotel!==packet.manifest.hotel||Object.keys(object(interfaces)).some(k=>!['hotel','discoveryBefore','discoveryAfter','mappings'].includes(k))||!Array.isArray(interfaces.mappings))fail();for(const mapping of interfaces.mappings)if(Object.keys(object(mapping)).some(k=>!['logo','before','after'].includes(k)))fail();for(const code of planned.fees)verifyMappedFeeCode(interfaces,code);}else if(evidence.interfaces!==undefined)fail();
 return new Map([...planned.roles].map(([id,c])=>[id,{role:c.role==='vat'?'vat':'taxable',signedCents:c.signedCents,component:'posted-pos-explicit-revenue-base'}]));
}
