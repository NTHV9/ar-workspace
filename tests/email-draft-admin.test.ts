import {afterEach,expect,it,vi} from 'vitest';
import {emailApi} from '../worker/email/api';
import {handleApi} from '../worker/index';
const owner='00000000-0000-4000-8000-000000000031',member='00000000-0000-4000-8000-000000000032',id='00000000-0000-4000-8000-000000000033';
const grant={actorId:member,workspaceOwnerId:owner,email:'staff@example.invalid',administrator:false,regions:['phuket' as const],scopeHotels:['KAT' as const],revision:1};
const env={SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic-server',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',REQUEST_ACTOR:member,REQUEST_ACCESS:grant};
const request=(action='gmail-draft')=>new Request(`https://app.synthetic.invalid/api/email/${id}/${action}`,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({revision:1,stage:null,confirmed:true})});
afterEach(()=>vi.unstubAllGlobals());
it('denies a regional member Gmail draft creation before any delivery or provider call even when actor is workspace owner',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const response=await emailApi(request(),env,owner);
 expect(response.status).toBe(403);expect(await response.json()).toEqual({error:'email_forbidden'});expect(fetcher).not.toHaveBeenCalled();
});
it('enforces the Gmail draft restriction through the authenticated regional dispatcher',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(input:unknown)=>{const path=new URL(String(input)).pathname;calls.push(path);if(path==='/auth/v1/user')return Response.json({id:member,email:grant.email,email_confirmed_at:'2026-09-17T00:00:00Z'});if(path==='/rest/v1/rpc/ar_access_authorize')return Response.json(grant);throw Error('Unexpected delivery/provider access');});
 const {REQUEST_ACTOR:_,REQUEST_ACCESS:__,...dispatcherEnv}=env;
 const response=await handleApi(request(),dispatcherEnv);expect(response.status).toBe(403);expect(calls).toEqual(['/auth/v1/user','/rest/v1/rpc/ar_access_authorize']);
});
it.each([undefined,{...grant,administrator:true,email:'ar@katathani.com'}])('retains verified administrator Gmail draft access %#',async access=>{
 vi.stubGlobal('fetch',async(input:unknown)=>{expect(String(input)).toBe('https://db.synthetic.invalid/rest/v1/rpc/ar_mail_for_draft');return Response.json({id,mode:'draft',state:'created',stage:null});});
 const response=await emailApi(request(),{...env,REQUEST_ACCESS:access},owner);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state:'created',gmailAccepted:false});
});
it('fails closed for a purported administrator grant with another identity',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await emailApi(request(),{...env,REQUEST_ACCESS:{...grant,administrator:true}},owner)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['send','deliveries'])('keeps member ordinary sends and existing delivery checks available: %s',async action=>{
 const delivery={id,mode:'send',state:'sent',stage:null,sent_at:'2026-10-24T08:00:00Z'};
 vi.stubGlobal('fetch',async(input:unknown)=>{expect(String(input)).toBe(`https://db.synthetic.invalid/rest/v1/rpc/${action==='send'?'ar_mail_for_draft':'ar_mail_get'}`);return Response.json(delivery);});
 const r=action==='send'?request('send'):new Request(`https://app.synthetic.invalid/api/email/deliveries/${id}/check`,{method:'POST'});
 const response=await emailApi(r,env,owner);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state:'sent',gmailAccepted:true});
});
