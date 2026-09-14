import {OperaError,type OperaReader} from './client';
import {parseFinancialMoney,readFinancialTransactionDetail,type FinancialHotel} from './financial-history';

const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const magnitude=(v:string)=>{const n=BigInt(v.replace('.',''));return n<0n?-n:n;};
/** Administrative GET-only probe; identifiers and source payloads stay in memory. */
export async function probePaymentHistory(reader:OperaReader,scope:{hotel:FinancialHotel;accountId:string;paymentTransactionId:string}){
 const query={hotel:scope.hotel,accountId:scope.accountId,kind:'payment' as const,transactionId:scope.paymentTransactionId};
 const rawDetail=await reader.financialTransactionDetail(query),detailEnvelope=object(rawDetail),groups=Array.isArray(detailEnvelope.details)?detailEnvelope.details.map(object):[];
 const paymentResponse=await readFinancialTransactionDetail({financialTransactionDetail:async()=>rawDetail},query),payment=paymentResponse.transaction?.kind==='payment'?paymentResponse.transaction:null;
 const raw=object(await reader.paymentAppliedInvoices(scope));
 if(!Array.isArray(raw.details)||raw.details.length>1000)throw new OperaError('invalid_response',undefined,'payment_probe_shape');
 const rows=raw.details.map(object),keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].sort();
 let sum=0n,known=0,invoiceSamples=0,invoiceSampleMatches=0;
 const signs={positive:0,negative:0,zero:0},sampleChecks={originalExact:0,originalMagnitude:0,currentExact:0,missingOriginal:0,appliedSamePaymentSign:0,appliedSameInvoiceSign:0,backPairs:0,backMagnitudeMatches:0,backSamePaymentSign:0};
 for(const row of rows){const amount=parseFinancialMoney(row.appliedAmount,payment?.currency==='THB'?'THB':undefined);if(amount!==null){sum+=magnitude(amount);known++;signs[amount.startsWith('-')?'negative':magnitude(amount)===0n?'zero':'positive']++;}}
 for(const row of rows.slice(0,3)){
  const id=String(row.transactionNo??'');if(!/^[1-9][0-9]{0,79}$/.test(id))continue;
  invoiceSamples++;
  const candidate=await readFinancialTransactionDetail(reader,{hotel:scope.hotel,accountId:scope.accountId,kind:'invoice',transactionId:id});
  if(candidate.status==='found'&&candidate.transaction?.kind==='invoice'){
   invoiceSampleMatches++;const invoice=candidate.transaction,original=parseFinancialMoney(row.originalAmount,payment?.currency==='THB'?'THB':undefined),applied=parseFinancialMoney(row.appliedAmount,payment?.currency==='THB'?'THB':undefined);
   if(invoice.originalAmount===null)sampleChecks.missingOriginal++;else if(original!==null){if(original===invoice.originalAmount)sampleChecks.originalExact++;if(magnitude(original)===magnitude(invoice.originalAmount))sampleChecks.originalMagnitude++;}
   if(original!==null&&original===invoice.currentAmount)sampleChecks.currentExact++;
   if(applied!==null&&payment?.amount!==null&&payment?.amount!==undefined&&applied.startsWith('-')===payment.amount.startsWith('-'))sampleChecks.appliedSamePaymentSign++;
   if(applied!==null&&invoice.currentAmount!==null&&applied.startsWith('-')===invoice.currentAmount.startsWith('-'))sampleChecks.appliedSameInvoiceSign++;
   const back=object(await reader.appliedInvoicePayments({hotel:scope.hotel,accountId:scope.accountId,invoiceTransactionId:id,...(invoice.invoiceNo&&/^\d+$/.test(invoice.invoiceNo)?{invoiceNo:invoice.invoiceNo}:{})}));
   const pairs=Array.isArray(back.details)?back.details.map(object).filter(v=>String(v.paymentTrxNo??v.transactionNo)===scope.paymentTransactionId):[];sampleChecks.backPairs+=pairs.length;
   if(pairs.length===1){const value=parseFinancialMoney(pairs[0].appliedAmount,payment?.currency==='THB'?'THB':undefined);if(value!==null&&applied!==null&&magnitude(value)===magnitude(applied))sampleChecks.backMagnitudeMatches++;if(value!==null&&payment?.amount!=null&&value.startsWith('-')===payment.amount.startsWith('-'))sampleChecks.backSamePaymentSign++;}
  }
 }
 return {
  hotel:scope.hotel,paymentFound:!!payment,paymentAmountKnown:payment?.amount!=null,
  detailInvoiceRows:groups.reduce((n,g)=>n+(Array.isArray(g.invoices)?g.invoices.length:0),0),
  detailPaymentRows:groups.reduce((n,g)=>n+(Array.isArray(g.payments)?g.payments.length:0),0),
  historyRows:rows.length,historyKeys:keys,knownAppliedAmounts:known,
  appliedTotalMatches:known===rows.length&&payment?.appliedAmount!==null&&payment?.appliedAmount!==undefined&&sum===magnitude(payment.appliedAmount),
  invoiceSamples,invoiceSampleMatches,signs,sampleChecks,
 };
}
