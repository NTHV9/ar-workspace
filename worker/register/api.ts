import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
import {exceptionScope} from '../collection/exceptions';
import {regionalHotelScope,resultMatchesHotelScope} from '../hotels';
import {hotelRegion} from '../../src/domain/hotels';
import {parseRegisterQuery,parseRegisterSave,parseRegisterVisibility} from './validation';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function invoiceRegisterApi(request:Request,env:RefreshEnv,workspaceActor:string){try{
 if(env.ACCEPTANCE)return json({error:'register_acceptance_unavailable'},409);
 const actor=env.REQUEST_ACCESS?.actorId??workspaceActor,url=new URL(request.url),parts=url.pathname.split('/');
 if(request.method!=='GET'&&(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:'register_forbidden'},403);
 const body=async()=>{if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw Error('register_invalid');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,65536)));}catch{throw Error('register_invalid');}};
 let value:Record<string,unknown>,region:'phuket'|'khao-lak',hotel=null;
 if(url.pathname==='/api/invoice-register'&&request.method==='GET'){
  const filter=parseRegisterQuery(url),scope=regionalHotelScope(url.searchParams,filter.account);region=scope.region;hotel=scope.hotel;
  value=await backendRpc(env,'ar_invoice_register_read',{p_actor:actor,p_filter:filter});
  if(!value.error&&(!Array.isArray(value.rows)||!Number.isSafeInteger(value.total)||!Number.isSafeInteger(value.hiddenTotal)||!value.summary))throw Error('register_unavailable');
 }else if(url.pathname==='/api/invoice-register/visibility'&&request.method==='POST'){
  for(const k of url.searchParams.keys())if(k!=='region'||url.searchParams.getAll(k).length!==1)throw Error('register_invalid');
  const scope=regionalHotelScope(url.searchParams);region=scope.region;value=await backendRpc(env,'ar_invoice_register_visibility',{p_actor:actor,p_scope:scope.reportHotel,p_input:parseRegisterVisibility(await body())});
 }else if((parts.length===6||parts.length===7&&parts[6]==='history')&&['GET','PUT'].includes(request.method)){
  const scope=exceptionScope(...parts.slice(3,6).map(decodeURIComponent) as [string,string,string]);hotel=scope.hotel;region=hotelRegion(scope.hotel);
  const args={p_actor:actor,p_hotel:hotel,p_account:scope.accountId,p_invoice:scope.invoiceId};
  if(parts[6]==='history'&&request.method==='GET'){
   const raw=url.searchParams.get('page')??'0';if(!/^\d+$/.test(raw)||Number(raw)>1000000||[...url.searchParams.keys()].some(k=>k!=='page')||url.searchParams.getAll('page').length>1)throw Error('register_invalid');
   value=await backendRpc(env,'ar_invoice_register_history',{...args,p_offset:Number(raw)*20});
  }else if(parts.length===6&&!url.search){value=await backendRpc(env,request.method==='GET'?'ar_invoice_register_get':'ar_invoice_register_save',{...args,...request.method==='PUT'?{p_input:parseRegisterSave(await body())}:{}});}
  else return json({error:'not_found'},404);
 }else return json({error:'method_not_allowed'},405);
 if(typeof value?.error==='string')return json(value,value.error.includes('forbidden')?403:value.error.includes('missing')?404:/conflict|changed/.test(value.error)?409:400);
 if(!resultMatchesHotelScope(value,region,hotel))throw Error('register_unavailable');return json(value);
 }catch(error){const code=error instanceof Error&&/^(register_invalid|exception_invalid|hotel_scope_invalid)$/.test(error.message)?'register_invalid':'register_unavailable';return json({error:code},code==='register_invalid'?400:503);}}
