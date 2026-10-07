import {afterEach,expect,it,vi} from 'vitest';
import {dashboardBalanceAccountsApi,parseDashboardBalanceAccountsQuery,parseDashboardBalancesQuery,dashboardBalancesApi} from '../worker/dashboard/api';
const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('uses bounded account paging and inclusive ages without an issued-date cohort',()=>{
 expect(parseDashboardBalanceAccountsQuery(new URL('https://app.test/api/dashboard/balance-accounts?region=phuket&asOf=2026-10-07&metric=unbilled&ageMin=61&ageMax=90&page=2&limit=200'))).toMatchObject({p_hotel:null,p_metric:'unbilled',p_age_min:61,p_age_max:90,p_offset:400,p_limit:200});
 expect(parseDashboardBalancesQuery(new URL('https://app.test/api/dashboard/balances?asOf=2026-10-07&hotel=KAT&account=A&ageMin=151'))).toMatchObject({p_account:'A',p_age_min:151,p_age_max:null});
 for(const q of ['ageMin=-1','ageMin=1e2','ageMax=2147483648','ageMin=91&ageMax=90','ageMin=61&ageMin=62','from=2026-01-01','limit=201'])expect(()=>parseDashboardBalanceAccountsQuery(new URL('https://app.test/api/dashboard/balance-accounts?asOf=2026-10-07&'+q))).toThrow('dashboard_invalid');
});
it('returns account groups through a private RPC and preserves unknown coverage',async()=>{
 const payload={asOfDate:'2026-10-07',mode:'current',capturedAt:null,sourceAt:null,complete:false,missingHotels:[],metrics:[],stages:[],rows:[{hotel:'KAT',accountId:'A',accountNo:null,accountName:'Synthetic',accountType:'Agent',count:2,amount:null,oldest:null,verified:false}],total:1,unverified:1};
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json(payload));vi.stubGlobal('fetch',fetcher);
 const res=await dashboardBalanceAccountsApi(new Request('https://app.test/api/dashboard/balance-accounts?asOf=2026-10-07&hotel=KAT&ageMin=61'),env,actor);
 expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');expect(await res.json()).toEqual(payload);
 expect(String(fetcher.mock.calls[0][0])).toContain('/rpc/ar_dashboard_balance_accounts');expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({p_actor:actor,p_age_min:61,p_age_max:null});
 vi.stubGlobal('fetch',async()=>Response.json({error:'dashboard_forbidden'}));expect((await dashboardBalanceAccountsApi(new Request('https://app.test/api/dashboard/balance-accounts?asOf=2026-10-07'),env,actor)).status).toBe(403);
 expect((await dashboardBalanceAccountsApi(new Request('https://app.test/api/dashboard/balance-accounts?asOf=2026-10-07'),env,'')).status).toBe(401);
});
it('routes age-filtered invoices through the new RPC while preserving old calls',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({asOfDate:'2026-10-07',mode:'current',complete:true,missingHotels:[],metrics:[],stages:[],rows:[],total:0}));vi.stubGlobal('fetch',fetcher);
 expect((await dashboardBalancesApi(new Request('https://app.test/api/dashboard/balances?asOf=2026-10-07&ageMin=61'),env,actor)).status).toBe(200);
 expect(String(fetcher.mock.calls[0][0])).toContain('/rpc/ar_dashboard_balance_invoices');
 expect((await dashboardBalancesApi(new Request('https://app.test/api/dashboard/balances?asOf=2026-10-07'),env,actor)).status).toBe(200);
 expect(String(fetcher.mock.calls[1][0])).toContain('/rpc/ar_dashboard_balances');
});
