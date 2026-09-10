import {OperaError,type OperaReader,type FinancialReadScope,type FinancialHistoryRead} from './client';
import {collectPages,verifiedNextCursor} from './pagination';
import {historyRootCount} from './history-count';

export type FinancialHotel='KAT'|'TSK';
export type FinancialKind='invoice'|'payment';
export type FinancialAmount=string;
export interface FinancialScope {hotel:FinancialHotel;accountId:string}
export interface FinancialHistoryQuery extends FinancialScope {start:string;end:string;kinds?:readonly FinancialKind[]}
export interface FinancialReadOptions {pageSize?:10|20;maxPages?:number;maxRows?:number;observedAt?:string}
interface FinancialSourceRow extends FinancialScope {
 transactionId:string;transactionDate:string|null;postingDate:string|null;revenueDate:string|null;transferDate:string|null;
 currency:'THB'|null;transferredIn:boolean|null;transferredOut:boolean|null;
}
export interface FinancialInvoice extends FinancialSourceRow {
 kind:'invoice';invoiceNo:string|null;folioNo:string|null;invoiceType:'Normal'|'Credit'|'OldBalance'|'PasserBy'|null;
 originalAmount:FinancialAmount|null;currentAmount:FinancialAmount|null;cumulativePayments:FinancialAmount|null;openAmount:FinancialAmount|null;
 closeDate:string|null;compressed:boolean|null;parentInvoiceNo:string|null;collectionRole:'standalone'|'parent'|'child'|'unverified';
 entryClassification:'invoice'|'credit'|'opening_balance'|'unclassified';
}
export interface FinancialPayment extends FinancialSourceRow {
 kind:'payment';transactionCode:string|null;amount:FinancialAmount|null;appliedAmount:FinancialAmount|null;unallocatedAmount:FinancialAmount|null;
 transfer:'in'|'out'|'both'|'none_reported'|'unknown';classification:'unknown';reversal:'unknown';
}
export interface FinancialHistoryCoverage {
 query:FinancialHistoryRead;observedAt:string;pagination:'complete';pages:number;members:number;roots:number;reportedRoots:number;
 dateSemantics:'unverified';financialClassification:'unverified';completeForFinancialPeriod:false;
 missingTransactionDates:number;outsideRequestedTransactionDates:number;unknownPrimaryAmounts:number;
}
export interface FinancialHistoryResult {invoices:FinancialInvoice[];payments:FinancialPayment[];coverage:FinancialHistoryCoverage}
export interface FinancialDetailQuery extends FinancialScope {kind:FinancialKind;transactionId:string}
export interface FinancialTransactionDetail {
 status:'found'|'missing';transaction:FinancialInvoice|FinancialPayment|null;
 coverage:{query:FinancialDetailQuery;observedAt:string;endpoint:'transaction_detail';completeForFinancialPeriod:false};
}
export interface AppliedPaymentQuery extends FinancialScope {invoiceTransactionId:string;invoiceNo?:string}
export interface AppliedPaymentLink extends FinancialScope {
 invoiceTransactionId:string;paymentTransactionId:string;invoiceNo:string|null;appliedAmount:FinancialAmount|null;currency:'THB'|null;
 invoiceTransactionDate:string|null;invoicePostingDate:string|null;invoiceCloseDate:string|null;
 applicationDate:null;applicationEventId:null;
}
export interface AppliedPaymentMapping {
 links:AppliedPaymentLink[];
 coverage:{query:AppliedPaymentQuery;observedAt:string;pagination:'not_exposed';completeness:'unverified';dateSemantics:'invoice_dates_only';accountScope:'request_path';applicationEventHistory:false};
}
type Obj=Record<string,unknown>;
type Row=FinancialInvoice|FinancialPayment;
const bad=(stage:string):never=>{throw new OperaError('invalid_response',undefined,'financial_'+stage);};
const invalid=(stage:string):never=>{throw new OperaError('invalid_request',undefined,'financial_'+stage);};
function object(value:unknown):Obj {if(!value||typeof value!=='object'||Array.isArray(value))return bad('shape');return value as Obj;}
function calendar(value:unknown,optional=false):string|null {
 if(optional&&(value===undefined||value===null))return null;
 if(typeof value!=='string'||value.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-'))return bad('date');
 const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)return bad('date');return value;
}
function flag(value:unknown):boolean|null {if(value===undefined||value===null)return null;if(typeof value!=='boolean')return bad('flag');return value;}
function optionalText(value:unknown,max=200):string|null {
 if(value===undefined||value===null)return null;
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<0)return bad('identifier');return String(value);}
 if(typeof value!=='string'||!value||value.length>max||value.trim()!==value||/[\x00-\x1f\x7f]/.test(value))return bad('text');return value;
}
function transactionId(value:unknown,opening=false):string {
 if(typeof value==='number'){if(!Number.isSafeInteger(value))return bad('transaction_identity');value=String(value);}
 if(typeof value!=='string'||value.length>80||!(/^-?(0|[1-9][0-9]*)$/).test(value)||value==='-0'||!opening&&BigInt(value)<=0n)return bad('transaction_identity');
 return value;
}
function scope(query:FinancialReadScope):FinancialScope {
 if(!query||!['KAT','TSK'].includes(query.hotel)||typeof query.accountId!=='string'||!query.accountId||query.accountId.length>200||query.accountId.trim()!==query.accountId||query.accountId==='.'||query.accountId==='..'||/[\x00-\x1f\x7f/\\]/.test(query.accountId))return invalid('scope');
 return {hotel:query.hotel as FinancialHotel,accountId:query.accountId};
}
function historyQuery(query:FinancialHistoryQuery):FinancialHistoryRead {
 const identity=scope(query);let start:string|null,end:string|null;
 try{start=calendar(query.start);end=calendar(query.end);}catch{return invalid('history_query');}
 const kinds=query.kinds??['invoice','payment'];
 if(!start||!end||start>end||(Date.parse(end)-Date.parse(start))/86400000>=366||!Array.isArray(kinds)||!kinds.length||kinds.length>2||new Set(kinds).size!==kinds.length||kinds.some(k=>!['invoice','payment'].includes(k)))return invalid('history_query');
 return {...identity,start,end,kinds:[...kinds]};
}
function options(value:FinancialReadOptions={}) {
 const pageSize=value.pageSize??20,maxPages=value.maxPages??1000,maxRows=value.maxRows??100000;
 if(![10,20].includes(pageSize)||!Number.isSafeInteger(maxPages)||maxPages<1||!Number.isSafeInteger(maxRows)||maxRows<1)return invalid('read_budget');
 const observedAt=value.observedAt??new Date().toISOString();
 if(typeof observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt))||new Date(observedAt).toISOString().slice(0,19)!==observedAt.slice(0,19))return invalid('observation_time');
 return {pageSize,maxPages,maxRows,observedAt:new Date(observedAt).toISOString()};
}
/** Unknown is null. Number inputs must preserve integer satang; strings avoid Number entirely. */
export function parseFinancialMoney(value:unknown,verifiedCurrency?:'THB'):FinancialAmount|null {
 if(value===null||value===undefined)return null;
 const v=object(value);if(v.currencyCode===undefined?verifiedCurrency!=='THB':v.currencyCode!=='THB')return bad('currency');
 if(v.amount===null||v.amount===undefined)return null;
 if(typeof v.amount!=='number'&&typeof v.amount!=='string'||typeof v.amount==='number'&&!Number.isFinite(v.amount))return bad('amount');
 // At 2^46 the binary step is 0.015625: JSON.parse may already merge distinct satang.
 // Exact decimal strings remain safe beyond this numeric-input boundary.
 if(typeof v.amount==='number'&&Math.abs(v.amount)>=2**46)return bad('amount_precision');
 const raw=String(v.amount);if(raw.length>82||!/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.test(raw))return bad('amount_precision');
 const negative=raw.startsWith('-'),[whole,fraction='']=raw.replace(/^-/,'').split('.');const absolute=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(typeof v.amount==='number'&&absolute>BigInt(Number.MAX_SAFE_INTEGER))return bad('amount_precision');
 return `${negative&&absolute!==0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}
function currency(group:Obj):'THB'|undefined {
 if(group.summary===undefined||group.summary===null)return undefined;
 const summary=object(group.summary);if(summary.total===undefined||summary.total===null)return undefined;
 const total=object(summary.total);if(total.currencyCode===undefined)return undefined;
 parseFinancialMoney(total);return 'THB';
}
function checkReturnedScope(value:Obj,requested:FinancialScope,requireHotel=false) {
 if(requireHotel||value.hotelId!==undefined){if(value.hotelId!==requested.hotel)return bad('hotel_scope');}
 if(value.accountId!==undefined&&object(value.accountId).id!==requested.accountId)return bad('account_scope');
}
function sourceRow(value:Obj,requested:FinancialScope,opening=false):FinancialSourceRow {
 checkReturnedScope(value,requested);
 return {...requested,transactionId:transactionId(value.transactionNo,opening),transactionDate:calendar(value.transactionDate,true),postingDate:calendar(value.postingDate,true),revenueDate:calendar(value.revenueDate,true),transferDate:calendar(value.transferDate,true),currency:null,transferredIn:flag(value.transferredIn),transferredOut:flag(value.transferredOut)};
}
function readInvoice(value:Obj,requested:FinancialScope,verifiedCurrency?:'THB'):FinancialInvoice {
 let invoiceType:FinancialInvoice['invoiceType']=null;
 if(value.invoiceType!==undefined&&value.invoiceType!==null){if(!['Normal','Credit','OldBalance','PasserBy'].includes(String(value.invoiceType)))return bad('invoice_type');invoiceType=value.invoiceType as FinancialInvoice['invoiceType'];}
 const base=sourceRow(value,requested,invoiceType==='OldBalance'),originalAmount=parseFinancialMoney(value.originalAmount,verifiedCurrency),currentAmount=parseFinancialMoney(value.amount,verifiedCurrency),cumulativePayments=parseFinancialMoney(value.payments,verifiedCurrency),openAmount=parseFinancialMoney(value.balance,verifiedCurrency);
 const compressed=flag(value.compressed),parentInvoiceNo=value.parentInvoiceNo===undefined||value.parentInvoiceNo===null?null:transactionId(value.parentInvoiceNo);
 if(compressed===true&&parentInvoiceNo!==null)return bad('invoice_relationship');
 return {...base,kind:'invoice',currency:verifiedCurrency||[originalAmount,currentAmount,cumulativePayments,openAmount].some(a=>a!==null)?'THB':null,invoiceNo:optionalText(value.invoiceNo),folioNo:optionalText(value.folioNo),invoiceType,originalAmount,currentAmount,cumulativePayments,openAmount,closeDate:calendar(value.closeDate,true),compressed,parentInvoiceNo,
  collectionRole:parentInvoiceNo!==null?'child':compressed===true?'parent':compressed===false?'standalone':'unverified',entryClassification:invoiceType==='OldBalance'?'opening_balance':invoiceType==='Credit'?'credit':invoiceType===null?'unclassified':'invoice'};
}
function readPayment(value:Obj,requested:FinancialScope,verifiedCurrency?:'THB'):FinancialPayment {
 const base=sourceRow(value,requested),amount=parseFinancialMoney(value.amount,verifiedCurrency),appliedAmount=parseFinancialMoney(value.amountUsed,verifiedCurrency),unallocatedAmount=parseFinancialMoney(value.balance,verifiedCurrency);
 const transfer=base.transferredIn===true&&base.transferredOut===true?'both':base.transferredIn===true?'in':base.transferredOut===true?'out':base.transferredIn===false&&base.transferredOut===false?'none_reported':'unknown';
 return {...base,kind:'payment',currency:verifiedCurrency||[amount,appliedAmount,unallocatedAmount].some(a=>a!==null)?'THB':null,transactionCode:optionalText(value.transactionCode),amount,appliedAmount,unallocatedAmount,transfer,classification:'unknown',reversal:'unknown'};
}
function envelope(value:unknown):Obj {
 const result=object(value);
 if(result.error!==undefined||result.errors!==undefined)return bad('upstream_error');
 if(result.warnings!==undefined&&(!Array.isArray(result.warnings)||result.warnings.length))return bad('upstream_warning');
 if(!Array.isArray(result.details))return bad('details');return result;
}
function groupedRows(value:Obj,requested:FinancialScope,kinds:readonly FinancialKind[],countRoots=true):{rows:Row[];roots:number} {
 const rows:Row[]=[],countRows:{kind:FinancialKind;value:Obj}[]=[];
 for(const raw of value.details as unknown[]){
  const group=object(raw);if(group.hotelId!==requested.hotel||object(group.accountId).id!==requested.accountId)return bad('account_scope');const verifiedCurrency=currency(group);
  for(const kind of ['invoice','payment'] as const){
   const name=kind==='invoice'?'invoices':'payments',items=group[name];if(items===undefined)continue;if(!Array.isArray(items))return bad('rows');
   if(items.length&&!kinds.includes(kind))return bad('unexpected_kind');
   for(const item of items){const row=object(item);countRows.push({kind,value:row});rows.push(kind==='invoice'?readInvoice(row,requested,verifiedCurrency):readPayment(row,requested,verifiedCurrency));}
  }
 }
 return {rows,roots:countRoots?historyRootCount(countRows):rows.length};
}
function memberKey(row:Row):string {return JSON.stringify([row.hotel,row.accountId,row.kind,row.transactionId]);}
function split(rows:Row[]) {return {invoices:rows.filter((row):row is FinancialInvoice=>row.kind==='invoice'),payments:rows.filter((row):row is FinancialPayment=>row.kind==='payment')};}
function checkedUnique(rows:Row[]) {const seen=new Set<string>();for(const row of rows){const key=memberKey(row);if(seen.has(key))throw new OperaError('duplicate_member',undefined,'financial_transaction_identity');seen.add(key);}}

/** Completion means the returned query paginated cleanly, not that source date semantics are proved. */
export async function readFinancialHistory(reader:OperaReader,input:FinancialHistoryQuery,readOptions:FinancialReadOptions={}):Promise<FinancialHistoryResult> {
 const query=historyQuery(input),settings=options(readOptions),requested=scope(query);let pages=0,members=0,roots=0,reportedRoots=0;
 const rows=await collectPages(async(offset,limit)=>{
  if(pages>=settings.maxPages)throw new OperaError('response_too_large',undefined,'financial_history_page_budget');
  const result=envelope(await reader.financialHistoryPage(query,offset,limit));pages++;
  if(typeof result.totalResults!=='number'||!Number.isSafeInteger(result.totalResults)||result.totalResults<0)return bad('pagination_metadata');
  const page=groupedRows(result,requested,query.kinds);members+=page.rows.length;roots+=page.roots;reportedRoots=result.totalResults;
  if(members>settings.maxRows)throw new OperaError('response_too_large',undefined,'financial_history_row_budget');
  const emptyTerminal=page.rows.length===0&&result.totalResults===0&&result.hasMore===false;
  const nextOffset=emptyTerminal?undefined:verifiedNextCursor(result,offset,limit);
  return {rows:page.rows,logicalCount:page.roots,totalResults:result.totalResults,hasMore:result.hasMore as boolean|undefined,nextOffset};
 },memberKey,settings.pageSize);
 return {...split(rows),coverage:{query,observedAt:settings.observedAt,pagination:'complete',pages,members,roots,reportedRoots,dateSemantics:'unverified',financialClassification:'unverified',completeForFinancialPeriod:false,
  missingTransactionDates:rows.filter(r=>r.transactionDate===null).length,outsideRequestedTransactionDates:rows.filter(r=>r.transactionDate!==null&&(r.transactionDate<query.start||r.transactionDate>query.end)).length,unknownPrimaryAmounts:rows.filter(r=>(r.kind==='invoice'?r.originalAmount:r.amount)===null).length}};
}
export async function readFinancialTransactionDetail(reader:OperaReader,input:FinancialDetailQuery,readOptions:FinancialReadOptions={}):Promise<FinancialTransactionDetail> {
 const requested=scope(input),settings=options(readOptions);if(!['invoice','payment'].includes(input.kind))return invalid('kind');
 let requestedId:string;try{requestedId=transactionId(input.transactionId,input.kind==='invoice');}catch{return invalid('transaction_identity');}
 const query={...requested,kind:input.kind,transactionId:requestedId};
 const result=envelope(await reader.financialTransactionDetail(query));const {rows}=groupedRows(result,requested,['invoice','payment'],false);
 if(rows.length>settings.maxRows)throw new OperaError('response_too_large',undefined,'financial_history_row_budget');checkedUnique(rows);
 const transaction=rows.find(r=>r.kind===query.kind&&r.transactionId===query.transactionId)??null;
 return {status:transaction?'found':'missing',transaction,coverage:{query,observedAt:settings.observedAt,endpoint:'transaction_detail',completeForFinancialPeriod:false}};
}
export async function readAppliedPaymentMapping(reader:OperaReader,input:AppliedPaymentQuery,readOptions:FinancialReadOptions={}):Promise<AppliedPaymentMapping> {
 const requested=scope(input),settings=options(readOptions);let invoiceTransactionId:string;
 try{invoiceTransactionId=transactionId(input.invoiceTransactionId);}catch{return invalid('invoice_identity');}
 if(input.invoiceNo!==undefined&&(typeof input.invoiceNo!=='string'||!/^(0|[1-9][0-9]*)$/.test(input.invoiceNo)||input.invoiceNo.length>80))return invalid('invoice_identity');
 const query={...requested,invoiceTransactionId,...(input.invoiceNo===undefined?{}:{invoiceNo:input.invoiceNo})};
 const result=envelope(await reader.appliedInvoicePayments(query)),items=result.details as unknown[];if(items.length>settings.maxRows)throw new OperaError('response_too_large',undefined,'financial_history_row_budget');
 const seen=new Set<string>();const links:AppliedPaymentLink[]=items.map(item=>{
  const row=object(item);checkReturnedScope(row,requested,true);
  const sourceInvoice=transactionId(row.transactionNo),paymentTransactionId=transactionId(row.paymentTrxNo),invoiceNo=optionalText(row.invoiceNo);
  if(sourceInvoice!==invoiceTransactionId||query.invoiceNo!==undefined&&invoiceNo!==query.invoiceNo)return bad('mapping_identity');
  const key=JSON.stringify([sourceInvoice,paymentTransactionId]);if(seen.has(key))throw new OperaError('duplicate_member',undefined,'financial_mapping_identity');seen.add(key);
  const appliedAmount=parseFinancialMoney(row.appliedAmount);
  return {...requested,invoiceTransactionId:sourceInvoice,paymentTransactionId,invoiceNo,appliedAmount,currency:appliedAmount===null?null:'THB',invoiceTransactionDate:calendar(row.transactionDate,true),invoicePostingDate:calendar(row.postingDate,true),invoiceCloseDate:calendar(row.closeDate,true),applicationDate:null,applicationEventId:null};
 });
 return {links,coverage:{query,observedAt:settings.observedAt,pagination:'not_exposed',completeness:'unverified',dateSemantics:'invoice_dates_only',accountScope:'request_path',applicationEventHistory:false}};
}
