import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
import {normalizeLogin} from '../../src/access/identity';
import {passwordSession} from './auth-provider';
const json=(value:unknown,status:number,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function usernameLogin(request:Request,env:RefreshEnv&{SUPABASE_PUBLISHABLE_KEY?:string}){try{
 if(request.method!=='POST'||new URL(request.url).searchParams.size||request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'invalid_credentials'},403);
 if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'invalid_credentials'},400);
 const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,8192))) as Record<string,unknown>;
 if(!v||Object.keys(v).some(k=>!['username','password'].includes(k))||typeof v.password!=='string'||v.password.length<1||new TextEncoder().encode(v.password).length>1024)return json({error:'invalid_credentials'},400);
 const {login,kind}=normalizeLogin(v.username);if(kind!=='username')return json({error:'invalid_credentials'},400);
 const retry=await backendRpc<number>(env,'ar_access_login_limit',{p_identity:await digest(login),p_network:await digest(request.headers.get('CF-Connecting-IP')??'unavailable')});
 if(!Number.isSafeInteger(retry)||retry<0)throw Error('access_auth_unavailable');if(retry>0)return json({error:'login_temporarily_limited'},429,{'Retry-After':String(retry)});
 const target=await backendRpc<{authUserId:string;authEmail:string}|null>(env,'ar_access_password_target',{p_username:login});
 const session=await passwordSession(env,target?.authEmail??'unavailable@users.ar-workspace.invalid',v.password);
 if(!target||!session||session.user.id!==target.authUserId||session.user.email.toLowerCase()!==target.authEmail)return json({error:'invalid_credentials'},401);
 if(!await backendRpc(env,'ar_access_self',{p_actor:target.authUserId}))return json({error:'invalid_credentials'},401);
 return json(session,200);
 }catch(error){const code=error instanceof Error?error.message:'';return json({error:code==='access_login_limited'?'login_temporarily_limited':code==='access_login_invalid'?'invalid_credentials':'login_unavailable'},code==='access_login_limited'?429:code==='access_login_invalid'?401:503);}
}
