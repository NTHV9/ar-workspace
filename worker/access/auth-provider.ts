import type {RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
export interface ProviderUser {id:string;email:string;email_confirmed_at?:string|null;app_metadata?:Record<string,unknown>}
export interface ProviderSession {access_token:string;refresh_token:string;expires_in?:number;token_type?:string;user:ProviderUser}
export class AuthProviderError extends Error {constructor(readonly status:number){super('access_auth_unavailable');}}
function origin(env:RefreshEnv){if(!env.SUPABASE_URL)throw Error('access_auth_unavailable');const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('access_auth_unavailable');return u.origin;}
export async function authProvider(env:RefreshEnv,path:string,method:'GET'|'POST'|'DELETE',body?:unknown):Promise<unknown>{
 if(!env.SUPABASE_SECRET_KEY||!/^\/admin\/users(?:\/[0-9a-f-]{36})?$/.test(path))throw Error('access_auth_unavailable');
 const r=await fetch(origin(env)+'/auth/v1'+path,{method,headers:{apikey:env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(!r.ok){await r.body?.cancel();throw new AuthProviderError(r.status);}const bytes=await boundedBody(r,65536);return bytes.length?JSON.parse(new TextDecoder().decode(bytes)):null;
}
export async function providerUser(env:RefreshEnv,id:string):Promise<ProviderUser|null>{try{
 const raw=await authProvider(env,'/admin/users/'+id,'GET');const u=raw&&typeof raw==='object'&&'user'in raw?(raw as {user:unknown}).user:raw;
 if(!u||typeof u!=='object'||!('id'in u)||u.id!==id||!('email'in u)||typeof u.email!=='string')throw Error('access_auth_unverified');return u as ProviderUser;
 }catch(error){if(error instanceof AuthProviderError&&error.status===404)return null;throw error;}}
export async function passwordSession(env:RefreshEnv&{SUPABASE_PUBLISHABLE_KEY?:string},email:string,password:string):Promise<ProviderSession|null>{
 if(!env.SUPABASE_PUBLISHABLE_KEY)throw Error('access_auth_unavailable');
 const r=await fetch(origin(env)+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok){await r.body?.cancel();if(r.status===400||r.status===401||r.status===422)return null;if(r.status===429)throw Error('access_login_limited');throw Error('access_auth_unavailable');}
 const v=JSON.parse(new TextDecoder().decode(await boundedBody(r,65536))) as ProviderSession;
 if(typeof v.access_token!=='string'||!v.access_token||typeof v.refresh_token!=='string'||!v.refresh_token||!v.user||typeof v.user.id!=='string'||typeof v.user.email!=='string')throw Error('access_auth_unavailable');return v;
}
