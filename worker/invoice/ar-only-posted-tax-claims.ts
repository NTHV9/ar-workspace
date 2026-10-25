import {inspectArOnlyPos,inspectArOnlyPosRemainder,verifyArOnlyPosDefinition,verifyArOnlyPosMetadata,type ArOnlyPosAtom,type ArOnlyPosDefinition} from './ar-only-pos-proof';
import type {VerifiedDirectZeroClaims} from './ar-only-zero-vat-net-proof';
import type {InvoicePacket} from './model';
export interface PostedPosClaim {role:'vat'|'taxable';signedCents:number;component:'posted-pos-vat'}
const fail=():never=>{throw Error('document_invoice_ar_only_posted_tax_claims_unverified');};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
/** Actual selected tax identity and footer policy are independent of a nominal
 * percentage. Identity, complete ownership and paired role metadata still apply. */
export function verifyPostedPosClaims(packet:InvoicePacket,evidence:{definitions:ArOnlyPosDefinition[]},zeroToken?:VerifiedDirectZeroClaims):Map<string,PostedPosClaim>{
 if(Object.keys(object(evidence)).some(key=>key!=='definitions'))fail();
 const atoms=zeroToken?inspectArOnlyPosRemainder(packet,zeroToken):inspectArOnlyPos(packet),codes=new Set(atoms.map(atom=>atom.code));if(!atoms.length||!Array.isArray(evidence.definitions)||evidence.definitions.length!==codes.size)fail();
 const definitions=new Map<string,ArOnlyPosDefinition>();for(const entry of evidence.definitions){if(Object.keys(object(entry)).some(key=>!['before','after'].includes(key)))fail();const code=object(object(entry.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,entry);}
 const claims=new Map<string,PostedPosClaim>();let vatCount=0;
 for(const atom of atoms){const role=verifyArOnlyPosDefinition(atom,definitions.get(atom.code)??fail(),packet.manifest.hotel);if(!['base','service','vat'].includes(role)||claims.has(atom.id))fail();if(role==='vat')vatCount++;claims.set(atom.id,{role:role==='vat'?'vat':'taxable',signedCents:atom.signedCents,component:'posted-pos-vat'});}
 if(!vatCount)fail();return claims;
}

/** Strategy planning only: no claim, token or replacement amount is produced.
 * Valid native partitions keep their established profile (including multi-VAT). */
export function canPlanPostedPosClaims(atoms:ArOnlyPosAtom[],definitions:ArOnlyPosDefinition[],hotel:string,ordinaryOnly=false):boolean{
 const byCode=new Map(definitions.map(e=>[String(object(object(e.before).transactionCode).code),e])),partitions=new Map<string,{base:bigint;vat:bigint;baseCount:number;vatCount:number}>();let vats=0;
 for(const atom of atoms){const evidence=byCode.get(atom.code)??fail(),{definition,group,type}=verifyArOnlyPosMetadata(atom,evidence,hotel);let role:'base'|'service'|'vat';
  if(type==='Tax'&&['TAX','F&B'].includes(String(group))&&/\bVAT\b/i.test(String(object(definition.description).defaultText)))role='vat';else if(type==='NonRevenue'&&group==='SVC')role='service';else if(type==='FoodAndBeverage'&&['F&B','RM'].includes(String(group)))role='base';else return false;
  if(!Number.isSafeInteger(atom.signedCents)||!atom.signedCents)fail();const key=JSON.stringify([atom.group,Math.sign(atom.signedCents)]),partition=partitions.get(key)??{base:0n,vat:0n,baseCount:0,vatCount:0};if(role==='vat'){partition.vat+=BigInt(atom.signedCents);partition.vatCount++;vats++;}else{partition.base+=BigInt(atom.signedCents);if(role==='base')partition.baseCount++;}partitions.set(key,partition);
 }
 if(!vats)return false;return [...partitions.values()].some(p=>{const difference=p.vat*100n-p.base*7n;return !p.baseCount||!p.vatCount||ordinaryOnly&&p.vatCount!==1||(difference<0n?-difference:difference)>100n;});
}
