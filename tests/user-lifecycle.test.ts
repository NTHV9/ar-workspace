import {afterEach,expect,it,vi} from 'vitest';
import {accessApi} from '../worker/access/api';
import {handleApi} from '../worker/index';
import {normalizeLogin,validInitialPassword} from '../src/access/identity';
const actor='00000000-0000-4000-8000-000000000001',cmd='00000000-0000-4000-8000-000000000071',memberId='00000000-0000-4000-8000-000000000072',authId='00000000-0000-4000-8000-000000000073';
const secret='Synthetic-only-password-73',authEmail=authId+'@users.ar-workspace.invalid';
const env={SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic-service',SUPABASE_PUBLISHABLE_KEY:'synthetic-public'};
const req=(path:string,body:unknown={},method='POST')=>new Request('https://app.synthetic.invalid'+path,{method,headers:{'Content-Type':'application/json',Origin:'https://app.synthetic.invalid'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
afterEach(()=>vi.unstubAllGlobals());
function setup(kind:'create'|'delete',options:{lostCreate?:boolean;deleteUnavailable?:boolean;getUnavailable?:boolean;dispatched?:boolean}={}){
 let present=kind==='delete',dispatched=!!options.dispatched,complete=false;const calls:{url:string;method:string;body:unknown}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{
  const url=String(input),method=init.method??'GET',body=init.body?JSON.parse(String(init.body)):{};calls.push({url,method,body});
  const member={memberId,email:null,username:'synthetic.user',accountKind:'username',setupState:kind==='create'?'creating':'deleting',pendingCommand:cmd,active:false,regions:['phuket'],revision:1};
  const view={commandId:cmd,kind,memberId,authUserId:authId,authEmail,dispatched,state:complete?'complete':'pending',result:{state:'complete',kind},member};
  if(url.includes('/rest/v1/rpc/')){
   expect(JSON.stringify(body)).not.toContain(secret);const name=url.split('/').at(-1);
   if(['ar_access_create_begin','ar_access_delete_begin','ar_access_command_get'].includes(name!))return Response.json(view);
   if(name==='ar_access_create_dispatch'){if(dispatched)return Response.json(false);dispatched=true;return Response.json(true);}
   if(name==='ar_access_create_finish'||name==='ar_access_delete_finish'){expect(present).toBe(kind==='create');complete=true;return Response.json({state:'complete',kind});}
   throw Error('Unexpected SQL method');
  }
  expect(new URL(url).origin).toBe('https://db.synthetic.invalid');
  if(method==='GET'){if(options.getUnavailable)return new Response(null,{status:503});return present?Response.json({id:authId,email:authEmail,email_confirmed_at:'2026-09-17',app_metadata:{ar_create_command:cmd}}):new Response(null,{status:404});}
  if(method==='POST'){expect(url.endsWith('/auth/v1/admin/users')).toBe(true);expect(body).toMatchObject({id:authId,email:authEmail,password:secret,email_confirm:true,role:'authenticated'});present=true;if(options.lostCreate)throw Error('Synthetic lost response');return Response.json({id:authId,email:authEmail});}
  if(method==='DELETE'){expect(url.endsWith('/'+authId)).toBe(true);if(options.deleteUnavailable)return new Response(null,{status:503});present=false;return Response.json({});}
  throw Error('Unexpected provider request');
 }));return {calls,present:()=>present};
}
it('normalizes usernames and emails while rejecting routing-address impersonation',()=>{
 expect(normalizeLogin(' Phuket.AR ')).toEqual({kind:'username',login:'phuket.ar'});expect(normalizeLogin('A@Example.com')).toEqual({kind:'email',login:'a@example.com'});
 for(const value of ['ab','x/y','x y','fake@users.ar-workspace.invalid'])expect(()=>normalizeLogin(value)).toThrow();
 expect(validInitialPassword(secret)).toBe(true);expect(validInitialPassword('short')).toBe(false);expect(validInitialPassword('ก'.repeat(25))).toBe(false);
});
it('creates only the reserved Auth ID and keeps password out of SQL and response',async()=>{
 const c=setup('create');const r=await accessApi(req('/api/access/users/create',{commandId:cmd,login:'synthetic.user',password:secret,regions:['phuket'],revision:0}),env,actor,'ar@katathani.com');
 expect(r.status).toBe(200);expect(await r.text()).not.toContain(secret);expect(c.calls.filter(c=>c.url.endsWith('/admin/users')&&c.method==='POST')).toHaveLength(1);expect(c.present()).toBe(true);
});
it('checks a lost creation result without another POST or password reset',async()=>{
 const c=setup('create',{lostCreate:true});const r=await accessApi(req('/api/access/users/create',{commandId:cmd,login:'synthetic.user',password:secret,regions:['phuket'],revision:0}),env,actor,'ar@katathani.com');expect(r.status).toBe(202);
 const checked=await accessApi(req('/api/access/users/commands/'+cmd+'/check'),env,actor,'ar@katathani.com');expect(checked.status).toBe(200);expect(c.calls.filter(c=>c.url.endsWith('/admin/users')&&c.method==='POST')).toHaveLength(1);expect(c.calls.some(c=>c.method==='PUT')).toBe(false);
});
it('does not resend a dispatched creation when no provider account was found',async()=>{
 const c=setup('create',{dispatched:true});const r=await accessApi(req('/api/access/users/create',{commandId:cmd,login:'synthetic.user',password:secret,regions:['phuket'],revision:0}),env,actor,'ar@katathani.com');expect(r.status).toBe(202);expect(await r.json()).toMatchObject({needsCleanup:true});expect(c.calls.some(c=>c.url.endsWith('/admin/users')&&c.method==='POST')).toBe(false);
});
it('deletes only the bound provider ID after access revocation and verifies absence',async()=>{
 const c=setup('delete');const r=await accessApi(req(`/api/access/users/${memberId}/delete`,{commandId:cmd,revision:1,confirmed:true}),env,actor,'ar@katathani.com');expect(r.status).toBe(200);expect(c.calls[0].url.endsWith('/ar_access_delete_begin')).toBe(true);expect(c.calls.filter(c=>c.method==='DELETE')).toHaveLength(1);expect(c.present()).toBe(false);
});
it('keeps deletion pending on provider failure rather than treating an error as absence',async()=>{
 const c=setup('delete',{deleteUnavailable:true});const r=await accessApi(req(`/api/access/users/${memberId}/delete`,{commandId:cmd,revision:1,confirmed:true}),env,actor,'ar@katathani.com');expect(r.status).toBe(202);expect(c.calls.some(c=>c.url.endsWith('/ar_access_delete_finish'))).toBe(false);
});
it('does not delete if the identity lookup itself is unavailable',async()=>{
 const c=setup('delete',{getUnavailable:true});const r=await accessApi(req(`/api/access/users/${memberId}/delete`,{commandId:cmd,revision:1,confirmed:true}),env,actor,'ar@katathani.com');expect(r.status).toBe(503);expect(c.calls.some(c=>c.method==='DELETE')).toBe(false);
});
it('rejects privilege fields, unconfirmed deletion and ordinary actors before provider writes',async()=>{
 const c=setup('create');for(const body of [{commandId:cmd,login:'synthetic.user',password:secret,regions:['phuket'],revision:0,role:'service_role'},{commandId:cmd,login:'synthetic.user',password:secret,regions:['phuket'],revision:0,id:authId}])expect((await accessApi(req('/api/access/users/create',body),env,actor,'ar@katathani.com')).status).toBe(400);
 expect((await accessApi(req(`/api/access/users/${memberId}/delete`,{commandId:cmd,revision:1,confirmed:false}),env,actor,'ar@katathani.com')).status).toBe(400);
 expect((await accessApi(req('/api/access/users/create'),env,authId,'staff@example.invalid')).status).toBe(403);expect(c.calls).toHaveLength(0);
});
it('does not execute lifecycle mutations through GET',async()=>{const c=setup('delete');expect((await accessApi(req('/api/access/users/commands/'+cmd+'/check',{},'GET'),env,actor,'ar@katathani.com')).status).toBe(404);expect(c.calls).toHaveLength(0);});
it('username login validates provider identity and active grant before returning a session',async()=>{
 const calls:{url:string;body:unknown}[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const url=String(input),body=JSON.parse(String(init.body));calls.push({url,body});if(url.endsWith('/ar_access_login_limit'))return Response.json(0);if(url.endsWith('/ar_access_password_target'))return Response.json({authUserId:authId,authEmail});if(url.endsWith('/ar_access_self'))return Response.json({active:true});if(url.includes('/token?grant_type=password'))return Response.json({access_token:'synthetic-session',refresh_token:'synthetic-refresh',user:{id:authId,email:authEmail}});throw Error('Unexpected');});
 const r=await handleApi(req('/api/access/login',{username:'Synthetic.User',password:secret}),env);expect(r.status).toBe(200);expect(await r.json()).toMatchObject({access_token:'synthetic-session'});expect(calls.filter(c=>c.url.includes('/rest/')).some(c=>JSON.stringify(c.body).includes(secret))).toBe(false);expect(calls.at(-1)?.url.endsWith('/ar_access_self')).toBe(true);
});
it('enforces the username-login attempt limit before any password request',async()=>{const f=vi.fn(async()=>Response.json(45));vi.stubGlobal('fetch',f);const r=await handleApi(req('/api/access/login',{username:'synthetic.user',password:secret}),env);expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('45');expect(f).toHaveBeenCalledTimes(1);});
it.each(['missing','wrong-id','wrong-email','revoked'])('does not return login tokens when the target is %s',async scenario=>{
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const url=String(input);if(url.endsWith('/ar_access_login_limit'))return Response.json(0);if(url.endsWith('/ar_access_password_target'))return Response.json(scenario==='missing'?null:{authUserId:authId,authEmail});if(url.endsWith('/ar_access_self'))return Response.json(null);return Response.json({access_token:'must-not-be-returned',refresh_token:'must-not-be-returned',user:{id:scenario==='wrong-id'?actor:authId,email:scenario==='wrong-email'?'different@example.invalid':authEmail}});});
 const r=await handleApi(req('/api/access/login',{username:'synthetic.user',password:secret}),env);expect(r.status).toBe(401);expect(await r.json()).toEqual({error:'invalid_credentials'});
});
