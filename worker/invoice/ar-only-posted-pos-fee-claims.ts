import {
 inspectArOnlyPos,inspectArOnlyPosRemainder,verifyArOnlyPosDefinition,
 type ArOnlyPosAtom,type ArOnlyPosDefinition,type PosRole,
} from './ar-only-pos-proof';
import {posFeeCandidate} from './ar-only-pos-fee-proof';
import {verifyMappedFeeCode,type PosInterfaceEvidence} from './pos-receipt-service';
import type {VerifiedDirectZeroClaims} from './ar-only-zero-vat-net-proof';
import type {InvoicePacket} from './model';

export interface PostedPosFeeEvidence {
 definitions:ArOnlyPosDefinition[];
 interfaces:PosInterfaceEvidence;
}
export interface PostedPosFeeClaim {
 role:'taxable'|'vat';
 signedCents:number;
 component:'posted-pos-mapped-fee';
}
export interface PostedPosFeeIdentity {
 role:Extract<PosRole,'base'|'service'|'fee'|'vat'>;
 signedCents:number;
}
const fail=():never=>{throw Error('document_invoice_ar_only_posted_pos_fee_unverified');};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
const closed=(value:unknown,keys:string[])=>{const record=object(value);if(Object.keys(record).some(key=>!keys.includes(key)))fail();return record;};

/** Classifies the complete inspected POS remainder. Money comes exclusively
 * from exact selected/source postings; mappings establish a fee identity only.
 * Native tax identities may repeat or offset and carry no nominal rate claim. */
export function verifyPostedPosFeeIdentities(
 packet:InvoicePacket,evidence:PostedPosFeeEvidence,zeroToken?:VerifiedDirectZeroClaims,
):Map<string,PostedPosFeeIdentity>{
 closed(evidence,['definitions','interfaces']);
 const atoms=zeroToken?inspectArOnlyPosRemainder(packet,zeroToken):inspectArOnlyPos(packet);
 const codes=new Set(atoms.map(atom=>atom.code));
 if(!atoms.length||!Array.isArray(evidence.definitions)||evidence.definitions.length!==codes.size)fail();
 const definitions=new Map<string,ArOnlyPosDefinition>();
 for(const entry of evidence.definitions){
  closed(entry,['before','after']);
  const code=object(object(entry.before).transactionCode).code;
  if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();
  definitions.set(code as string,entry);
 }
 const interfaces=evidence.interfaces;
 closed(interfaces,['hotel','discoveryBefore','discoveryAfter','mappings']);
 if(interfaces.hotel!==packet.manifest.hotel||!Array.isArray(interfaces.mappings))fail();
 for(const mapping of interfaces.mappings)closed(mapping,['logo','before','after']);

 const identities=new Map<string,PostedPosFeeIdentity>();
 const feeCodes=new Set<string>(),groups=new Map<string,ArOnlyPosAtom[]>();
 let vatCount=0;
 for(const atom of atoms){
  const definition=definitions.get(atom.code)??fail();
  const role=posFeeCandidate(atom,definition,packet.manifest.hotel)?'fee':verifyArOnlyPosDefinition(atom,definition,packet.manifest.hotel);
  if(!['base','service','fee','vat'].includes(role)||identities.has(atom.id))fail();
  if(role==='fee')feeCodes.add(atom.code);
  if(role==='vat')vatCount++;
  identities.set(atom.id,{role:role as PostedPosFeeIdentity['role'],signedCents:atom.signedCents});
  const group=groups.get(atom.group)??[];group.push(atom);groups.set(atom.group,group);
 }
 if(!feeCodes.size||!vatCount)fail();
 for(const code of feeCodes)verifyMappedFeeCode(interfaces,code);
 for(const group of groups.values()){
  if(!group.some(atom=>identities.get(atom.id)!.role==='fee'))continue;
  const check=group[0].selected.checkNo;
  if(typeof check!=='string'||!check.trim()||group.some(atom=>atom.selected.checkNo!==check||atom.posting.checkNo!==check)
   ||!group.some(atom=>identities.get(atom.id)!.role==='base')
   ||!group.some(atom=>identities.get(atom.id)!.role==='vat'))fail();
 }
 return identities;
}

/** Footer claims and display identities share the same independent role proof.
 * The containing source-claims envelope still owns global residual validation. */
export function verifyPostedPosFeeClaims(
 packet:InvoicePacket,evidence:PostedPosFeeEvidence,zeroToken?:VerifiedDirectZeroClaims,
):Map<string,PostedPosFeeClaim>{
 return new Map([...verifyPostedPosFeeIdentities(packet,evidence,zeroToken)].map(([id,identity])=>[
  id,{role:identity.role==='vat'?'vat':'taxable',signedCents:identity.signedCents,component:'posted-pos-mapped-fee'},
 ]));
}
