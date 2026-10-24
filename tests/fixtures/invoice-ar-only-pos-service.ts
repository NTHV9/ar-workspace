import {posPacket} from './invoice-ar-only-pos';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {serviceReceipt,serviceInterfaces} from './pos-service-receipt';
export function posServicePacket(){
 const {p,rules}=posPacket(),check='123456789012345678901';
 rules[1].transactionCode.classification.group.code='F&B';Reflect.set(p.postings.trxCodesInfo[2],'transactionGroup','F&B');
 for(const s of p.postings.invoicePostingsDetails.slice(1)){s.transactionDate='2026-01-02';s.checkNo=check;const row=p.taxRows.find(e=>e.posting.transactionNo===s.transactionNo)!;Object.assign(row.posting,{transactionDate:s.transactionDate,checkNo:check});}
 const proof={version:1 as const,kind:'ar-only-pos-receipt-service-vat7' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions:rules.map(before=>({before:structuredClone(before),after:structuredClone(before)})),interfaces:serviceInterfaces(),receipts:[{hotel:'KAT',checkNumber:check,before:serviceReceipt(),after:serviceReceipt()}]};
 return {p,proof};
}
