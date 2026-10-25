import {canonical} from './ar-tax';
export interface CurrentArRulePair {before:unknown;after:unknown}
const fail=():never=>{throw Error('document_invoice_current_rule_witness_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
/** Enforce the collector's one current definition per exact hotel/code across
 * independently verified financial components and repeated source scopes. */
export function verifyCurrentArRuleWitnesses(hotel:string,pairs:CurrentArRulePair[]):void{
 const seen=new Map<string,string>();for(const pair of pairs){const d=object(object(pair.before).transactionCode),fingerprint=canonical(pair.before);if(d.hotelId!==hotel||typeof d.code!=='string'||!d.code||fingerprint!==canonical(pair.after))fail();const key=JSON.stringify([hotel,d.code]);if(seen.has(key)&&seen.get(key)!==fingerprint)fail();seen.set(key,fingerprint);}
}
