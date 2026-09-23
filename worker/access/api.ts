import {administratorEmail,parseAccess,type UserAccess} from '../../src/access/model';
import {isHotelId,isRegionId,regionHotels,type HotelId} from '../../src/domain/hotels';
import {acceptanceCookie} from '../acceptance/routing';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
import {containsOutsideHotel,requestAccessIntent} from './scope';
import {lifecycleApi} from './lifecycle';
export interface AccessGrant extends UserAccess {actorId:string;workspaceOwnerId:string;scopeHotels:HotelId[];missingCommand?:boolean}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function accessError(error:unknown):Response {
 const requested=error instanceof Error?error.message:'';
 const code=['access_forbidden','access_invalid','access_login_invalid','access_password_invalid','access_delete_confirmation','access_revision_conflict','access_command_conflict','access_administrator_locked','access_user_missing','access_user_exists','access_lifecycle_pending','access_auth_unavailable','access_auth_unverified','email_region_disabled'].includes(requested)?requested:'access_unavailable';
 return json({error:code},code==='access_forbidden'?403:['access_invalid','access_login_invalid','access_password_invalid','access_delete_confirmation'].includes(code)?400:code==='access_user_missing'?404:['access_unavailable','access_auth_unavailable','access_auth_unverified'].includes(code)?503:409);
}
function sameOrigin(request:Request){if(request.method!=='GET'&&(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))throw Error('access_forbidden');}
export async function accessApi(request:Request,env:RefreshEnv,actor:string,email:string):Promise<Response>{try{
 sameOrigin(request);const url=new URL(request.url);
 if(url.pathname==='/api/access/me'&&request.method==='GET'){
  if(email.toLowerCase()===administratorEmail)return json({email:administratorEmail,administrator:true,regions:['phuket','khao-lak'],revision:1});
  if(acceptanceCookie(request))throw Error('access_forbidden');
  const data=await backendRpc<unknown>(env,'ar_access_self',{p_actor:actor});if(!data)throw Error('access_forbidden');return json(parseAccess(data));
 }
 if(email.toLowerCase()!==administratorEmail)throw Error('access_forbidden');
 const lifecycle=await lifecycleApi(request,env,actor);if(lifecycle)return lifecycle;
 if(url.pathname!=='/api/access/users')return json({error:'not_found'},404);
 if(request.method==='GET'){
  for(const k of url.searchParams.keys())if(!['page','search'].includes(k)||url.searchParams.getAll(k).length!==1)throw Error('access_invalid');
  const raw=url.searchParams.get('page')??'0',search=url.searchParams.get('search')??'';if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>40000||search.length>254)throw Error('access_invalid');
  return json(await backendRpc(env,'ar_access_list',{p_actor:actor,p_offset:Number(raw)*25,p_limit:25,p_search:search}));
 }
 if(request.method!=='POST'||url.searchParams.size||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('access_invalid');
 const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,8192)));
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('access_invalid');const input=v as Record<string,unknown>;
 if(Object.keys(input).some(k=>!['commandId','email','displayName','regions','active','revision'].includes(k))||typeof input.commandId!=='string'||!uuid.test(input.commandId)||typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.length>100||/[\u0000-\u001f]/.test(input.displayName)||typeof input.email!=='string'||input.email.length>254||!Array.isArray(input.regions)||input.regions.length<1||input.regions.length>2||input.regions.some(r=>!isRegionId(r))||new Set(input.regions).size!==input.regions.length||typeof input.active!=='boolean'||!Number.isSafeInteger(input.revision)||Number(input.revision)<0)throw Error('access_invalid');
 return json(await backendRpc(env,'ar_access_staff_save',{p_actor:actor,p_command:input.commandId,p_member:null,p_display_name:input.displayName,p_email:input.email,p_regions:input.regions,p_active:input.active,p_revision:input.revision}));
 }catch(error){return accessError(error);}
}
export async function authorizeRegionalRequest(request:Request,env:RefreshEnv,actor:string):Promise<AccessGrant>{
 sameOrigin(request);const intent=await requestAccessIntent(request);
 const raw=await backendRpc<Record<string,unknown>|null>(env,'ar_access_authorize',{p_actor:actor,p_kind:intent.kind,p_hotel:intent.hotel??null,p_region:intent.region??null,p_ref:intent.ref??null,p_mail:intent.mail??false,p_method:request.method,p_path:new URL(request.url).pathname});
 if(!raw)throw Error('access_forbidden');const member=parseAccess(raw);
 const allowed=member.regions.flatMap(r=>[...regionHotels(r)]);
 if(typeof raw.workspaceOwnerId!=='string'||!uuid.test(raw.workspaceOwnerId)||!Array.isArray(raw.scopeHotels)||!raw.scopeHotels.length||raw.scopeHotels.some(h=>!isHotelId(h)||!allowed.includes(h)))throw Error('access_unavailable');
 return {...member,actorId:actor,workspaceOwnerId:raw.workspaceOwnerId,scopeHotels:raw.scopeHotels as HotelId[],...(raw.missingCommand===true?{missingCommand:true}:{})};
}
export async function scopedRows(env:RefreshEnv,grant:AccessGrant,table:string,query:string,offset:number){
 const q=new URLSearchParams(query),account=q.get('account_id');
 if(account!==null&&!account.startsWith('eq.'))throw Error('access_forbidden');
 const hotels=q.get('hotel')?[q.get('hotel')!.slice(3)]:grant.scopeHotels;
 if(q.get('hotel')&&!q.get('hotel')!.startsWith('eq.')||hotels.some(h=>!grant.scopeHotels.includes(h as HotelId)))throw Error('access_forbidden');
 return backendRpc<unknown[]>(env,'ar_access_rows',{p_actor:grant.actorId,p_table:table,p_hotels:hotels,p_account:account?.slice(3)??null,p_offset:offset,p_limit:500});
}
export async function containRegionalResponse(response:Response,grant:AccessGrant):Promise<Response>{
 if(!response.headers.get('Content-Type')?.includes('application/json'))return response;
 const data:unknown=JSON.parse(new TextDecoder().decode(await boundedBody(response,64*1024*1024)));
 if(containsOutsideHotel(data,grant.scopeHotels))return json({error:'access_scope_mismatch'},503);
 return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});
}
