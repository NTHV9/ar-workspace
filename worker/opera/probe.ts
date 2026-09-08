import { OperaReader, OperaError } from './client';
import { createTokenProvider } from './auth';
import { normalizeAccount } from './normalize';
export interface OperaEnv { OPERA_BASE_URL?:string; OPERA_ENTERPRISE_ID?:string; OPERA_HOTEL_IDS?:string; OPERA_CLIENT_ID?:string; OPERA_CLIENT_SECRET?:string; OPERA_APP_KEY?:string; OPERA_SCOPE?:string }
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new OperaError('invalid_response');return value as Record<string,unknown>;}
export function makeReader(env:OperaEnv,hotel:string,sharedToken?:()=>Promise<string>) {
  if(!env.OPERA_BASE_URL||!env.OPERA_CLIENT_ID||!env.OPERA_CLIENT_SECRET||!env.OPERA_APP_KEY||!env.OPERA_HOTEL_IDS?.split(',').includes(hotel))throw new OperaError('invalid_configuration');
  const getToken=sharedToken??createTokenProvider(env.OPERA_BASE_URL,env.OPERA_ENTERPRISE_ID??'',JSON.stringify({grantType:'client_credentials',clientId:env.OPERA_CLIENT_ID,clientSecret:env.OPERA_CLIENT_SECRET,appKey:env.OPERA_APP_KEY,scope:env.OPERA_SCOPE??'urn:opc:hgbu:ws:__myscopes__'}));
  return new OperaReader({origin:env.OPERA_BASE_URL,appKey:env.OPERA_APP_KEY,hotelId:hotel},getToken);
}
function shape(value:unknown,depth=0):unknown {
  if(value===null)return 'null';
  if(depth>5)return typeof value;
  if(Array.isArray(value))return {kind:'array',count:value.length,item:value.length?shape(value[0],depth+1):null};
  if(typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([k])=>!['links','warnings'].includes(k)).map(([k,v])=>[k,shape(v,depth+1)]));
  return typeof value;
}
/** Categorical private diagnostics only: no customer names, amounts, IDs or raw responses. */
export async function probeOpera(env:OperaEnv,hotel:string) {
  const reader=makeReader(env,hotel);
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
  const selected=accounts.find(a=>a.hotelId===hotel&&typeof a.accountId==='object'&&a.balance&&Number(object(a.balance).amount)>0)??accounts.find(a=>a.hotelId===hotel);
  if(!selected)return {hotel,status:'read_verified',discoveryCount:accounts.length,hasMore:discovery.hasMore??false,discoveryShape:shape(discovery),sampleAccount:false};
  const accountId=object(selected.accountId).id;
  if(typeof accountId!=='string')throw new OperaError('invalid_response');
  const [current,history,businessDate]=await Promise.all([checked('current_account',()=>reader.account(accountId)),checked('invoice_history',()=>reader.history(accountId,0,20)),checked('business_date',()=>reader.businessDate())]);
  const dates=object(businessDate).hotels;const date=Array.isArray(dates)?object(dates[0]).businessDate:null;
  const normalizationChecks=[];
  for(const [sample,raw]of [['selected',current],['first',await reader.account(String(object(accounts[0].accountId).id))]] as const){
    const a=object(object(raw).accountDetails);const summary=a.summary?object(a.summary):{};
    let normalized='passed';try{normalizeAccount(raw,hotel,String(date));}catch(e){normalized=e instanceof OperaError?e.stage??e.code:'failed';}
    normalizationChecks.push({sample,normalized,invoiceArrayPresent:Array.isArray(a.invoices),invoiceCount:Array.isArray(a.invoices)?a.invoices.length:null,summaryShape:shape(summary),agingRanges:Array.isArray(a.agingInfo&&object(a.agingInfo).aging)?(object(a.agingInfo).aging as unknown[]).map(b=>{const r=object(b);return {start:r.agingStartDay,end:r.agingEndDay,sequence:r.sequence};}):null});
  }
  return {hotel,status:'read_verified',normalizationChecks,discoveryCount:accounts.length,hasMore:discovery.hasMore??false,discoveryPaging:{offset:discovery.offset,limit:discovery.limit,totalResults:discovery.totalResults},pagingChecks:paging,historyPaging:{offset:object(history).offset,limit:object(history).limit,totalResults:object(history).totalResults,hasMore:object(history).hasMore},discoveryShape:shape(discovery),currentShape:shape(current),historyShape:shape(history),businessDateShape:shape(businessDate),sampleAccount:true};
}
