import {mixedTaxPacket,money} from './invoice-packet';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import type {InvoicePacket} from '../../worker/invoice/model';
export function posPacket(sign=1){
 const p=mixedTaxPacket();p.postings.invoicePostingsDetails.pop();p.postings.trxCodesInfo.pop();p.taxRows.pop();
 Reflect.set(p.postings.trxCodesInfo[1],'transactionGroup','F&B');
 p.account=Object.assign(p.account,{accountNo:'SYN-POS'});
 for(const row of p.postings.invoicePostingsDetails){const root=p.taxRows.find(e=>e.posting.transactionNo===row.transactionNo)!;
  Object.assign(root.posting,{transactionCode:row.transactionCode,transactionDate:row.transactionDate,postedAmount:money(row.debitAmount.amount)});
  if(row.transactionNo>=60001){row.debitAmount.amount*=sign;Object.assign(row,{folioWindowNo:1,cashierInfo:{cashierId:3}});Object.assign(root.posting,{checkNo:row.checkNo,folioWindowNo:1,cashierInfo:{cashierId:3},debitAmount:money(row.debitAmount.amount),postedAmount:money(row.debitAmount.amount)});
   if('postingBreakdown'in root)root.postingBreakdown.grossAmount=root.postingBreakdown.netAmount=money(row.debitAmount.amount);
  }
 }
 const total=3315+sign*1177;p.manifest.open=total;p.invoice.amount=p.invoice.balance=money(total);
 const rules=['FOOD','SERVICE','POSTED-VAT'].map((code,n)=>({transactionCode:{hotelId:'KAT',code,classification:{type:'Revenue',transactionType:{code:n===0?'FoodAndBeverage':n===1?'NonRevenue':'Tax'},group:{code:n===0?'F&B':n===1?'SVC':'TAX'}},description:{defaultText:n===2?'Posted VAT':'Synthetic charge'},trxSetup:{taxInclusive:false,nonTaxable:false},generatesSetup:{addBaseAmtTo:{bucket1:false,bucket2:false,bucket3:false}},associatedTransactionCodes:[]}}));
 return {p,rules};
}
export function withPosProof(p:InvoicePacket,rules:unknown[]):InvoicePacket{
 return Object.assign(p,{arOnlyPosProof:{version:1,kind:'ar-only-direct-pos-vat7',sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions:rules.map(before=>({before:structuredClone(before),after:structuredClone(before)}))}});
}
