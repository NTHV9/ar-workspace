import {posPacket} from './invoice-ar-only-pos';
import {money} from './invoice-packet';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
export function posMultiVatPacket(){
 const {p,rules}=posPacket(),selected=structuredClone(p.postings.invoicePostingsDetails[3]),entry=structuredClone(p.taxRows[5]);selected.transactionNo=60004;entry.posting.transactionNo=60004;p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(entry);p.manifest.open+=77;
 function amount(id:number,n:number){const s=p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!,e=p.taxRows.find(e=>e.posting.transactionNo===id)!,delta=n-s.debitAmount.amount;s.debitAmount=money(n);Object.assign(e.posting,{debitAmount:money(n),postedAmount:money(n),transactionAmount:n});if('postingBreakdown'in e)Object.assign(e.postingBreakdown,{grossAmount:money(n),netAmount:money(n)});p.manifest.open+=delta;p.invoice.amount=p.invoice.balance=money(p.manifest.open);}
 amount(60003,40);amount(60004,37);
 const definitions=rules.map(before=>{Object.assign(before.transactionCode.trxSetup,{manualPosting:false});Object.assign(before.transactionCode,{compTransaction:false,transactionAdjustments:[]});return {before,after:structuredClone(before)};});
 const proof={version:1 as const,kind:'ar-only-pos-positive-multi-vat7' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions};return {p,proof,amount};
}
