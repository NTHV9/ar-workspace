import type {Hotel,RemittanceInput} from '../../src/remittance/model';
import {amountToSatang,parseAmount} from '../../src/remittance/money';
export {amountToSatang,parseAmount,satangToAmount} from '../../src/remittance/money';

const fail=(code='remittance_invalid'):never=>{throw Error(code);};
const controls=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
export function remittanceObject(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 return value as Record<string,unknown>;
}
function keys(value:Record<string,unknown>,allowed:string[],code='remittance_invalid') {if(Object.keys(value).some(key=>!allowed.includes(key)))fail(code);}
export function parseRemittanceId(value:unknown):string {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return fail('remittance_id_invalid');
 return value.toLowerCase();
}
export function parseRevision(value:unknown):number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>2147483647)return fail('remittance_revision_invalid');
 return value;
}
function text(value:unknown,max:number,code='remittance_invalid'):string {
 if(typeof value!=='string'||value.length>max||controls.test(value))return fail(code);
 return value.trim();
}
function identity(value:unknown,code:string):string {
 if(typeof value!=='string'||!value||value.length>200||value.trim()!==value||/[\x00-\x1f\x7f]/.test(value))return fail(code);
 return value;
}
function hotel(value:unknown,code:string):Hotel {if(value!=='KAT'&&value!=='TSK')return fail(code);return value;}
function date(value:unknown,code:string):string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-'))return fail(code);
 const time=Date.parse(value+'T00:00:00Z');
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)return fail(code);
 return value;
}
export function thaiToday(now=new Date()):string {return new Date(now.getTime()+7*60*60*1000).toISOString().slice(0,10);}
function reason(value:unknown,required=true):string {
 const result=text(value,1000,'remittance_reason_required');
 if(required&&!result)return fail('remittance_reason_required');
 return result;
}
function confirmed(value:unknown):true {if(value!==true)return fail('remittance_confirmation_required');return true;}

export function parseRemittanceInput(value:unknown,now=new Date()):RemittanceInput {
 const v=remittanceObject(value);
 keys(v,['commandId','revision','confirmed','hotel','accountId','receivedDate','reference','sourceNote','notes','reportedAmount','lines','changeReason']);
 const commandId=parseRemittanceId(v.commandId),revision=parseRevision(v.revision);
 const scopeHotel=hotel(v.hotel,'remittance_scope_invalid'),accountId=identity(v.accountId,'remittance_scope_invalid');
 const receivedDate=date(v.receivedDate,'remittance_date_invalid');if(receivedDate>thaiToday(now))return fail('remittance_date_invalid');
 const reference=text(v.reference,200,'remittance_reference_required');if(!reference)return fail('remittance_reference_required');
 const reportedAmount=parseAmount(v.reportedAmount);
 if(!Array.isArray(v.lines)||v.lines.length<1)return fail('remittance_lines_invalid');
 if(v.lines.length>5000)return fail('remittance_too_many_lines');
 const seen=new Set<string>();let allocated=0n;
 const lines=v.lines.map(value=>{
  let line:Record<string,unknown>;try{line=remittanceObject(value);}catch{return fail('remittance_lines_invalid');}
  keys(line,['invoiceId','reportedAmount'],'remittance_lines_invalid');
  const invoiceId=identity(line.invoiceId,'remittance_lines_invalid');
  if(seen.has(invoiceId))return fail('remittance_duplicate_invoice');seen.add(invoiceId);
  const amount=parseAmount(line.reportedAmount);if(amount!==null)allocated+=amountToSatang(amount);
  return {invoiceId,reportedAmount:amount};
 });
 if(reportedAmount!==null&&allocated>amountToSatang(reportedAmount))return fail('remittance_allocation_exceeded');
 return {commandId,revision,confirmed:confirmed(v.confirmed),hotel:scopeHotel,accountId,receivedDate,reference,sourceNote:text(v.sourceNote,4000),notes:text(v.notes,4000),reportedAmount,lines,changeReason:reason(v.changeReason,revision>0)};
}
export interface RemittanceFileAction {commandId:string;revision:number;reason:string;confirmed:true}
export function parseRemittanceFileAction(value:unknown):RemittanceFileAction {
 const v=remittanceObject(value);keys(v,['commandId','revision','reason','confirmed']);
 const revision=parseRevision(v.revision);if(revision<1)return fail('remittance_revision_invalid');
 return {commandId:parseRemittanceId(v.commandId),revision,reason:reason(v.reason),confirmed:confirmed(v.confirmed)};
}
export function parseRemittanceStatus(value:unknown):RemittanceFileAction&{status:'active'|'voided'} {
 const v=remittanceObject(value);keys(v,['commandId','revision','reason','confirmed','status']);
 if(v.status!=='active'&&v.status!=='voided')return fail('remittance_status_invalid');
 return {...parseRemittanceFileAction({commandId:v.commandId,revision:v.revision,reason:v.reason,confirmed:v.confirmed}),status:v.status};
}
export function parseRemittanceDiagnostic(value:unknown):{commandId:string;confirmed:true} {
 const v=remittanceObject(value);keys(v,['commandId','confirmed']);
 return {commandId:parseRemittanceId(v.commandId),confirmed:confirmed(v.confirmed)};
}

function queryKeys(params:URLSearchParams,allowed:string[]) {
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)fail('remittance_query_invalid');
}
function queryNumber(value:string|null,fallback:number,min:number,max:number):number {
 if(value===null)return fallback;
 if(!/^(0|[1-9][0-9]*)$/.test(value))return fail('remittance_query_invalid');
 const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)return fail('remittance_query_invalid');return n;
}
export function parseRemittancePage(params:URLSearchParams,defaultLimit=50):{offset:number;limit:number} {
 const page=queryNumber(params.get('page'),0,0,2147483647),limit=queryNumber(params.get('limit'),defaultLimit,1,200);
 if(params.getAll('page').length>1||params.getAll('limit').length>1||page*limit>2147483647)return fail('remittance_query_invalid');
 return {offset:page*limit,limit};
}
export function parseRemittanceHistoryQuery(params:URLSearchParams) {queryKeys(params,['page','limit']);return parseRemittancePage(params,20);}
export function parseRemittanceInvoiceQuery(params:URLSearchParams) {
 queryKeys(params,['hotel','accountId','search','page','limit']);
 return {hotel:hotel(params.get('hotel'),'remittance_query_invalid'),accountId:identity(params.get('accountId'),'remittance_query_invalid'),search:text(params.get('search')??'',200,'remittance_query_invalid'),...parseRemittancePage(params)};
}
export function parseRemittanceFilters(params:URLSearchParams) {
 queryKeys(params,['view','hotel','accountId','type','search','from','to','includeVoided','page','limit']);
 const view=params.get('view')??'pending';if(!['pending','activity','all'].includes(view))return fail('remittance_query_invalid');
 const hotelValue=params.get('hotel'),account=params.get('accountId');
 const scopeHotel=hotelValue?hotel(hotelValue,'remittance_query_invalid'):null,accountId=account?identity(account,'remittance_query_invalid'):null;
 if(accountId&&!scopeHotel)return fail('remittance_query_invalid');
 const fromValue=params.get('from'),toValue=params.get('to');
 const from=fromValue?date(fromValue,'remittance_query_invalid'):null,to=toValue?date(toValue,'remittance_query_invalid'):null;
 if(view==='activity'&&(!from||!to||from>to))return fail('remittance_query_invalid');
 const includeVoided=params.get('includeVoided')??'false';if(!['true','false'].includes(includeVoided))return fail('remittance_query_invalid');
 return {view:view as 'pending'|'activity'|'all',hotel:scopeHotel,accountId,type:params.get('type')?text(params.get('type'),200,'remittance_query_invalid'):null,search:text(params.get('search')??'',200,'remittance_query_invalid'),from:view==='activity'?from:null,to:view==='activity'?to:null,includeVoided:includeVoided==='true',...parseRemittancePage(params)};
}

/** JSON commands and file byte uploads have separate explicit resource budgets. */
export async function readRemittanceJson(request:Request):Promise<Record<string,unknown>> {
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail();
 const limit=1024*1024;
 const declared=request.headers.get('Content-Length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))return fail('remittance_request_too_large');
 const reader=request.body?.getReader();if(!reader)return fail();
 const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,body='';
 try {
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();return fail('remittance_request_too_large');}body+=decoder.decode(part.value,{stream:true});}
  body+=decoder.decode();
 }catch(error){if(error instanceof Error&&error.message==='remittance_request_too_large')throw error;return fail();}
 finally{reader.releaseLock();}
 try{return remittanceObject(JSON.parse(body));}catch{return fail();}
}
