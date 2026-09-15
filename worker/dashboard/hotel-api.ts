import {thaiToday} from '../../src/domain/collection';
import {isRegionId,regionHotels,type RegionId} from '../../src/domain/hotels';
import {resultMatchesHotelScope} from '../hotels';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {OperaError} from '../opera/client';

const invalid=():never=>{throw Error('dashboard_invalid');};
type OverviewStage='query'|'database'|'shape'|'done';
const json=(value:unknown,status=200,stage:OverviewStage='query',diagnostic:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-AR-Overview-Stage':stage,...diagnostic}});
export function parseDashboardHotelOverviewQuery(url:URL){
 if(url.pathname!=='/api/dashboard/hotel-overview')invalid();
 const q=url.searchParams;
 for(const key of q.keys())if(!['from','to','type','region'].includes(key)||q.getAll(key).length!==1)invalid();
 const field=(key:string)=>{const value=q.get(key);if(value!==null&&(!value||value!==value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value)))invalid();return value;};
 const date=(key:string):string=>{const value=field(key);if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return invalid();return value;};
 const from=date('from'),to=date('to');
 if(from>to||to>thaiToday()||Date.parse(to)-Date.parse(from)>3660*86400000)invalid();
 const region=field('region');if(region!==null&&!isRegionId(region))invalid();
 return {p_from:from,p_to:to,p_type:field('type'),...(region?{p_region:region}:{})};
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const emptyRows=(value:Record<string,unknown>)=>Array.isArray(value.rows)&&value.rows.length===0;
function validScope(value:unknown):boolean {
 if(!object(value))return false;
 for(const key of ['balances','activity','external','entries','payments','paid']){
  const part=value[key];if(part===null)continue;if(!object(part)||'error' in part)return false;
  if(key==='entries'||key==='payments'){
   if(!object(part.summary)||!object(part.coverage)||typeof part.coverage.complete!=='boolean'||'rows'in part)return false;
  }else{
   if(!emptyRows(part)||!count(part.total))return false;
   if(key==='balances'){
    if(!['current','snapshot','unavailable'].includes(String(part.mode))||!Array.isArray(part.metrics)||!Array.isArray(part.stages)||!Array.isArray(part.missingHotels)||typeof part.complete!=='boolean')return false;
   }else if(!object(part.summary)||key==='paid'&&typeof part.complete!=='boolean')return false;
  }
 }
 return true;
}
/** Session checked by the root router; the single service-only RPC also checks actor. */
export async function dashboardHotelOverviewApi(request:Request,env:RefreshEnv,actor:string):Promise<Response>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor))return json({error:'unauthorized'},401,'query');
 if(request.method!=='GET')return json({error:'method_not_allowed'},405,'query');
 let stage:OverviewStage='query';
 try{
  const args=parseDashboardHotelOverviewQuery(new URL(request.url)),regional='p_region'in args;
  const region:RegionId=regional&&isRegionId(args.p_region)?args.p_region:'phuket';
  stage='database';
  const result=await backendRpc<unknown>(env,regional?'ar_dashboard_region_overview':'ar_dashboard_hotel_overview',{p_actor:actor,...args});
  if(object(result)&&result.error==='dashboard_forbidden')return json({error:'dashboard_forbidden'},403,'database');
  if(object(result)&&result.error==='dashboard_invalid')invalid();
  stage='shape';
  const hotels=regionHotels(region);
  if(!object(result)||'error'in result||regional&&result.region!==region||result.from!==args.p_from||result.to!==args.p_to||!validScope(result.total)||!Array.isArray(result.hotels)||result.hotels.length!==hotels.length
   ||result.hotels.some((hotel,index)=>!object(hotel)||hotel.hotel!==hotels[index]||!validScope(hotel))||!resultMatchesHotelScope(result,region))throw Error('dashboard_unavailable');
  return json(result,200,'done');
 }catch(error){
  const code=error instanceof Error&&error.message==='dashboard_invalid'?'dashboard_invalid':'dashboard_unavailable';
  const diagnostic:Record<string,string>={};
  if(stage==='database'&&error instanceof OperaError){
   if(['database_ar_dashboard_region_overview','database_ar_dashboard_hotel_overview'].includes(error.stage??''))diagnostic['X-AR-Overview-Database-Stage']=error.stage!;
   if(typeof error.upstreamStatus==='number'&&Number.isSafeInteger(error.upstreamStatus)&&error.upstreamStatus>=100&&error.upstreamStatus<=599)diagnostic['X-AR-Overview-Upstream-Status']=String(error.upstreamStatus);
  }
  return json({error:code},code==='dashboard_invalid'?400:503,stage,diagnostic);
 }
}
