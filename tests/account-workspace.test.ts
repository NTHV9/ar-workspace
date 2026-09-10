import {afterEach,expect,it,vi} from 'vitest';
import {accountWorkspaceApi} from '../worker/accounts/workspace';
import {handleApi} from '../worker/index';
const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('requires authentication at the public boundary',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 const r=await handleApi(new Request('https://app.test/api/account-workspace/KAT/A/history'),env);expect(r.status).toBe(401);expect(f).not.toHaveBeenCalled();
});
it('passes exact encoded account, hotel and pagination to the actor-checked RPC',async()=>{
 const f=vi.fn(async(_url:string,_init:RequestInit)=>Response.json({rows:[],total:0}));vi.stubGlobal('fetch',f);
 const r=await accountWorkspaceApi(new Request('https://app.test/api/account-workspace/TSK/A%2FB/documents?page=2'),env,actor);
 expect(r.status).toBe(200);expect(JSON.parse(String(f.mock.calls[0][1].body))).toEqual({p_actor:actor,p_hotel:'TSK',p_account:'A/B',p_section:'documents',p_offset:40,p_limit:20});
});
for(const path of ['KAT/A/history?page=-1','OTHER/A/history','KAT/A/unknown','KAT/A/history?page=0.5'])it(`rejects malformed scope ${path}`,async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);expect((await accountWorkspaceApi(new Request(`https://app.test/api/account-workspace/${path}`),env,actor)).status).toBe(400);expect(f).not.toHaveBeenCalled();
});
it('does not substitute empty history on service failure',async()=>{
 vi.stubGlobal('fetch',async()=>new Response('provider details',{status:500}));
 const r=await accountWorkspaceApi(new Request('https://app.test/api/account-workspace/KAT/A/history'),env,actor);expect(r.status).toBe(503);expect(await r.text()).not.toContain('provider details');
});
it('honors RPC membership denial and has no write command',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({error:'account_workspace_forbidden'}));
 expect((await accountWorkspaceApi(new Request('https://app.test/api/account-workspace/KAT/A/history'),env,actor)).status).toBe(403);
 expect((await accountWorkspaceApi(new Request('https://app.test/api/account-workspace/KAT/A/history',{method:'POST'}),env,actor)).status).toBe(405);
});
