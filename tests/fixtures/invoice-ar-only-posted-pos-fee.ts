import {posFeePacket} from './invoice-ar-only-pos-fee';
import {money} from './invoice-packet';

export function postedPosFeePacket(){
 const {p,proof}=posFeePacket();
 return {p,evidence:{definitions:proof.definitions,interfaces:proof.interfaces}};
}
export type PostedFeeFixture=ReturnType<typeof postedPosFeePacket>;
export function feeAmount(f:PostedFeeFixture,id:number,value:number){
 const selected=f.p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!;
 const source=f.p.taxRows.find(e=>e.posting.transactionNo===id)!;
 selected.debitAmount=money(value);
 Object.assign(source.posting,{debitAmount:money(value),postedAmount:money(value),transactionAmount:value});
 if(!('postingBreakdown'in source))throw Error('fixture');
 Object.assign(source.postingBreakdown,{grossAmount:money(value),netAmount:money(value)});
}
export function addFeeAtom(f:PostedFeeFixture,copyId:number,newId:number,value:number){
 const selected=structuredClone(f.p.postings.invoicePostingsDetails.find(s=>s.transactionNo===copyId)!);
 const source=structuredClone(f.p.taxRows.find(e=>e.posting.transactionNo===copyId)!);
 selected.transactionNo=newId;source.posting.transactionNo=newId;
 f.p.postings.invoicePostingsDetails.push(selected);f.p.taxRows.push(source);feeAmount(f,newId,value);
}
export function pairFeeEvidence(f:PostedFeeFixture){
 f.evidence.definitions.forEach(e=>e.after=structuredClone(e.before));
 f.evidence.interfaces.discoveryAfter=structuredClone(f.evidence.interfaces.discoveryBefore);
 f.evidence.interfaces.mappings.forEach(e=>e.after=structuredClone(e.before));
}
