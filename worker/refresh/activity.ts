import {isHotelId,isRegionId,regionHotels,REGION_IDS} from '../../src/domain/hotels';
import {boundedBody} from '../email/shared';
import {backendRpc,type RefreshEnv} from './backend';

/** An unavailable optional activity check must never become a full refresh. */
export async function activeRefreshHotels(env:RefreshEnv):Promise<string[]>{
 try{
  const hotels=await backendRpc<unknown>(env,'ar_refresh_active_hotels',{});
  if(!Array.isArray(hotels)||hotels.some(h=>!isHotelId(h))||new Set(hotels).size!==hotels.length)return [];
  return hotels;
 }catch{return [];}
}
export async function refreshActivityApi(request:Request,env:RefreshEnv,actor:string):Promise<Response>{
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url);
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'forbidden'},403);
 if(url.search||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'invalid_request'},400);
 if(env.ACCEPTANCE)return json({error:'acceptance_action_unavailable'},409);
 let value:Record<string,unknown>;
 try{
  const body:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,256)));
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'invalid_request'},400);
  value=body as Record<string,unknown>;
 }catch{return json({error:'invalid_request'},400);}
 if(Object.keys(value).length!==1||!isRegionId(value.region))return json({error:'invalid_request'},400);
 const viewedHotels=regionHotels(value.region);
 if(env.REQUEST_ACCESS&&viewedHotels.some(h=>!env.REQUEST_ACCESS!.scopeHotels.includes(h)))return json({error:'forbidden'},403);
 // Staff grants come from backend authorization. Only the authenticated owner
 // bypasses that grant in the router; the owner's fixed rights cover both regions.
 // The SQL touch independently rechecks current membership for every hotel.
 const hotels=(env.REQUEST_ACCESS?.regions??REGION_IDS).flatMap(region=>[...regionHotels(region)]);
 if(env.OPERA_REFRESH_ENABLED!=='true')return json({active:false});
 try{await backendRpc(env,'ar_refresh_activity_touch',{p_actor:actor,p_hotels:hotels});return json({active:true});}
 catch{return json({error:'activity_unavailable'},503);}
}
