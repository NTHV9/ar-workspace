import {afterEach,it,expect,vi} from 'vitest';
import {managementDashboardApi} from '../worker/dashboard/management-api';
import {syntheticManagement} from './fixtures/management-dashboard';
const actor='00000000-0000-4000-8000-000000000001',env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const request=(q='from=2026-09-01&to=2026-09-30',method='GET')=>new Request('https://app.test/api/dashboard/management?'+q,{method});
afterEach(()=>vi.unstubAllGlobals());
it('denies anonymous, malformed actor and writes before the database',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect((await managementDashboardApi(request(),env,'')).status).toBe(401);
 expect((await managementDashboardApi(request(),env,'-'.repeat(36))).status).toBe(401);
 expect((await managementDashboardApi(request(undefined,'POST'),env,actor)).status).toBe(405);expect(fetcher).not.toHaveBeenCalled();
});
it('reads one database summary with exact actor/region/date arguments and no-store',async()=>{
 const calls:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{expect(String(url)).toBe('https://synthetic.supabase.co/rest/v1/rpc/ar_dashboard_management');calls.push(JSON.parse(init.body));return Response.json(syntheticManagement('khao-lak'));}));
 const response=await managementDashboardApi(request('from=2026-09-01&to=2026-09-30&region=khao-lak'),env,actor);
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');expect(calls).toEqual([{p_actor:actor,p_from:'2026-09-01',p_to:'2026-09-30',p_hotel:'KhaoLak',p_account:null,p_type:null}]);
});
it('rejects a returned Account from another hotel and database denial',async()=>{
 const data=syntheticManagement();data.accountsOver60![0].hotel='TLKL';vi.stubGlobal('fetch',vi.fn(async()=>Response.json(data)));
 expect((await managementDashboardApi(request(),env,actor)).status).toBe(503);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'dashboard_forbidden'})));expect((await managementDashboardApi(request(),env,actor)).status).toBe(403);
});
it('rejects summary pagination and ambiguous/foreign query fields before RPC',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const q of ['from=2026-09-01&to=2026-09-30&limit=1','from=2026-09-01&to=2026-09-30&region=khao-lak&hotel=KAT','from=2026-09-01&to=2026-09-30&account=A'])expect((await managementDashboardApi(request(q),env,actor)).status).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();
});
