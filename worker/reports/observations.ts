import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {regionalHotelScope,resultMatchesHotelScope} from '../hotels';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function observationFilters(url:URL){
 const q=url.searchParams,view=url.pathname.split('/').at(-1);if(!['daily_ar','balance_observations','timing','options'].includes(view??''))throw Error('observations_invalid');
 for(const key of q.keys())if(!['region','hotel','account','type','from','to','over60','page'].includes(key)||q.getAll(key).length!==1)throw Error('observations_invalid');
 const field=(key:string)=>{const value=q.get(key)||null;if(value&&(value.length>200||/[\x00-\x1f\x7f]/.test(value)))throw Error('observations_invalid');return value;};
 const hotel=field('hotel'),account=field('account'),type=field('type'),from=field('from'),to=field('to'),page=Number(q.get('page')??0),over60=q.get('over60')??'false';
 const date=(v:string|null)=>v===null||/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 let regional;try{regional=regionalHotelScope(q,account);}catch{throw Error('observations_invalid');}
 if(!date(from)||!date(to)||from&&to&&(from>to||Date.parse(to)-Date.parse(from)>3660*86400000)||!['true','false'].includes(over60)||!Number.isSafeInteger(page)||page<0||page>1000000)throw Error('observations_invalid');
 return {p_view:view,p_hotel:regional.reportHotel,p_account:account,p_type:type,p_from:from,p_to:to,p_over60:over60==='true',p_offset:page*50,p_limit:50};
}
export async function observationsApi(request:Request,env:RefreshEnv,actor:string){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{const url=new URL(request.url),filters=observationFilters(url),regional=regionalHotelScope(url.searchParams,filters.p_account);const result=await backendRpc<Record<string,unknown>>(env,'ar_observation_reports',{p_actor:actor,...filters});if(result?.error==='observations_forbidden')return json(result,403);if(result?.error)throw Error('observations_invalid');if(!result||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||!result.summary||!resultMatchesHotelScope(result,regional.region,regional.hotel))throw Error('observations_unavailable');return json(result);}catch(e){const invalid=e instanceof Error&&e.message==='observations_invalid';return json({error:invalid?'observations_invalid':'observations_unavailable'},invalid?400:503);}
}
