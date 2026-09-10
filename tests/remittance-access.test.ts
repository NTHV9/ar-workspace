import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
const id='00000000-0000-4000-8000-000000000001';
const routes=[['','GET'],['/options','GET'],['/invoices?hotel=KAT&accountId=synthetic','GET'],[`/${id}`,'PUT'],[`/${id}`,'GET'],[`/${id}/history`,'GET'],[`/${id}/status`,'POST'],[`/commands/${id}`,'GET'],[`/${id}/files/${id}`,'GET'],[`/${id}/files/${id}`,'POST'],[`/${id}/files/${id}`,'DELETE'],[`/${id}/files/${id}/restore`,'POST'],['/diagnostic','POST']];
afterEach(()=>vi.unstubAllGlobals());
it('rejects every unauthenticated remittance surface before source/storage access',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const [path,method] of routes)expect((await handleApi(new Request('https://app.test/api/remittances'+path,{method}),{})).status).toBe(401);
 expect(fetcher).not.toHaveBeenCalled();
});
it('rejects other verified users before remittance lookup or diagnostic writes',async()=>{
 const fetcher=vi.fn(async(_url:string)=>Response.json({id,email:'other@example.test',email_confirmed_at:'2026-01-01'}));vi.stubGlobal('fetch',fetcher);
 for(const [path,method] of [['/options','GET'],['/diagnostic','POST']])expect((await handleApi(new Request('https://app.test/api/remittances'+path,{method,headers:{Authorization:'Bearer synthetic-session'}}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic-public'})).status).toBe(403);
 expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.every(c=>String(c[0]).endsWith('/auth/v1/user'))).toBe(true);
});
