import {OperaError,type OperaReader} from './client';
import {mapFinancialReads} from './bounded-read';
import {parseFinancialMoney,readFinancialHistory,readFinancialTransactionDetail,readScopedFinancialInvoiceHistory,type AppliedPaymentLink,type FinancialInvoice,type FinancialPayment,type FinancialReadOptions,type FinancialScope} from './financial-history';

type Reader=Pick<OperaReader,'financialTransactionDetail'|'financialHistoryPage'|'paymentAppliedInvoices'|'invoiceHistory'|'appliedInvoicePayments'>;
type Obj=Record<string,unknown>;
const bad=(stage:string):never=>{throw new OperaError('invalid_response',undefined,'financial_payment_mapping_'+stage);};
const object=(value:unknown):Obj=>value&&typeof value==='object'&&!Array.isArray(value)?value as Obj:bad('shape');
const cents=(value:string)=>BigInt(value.replace('.',''));
const magnitude=(value:bigint)=>value<0n?-value:value;
const decimal=(value:bigint)=>`${value<0n?'-':''}${magnitude(value)/100n}.${String(magnitude(value)%100n).padStart(2,'0')}`;
const identity=(value:unknown,allowNonpositive=false):string=>{
 if(typeof value==='number'&&Number.isSafeInteger(value))value=String(value);
 if(typeof value!=='string'||value.length>80||!(/^-?(0|[1-9][0-9]*)$/).test(value)||value==='-0'||!allowNonpositive&&BigInt(value)<=0n)return bad('identity');return value;
};
const printedNumber=(value:unknown)=>{const n=identity(value,true);if(n.startsWith('-'))return bad('invoice_number');return n;};
function notice(row:Obj){
 for(const key of ['error','errors','warning','warnings'])if(row[key]!==undefined&&(!Array.isArray(row[key])||row[key].length))return bad('upstream_notice');
}
function returnedScope(row:Obj,scope:FinancialScope){
 notice(row);
 if(row.hotelId!==undefined&&row.hotelId!==scope.hotel||row.hotel!==undefined&&row.hotel!==scope.hotel)return bad('scope');
 if(row.hotelIds!==undefined&&(!Array.isArray(row.hotelIds)||row.hotelIds.length!==1||row.hotelIds[0]!==scope.hotel))return bad('scope');
 if(row.accountId!==undefined&&(typeof row.accountId==='string'?row.accountId:object(row.accountId).id)!==scope.accountId)return bad('scope');
 if(row.currencyCode!==undefined&&row.currencyCode!=='THB')return bad('currency');
}
function history(value:unknown,scope:FinancialScope,options:FinancialReadOptions):Obj[]{
 const envelope=object(value);returnedScope(envelope,scope);
 if(!Array.isArray(envelope.details))return bad('shape');
 if(envelope.details.length>(options.maxRows??100000))throw new OperaError('response_too_large',undefined,'financial_payment_mapping_row_budget');
 // This endpoint has no paging input. A claimed continuation cannot be fulfilled.
 if(envelope.hasMore!==undefined&&envelope.hasMore!==false)return bad('pagination');
 if(envelope.totalResults!==undefined&&envelope.totalResults!==envelope.details.length)return bad('pagination');
 if(envelope.offset!==undefined||envelope.limit!==undefined)return bad('pagination');
 return envelope.details.map(value=>{const row=object(value);returnedScope(row,scope);return row;});
}
function sourceDate(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-'))return bad('date');
 const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)return bad('date');return value;
}
function rowMoney(value:unknown):string{const amount=parseFinancialMoney(value,'THB');return amount===null?bad('missing_amount'):amount;}
const facts=(value:FinancialInvoice|FinancialPayment)=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
function checkedReader(reader:Reader,scope:FinancialScope):Reader{
 const checkGrouped=(value:unknown)=>{
  const envelope=object(value);returnedScope(envelope,scope);
  if(!Array.isArray(envelope.details))return bad('shape');
  for(const raw of envelope.details){
   const group=object(raw);returnedScope(group,scope);
   for(const key of ['invoices','payments']){
    if(group[key]!==undefined&&!Array.isArray(group[key]))return bad('shape');
    for(const row of group[key] as unknown[]??[])returnedScope(object(row),scope);
   }
  }
  return value;
 };
 return {
  financialTransactionDetail:async query=>checkGrouped(await reader.financialTransactionDetail(query)),
  financialHistoryPage:async(...args)=>checkGrouped(await reader.financialHistoryPage(...args)),
  invoiceHistory:async(...args)=>checkGrouped(await reader.invoiceHistory(...args)),
  paymentAppliedInvoices:reader.paymentAppliedInvoices.bind(reader),appliedInvoicePayments:reader.appliedInvoicePayments.bind(reader),
 };
}
function sameKnownFacts(detail:FinancialInvoice,context:FinancialInvoice){
 // A missing descriptor in detail supplies no role or date evidence. Every
 // shared descriptor must agree with the fully scoped history. Detail-only
 // optional dates remain independent observations; they do not overwrite it.
 for(const key of ['hotel','accountId','kind','transactionId','transactionDate','currency','transferredIn','transferredOut','invoiceNo','folioNo','invoiceType','originalAmount','currentAmount','cumulativePayments','openAmount','compressed','parentInvoiceNo'] as const){
  if(detail[key]!==null&&detail[key]!==context[key])return bad('invoice_facts');
 }
 for(const key of ['postingDate','revenueDate','transferDate','closeDate'] as const){
  if(detail[key]!==null&&context[key]!==null&&detail[key]!==context[key])return bad('invoice_facts');
 }
 if(detail.collectionRole==='child'||detail.collectionRole!=='unverified'&&detail.collectionRole!==context.collectionRole)return bad('invoice_role');
}
function allocation(payment:FinancialPayment){
 if(payment.currency!=='THB'||payment.transactionDate===null||payment.amount===null||payment.appliedAmount===null||payment.unallocatedAmount===null||payment.transfer!=='none_reported')return bad('payment_facts');
 sourceDate(payment.transactionDate);
 const amount=cents(payment.amount),used=magnitude(cents(payment.appliedAmount)),unallocated=magnitude(cents(payment.unallocatedAmount));
 if(magnitude(amount)!==used+unallocated)return bad('allocation');
 return {amount,used,direction:amount<0n?1n:amount>0n?-1n:0n};
}
function samePaymentFacts(actual:FinancialPayment,expected:FinancialPayment){
 for(const key of ['hotel','accountId','kind','transactionId','transactionDate','currency','amount','appliedAmount','unallocatedAmount'] as const){
  if(actual[key]!==expected[key])return bad('payment_changed');
 }
 for(const key of ['postingDate','revenueDate','transferDate','transactionCode','transferredIn','transferredOut'] as const){
  if(actual[key]!==null&&expected[key]!==null&&actual[key]!==expected[key])return bad('payment_changed');
 }
 if(actual.transferredIn===true||actual.transferredOut===true||expected.transferredIn===true||expected.transferredOut===true)return bad('payment_transfer');
}
async function paymentDetail(reader:Reader,expected:FinancialPayment,options:FinancialReadOptions){
 const result=await readFinancialTransactionDetail(reader,{hotel:expected.hotel,accountId:expected.accountId,kind:'payment',transactionId:expected.transactionId},options);
 if(result.status!=='found'||result.transaction?.kind!=='payment')return bad('payment_identity');
 samePaymentFacts(result.transaction,expected);return result.transaction;
}
async function paymentHistoryFacts(reader:Reader,expected:FinancialPayment,options:FinancialReadOptions){
 const result=await readFinancialHistory(reader,{hotel:expected.hotel,accountId:expected.accountId,start:expected.transactionDate!,end:expected.transactionDate!,kinds:['payment']},options);
 const matches=result.payments.filter(row=>row.transactionId===expected.transactionId);
 if(matches.length!==1)return bad('payment_history_identity');
 const payment=matches[0];samePaymentFacts(payment,expected);allocation(payment);
 if(payment.transferredIn!==false||payment.transferredOut!==false)return bad('payment_transfer');
 return payment;
}
interface InvoiceApplication {transactionId:string;invoiceNo:string;appliedAmount:string;originalAmount:string;postingDate:string;transactionDate:string|null}
function invoiceApplications(rows:Obj[],payment:FinancialPayment):InvoiceApplication[]{
 const seen=new Set<string>(),directed=allocation(payment);
 return rows.map(row=>{
  const transactionId=identity(row.transactionNo),invoiceNo=printedNumber(row.invoiceNo);
  if(seen.has(transactionId))throw new OperaError('duplicate_member',undefined,'financial_payment_mapping_invoice');seen.add(transactionId);
  if(row.paymentTrxNo!==undefined&&identity(row.paymentTrxNo)!==payment.transactionId)return bad('payment_identity');
  const appliedAmount=rowMoney(row.appliedAmount),originalAmount=rowMoney(row.originalAmount),applied=cents(appliedAmount);
  if(applied===0n||magnitude(applied)>directed.used)return bad('application_amount');
  return {transactionId,invoiceNo,appliedAmount,originalAmount,postingDate:sourceDate(row.postingDate),transactionDate:row.transactionDate==null?null:sourceDate(row.transactionDate)};
 });
}
function contextFor(application:InvoiceApplication,contexts:FinancialInvoice[]):FinancialInvoice{
 const matches=contexts.filter(row=>row.transactionId===application.transactionId);
 if(matches.length!==1)return bad('invoice_identity');
 const invoice=matches[0];
 if(invoice.invoiceNo!==application.invoiceNo)return bad('invoice_number');
 if(!['standalone','parent'].includes(invoice.collectionRole))return bad('invoice_role');
 if(invoice.currency!=='THB'||invoice.originalAmount===null||invoice.currentAmount===null||invoice.openAmount===null||invoice.cumulativePayments===null||invoice.transactionDate===null||invoice.entryClassification!=='invoice')return bad('invoice_facts');
 if(magnitude(cents(invoice.currentAmount)-cents(invoice.openAmount))!==magnitude(cents(invoice.cumulativePayments)))return bad('invoice_totals');
 if(application.originalAmount!==invoice.originalAmount)return bad('invoice_amount');
 if(application.postingDate!==invoice.postingDate&&application.postingDate!==invoice.transactionDate)return bad('invoice_date');
 if(application.transactionDate!==null&&application.transactionDate!==invoice.transactionDate)return bad('invoice_date');
 return invoice;
}
function pair(rows:Obj[],payment:FinancialPayment,invoice:FinancialInvoice,application:InvoiceApplication,paymentSources:readonly FinancialPayment[],invoiceSources:readonly FinancialInvoice[]){
 const seen=new Set<string>();let match:Obj|undefined,expandedMatch=false;
 for(const row of rows){
  const expanded=row.paymentTrxNo!==undefined;
  const id=identity(expanded?row.paymentTrxNo:row.transactionNo,true);
  if(seen.has(id))throw new OperaError('duplicate_member',undefined,'financial_payment_mapping_back_pair');seen.add(id);
  if(expanded&&(identity(row.transactionNo)!==invoice.transactionId||row.invoiceNo!==undefined&&printedNumber(row.invoiceNo)!==invoice.invoiceNo))return bad('back_invoice_identity');
  if(id===payment.transactionId){match=row;expandedMatch=expanded;}
 }
 if(!match)return bad('missing_back_pair');
 const applied=rowMoney(match.appliedAmount),amount=cents(applied);
 if(magnitude(amount)!==magnitude(cents(application.appliedAmount)))return bad('back_amount');
 if(!expandedMatch){
  if(magnitude(cents(rowMoney(match.originalAmount)))!==magnitude(cents(payment.amount!)))return bad('back_original_amount');
  if((amount<0n)!==(cents(payment.amount!)<0n))return bad('back_sign');
  const date=sourceDate(match.postingDate);
  if(date!==payment.transactionDate&&!paymentSources.some(source=>source.postingDate===date))return bad('back_date');
  if(match.transactionDate!=null&&sourceDate(match.transactionDate)!==payment.transactionDate)return bad('back_date');
 }else{
  if(match.transactionDate!=null&&sourceDate(match.transactionDate)!==invoice.transactionDate)return bad('back_date');
  if(match.postingDate!=null){const date=sourceDate(match.postingDate);if(!invoiceSources.some(source=>source.postingDate===date))return bad('back_date');}
 }
}
export interface PaymentApplications {
 payment:FinancialPayment;invoices:FinancialInvoice[];links:AppliedPaymentLink[];
 coverage:{contract:'payment_history_correlated_v1';paymentTotalsReconciled:true;invoicePairsCorroborated:true;applicationEventHistory:false;observedAt:string;completeness:'payment_totals_reconciled';dateSemantics:'no_application_event_date'};
}
/** Payment-date discovery reaches older invoices through two independent source
 * directions. No application event date, collection role, or missing zero is inferred. */
export async function readPaymentApplications(reader:Reader,expectedPayment:FinancialPayment,options:FinancialReadOptions={}):Promise<PaymentApplications>{
 reader=checkedReader(reader,expectedPayment);
 const payment=expectedPayment,detailBefore=await paymentDetail(reader,payment,options),scope={hotel:payment.hotel,accountId:payment.accountId};
 allocation(payment);
 const historyBefore=await paymentHistoryFacts(reader,payment,options);samePaymentFacts(detailBefore,historyBefore);
 const query={...scope,paymentTransactionId:payment.transactionId};
 const before=invoiceApplications(history(await reader.paymentAppliedInvoices(query),scope,options),payment),directed=allocation(payment);
 if(before.reduce((sum,row)=>sum+magnitude(cents(row.appliedAmount)),0n)!==directed.used)return bad('total');
 const numbers=[...new Set(before.map(row=>row.invoiceNo))],invoices:FinancialInvoice[]=[],links:AppliedPaymentLink[]=[];
 for(let offset=0;offset<numbers.length;offset+=20){
  const batch=numbers.slice(offset,offset+20),contexts=await readScopedFinancialInvoiceHistory(reader,scope,batch,options);
  const applications=before.filter(row=>batch.includes(row.invoiceNo));
  const details=await mapFinancialReads(applications,async application=>{
   const invoice=contextFor(application,contexts);
   const detail=await readFinancialTransactionDetail(reader,{...scope,kind:'invoice',transactionId:invoice.transactionId},options);
   if(detail.status!=='found'||detail.transaction?.kind!=='invoice')return bad('invoice_identity');
   sameKnownFacts(detail.transaction,invoice);
   pair(history(await reader.appliedInvoicePayments({...scope,invoiceTransactionId:invoice.transactionId,invoiceNo:invoice.invoiceNo!}),scope,options),payment,invoice,application,[detailBefore,historyBefore],[invoice,detail.transaction]);
   return {invoice,detail:detail.transaction,link:{...scope,invoiceTransactionId:invoice.transactionId,paymentTransactionId:payment.transactionId,invoiceNo:invoice.invoiceNo,appliedAmount:decimal(directed.direction*magnitude(cents(application.appliedAmount))),currency:'THB' as const,invoiceTransactionDate:invoice.transactionDate,invoicePostingDate:invoice.postingDate,invoiceCloseDate:invoice.closeDate,applicationDate:null,applicationEventId:null}};
  });
  const after=await readScopedFinancialInvoiceHistory(reader,scope,batch,options);
  if(JSON.stringify(contexts.map(facts).sort())!==JSON.stringify(after.map(facts).sort()))return bad('invoice_changed');
  await mapFinancialReads(details,async({invoice,detail})=>{
   const afterDetail=await readFinancialTransactionDetail(reader,{...scope,kind:'invoice',transactionId:invoice.transactionId},options);
   if(afterDetail.status!=='found'||afterDetail.transaction?.kind!=='invoice'||facts(detail)!==facts(afterDetail.transaction))return bad('invoice_changed');
  });
  for(const {invoice,link}of details){invoices.push(invoice);links.push(link);}
 }
 const after=invoiceApplications(history(await reader.paymentAppliedInvoices(query),scope,options),payment);
 const rowFacts=(rows:InvoiceApplication[])=>JSON.stringify(rows.map(row=>JSON.stringify(row)).sort());
 if(rowFacts(before)!==rowFacts(after))return bad('history_changed');
 const detailAfter=await paymentDetail(reader,payment,options);
 if(facts(detailBefore)!==facts(detailAfter))return bad('payment_changed');
 const historyAfter=await paymentHistoryFacts(reader,payment,options);
 if(facts(historyBefore)!==facts(historyAfter))return bad('payment_changed');
 samePaymentFacts(detailAfter,historyAfter);
 return {payment,invoices,links,coverage:{contract:'payment_history_correlated_v1',paymentTotalsReconciled:true,invoicePairsCorroborated:true,applicationEventHistory:false,observedAt:new Date(options.observedAt??Date.now()).toISOString(),completeness:'payment_totals_reconciled',dateSemantics:'no_application_event_date'}};
}
