import { OperaReader, OperaError } from './client';
import { createTokenProvider } from './auth';
export interface OperaEnv { OPERA_BASE_URL?:string; OPERA_ENTERPRISE_ID?:string; OPERA_HOTEL_IDS?:string; OPERA_CLIENT_ID?:string; OPERA_CLIENT_SECRET?:string; OPERA_APP_KEY?:string; OPERA_SCOPE?:string }
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new OperaError('invalid_response');return value as Record<string,unknown>;}
export function makeReader(env:OperaEnv,hotel:string) {
  if(!env.OPERA_BASE_URL||!env.OPERA_CLIENT_ID||!env.OPERA_CLIENT_SECRET||!env.OPERA_APP_KEY||!env.OPERA_HOTEL_IDS?.split(',').includes(hotel))throw new OperaError('invalid_configuration');
  const getToken=createTokenProvider(env.OPERA_BASE_URL,env.OPERA_ENTERPRISE_ID??'',JSON.stringify({grantType:'client_credentials',clientId:env.OPERA_CLIENT_ID,clientSecret:env.OPERA_CLIENT_SECRET,appKey:env.OPERA_APP_KEY,scope:env.OPERA_SCOPE??'urn:opc:hgbu:ws:__myscopes__'}));
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
  const discovery=object(await checked('account_discovery',()=>reader.accounts(0,50)));
  if(!Array.isArray(discovery.accountsDetails))throw new OperaError('invalid_response');
  const accounts=discovery.accountsDetails.map(object);
  const selected=accounts.find(a=>a.hotelId===hotel&&typeof a.accountId==='object'&&a.balance&&Number(object(a.balance).amount)>0)??accounts.find(a=>a.hotelId===hotel);
  if(!selected)return {hotel,status:'read_verified',discoveryCount:accounts.length,hasMore:discovery.hasMore??false,discoveryShape:shape(discovery),sampleAccount:false};
  const accountId=object(selected.accountId).id;
  if(typeof accountId!=='string')throw new OperaError('invalid_response');
  const [current,history,businessDate]=await Promise.all([checked('current_account',()=>reader.account(accountId)),checked('invoice_history',()=>reader.history(accountId,0,50)),checked('business_date',()=>reader.businessDate())]);
  return {hotel,status:'read_verified',discoveryCount:accounts.length,hasMore:discovery.hasMore??false,discoveryShape:shape(discovery),currentShape:shape(current),historyShape:shape(history),businessDateShape:shape(businessDate),sampleAccount:true};
}
