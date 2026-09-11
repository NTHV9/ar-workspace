import {isCollectionStageKey} from '../../src/domain/collection-policy';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {dashboardMetricKeys,type DashboardBalancesResponse,type DashboardPaymentInvoicesResponse} from './model';
const invalid=():never=>{throw Error('dashboard_invalid');};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function filters(url:URL,path:string,extra:string[]){
 const q=url.searchParams;if(url.pathname!==path)invalid();
 for(const key of q.keys())if(!['hotel','account','type','page','limit',...extra].includes(key)||q.getAll(key).length!==1)invalid();
 const field=(key:string)=>{const value=q.get(key);if(value!==null&&(!value||value!==value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value)))invalid();return value;};
 const hotel=field('hotel'),account=field('account'),type=field('type');
 if(hotel&&!['KAT','TSK'].includes(hotel)||account&&!hotel)invalid();
 const integer=(key:string,fallback:number,max:number)=>{const raw=q.get(key);if(raw!==null&&!/^(0|[1-9][0-9]*)$/.test(raw))invalid();const n=raw===null?fallback:Number(raw);if(!Number.isSafeInteger(n)||n<0||n>max)invalid();return n;};
 const page=integer('page',0,2147483647),limit=integer('limit',50,200);if(limit<1||page*limit>2147483647)invalid();
 const date=(key:string):string=>{const value=field(key);if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return invalid();return value;};
 return {field,date,scope:{p_hotel:hotel,p_account:account,p_type:type,p_offset:page*limit,p_limit:limit}};
}
export function parseDashboardBalancesQuery(url:URL){
 const f=filters(url,'/api/dashboard/balances',['asOf','metric','stage']),metric=f.field('metric'),stage=f.field('stage');
 if(metric&&!dashboardMetricKeys.some(k=>k===metric)||stage&&!isCollectionStageKey(stage)||metric&&stage)invalid();
 return {...f.scope,p_as_of:f.date('asOf'),p_metric:metric,p_stage:stage};
}
export function parseDashboardPaymentQuery(url:URL){
 const f=filters(url,'/api/dashboard/payment-invoices',['from','to']),from=f.date('from'),to=f.date('to');
 if(from>to||Date.parse(to)-Date.parse(from)>3660*86400000)invalid();return {...f.scope,p_from:from,p_to:to};
}
async function read(request:Request,env:RefreshEnv,actor:string,kind:'balances'|'payments'){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor))return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const args=kind==='balances'?parseDashboardBalancesQuery(new URL(request.url)):parseDashboardPaymentQuery(new URL(request.url));
  const result=await backendRpc<(DashboardBalancesResponse|DashboardPaymentInvoicesResponse)&{error?:string}>(env,kind==='balances'?'ar_dashboard_balances':'ar_dashboard_payment_invoices',{p_actor:actor,...args});
  if(result?.error==='dashboard_forbidden')return json({error:result.error},403);
  if(result?.error==='dashboard_invalid')invalid();
  if(!result||result.error||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||result.total<0||typeof result.complete!=='boolean')throw Error('dashboard_unavailable');
  if(kind==='balances'&&(!('mode' in result)||!['current','snapshot','unavailable'].includes(result.mode)||!Array.isArray(result.metrics)||!Array.isArray(result.stages)||!Array.isArray(result.missingHotels)))throw Error('dashboard_unavailable');
  if(kind==='payments'&&(!('summary' in result)||!result.summary))throw Error('dashboard_unavailable');
  return json(result);
 }catch(error){const code=error instanceof Error&&error.message==='dashboard_invalid'?'dashboard_invalid':'dashboard_unavailable';return json({error:code},code==='dashboard_invalid'?400:503);}
}
/** Root router validates the session; each service-only RPC independently checks the actor. */
export const dashboardBalancesApi=(request:Request,env:RefreshEnv,actor:string)=>read(request,env,actor,'balances');
export const dashboardPaymentInvoicesApi=(request:Request,env:RefreshEnv,actor:string)=>read(request,env,actor,'payments');
