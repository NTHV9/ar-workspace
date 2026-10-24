import {posPacket} from './invoice-ar-only-pos';
import {money} from './invoice-packet';
import {serviceInterfaces} from './pos-service-receipt';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
export function posDiscountPacket(){
 const {p,rules}=posPacket();
 const selected=structuredClone(p.postings.invoicePostingsDetails[1]),entry=structuredClone(p.taxRows[3]);selected.transactionNo=60004;selected.transactionCode='DISCOUNT';entry.posting.transactionNo=60004;Reflect.set(entry.posting,'transactionCode','DISCOUNT');p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(entry);p.postings.trxCodesInfo.push({...p.postings.trxCodesInfo[1],transactionCode:'DISCOUNT'});p.manifest.open+=1000;
 function amount(id:number,n:number){const s=p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!,e=p.taxRows.find(e=>e.posting.transactionNo===id)!,delta=n-s.debitAmount.amount;s.debitAmount=money(n);Object.assign(e.posting,{debitAmount:money(n),postedAmount:money(n),transactionAmount:n});if('postingBreakdown'in e)Object.assign(e.postingBreakdown,{grossAmount:money(n),netAmount:money(n)});p.manifest.open+=delta;p.invoice.amount=p.invoice.balance=money(p.manifest.open);}
 amount(60004,-200);amount(60002,80);amount(60003,61.6);
 const discount=structuredClone(rules[0]);discount.transactionCode.code='DISCOUNT';rules.push(discount);
 const definitions=rules.map(before=>{Object.assign(before.transactionCode.trxSetup,{manualPosting:false});Object.assign(before.transactionCode,{compTransaction:false,transactionAdjustments:[]});return {before,after:structuredClone(before)};});
 const interfaces=serviceInterfaces(),map=interfaces.mappings[0];map.before.details.transactionsInfo.transactionCodes[0].itemizersShortInfo[0].code='DISCOUNT';map.before.details.transactionsInfo.itemizers[0].splitCode='DC0';map.before.details.transactionsInfo.itemizers[1].splitCode='DC1';map.after=structuredClone(map.before);
 const proof={version:1 as const,kind:'ar-only-pos-mapped-discount-vat7' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions,interfaces};
 return {p,proof,amount};
}
