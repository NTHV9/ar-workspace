import type {AcceptanceEnv} from '../acceptance/routing';
import {acceptanceTransport,checkedAcceptanceFixture} from '../acceptance/fixture';
import {backendRpc} from '../refresh/backend';
import { OperaReader, OperaError } from './client';
import { createTokenProvider } from './auth';
import { normalizeAccount } from './normalize';
import {isHotelId} from '../../src/domain/hotels';
import {configuredOperaHotels} from '../hotels';
import {balanceReconciliationDiagnostic} from './balance-diagnostic';
export interface OperaEnv extends AcceptanceEnv { OPERA_BASE_URL?:string; OPERA_ENTERPRISE_ID?:string; OPERA_HOTEL_IDS?:string; OPERA_CLIENT_ID?:string; OPERA_CLIENT_SECRET?:string; OPERA_APP_KEY?:string; OPERA_SCOPE?:string; OPERA_TIMEOUT_MS?:string }
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new OperaError('invalid_response');return value as Record<string,unknown>;}
export function makeReader(env:OperaEnv,hotel:string,sharedToken?:()=>Promise<string>) {
  if(!isHotelId(hotel))throw new OperaError('invalid_configuration');
  if(env.ACCEPTANCE){const scoped=env as OperaEnv&{SUPABASE_URL?:string;SUPABASE_SECRET_KEY?:string};const fixture=backendRpc<unknown>(scoped,'ar_acceptance_fixture',{p_actor:env.ACCEPTANCE.owner,p_id:env.ACCEPTANCE.id}).then(checkedAcceptanceFixture);return new OperaReader({origin:'https://ar-acceptance.invalid',appKey:'synthetic-test-only',hotelId:hotel},async()=> 'synthetic-test-only',acceptanceTransport(fixture,hotel));}
  if(!env.OPERA_BASE_URL||!env.OPERA_CLIENT_ID||!env.OPERA_CLIENT_SECRET||!env.OPERA_APP_KEY||!configuredOperaHotels(env.OPERA_HOTEL_IDS).includes(hotel))throw new OperaError('invalid_configuration');
  const getToken=sharedToken??createTokenProvider(env.OPERA_BASE_URL,env.OPERA_ENTERPRISE_ID??'',JSON.stringify({grantType:'client_credentials',clientId:env.OPERA_CLIENT_ID,clientSecret:env.OPERA_CLIENT_SECRET,appKey:env.OPERA_APP_KEY,scope:env.OPERA_SCOPE??'urn:opc:hgbu:ws:__myscopes__'}));
  return new OperaReader({origin:env.OPERA_BASE_URL,appKey:env.OPERA_APP_KEY,hotelId:hotel,timeoutMs:Number(env.OPERA_TIMEOUT_MS??60000)},getToken);
}
function shape(value:unknown,depth=0):unknown {
  if(value===null)return 'null';
  if(depth>5)return typeof value;
  if(Array.isArray(value))return {kind:'array',count:value.length,item:value.length?shape(value[0],depth+1):null};
  if(typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([k])=>!['links','warnings'].includes(k)).map(([k,v])=>[k,shape(v,depth+1)]));
  return typeof value;
}
function diagnosticDate(value:unknown):string|null {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const parsed=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:null;
}
function diagnosticInteger(value:unknown):number|null {return typeof value==='number'&&Number.isSafeInteger(value)?value:null;}
export function agingBasisDiagnostic(value:unknown,hotel:string):{status:'verified';basis:'ART'|'INC'|'COD'|'ING'}|{status:'unavailable';reason:'invalid_response'|'missing_or_ambiguous'} {
  try{
    const root=object(value);
    if(!Array.isArray(root.groups))return {status:'unavailable',reason:'invalid_response'};
    const rows=root.groups.flatMap(raw=>{
      const group=object(raw);
      if(!Array.isArray(group.appSettings))throw new OperaError('invalid_response');
      return group.appSettings.flatMap(rawSetting=>{
        const setting=object(rawSetting);
        if(setting.settings!==undefined&&!Array.isArray(setting.settings))throw new OperaError('invalid_response');
        return [setting,...Array.isArray(setting.settings)?setting.settings.map(object):[]];
      });
    });
    const matches=rows.filter(row=>row.name==='DATE_FOR_AGING'&&row.hotelId===hotel);
    if(matches.length!==1)return {status:'unavailable',reason:'missing_or_ambiguous'};
    const basis=matches[0].value;
    if(basis!=='ART'&&basis!=='INC'&&basis!=='COD'&&basis!=='ING')return {status:'unavailable',reason:'invalid_response'};
    return {status:'verified',basis};
  }catch{return {status:'unavailable',reason:'invalid_response'};}
}
function diagnosticAgingDate(value:unknown) {
  const range=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  return {start:diagnosticDate(range.start),end:diagnosticDate(range.end)};
}
function diagnosticInvoiceDatePatterns(value:unknown,businessDate:unknown) {
  if(!Array.isArray(value))return null;
  const business=diagnosticDate(businessDate);
  const dayDelta=(candidate:unknown)=>{
    const source=diagnosticDate(candidate);
    return business&&source?(Date.parse(`${business}T00:00:00Z`)-Date.parse(`${source}T00:00:00Z`))/86400000:null;
  };
  const patterns=value.map(raw=>{
    const invoice=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    return {age:diagnosticInteger(invoice.age),compressed:typeof invoice.compressed==='boolean'?invoice.compressed:null,
      parentReferencePresent:typeof invoice.parentInvoiceNo==='string'?invoice.parentInvoiceNo.trim().length>0:typeof invoice.parentInvoiceNo==='number'&&Number.isSafeInteger(invoice.parentInvoiceNo)&&invoice.parentInvoiceNo>=0,
      dateDeltas:{transactionDate:dayDelta(invoice.transactionDate),transferDate:dayDelta(invoice.transferDate),postingDate:dayDelta(invoice.postingDate),revenueDate:dayDelta(invoice.revenueDate),folioDate:dayDelta(invoice.folioDate),closeDate:dayDelta(invoice.closeDate)}};
  });
  const grouped=new Map<string,typeof patterns[number]&{count:number}>();
  for(const pattern of patterns){
    const key=JSON.stringify(pattern),existing=grouped.get(key);
    if(existing)existing.count++;else grouped.set(key,{...pattern,count:1});
  }
  const all=[...grouped.values()],omitted=all.slice(100);
  return {groups:all.slice(0,100),omittedGroups:omitted.length,omittedInvoices:omitted.reduce((count,group)=>count+group.count,0)};
}
/** Private diagnostics only: categories, numeric ranges and validated calendar dates; no customer names, amounts, IDs or raw responses. */
export async function probeOpera(env:OperaEnv,hotel:string,requestedAccountId?:string,savePdf?:(bytes:Uint8Array,expected:Record<string,string>)=>Promise<void>) {
  const reader=makeReader(env,hotel);
  const agingBasisSettings=await reader.agingBasisSettings().then(raw=>agingBasisDiagnostic(raw,hotel)).catch(()=>({status:'unavailable' as const,reason:'provider_unavailable' as const}));
  const checked=async(stage:string,read:()=>Promise<unknown>)=>{try{return await read();}catch(e){throw e instanceof OperaError?new OperaError(e.code,e.upstreamStatus,e.stage??stage,e.providerMessage):new OperaError('provider_unavailable',undefined,stage);}};
  const discovery=object(await checked('account_discovery',()=>reader.accounts(0,20)));
  if(!Array.isArray(discovery.accountsDetails))throw new OperaError('invalid_response');
  const accounts=discovery.accountsDetails.map(object);
  const paging=[];
  const total=typeof discovery.totalResults==='number'?discovery.totalResults:accounts.length;
  for(const offset of [...new Set([20,Math.max(0,Math.floor((total-1)/20)*20)])].filter(x=>x<total&&x>0)){
    const page=object(await reader.accounts(offset,20));
    paging.push({requestedOffset:offset,returnedOffset:page.offset,limit:page.limit,count:Array.isArray(page.accountsDetails)?page.accountsDetails.length:null,hasMore:page.hasMore,totalResults:page.totalResults});
  }
  const selected=requestedAccountId?{hotelId:hotel,accountId:{id:requestedAccountId}}:accounts.find(a=>a.hotelId===hotel&&typeof a.accountId==='object'&&a.balance&&Number(object(a.balance).amount)>0)??accounts.find(a=>a.hotelId===hotel);
  if(!selected)return {hotel,status:'read_verified',discoveryCount:accounts.length,hasMore:discovery.hasMore??false,discoveryShape:shape(discovery),sampleAccount:false};
  const accountId=object(selected.accountId).id;
  if(typeof accountId!=='string')throw new OperaError('invalid_response');
  const [current,history,businessDate]=await Promise.all([checked('current_account',()=>reader.account(accountId)),checked('invoice_history',()=>reader.history(accountId,0,20)),checked('business_date',()=>reader.businessDate())]);
  const currentAccount=object(object(current).accountDetails);
  if(currentAccount.hotelId!==hotel||object(currentAccount.accountId).id!==accountId)throw new OperaError('invalid_response',undefined,'account_scope');
  const dates=object(businessDate).hotels;const date=Array.isArray(dates)?object(dates[0]).businessDate:null;
  const historyDetails=object(history).details;
  if(!Array.isArray(historyDetails))throw new OperaError('invalid_response',undefined,'history_shape');
  const historyInvoices=historyDetails.flatMap(raw=>{
    const group=object(raw);
    if(group.hotelId!==hotel||object(group.accountId).id!==accountId)throw new OperaError('invalid_response',undefined,'history_scope');
    if(group.invoices===undefined)return [];
    if(!Array.isArray(group.invoices))throw new OperaError('invalid_response',undefined,'history_shape');
    return group.invoices;
  });
  const statementSelection={status:'retired',source:'workspace'};
  const currentInvoices=object(object(current).accountDetails).invoices;
  const eligibleInvoices=Array.isArray(currentInvoices)?currentInvoices.map(object).filter(i=>i.balance&&Number(object(i.balance).amount)>0&&!i.parentInvoiceNo):[];
  const selectedInvoice=eligibleInvoices.find(i=>i.reservationId&&i.folioNo!==undefined)??eligibleInvoices[0];
  let nativeFolio:unknown={status:'selector_not_available'};
  if(selectedInvoice?.reservationId&&typeof selectedInvoice.folioDate==='string'&&selectedInvoice.folioNo!==undefined){
    try{
      const reservationId=String(object(selectedInvoice.reservationId).id);
      const history=object(await checked('folio_history',()=>reader.folioHistory(reservationId,selectedInvoice.folioDate as string)));
      const rows=Array.isArray(history.folioHistory)?history.folioHistory.map(object):[];
      const matching=rows.filter(r=>String(r.folioNo)===String(selectedInvoice.folioNo)&&String(r.invoiceNo)===String(selectedInvoice.invoiceNo)&&r.reservationInfo&&String(object(r.reservationInfo).reservationId)===reservationId);
      if(savePdf&&matching.length===1&&history.hasMore!==true&&rows.length===1&&typeof matching[0].folioWindowNo==='number'){
        const windowNo=matching[0].folioWindowNo;
        const report=object(await checked('folio_report',()=>reader.folioReport(reservationId,windowNo,selectedInvoice.folioDate as string)));
        const folio=object(report.folio);const bytes=typeof folio.folio==='string'?atob(folio.folio):'';
        nativeFolio={status:bytes.startsWith('%PDF-')?'native_pdf_received':'invalid_pdf',byteCount:bytes.length,hotelMatches:folio.hotelId===hotel,reservationMatches:folio.reservationId&&object(folio.reservationId).id===reservationId,selectorSource:'folio_history',selectedInvoiceTextVerified:false,stored:false};
      }else nativeFolio={status:'selector_ambiguous_or_missing',matching:matching.length,returned:rows.length};
    }catch(e){nativeFolio={status:'unavailable',code:e instanceof OperaError?e.code:'invalid_response',stage:e instanceof OperaError?e.stage:undefined,upstreamStatus:e instanceof OperaError?e.upstreamStatus:undefined,providerMessage:e instanceof OperaError?e.providerMessage:undefined};}
  }
  const normalizationChecks=[];
  let reservationFolioLookup:unknown={status:'no_selector'};
  if(selectedInvoice?.reservationId&&typeof selectedInvoice.folioDate==='string'){
    try{
      const reservationId=String(object(selectedInvoice.reservationId).id);
      const result=object(await reader.reservationFolios(reservationId,selectedInvoice.folioDate));
      const info=object(result.reservationFolioInformation),reservation=object(info.reservationInfo);
      const identityMatches=reservation.hotelId===hotel&&Array.isArray(reservation.reservationIdList)&&reservation.reservationIdList.map(object).some(r=>r.id===reservationId&&r.type==='Reservation');
      const windows=Array.isArray(info.folioHistory)?info.folioHistory.map(object):[];
      const all=windows.flatMap(w=>Array.isArray(w.folios)?w.folios.map(object).map(f=>({window:w.folioWindowNo,folio:f})):[]);
      const matches=all.filter(r=>String(r.folio.invoiceNo)===String(selectedInvoice.invoiceNo)&&String(r.folio.folioNo)===String(selectedInvoice.folioNo));
      reservationFolioLookup={status:'read',identityMatches,returned:all.length,matching:matches.length};
      if(savePdf&&identityMatches&&matches.length===1&&all.length===1&&typeof matches[0].window==='number'){
        const report=object(await checked('reservation_folio_report',()=>reader.folioReport(reservationId,matches[0].window as number,selectedInvoice.folioDate as string)));
        const folio=object(report.folio);const bytes=typeof folio.folio==='string'?atob(folio.folio):'';
        const reportScopeMatches=folio.hotelId===hotel&&!!folio.reservationId&&String(object(folio.reservationId).id)===reservationId;
        let stored=false;
        if(bytes.startsWith('%PDF-')&&reportScopeMatches&&savePdf){await savePdf(Uint8Array.from(bytes,c=>c.charCodeAt(0)),{hotel,accountId,reservationId,invoiceNo:String(selectedInvoice.invoiceNo),folioNo:String(selectedInvoice.folioNo)});stored=true;}
        reservationFolioLookup={status:bytes.startsWith('%PDF-')?'native_pdf_received':'invalid_pdf',byteCount:bytes.length,identityMatches,reportScopeMatches,returned:all.length,matching:matches.length,selectedInvoiceTextVerified:false,stored};
      }
    }
    catch(e){reservationFolioLookup={status:'unavailable',code:e instanceof OperaError?e.code:'invalid_response',stage:e instanceof OperaError?e.stage:undefined,upstreamStatus:e instanceof OperaError?e.upstreamStatus:undefined};}
  }
  for(const [sample,raw]of [['selected',current],['first',await reader.account(String(object(accounts[0].accountId).id))]] as const){
    const a=object(object(raw).accountDetails);const summary=a.summary?object(a.summary):{};
    let normalized='passed';try{normalizeAccount(raw,hotel,String(date));}catch(e){normalized=e instanceof OperaError?e.stage??e.code:'failed';}
    normalizationChecks.push({sample,normalized,businessDate:diagnosticDate(date),balanceDiagnostic:balanceReconciliationDiagnostic(raw),invoiceDatePatterns:diagnosticInvoiceDatePatterns(a.invoices,date),invoiceArrayPresent:Array.isArray(a.invoices),invoiceCount:Array.isArray(a.invoices)?a.invoices.length:null,summaryShape:shape(summary),agingRanges:Array.isArray(a.agingInfo&&object(a.agingInfo).aging)?(object(a.agingInfo).aging as unknown[]).map(b=>{const r=object(b);return {start:diagnosticInteger(r.agingStartDay),end:diagnosticInteger(r.agingEndDay),sequence:diagnosticInteger(r.sequence),agingDate:diagnosticAgingDate(r.agingDate)};}):null});
  }
  return {hotel,status:'read_verified',agingBasisSettings,statementSelection,nativeFolio,reservationFolioLookup,normalizationChecks,historyInvoiceDatePatterns:diagnosticInvoiceDatePatterns(historyInvoices,date),discoveryCount:accounts.length,hasMore:discovery.hasMore??false,discoveryPaging:{offset:discovery.offset,limit:discovery.limit,totalResults:discovery.totalResults},pagingChecks:paging,historyPaging:{offset:object(history).offset,limit:object(history).limit,totalResults:object(history).totalResults,hasMore:object(history).hasMore},discoveryShape:shape(discovery),currentShape:shape(current),historyShape:shape(history),businessDateShape:shape(businessDate),sampleAccount:true};
}
