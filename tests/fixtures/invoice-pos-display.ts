import {posPacket,withPosProof} from './invoice-ar-only-pos';
import {verifyArOnlyPosProof} from '../../worker/invoice/ar-only-pos-proof';
import {verifyArOnlyPosDiscountProof} from '../../worker/invoice/ar-only-pos-discount-proof';
import {posDiscountPacket} from './invoice-ar-only-pos-discount';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import type {ArPosDisplayProof} from '../../worker/invoice/pos-display-proof';
export interface SyntheticPosDisplayPosting {transactionNo:number|string;transactionDate:string;transactionCode:string;transactionDescription?:string;reference:string;checkNo:string;cashierInfo:{cashierId:number};groupTypeInfo:{groupId?:string;subGroupId?:string;groupCount?:number;groupDescription?:string}}
export function posDisplayFixture(reference='Room# 101 : CHECK# 10 [99]'){
 const {p,rules}=posPacket();
 for(const selected of p.postings.invoicePostingsDetails)if(selected.transactionNo>=60001){selected.reference=reference;Reflect.set(p.taxRows.find(e=>e.posting.transactionNo===selected.transactionNo)!.posting,'reference',reference);}
 const packet=withPosProof(p,rules),roles=verifyArOnlyPosProof(packet),ids=[...roles.keys()];
 const members:SyntheticPosDisplayPosting[]=ids.map(id=>{const selected=p.postings.invoicePostingsDetails.find(row=>String(row.transactionNo)===id)!;return {transactionNo:Number(id),transactionDate:selected.transactionDate,transactionCode:selected.transactionCode,reference,checkNo:'POS-CHECK',cashierInfo:{cashierId:3},groupTypeInfo:{subGroupId:'POS-CHECK'}};});
 const page={hotelId:'KAT',reservationId:'777',folioWindowNo:1,missingWindow:false,omittedWindows:0,windows:[{section:'current',folioWindowNo:1,offset:200,limit:200,totalResults:1,totalPages:1,folios:[{folioNo:0,postings:[{transactionNo:60002,transactionDate:'2026-01-03',transactionCode:'SYNTHETIC-DESCRIPTOR',transactionDescription:'Example cafe',reference:'POS-CHECK',checkNo:'POS-CHECK',cashierInfo:{cashierId:3},groupTypeInfo:{groupId:'POS-CHECK',groupCount:3,groupDescription:'Example cafe'}},...members]}]}]};
 const proof:ArPosDisplayProof={version:1,kind:'ar-pos-checkno-source-display',sourceBefore:structuredClone(arOnlyTaxSource(packet)),sourceAfter:structuredClone(arOnlyTaxSource(packet)),contexts:[{hotel:'KAT',reservationId:'777',folioWindowNo:1,before:[structuredClone(page)],after:[structuredClone(page)]}]};
 return {packet,roles,page,proof,raw:p};
}
export function posDiscountDisplayFixture(){
 const result=posDisplayFixture(),{p,proof}=posDiscountPacket(),reference='Room# 101 : CHECK# 10 [99]';
 for(const selected of p.postings.invoicePostingsDetails)if(selected.transactionNo>=60001){selected.reference=reference;Reflect.set(p.taxRows.find(e=>e.posting.transactionNo===selected.transactionNo)!.posting,'reference',reference);}
 proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));const packet=Object.assign(p,{arOnlyPosDiscountProof:proof}),roles=verifyArOnlyPosDiscountProof(packet);
 const page=structuredClone(result.page);const member=structuredClone(page.windows[0].folios[0].postings[1]);member.transactionNo=60004;member.transactionCode='DISCOUNT';page.windows[0].folios[0].postings.push(member);Reflect.set(page.windows[0].folios[0].postings[0].groupTypeInfo,'groupCount',4);
 const displayProof:ArPosDisplayProof={...result.proof,sourceBefore:structuredClone(arOnlyTaxSource(packet)),sourceAfter:structuredClone(arOnlyTaxSource(packet)),contexts:[{hotel:'KAT',reservationId:'777',folioWindowNo:1,before:[structuredClone(page)],after:[structuredClone(page)]}]};
 return {packet,roles,page,proof:displayProof};
}
import {posSignedMultiVatPacket} from './invoice-ar-only-pos-signed-multi-vat';
import {posSalesPacket} from './invoice-ar-only-pos-sales';
import {verifyArOnlyPosSignedMultiVatProof} from '../../worker/invoice/ar-only-pos-signed-multi-vat-proof';
import {verifyArOnlyPosSalesProof} from '../../worker/invoice/ar-only-pos-sales-proof';
export function posExtendedDisplayFixture(kind:'signed'|'sales'){
 const base=posDisplayFixture(),data=kind==='signed'?posSignedMultiVatPacket():posSalesPacket(),{p,proof}=data,reference='Room# 101 : CHECK# 10 [99]';
 for(const selected of p.postings.invoicePostingsDetails)if(selected.transactionNo>=60001){selected.reference=reference;Reflect.set(p.taxRows.find(e=>e.posting.transactionNo===selected.transactionNo)!.posting,'reference',reference);}
 proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));
 const packet=Object.assign(p,kind==='signed'?{arOnlyPosSignedMultiVatProof:proof as ReturnType<typeof posSignedMultiVatPacket>['proof']}:{arOnlyPosSalesProof:proof as ReturnType<typeof posSalesPacket>['proof']});
 const roles=kind==='signed'?verifyArOnlyPosSignedMultiVatProof(packet):verifyArOnlyPosSalesProof(packet),page=structuredClone(base.page),header=page.windows[0].folios[0].postings[0];
 const members=[...roles.keys()].map(id=>{const selected=p.postings.invoicePostingsDetails.find(row=>String(row.transactionNo)===id)!;return {transactionNo:Number(id),transactionDate:selected.transactionDate,transactionCode:selected.transactionCode,reference,checkNo:selected.checkNo,cashierInfo:{cashierId:3},groupTypeInfo:{subGroupId:selected.checkNo}};});
 page.windows[0].folios[0].postings=[header,...members];header.groupTypeInfo.groupCount=members.length;
 const displayProof:ArPosDisplayProof={...base.proof,sourceBefore:structuredClone(arOnlyTaxSource(packet)),sourceAfter:structuredClone(arOnlyTaxSource(packet)),contexts:[{hotel:'KAT',reservationId:'777',folioWindowNo:1,before:[structuredClone(page)],after:[structuredClone(page)]}]};return {packet,roles,page,proof:displayProof};
}
