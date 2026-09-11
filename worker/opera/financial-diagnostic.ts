import {OperaError,type OperaErrorCode,type OperaReader} from './client';
import {readCorroboratedApplications} from './applied-payments';
import {makeReader} from './probe';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {readBusinessDate} from '../refresh/read-snapshot';
import {readFinancialHistory,readFinancialTransactionDetail,parseAppliedPaymentMapping,parseFinancialMoney,type FinancialHotel,type FinancialInvoice,type FinancialPayment,type FinancialHistoryResult,type FinancialReadOptions} from './financial-history';

export interface FinancialDiagnosticOptions {maxAccounts?:1|2;maxPages?:number;maxRows?:number}
type DiagnosticStage='candidates'|'business_date'|'history_20'|'history_10'|'adjacent_days'|'detail'|'mapping';
interface DiagnosticError {stage:DiagnosticStage;code:OperaErrorCode|'unavailable'}
interface DateCount {present:number;withinWindow:number}
type DateField='transactionDate'|'postingDate'|'revenueDate'|'transferDate'|'closeDate';
type DateFields=Record<DateField,DateCount>;
interface FieldShape {type:'null'|'array'|'object'|'string'|'number'|'boolean'|'undefined';count?:number;sample?:FieldShape;fields?:Record<string,FieldShape>}
interface MappingCorroboration {sampled:number;candidateIds:number;idsInWindow:number;paymentDetailsFound:number;originalAmountMatches:number;originalAbsolutePaymentMatches:number;originalInvoiceAmountMatches:number;appliedWithinPaymentAmount:number;appliedWithinInvoiceOriginal:number;paymentNegative:number;appliedPositive:number;postingDateMatches:number;paymentTransactionDateMatches:number;sourceInvoiceConfirmed:boolean;acceptedAsMapping:false;errors:number}
interface MappingCheck {status:'no_candidate'|'read'|'unavailable';links:number|null;knownAmounts:number|null;paymentLinksSeenInWindow:number|null;invoiceDatesPresent:number|null;applicationDatesPresent:0;complete:false;error?:DiagnosticError;shape?:FieldShape;identityChecks?:{sampled:number;hotelMatches:number;invoiceTransactionMatches:number;paymentIdentityPresent:number};parseStage?:string|null;corroboration?:MappingCorroboration;verifiedMapping?:{status:'verified'|'unavailable';links:number|null;invoiceTotalsReconciled:boolean;contract:string|null;failureStage:string|null}}
export interface FinancialDiagnosticSample {
 sample:number;status:'checked'|'unavailable';sameMembership:boolean|null;sameValues:boolean|null;
 invoices:number|null;payments:number|null;pages20:number|null;pages10:number|null;zeroInvoices:number|null;openingBalances:number|null;
 unknownPrimaryAmounts:number|null;transferFlaggedPayments:number|null;receiptClassification:'unknown';reversalClassification:'unknown';
 dateFields:{invoice:DateFields;payment:DateFields};adjacentDays:{checked:number;transactionDatesMatch:boolean|null;membershipMatchesWindow:boolean|null};
 detail:{status:'no_candidate'|'found'|'missing'|'unavailable';error?:DiagnosticError};mapping:MappingCheck;error?:DiagnosticError;
}
export interface FinancialDiagnosticResult {
 hotel:FinancialHotel;status:'checked'|'no_candidates'|'unavailable';windowDays:7;accountsChecked:number;candidatesSelected:number;
 readChecksPassed:boolean;financialPeriodCoverageVerified:false;applicationDatesVerified:false;samples:FinancialDiagnosticSample[];error?:DiagnosticError;
}
interface Candidate {accountId:string;invoiceTransactionId:string|null;invoiceNo:string|null}
const bad=():never=>{throw new OperaError('invalid_response',undefined,'financial_diagnostic_candidates');};
function candidates(value:unknown,hotel:FinancialHotel,limit:number):Candidate[] {
 if(!value||typeof value!=='object'||Array.isArray(value))return bad();const v=value as Record<string,unknown>;
 if(v.hotel!==hotel||!Array.isArray(v.accounts)||v.accounts.length>limit)return bad();const seen=new Set<string>();
 return v.accounts.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return bad();const row=value as Record<string,unknown>;
  if(typeof row.accountId!=='string'||!row.accountId||row.accountId.length>200||row.accountId.trim()!==row.accountId||/[\x00-\x1f\x7f/\\]/.test(row.accountId)||seen.has(row.accountId)||row.accountId==='.'||row.accountId==='..')return bad();seen.add(row.accountId);
  for(const key of ['invoiceTransactionId','invoiceNo'] as const)if(row[key]!==null&&(typeof row[key]!=='string'||row[key].length>80||!/^[1-9][0-9]*$/.test(row[key])))return bad();
  return {accountId:row.accountId,invoiceTransactionId:row.invoiceTransactionId as string|null,invoiceNo:row.invoiceNo as string|null};
 });
}
function error(stage:DiagnosticStage,value:unknown):DiagnosticError {return {stage,code:value instanceof OperaError?value.code:'unavailable'};}
const shapeFields=['details','invoices','payments','appliedPayments','invoicePayments','paymentDetails','hotelId','accountId','id','type','transactionNo','invoiceNo','paymentTrxNo','appliedAmount','amount','currencyCode','transactionDate','postingDate','closeDate','balance','originalAmount','warnings'];
function fieldShape(value:unknown,depth=0):FieldShape {
 const type=value===null?'null':Array.isArray(value)?'array':typeof value;
 if(!['null','array','object','string','number','boolean','undefined'].includes(type))return {type:'undefined'};
 const result:FieldShape={type:type as FieldShape['type']};
 if(Array.isArray(value)){result.count=value.length;if(value.length&&depth<4)result.sample=fieldShape(value[0],depth+1);}
 else if(value&&typeof value==='object'&&depth<4){const record=value as Record<string,unknown>;result.fields=Object.fromEntries(shapeFields.filter(key=>Object.hasOwn(record,key)).map(key=>[key,fieldShape(record[key],depth+1)]));}
 return result;
}
function mappingIdentityChecks(value:unknown,hotel:string,invoiceId:string){
 const items=value&&typeof value==='object'&&'details' in value&&Array.isArray(value.details)?value.details.slice(0,3):[];
 const records=items.map(item=>item&&typeof item==='object'?item as Record<string,unknown>:{});
 return {sampled:records.length,hotelMatches:records.filter(row=>row.hotelId===hotel).length,invoiceTransactionMatches:records.filter(row=>String(row.transactionNo)===invoiceId).length,paymentIdentityPresent:records.filter(row=>row.paymentTrxNo!==undefined&&row.paymentTrxNo!==null).length};
}
const parserStages=new Set(['financial_shape','financial_details','financial_hotel_scope','financial_account_scope','financial_mapping_identity','financial_transaction_identity','financial_identifier','financial_text','financial_currency','financial_amount','financial_amount_precision','financial_date','financial_upstream_error','financial_upstream_warning','financial_history_row_budget']);
async function corroborateSlimMapping(reader:OperaReader,value:unknown,scope:{hotel:FinancialHotel;accountId:string},payments:FinancialPayment[],sourceInvoice:FinancialInvoice|null,options:FinancialReadOptions):Promise<MappingCorroboration|undefined>{
 const details=value&&typeof value==='object'&&'details'in value&&Array.isArray(value.details)?value.details:[];
 const candidates=details.filter(row=>row&&typeof row==='object'&&!Object.hasOwn(row,'paymentTrxNo')&&Object.hasOwn(row,'transactionNo')).slice(0,3) as Record<string,unknown>[];
 if(!candidates.length)return undefined;
 const result:MappingCorroboration={sampled:candidates.length,candidateIds:0,idsInWindow:0,paymentDetailsFound:0,originalAmountMatches:0,originalAbsolutePaymentMatches:0,originalInvoiceAmountMatches:0,appliedWithinPaymentAmount:0,appliedWithinInvoiceOriginal:0,paymentNegative:0,appliedPositive:0,postingDateMatches:0,paymentTransactionDateMatches:0,sourceInvoiceConfirmed:sourceInvoice!==null,acceptedAsMapping:false,errors:0};
 const windowIds=new Set(payments.map(payment=>payment.transactionId));
 for(const row of candidates){
  const rawId=row.transactionNo;
  if(!(typeof rawId==='number'&&Number.isSafeInteger(rawId)&&rawId>0||typeof rawId==='string'&&/^[1-9][0-9]{0,79}$/.test(rawId))){result.errors++;continue;}
  const id=String(rawId);result.candidateIds++;if(windowIds.has(id))result.idsInWindow++;
  try{
   const detail=await readFinancialTransactionDetail(reader,{...scope,kind:'payment',transactionId:id},options);
   if(detail.status!=='found'||detail.transaction?.kind!=='payment')continue;result.paymentDetailsFound++;
   const original=parseFinancialMoney(row.originalAmount),applied=parseFinancialMoney(row.appliedAmount),payment=detail.transaction;
   const magnitude=(value:string)=>BigInt(value.replace('-','').replace('.',''));
   if(payment.amount?.startsWith('-'))result.paymentNegative++;
   if(applied!==null&&!applied.startsWith('-')&&magnitude(applied)>0n)result.appliedPositive++;
   if(original!==null&&payment.amount!==null&&magnitude(original)===magnitude(payment.amount))result.originalAbsolutePaymentMatches++;
   if(original!==null&&sourceInvoice?.originalAmount!==null&&sourceInvoice?.originalAmount!==undefined&&original===sourceInvoice.originalAmount)result.originalInvoiceAmountMatches++;
   if(applied!==null&&payment.amount!==null&&magnitude(applied)<=magnitude(payment.amount))result.appliedWithinPaymentAmount++;
   if(applied!==null&&sourceInvoice?.originalAmount!==null&&sourceInvoice?.originalAmount!==undefined&&magnitude(applied)<=magnitude(sourceInvoice.originalAmount))result.appliedWithinInvoiceOriginal++;
   if(original!==null&&payment.amount!==null&&original===payment.amount)result.originalAmountMatches++;
   if(typeof row.postingDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.postingDate)){
    if(payment.postingDate!==null&&row.postingDate===payment.postingDate)result.postingDateMatches++;
    if(payment.transactionDate!==null&&row.postingDate===payment.transactionDate)result.paymentTransactionDateMatches++;
   }
  }catch{result.errors++;}
 }
 return result;
}
function shifted(day:string,days:number):string {const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
type Row=FinancialInvoice|FinancialPayment;
function rows(result:FinancialHistoryResult):Row[] {return [...result.invoices,...result.payments];}
function fingerprint(data:Row[],values=false):string {return JSON.stringify(data.map(row=>JSON.stringify(values?row:[row.hotel,row.accountId,row.kind,row.transactionId])).sort());}
function dateFields(data:Row[],start:string,end:string):DateFields {
 const dates=(key:DateField)=>data.map(row=>key==='closeDate'?row.kind==='invoice'?row.closeDate:null:row[key]);
 const count=(key:DateField):DateCount=>{const values=dates(key);return {present:values.filter(v=>v!==null).length,withinWindow:values.filter(v=>v!==null&&v>=start&&v<=end).length};};
 return {transactionDate:count('transactionDate'),postingDate:count('postingDate'),revenueDate:count('revenueDate'),transferDate:count('transferDate'),closeDate:count('closeDate')};
}
function sample(index:number):FinancialDiagnosticSample {
 return {sample:index+1,status:'unavailable',sameMembership:null,sameValues:null,invoices:null,payments:null,pages20:null,pages10:null,zeroInvoices:null,openingBalances:null,unknownPrimaryAmounts:null,transferFlaggedPayments:null,receiptClassification:'unknown',reversalClassification:'unknown',dateFields:{invoice:dateFields([],'',''),payment:dateFields([],'','')},adjacentDays:{checked:0,transactionDatesMatch:null,membershipMatchesWindow:null},detail:{status:'no_candidate'},mapping:{status:'no_candidate',links:null,knownAmounts:null,paymentLinksSeenInWindow:null,invoiceDatesPresent:null,applicationDatesPresent:0,complete:false}};
}
/** All returned fields are categorical/aggregate. Candidate identities and source rows stay in memory. */
export async function runFinancialDiagnostic(env:RefreshEnv,hotel:FinancialHotel,options:FinancialDiagnosticOptions={}):Promise<FinancialDiagnosticResult> {
 const maxAccounts=options.maxAccounts??2,maxPages=options.maxPages??50,maxRows=options.maxRows??5000;
 if(!['KAT','TSK'].includes(hotel)||![1,2].includes(maxAccounts)||!Number.isSafeInteger(maxPages)||maxPages<1||!Number.isSafeInteger(maxRows)||maxRows<1)throw new OperaError('invalid_request',undefined,'financial_diagnostic_options');
 const result:FinancialDiagnosticResult={hotel,status:'unavailable',windowDays:7,accountsChecked:0,candidatesSelected:0,readChecksPassed:false,financialPeriodCoverageVerified:false,applicationDatesVerified:false,samples:[]};
 let selected:Candidate[];try{selected=candidates(await backendRpc(env,'ar_financial_diagnostic_candidates',{p_hotel:hotel,p_limit:maxAccounts}),hotel,maxAccounts);}catch(e){result.error=error('candidates',e);return result;}
 result.candidatesSelected=selected.length;if(!selected.length){result.status='no_candidates';return result;}
 let reader:ReturnType<typeof makeReader>,end:string;try{reader=makeReader(env,hotel);end=await readBusinessDate(reader,hotel);}catch(e){result.error=error('business_date',e);return result;}
 const start=shifted(end,-6),observedAt=new Date().toISOString();
 for(const [index,candidate]of selected.entries()){
  const entry=sample(index);result.samples.push(entry);result.accountsChecked++;let stage:DiagnosticStage='history_20';
  const scope={hotel,accountId:candidate.accountId},readOptions={observedAt,maxPages,maxRows};
  try{
   const twenty=await readFinancialHistory(reader,{...scope,start,end},{...readOptions,pageSize:20});entry.pages20=twenty.coverage.pages;
   entry.invoices=twenty.invoices.length;entry.payments=twenty.payments.length;entry.zeroInvoices=twenty.invoices.filter(i=>i.openAmount==='0.00').length;entry.openingBalances=twenty.invoices.filter(i=>i.entryClassification==='opening_balance').length;
   entry.unknownPrimaryAmounts=twenty.coverage.unknownPrimaryAmounts;entry.transferFlaggedPayments=twenty.payments.filter(p=>['in','out','both'].includes(p.transfer)).length;
   entry.dateFields={invoice:dateFields(twenty.invoices,start,end),payment:dateFields(twenty.payments,start,end)};
   stage='history_10';const ten=await readFinancialHistory(reader,{...scope,start,end},{...readOptions,pageSize:10});entry.pages10=ten.coverage.pages;
   const allRows=rows(twenty);entry.sameMembership=fingerprint(allRows)===fingerprint(rows(ten));entry.sameValues=fingerprint(allRows,true)===fingerprint(rows(ten),true);
   stage='adjacent_days';let dateMatches=true,membershipMatches=true;
   for(const day of [shifted(end,-1),end]){
    const single=await readFinancialHistory(reader,{...scope,start:day,end:day},{...readOptions,pageSize:20});const singleRows=rows(single);entry.adjacentDays.checked++;
    dateMatches&&=singleRows.every(row=>row.transactionDate===day);
    membershipMatches&&=fingerprint(singleRows)===fingerprint(allRows.filter(row=>row.transactionDate===day));
   }
   entry.adjacentDays.transactionDatesMatch=dateMatches;entry.adjacentDays.membershipMatchesWindow=membershipMatches;
   if(candidate.invoiceTransactionId!==null){
    stage='detail';let sourceInvoice:FinancialInvoice|null=null;try{const detail=await readFinancialTransactionDetail(reader,{...scope,kind:'invoice',transactionId:candidate.invoiceTransactionId},readOptions);entry.detail={status:detail.status};if(detail.transaction?.kind==='invoice')sourceInvoice=detail.transaction;}catch(e){entry.detail={status:'unavailable',error:error('detail',e)};}
    stage='mapping';try{
     const query={...scope,invoiceTransactionId:candidate.invoiceTransactionId,...(candidate.invoiceNo===null?{}:{invoiceNo:candidate.invoiceNo})};
     const raw=await reader.appliedInvoicePayments(query);entry.mapping.shape=fieldShape(raw);entry.mapping.identityChecks=mappingIdentityChecks(raw,hotel,candidate.invoiceTransactionId);
     entry.mapping.corroboration=await corroborateSlimMapping(reader,raw,scope,twenty.payments,sourceInvoice,readOptions);
     try{const verified=await readCorroboratedApplications(reader,query,readOptions,raw);entry.mapping.verifiedMapping={status:'verified',links:verified.links.length,invoiceTotalsReconciled:true,contract:verified.coverage.contract,failureStage:null};}catch(e){const failed=e instanceof OperaError&&/^financial_[a-z_]+$/.test(e.stage??'')?e.stage!:null;entry.mapping.verifiedMapping={status:'unavailable',links:null,invoiceTotalsReconciled:false,contract:null,failureStage:failed};}
     const mapping=parseAppliedPaymentMapping(raw,query,readOptions),paymentIds=new Set(twenty.payments.map(p=>p.transactionId));
     entry.mapping={...entry.mapping,status:'read',links:mapping.links.length,knownAmounts:mapping.links.filter(l=>l.appliedAmount!==null).length,paymentLinksSeenInWindow:mapping.links.filter(l=>paymentIds.has(l.paymentTransactionId)).length,invoiceDatesPresent:mapping.links.filter(l=>l.invoiceTransactionDate!==null).length,applicationDatesPresent:0,complete:false,parseStage:null};
    }catch(e){entry.mapping={...entry.mapping,status:'unavailable',error:error('mapping',e),parseStage:e instanceof OperaError&&e.stage&&parserStages.has(e.stage)?e.stage:null};}
   }
   entry.status='checked';
  }catch(e){entry.error=error(stage,e);}
 }
 result.status='checked';
 result.readChecksPassed=result.samples.every(s=>s.status==='checked'&&(s.invoices??0)+(s.payments??0)>0&&s.sameMembership===true&&s.sameValues===true&&s.adjacentDays.checked===2&&s.adjacentDays.transactionDatesMatch===true&&s.adjacentDays.membershipMatchesWindow===true&&s.dateFields.invoice.transactionDate.withinWindow===s.invoices&&s.dateFields.payment.transactionDate.withinWindow===s.payments&&!['unavailable','missing'].includes(s.detail.status)&&s.mapping.status!=='unavailable');
 return result;
}
