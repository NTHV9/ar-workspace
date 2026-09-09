import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
afterEach(()=>vi.unstubAllGlobals());
it('keeps ledger data visible when only workflow history is unavailable',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>url.includes('/auth/v1/user')?Response.json({id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',email_confirmed_at:'2026-09-09'}):url.includes('/ar_invoice_workflow')?new Response('',{status:503}):Response.json([{id:'1',open:100}]));
 const r=await handleApi(new Request('https://app.test/api/accounts/KAT/example',{headers:{Authorization:'Bearer synthetic'}}),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic'});
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({invoices:[{id:'1',open:100,workflow:null}],workflow_status:'unavailable'});
});
