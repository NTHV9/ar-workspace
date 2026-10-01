import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {regionalHotelScope,resultMatchesHotelScope} from '../hotels';
import {parseDashboardPaymentQuery} from './api';
import type {ManagementDashboardData} from './management-model';
export function parseManagementQuery(url:URL){
 if(url.pathname!=='/api/dashboard/management'||url.searchParams.has('page')||url.searchParams.has('limit'))throw Error('dashboard_invalid');
 const copy=new URL(url);copy.pathname='/api/dashboard/payment-invoices';
 const {p_offset:_offset,p_limit:_limit,...args}=parseDashboardPaymentQuery(copy);return args;
}
export async function managementDashboardApi(request:Request,env:RefreshEnv,actor:string){
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor))return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const url=new URL(request.url),args=parseManagementQuery(url),scope=regionalHotelScope(url.searchParams,args.p_account);
  const data=await backendRpc<ManagementDashboardData&{error?:string}>(env,'ar_dashboard_management',{p_actor:actor,...args});
  if(data?.error==='dashboard_forbidden')return json({error:data.error},403);
  if(data?.error==='dashboard_invalid')throw Error('dashboard_invalid');
  if(!data||data.error||data.from!==args.p_from||data.to!==args.p_to||typeof data.complete!=='boolean'||!Array.isArray(data.hotels)||!Array.isArray(data.cohort)||!resultMatchesHotelScope(data,scope.region,scope.hotel))throw Error('dashboard_unavailable');
  return json(data);
 }catch(error){const invalid=error instanceof Error&&error.message==='dashboard_invalid';return json({error:invalid?'dashboard_invalid':'dashboard_unavailable'},invalid?400:503);}
}
