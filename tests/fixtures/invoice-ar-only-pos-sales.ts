import {posPacket} from './invoice-ar-only-pos';
import {money} from './invoice-packet';
import {serviceInterfaces} from './pos-service-receipt';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
export function posSalesPacket(){
 const {p,rules}=posPacket();p.postings.invoicePostingsDetails[1].transactionCode='MAPPED-SALES';Reflect.set(p.taxRows[3].posting,'transactionCode','MAPPED-SALES');Object.assign(p.postings.trxCodesInfo[1],{transactionCode:'MAPPED-SALES',transactionGroup:'MISC'});Object.assign(rules[0].transactionCode,{code:'MAPPED-SALES'});rules[0].transactionCode.classification.transactionType.code='Others';rules[0].transactionCode.classification.group.code='MISC';
 const definitions=rules.map(before=>{Object.assign(before.transactionCode.trxSetup,{manualPosting:false});Object.assign(before.transactionCode,{compTransaction:false,transactionAdjustments:[]});return {before,after:structuredClone(before)};});
 const interfaces=serviceInterfaces(),map=interfaces.mappings[0];map.before.details.transactionsInfo.transactionCodes[0].itemizersShortInfo[0].code='MAPPED-SALES';map.before.details.transactionsInfo.itemizers[0].splitCode='ST0';map.before.details.transactionsInfo.itemizers[1].splitCode='ST1';map.after=structuredClone(map.before);
 const proof={version:1 as const,kind:'ar-only-pos-mapped-sales-vat7' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions,interfaces};
 function amount(id:number,n:number){const s=p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!,e=p.taxRows.find(e=>e.posting.transactionNo===id)!,delta=n-s.debitAmount.amount;s.debitAmount=money(n);Object.assign(e.posting,{debitAmount:money(n),postedAmount:money(n),transactionAmount:n});if('postingBreakdown'in e)Object.assign(e.postingBreakdown,{grossAmount:money(n),netAmount:money(n)});p.manifest.open+=delta;p.invoice.amount=p.invoice.balance=money(p.manifest.open);}
 return {p,proof,amount};
}
