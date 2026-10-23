import {posFeePacket} from './invoice-ar-only-pos-fee';
import {posSignedMultiVatPacket} from './invoice-ar-only-pos-signed-multi-vat';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {money} from './invoice-packet';
export function posSignedFeePacket(){
 const {p,proof,amount}=posSignedMultiVatPacket(),fee=posFeePacket(),selected=structuredClone(fee.p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(fee.p.taxRows.slice(3)),definition=structuredClone(fee.proof.definitions[1]);
 selected.forEach(s=>{s.transactionNo+=10;s.transactionDate='2026-01-04';if(s.transactionCode==='SERVICE')s.transactionCode='MAPPED-FEE';});entries.forEach(e=>{e.posting.transactionNo+=10;Reflect.set(e.posting,'transactionDate','2026-01-04');if(Reflect.get(e.posting,'transactionCode')==='SERVICE')Reflect.set(e.posting,'transactionCode','MAPPED-FEE');});p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);p.postings.trxCodesInfo.push(Object.assign({...fee.p.postings.trxCodesInfo[2]},{transactionCode:'MAPPED-FEE',transactionGroup:'F&B'}));definition.before.transactionCode.code='MAPPED-FEE';definition.after=structuredClone(definition.before);proof.definitions.push(definition);p.manifest.open+=1177;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 const interfaces=fee.proof.interfaces,map=interfaces.mappings[0];map.before.details.transactionsInfo.transactionCodes[0].itemizersShortInfo[0].code='MAPPED-FEE';map.after=structuredClone(map.before);const complete=Object.assign(proof,{interfaces});complete.sourceBefore=structuredClone(arOnlyTaxSource(p));complete.sourceAfter=structuredClone(arOnlyTaxSource(p));return {p,proof:complete,amount};
}
