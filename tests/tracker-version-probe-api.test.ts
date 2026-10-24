import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {probeTrackerVersions} from '../worker/tracker-sync/version-probe';
vi.mock('../worker/tracker-sync/version-probe',()=>({probeTrackerVersions:vi.fn(async()=>{})}));
const actor='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic'};
beforeEach(()=>vi.clearAllMocks());afterEach(()=>vi.unstubAllGlobals());
function auth(staff=false){vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,email:staff?'staff@example.test':'ar@katathani.com',email_confirmed_at:'2026-10-24'});
 if(url.endsWith('/rpc/ar_access_authorize'))return Response.json({email:'staff@example.test',administrator:false,regions:['khao-lak'],revision:1,workspaceOwnerId:owner,scopeHotels:['TLKL','WAKL','TLFO','TSAN']});
 if(url.endsWith('/rpc/ar_tracker_revisions')){expect(JSON.parse(String(init.body))).toEqual({p_actor:actor});return Response.json({rows:staff?[{region:'khao-lak',revision:'4'}]:[{region:'phuket',revision:'3'},{region:'khao-lak',revision:'4'}]});}
 throw Error('Unexpected external service');
});}
const request=(query='',authenticated=true)=>new Request('https://app.test/api/reports/tracker-revisions'+query,{headers:authenticated?{Authorization:'Bearer synthetic'}:{}});
it('returns cached authorized revisions without waiting for the provider hint',async()=>{
 auth();let done:()=>void=()=>{};vi.mocked(probeTrackerVersions).mockImplementationOnce(()=>new Promise<void>(r=>{done=r;}));
 const tasks:Promise<unknown>[]=[];const response=await handleApi(request(),env,{waitUntil:p=>tasks.push(p)});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({rows:[{region:'phuket'},{region:'khao-lak'}]});
 expect(probeTrackerVersions).toHaveBeenCalledExactlyOnceWith(expect.anything(),actor,['phuket','khao-lak']);expect(tasks).toHaveLength(1);done();await Promise.all(tasks);
});
it('uses shared provider ownership while probing only the staff member’s authorized region',async()=>{
 auth(true);const tasks:Promise<unknown>[]=[];const response=await handleApi(request(),env,{waitUntil:p=>tasks.push(p)});expect(response.status).toBe(200);
 expect(probeTrackerVersions).toHaveBeenCalledExactlyOnceWith(expect.anything(),owner,['khao-lak']);await Promise.all(tasks);
});
it('does not probe for unauthorized or client-supplied target requests',async()=>{
 const tasks:Promise<unknown>[]=[];
 expect((await handleApi(request('',false),env,{waitUntil:p=>tasks.push(p)})).status).toBe(401);
 auth();expect((await handleApi(request('?fileId=untrusted'),env,{waitUntil:p=>tasks.push(p)})).status).toBe(400);
 expect(probeTrackerVersions).not.toHaveBeenCalled();expect(tasks).toHaveLength(0);
});
