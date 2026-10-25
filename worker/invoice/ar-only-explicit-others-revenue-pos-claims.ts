import {exclusiveNonRevenueCandidate} from './ar-only-exclusive-nonrevenue-pos-claims';
import {canonical} from './ar-tax';
import {inspectArOnlyPos,inspectArOnlyPosRemainder,verifyArOnlyPosDefinition,type ArOnlyPosAtom,type ArOnlyPosDefinition} from './ar-only-pos-proof';
import {explicitRevenueBaseCandidate} from './ar-only-explicit-revenue-pos-claims';
import type {VerifiedDirectZeroClaims} from './ar-only-zero-vat-net-proof';
import type {InvoicePacket} from './model';
export interface ExplicitOthersRevenuePosEvidence {definitions:ArOnlyPosDefinition[]}
export interface ExplicitOthersRevenuePosClaim {role:'taxable'|'vat';signedCents:number;component:'posted-pos-explicit-others-revenue'}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_explicit_others_revenue_pos_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&v.length===0;
/** Explicit supplied Others/MISC Revenue identity for actual posted net. No interface
 * alias, sign, rate or native-total difference supplies role authority. */
export function explicitOthersRevenueCandidate(a:ArOnlyPosAtom,e:ArOnlyPosDefinition,hotel:string):boolean{
 if(canonical(e.before)!==canonical(e.after))return false;
 const d=object(object(e.before).transactionCode),c=object(d.classification),s=object(d.trxSetup);
 if(d.hotelId!==hotel||d.code!==a.code||c.type!=='Revenue'||object(c.transactionType).code!=='Others'||Object.hasOwn(object(c.transactionType),'taxCode')||object(c.group).code!=='MISC'||a.definition.transactionGroup!=='MISC'||s.revenue!==true||s.nonTaxable!==false||s.taxInclusive!==false||s.manualPosting!==false||s.useForPaidout!==false||s.depositPostingOnly!==false||d.compTransaction!==false||s.generatesType!==undefined||!empty(d.transactionAdjustments)||!empty(d.associatedTransactionCodes)||d.adjustmentCode!==undefined)return false;
 if(d.generatesSetup!==undefined){const g=object(d.generatesSetup);if(!empty(g.generates))return false;if(g.addBaseAmtTo!==undefined){const flags=object(g.addBaseAmtTo);if(Object.keys(flags).some(k=>!['bucket1','bucket2','bucket3'].includes(k))||Object.values(flags).some(v=>v!==false))return false;}}
 return true;
}
function rolesFor(atoms:ArOnlyPosAtom[],definitions:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code));if(!Array.isArray(definitions)||definitions.length!==codes.size)return undefined;
 const byCode=new Map<string,ArOnlyPosDefinition>();for(const e of definitions){if(Object.keys(object(e)).some(k=>!['before','after'].includes(k)))return undefined;const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||byCode.has(code))return undefined;byCode.set(code,e);}
 const roles=new Map<string,{role:'taxable'|'vat';signedCents:number}>(),newIds=new Set<string>(),strictIds=new Set<string>(),newBaseIds=new Set<string>(),scopes=new Map<string,ArOnlyPosAtom[]>();
 for(const a of atoms){const e=byCode.get(a.code)??fail(),d=object(object(e.before).transactionCode),c=object(d.classification);let role:'taxable'|'vat';
  if(c.transactionType===undefined){if(Object.hasOwn(c,'transactionType')||!explicitRevenueBaseCandidate(a,e,hotel))return undefined;role='taxable';newBaseIds.add(a.id);}
  else{const type=object(c.transactionType).code,group=object(c.group).code;
   if(type==='Others'&&group==='MISC'){if(!explicitOthersRevenueCandidate(a,e,hotel))return undefined;role='taxable';newIds.add(a.id);}
   else if(type==='NonRevenue'&&group==='F&B'){if(!exclusiveNonRevenueCandidate(a,e,hotel))return undefined;role='taxable';strictIds.add(a.id);}
   else{if(!(type==='Tax'&&['TAX','F&B'].includes(String(group))&&/\bVAT\b/i.test(String(object(d.description).defaultText))||type==='NonRevenue'&&group==='SVC'||type==='FoodAndBeverage'&&['F&B','RM'].includes(String(group))))return undefined;role=verifyArOnlyPosDefinition(a,e,hotel)==='vat'?'vat':'taxable';}
  }
  roles.set(a.id,{role,signedCents:a.signedCents});const scope=scopes.get(a.group)??[];scope.push(a);scopes.set(a.group,scope);
 }
 if(!newIds.size)return undefined;
 for(const scope of scopes.values())if(scope.some(a=>newIds.has(a.id)||strictIds.has(a.id)||newBaseIds.has(a.id))){const check=scope[0].selected.checkNo;if(typeof check!=='string'||!check.trim()||scope.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check)||!scope.some(a=>roles.get(a.id)!.role==='vat'))return undefined;}
 return roles;
}
/** Deterministic whole-remainder planning, before provider effects. */
export function canPlanExplicitOthersRevenuePos(atoms:ArOnlyPosAtom[],definitions:ArOnlyPosDefinition[],hotel:string):boolean{
 const byCode=new Map(definitions.map(e=>[String(object(object(e.before).transactionCode).code),e]));
 if(!atoms.some(a=>{const e=byCode.get(a.code);if(!e)return false;const c=object(object(object(e.before).transactionCode).classification);return c.transactionType!==undefined&&object(c.transactionType).code==='Others'&&object(c.group).code==='MISC'&&explicitOthersRevenueCandidate(a,e,hotel);}))return false;
 return !!rolesFor(atoms,definitions,hotel);
}
export function verifyExplicitOthersRevenuePosClaims(packet:InvoicePacket,evidence:ExplicitOthersRevenuePosEvidence,zeroToken?:VerifiedDirectZeroClaims):Map<string,ExplicitOthersRevenuePosClaim>{
 if(Object.keys(object(evidence)).some(k=>k!=='definitions'))fail();
 const atoms=zeroToken?inspectArOnlyPosRemainder(packet,zeroToken):inspectArOnlyPos(packet),roles=rolesFor(atoms,evidence.definitions,packet.manifest.hotel)??fail();
 return new Map([...roles].map(([id,c])=>[id,{...c,component:'posted-pos-explicit-others-revenue'}]));
}

