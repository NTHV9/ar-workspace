import {OperaError,type OperaReader} from './client';
import {parseAppliedPaymentMapping,parseFinancialMoney,readFinancialTransactionDetail,type AppliedPaymentLink,type AppliedPaymentQuery,type FinancialInvoice,type FinancialPayment,type FinancialReadOptions} from './financial-history';

const bad=(stage:string):never=>{throw new OperaError('invalid_response',undefined,stage);};
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return bad('financial_mapping_shape');return value as Record<string,unknown>;};
const cents=(value:string)=>BigInt(value.replace('.',''));
const magnitude=(value:bigint)=>value<0n?-value:value;
const decimal=(value:bigint)=>`${value<0n?'-':''}${magnitude(value)/100n}.${String(magnitude(value)%100n).padStart(2,'0')}`;
const identity=(value:unknown)=>{if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)return String(value);if(typeof value==='string'&&/^[1-9][0-9]{0,79}$/.test(value))return value;return bad('financial_mapping_identity');};
const invoiceFacts=(value:FinancialInvoice)=>JSON.stringify([value.hotel,value.accountId,value.transactionId,value.invoiceNo,value.currentAmount,value.cumulativePayments,value.openAmount,value.collectionRole]);
async function invoiceDetail(reader:OperaReader,query:AppliedPaymentQuery,options:FinancialReadOptions){
 const response=await readFinancialTransactionDetail(reader,{hotel:query.hotel,accountId:query.accountId,kind:'invoice',transactionId:query.invoiceTransactionId},options);
 const invoice=response.transaction;if(response.status!=='found'||invoice?.kind!=='invoice')return bad('financial_mapping_invoice_identity');
 if(query.invoiceNo!==undefined&&invoice.invoiceNo!==null&&invoice.invoiceNo!==query.invoiceNo)return bad('financial_mapping_invoice_reference');
 // A sparse detail response supplies no new collection eligibility. The ingest
 // caller independently selects standalone/parent rows from scoped history.
 if(invoice.collectionRole==='child')return bad('financial_mapping_child');
 return invoice;
}
export interface CorroboratedApplications {
 links:AppliedPaymentLink[];payments:FinancialPayment[];
 coverage:{contract:'expanded_invoice_rows_correlated_v1'|'scoped_payment_rows_correlated_v1';invoiceTotalsReconciled:true;applicationEventHistory:false;observedAt:string;completeness:'invoice_totals_reconciled';dateSemantics:'no_application_event_date'};
}
/** Reads only fixed OPERA paths. Returned links are current observations, never dated application events.
 * Slim rows identify payments in this environment, unlike the inherited invoice-row schema.
 * Independent scoped invoice/payment reads and monetary reconciliation are mandatory. */
export async function readCorroboratedApplications(reader:OperaReader,query:AppliedPaymentQuery,options:FinancialReadOptions={},responseAlreadyRead?:unknown):Promise<CorroboratedApplications>{
 const before=await invoiceDetail(reader,query,options);
 if(before.currentAmount===null||before.openAmount===null||before.cumulativePayments===null)return bad('financial_mapping_invoice_amounts');
 const envelope=record(responseAlreadyRead??await reader.appliedInvoicePayments(query));
 if(!Array.isArray(envelope.details)||envelope.details.length>(options.maxRows??5000))return bad('financial_mapping_shape');
 for(const key of ['errors','warnings'])if(envelope[key]!==undefined&&(!Array.isArray(envelope[key])||envelope[key].length))return bad('financial_mapping_upstream_notice');
 const rows=envelope.details.map(record),expanded=rows.length>0&&rows.every(row=>row.paymentTrxNo!==undefined);
 if(!expanded&&rows.some(row=>row.paymentTrxNo!==undefined))return bad('financial_mapping_mixed_contract');
 const parsed=expanded?parseAppliedPaymentMapping(envelope,query,options).links:null;
 const links:AppliedPaymentLink[]=[],payments:FinancialPayment[]=[];const seen=new Set<string>();
 for(const [index,row]of rows.entries()){
  if(row.hotelId!==undefined&&row.hotelId!==query.hotel||row.accountId!==undefined&&record(row.accountId).id!==query.accountId)return bad('financial_mapping_scope');
  const paymentId=expanded?parsed![index].paymentTransactionId:identity(row.transactionNo);if(seen.has(paymentId))return bad('financial_mapping_duplicate');seen.add(paymentId);
  const detail=await readFinancialTransactionDetail(reader,{hotel:query.hotel,accountId:query.accountId,kind:'payment',transactionId:paymentId},options);
  const payment=detail.transaction;if(detail.status!=='found'||payment?.kind!=='payment'||payment.amount===null)return bad('financial_mapping_payment');
  const applied=parseFinancialMoney(row.appliedAmount);if(applied===null)return bad('financial_mapping_amount');
  const raw=cents(applied),paid=cents(payment.amount);
  if(magnitude(raw)>magnitude(paid)||paid===0n&&raw!==0n)return bad('financial_mapping_payment_amount');
  if(!expanded){
   const original=parseFinancialMoney(row.originalAmount);
   if(original===null||magnitude(cents(original))!==magnitude(paid))return bad('financial_mapping_payment_amount');
   if(typeof row.postingDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.postingDate)||row.postingDate!==payment.postingDate&&row.postingDate!==payment.transactionDate)return bad('financial_mapping_payment_date');
   if(raw!==0n&&(raw<0n)!==(paid<0n))return bad('financial_mapping_payment_sign');
  }
  // Credit payments reduce an invoice; debit payment postings reverse that reduction.
  const allocated=paid<0n?magnitude(raw):-magnitude(raw);
  links.push({hotel:query.hotel,accountId:query.accountId,invoiceTransactionId:query.invoiceTransactionId,paymentTransactionId:paymentId,invoiceNo:before.invoiceNo,appliedAmount:decimal(allocated),currency:'THB',invoiceTransactionDate:before.transactionDate,invoicePostingDate:before.postingDate,invoiceCloseDate:before.closeDate,applicationDate:null,applicationEventId:null});payments.push(payment);
 }
 const total=links.reduce((sum,link)=>sum+cents(link.appliedAmount!),0n),invoiceApplied=cents(before.currentAmount)-cents(before.openAmount);
 if(total!==invoiceApplied||magnitude(total)!==magnitude(cents(before.cumulativePayments)))return bad('financial_mapping_total');
 const after=await invoiceDetail(reader,query,options);if(invoiceFacts(before)!==invoiceFacts(after))return bad('financial_mapping_changed');
 return {links,payments,coverage:{contract:expanded?'expanded_invoice_rows_correlated_v1':'scoped_payment_rows_correlated_v1',invoiceTotalsReconciled:true,applicationEventHistory:false,observedAt:options.observedAt??new Date().toISOString(),completeness:'invoice_totals_reconciled',dateSemantics:'no_application_event_date'}};
}
