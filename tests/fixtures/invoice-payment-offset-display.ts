import {posDisplayFixture} from './invoice-pos-display';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {money} from './invoice-packet';

export function paymentOffsetFixture(owners=[99,99]){
 const {packet}=posDisplayFixture();
 const payments=owners.map((_,n)=>({hotelId:'KAT',guestInfo:{reservationId:{id:'777'}},folioNo:88,folioWindowNo:1,transactionNo:70001+n,transactionCode:'SYN-PAY',transactionDate:'2026-01-04',reference:'Explicit payment reference',transactionType:'Payment',creditAmount:money((n%2?-1:1)*100),postedAmount:money((n%2?-1:1)*100),transactionAmount:(n%2?-1:1)*100,paidOut:false,cashierInfo:{cashierId:3}}));
 for(const posting of payments)packet.taxRows.push({posting:structuredClone(posting)});
 packet.arOnlyPosProof!.sourceBefore=structuredClone(arOnlyTaxSource(packet));packet.arOnlyPosProof!.sourceAfter=structuredClone(arOnlyTaxSource(packet));
 const response={transactions:payments.map((p,n)=>{const {hotelId,guestInfo,...detail}=p;return {...detail,aRInfo:{accountNumber:'EARLIER-ACCOUNT',invoiceNo:owners[n]},deferredTax:false};}),trxCodesInfo:[{hotelId:'KAT',transactionCode:'SYN-PAY',description:'Synthetic City Ledger'}]};
 const proof={version:1 as const,kind:'ar-owned-payment-offset-display' as const,sourceBefore:structuredClone(arOnlyTaxSource(packet)),sourceAfter:structuredClone(arOnlyTaxSource(packet)),details:[{ids:payments.map(p=>String(p.transactionNo)),before:structuredClone(response),after:structuredClone(response)}]};
 return {packet,payments,response,proof};
}
