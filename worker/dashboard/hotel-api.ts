import {thaiToday} from '../../src/domain/collection';
import {backendRpc,type RefreshEnv} from '../refresh/backend';

const invalid=():never=>{throw Error('dashboard_invalid');};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function parseDashboardHotelOverviewQuery(url:URL){
 if(url.pathname!=='/api/dashboard/hotel-overview')invalid();
 const q=url.searchParams;
 for(const key of q.keys())if(!['from','to','type'].includes(key)||q.getAll(key).length!==1)invalid();
 const field=(key:string)=>{const value=q.get(key);if(value!==null&&(!value||value!==value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value)))invalid();return value;};
 const date=(key:string):string=>{const value=field(key);if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return invalid();return value;};
 const from=date('from'),to=date('to');
 if(from>to||to>thaiToday()||Date.parse(to)-Date.parse(from)>3660*86400000)invalid();
 return {p_from:from,p_to:to,p_type:field('type')};
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
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor))return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const args=parseDashboardHotelOverviewQuery(new URL(request.url));
  const result=await backendRpc<unknown>(env,'ar_dashboard_hotel_overview',{p_actor:actor,...args});
  if(object(result)&&result.error==='dashboard_forbidden')return json({error:'dashboard_forbidden'},403);
  if(object(result)&&result.error==='dashboard_invalid')invalid();
  if(!object(result)||'error'in result||result.from!==args.p_from||result.to!==args.p_to||!validScope(result.total)||!Array.isArray(result.hotels)||result.hotels.length!==2
   ||result.hotels.some((hotel,index)=>!object(hotel)||hotel.hotel!==['KAT','TSK'][index]||!validScope(hotel)))throw Error('dashboard_unavailable');
  return json(result);
 }catch(error){const code=error instanceof Error&&error.message==='dashboard_invalid'?'dashboard_invalid':'dashboard_unavailable';return json({error:code},code==='dashboard_invalid'?400:503);}
}
