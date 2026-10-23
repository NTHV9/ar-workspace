import type {InvoicePacket} from '../../worker/invoice/model';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {packet,money} from './invoice-packet';
import {embeddedNonVatPacket} from './invoice-embedded-nonvat';
export function nonVatPacket(amounts=[20,-10]){
 const p=packet(1),fixture=embeddedNonVatPacket(amounts);
 p.manifest.hotel=p.account.hotelId=p.invoice.hotelId=p.reservation.hotelId='TSAN';
 for(const row of p.taxRows)row.posting.hotelId='TSAN';for(const d of [...p.taxCodes,...p.postings.trxCodesInfo])d.hotelId='TSAN';
 Object.assign(p.taxRows[0].posting,{transactionCode:'ROOM',transactionDate:'2026-01-02',postedAmount:money(3315)});
 p.postings.invoicePostingsDetails.push(...fixture.postings.invoicePostingsDetails.slice(1));p.postings.trxCodesInfo.push(...fixture.postings.trxCodesInfo.slice(1));
 const taxRows=[...p.taxRows,...fixture.taxRows.slice(1)];
 p.manifest.open=3315+amounts.reduce((n,v)=>n+v,0);p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 return {p:{...p,taxRows},groups:fixture.embeddedGenerateProof.nonVatGroups};
}
export function withNonVatProof(p:InvoicePacket,groups:unknown[]):InvoicePacket{
 return Object.assign(p,{arOnlyNonVatProof:{version:1,kind:'ar-only-direct-nonvat',sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),groups}});
}
