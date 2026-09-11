import {afterEach,expect,it,vi} from 'vitest';
import {dashboardBalancesApi,dashboardPaymentInvoicesApi,parseDashboardBalancesQuery,parseDashboardPaymentQuery} from '../worker/dashboard/api';
const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('validates dates, identities, stage keys, duplicates and bounded integer paging',()=>{
 expect(parseDashboardBalancesQuery(new URL('https://app.test/api/dashboard/balances?asOf=2026-09-11&hotel=KAT&account=A&stage=Follow+1&page=2&limit=200'))).toMatchObject({p_as_of:'2026-09-11',p_hotel:'KAT',p_account:'A',p_stage:'Follow 1',p_offset:400,p_limit:200});
 for(const q of ['', 'asOf=2026-02-30','asOf=0000-01-01','asOf=2026-09-11&account=A','asOf=2026-09-11&hotel=KAT&hotel=TSK','asOf=2026-09-11&metric=open&stage=Final','asOf=2026-09-11&stage=unknown','asOf=2026-09-11&page=1e2','asOf=2026-09-11&limit=201','asOf=2026-09-11&page=2147483647','asOf=2026-09-11&surprise=1','asOf=2026-09-11&type=%20'])expect(()=>parseDashboardBalancesQuery(new URL('https://app.test/api/dashboard/balances?'+q))).toThrow('dashboard_invalid');
});
it('payment cohort uses inclusive required dates and bounded ranges',()=>{
 expect(parseDashboardPaymentQuery(new URL('https://app.test/api/dashboard/payment-invoices?from=2026-09-01&to=2026-09-11'))).toMatchObject({p_from:'2026-09-01',p_to:'2026-09-11',p_offset:0,p_limit:50});
 for(const q of ['from=2026-09-01','from=2026-09-12&to=2026-09-11','from=2020-01-01&to=2040-01-01','from=2026-09-01&to=2026-09-11&account=A'])expect(()=>parseDashboardPaymentQuery(new URL('https://app.test/api/dashboard/payment-invoices?'+q))).toThrow('dashboard_invalid');
});
it('denies missing actor and non-GET before database access',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect((await dashboardBalancesApi(new Request('https://app.test/api/dashboard/balances?asOf=2026-09-11'),env,'')).status).toBe(401);
 expect((await dashboardPaymentInvoicesApi(new Request('https://app.test/api/dashboard/payment-invoices',{method:'POST'}),env,actor)).status).toBe(405);expect(fetcher).not.toHaveBeenCalled();
});
it('preserves unavailable history with null summary and never exposes database errors',async()=>{
 const payload={asOfDate:'2026-09-11',mode:'unavailable',capturedAt:null,sourceAt:null,complete:false,missingHotels:['KAT','TSK'],reason:'uncaptured_date',metrics:[],stages:[],rows:[],total:0,unverified:0};
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json(payload));vi.stubGlobal('fetch',fetcher);
 const req=new Request('https://app.test/api/dashboard/balances?asOf=2026-09-11');const res=await dashboardBalancesApi(req,env,actor);expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');expect(await res.json()).toEqual(payload);
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({p_actor:actor,p_as_of:'2026-09-11'});
 vi.stubGlobal('fetch',async()=>Response.json({error:'dashboard_forbidden'}));expect((await dashboardBalancesApi(req,env,actor)).status).toBe(403);
 vi.stubGlobal('fetch',async()=>new Response('private customer details',{status:500}));const failed=await dashboardBalancesApi(req,env,actor);expect(failed.status).toBe(503);expect(await failed.json()).toEqual({error:'dashboard_unavailable'});
});
