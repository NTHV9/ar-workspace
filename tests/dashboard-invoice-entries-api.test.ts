import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {dashboardInvoiceEntriesApi} from '../worker/dashboard/invoice-entries-api';
const actor='11111111-1111-4111-8111-111111111111',env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-key'};
const url='https://app.example/api/dashboard/invoice-entries?from=2026-09-12&to=2026-09-13&hotel=KAT&account=account&type=OTA';
afterEach(()=>vi.unstubAllGlobals());
it('reads the protected Portfolio invoice cohort only, passing exact Bill Date scope and pagination',async()=>{
 const result={source:'portfolio',view:'invoice_entries',rows:[{hotel:'KAT',accountId:'account',transactionId:'1',transactionDate:'2026-09-13'}],total:1,summary:{invoiceCount:1,amount:'175.25'},coverage:{complete:true,from:'2026-09-12',to:'2026-09-13'}};
 const fetcher=vi.fn(async(_target:string,_options:RequestInit)=>Response.json(result));vi.stubGlobal('fetch',fetcher);
 const response=await dashboardInvoiceEntriesApi(new Request(url+'&page=2&limit=10'),env,actor);
 expect(response.status).toBe(200);expect(await response.json()).toEqual(result);expect(response.headers.get('cache-control')).toBe('no-store');expect(fetcher).toHaveBeenCalledTimes(1);
 const [target,options]=fetcher.mock.calls[0];expect(target).toBe(env.SUPABASE_URL+'/rest/v1/rpc/ar_dashboard_invoice_entries');
 expect(JSON.parse(String(options.body))).toEqual({p_actor:actor,p_from:'2026-09-12',p_to:'2026-09-13',p_hotel:'KAT',p_account:'account',p_type:'OTA',p_offset:20,p_limit:10});
});
it('rejects unauthenticated, writes and invalid date or account scope before reading data',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect((await dashboardInvoiceEntriesApi(new Request(url),env,'bad')).status).toBe(401);
 expect((await dashboardInvoiceEntriesApi(new Request(url,{method:'POST'}),env,actor)).status).toBe(405);
 for(const suffix of ['','?from=2026-09-13','?from=2026-09-12&to=2026-09-13&account=account','?from=2026-09-12&to=2026-09-13&limit=500'])expect((await dashboardInvoiceEntriesApi(new Request('https://app.example/api/dashboard/invoice-entries'+suffix),env,actor)).status).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();
});
it('conceals provider errors and rejects rows outside the selected Bill Date range',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({error:'private_database_detail'}));expect((await dashboardInvoiceEntriesApi(new Request(url),env,actor)).status).toBe(503);
 vi.stubGlobal('fetch',async()=>Response.json({source:'portfolio',view:'invoice_entries',rows:[{hotel:'KAT',accountId:'account',transactionId:'1',transactionDate:'2026-09-11'}],total:1,summary:{invoiceCount:1,amount:'1.00'},coverage:{complete:true,from:'2026-09-12',to:'2026-09-13'}}));
 expect((await dashboardInvoiceEntriesApi(new Request(url),env,actor)).status).toBe(503);
});

it('the application router authenticates the invoice-entry route and dispatches only its Portfolio reader',async()=>{
 const endpoints:string[]=[],result={source:'portfolio',view:'invoice_entries',rows:[],total:0,summary:{invoiceCount:0,amount:'0.00'},coverage:{complete:true,from:'2026-09-12',to:'2026-09-13'}};
 vi.stubGlobal('fetch',async(target:string)=>{endpoints.push(target);if(target===env.SUPABASE_URL+'/auth/v1/user')return Response.json({id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-01-01T00:00:00Z'});if(target===env.SUPABASE_URL+'/rest/v1/rpc/ar_dashboard_invoice_entries')return Response.json(result);throw Error('Unexpected request');});
 expect((await handleApi(new Request(url),env)).status).toBe(401);expect(endpoints).toEqual([]);
 const response=await handleApi(new Request(url,{headers:{Authorization:'Bearer synthetic-token'}}),{...env,SUPABASE_PUBLISHABLE_KEY:'synthetic-public'});
 expect(response.status).toBe(200);expect(await response.json()).toEqual(result);expect(endpoints).toEqual([env.SUPABASE_URL+'/auth/v1/user',env.SUPABASE_URL+'/rest/v1/rpc/ar_dashboard_invoice_entries']);
});
