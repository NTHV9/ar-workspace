import {expect,it,vi} from 'vitest';
import {dashboardHotelOverviewApi} from '../worker/dashboard/hotel-api';
it('loads just the selected comparison group without waiting for unrelated readers',async()=>{
 const part={balances:null,activity:null,external:null,entries:null,payments:null,paid:null};
 const fetcher=vi.fn(async(_url:string,_init:RequestInit)=>Response.json({region:'phuket',from:'2026-09-01',to:'2026-09-11',total:part,hotels:[{hotel:'KAT',...part},{hotel:'TSK',...part}]}));
 vi.stubGlobal('fetch',fetcher);
 try{
 const response=await dashboardHotelOverviewApi(new Request('https://app.test/api/dashboard/hotel-overview?from=2026-09-01&to=2026-09-11&segment=activity'),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},'00000000-0000-4000-8000-000000000001');
 expect(response.status).toBe(200);
 expect(fetcher.mock.calls[0]?.[0]).toContain('ar_dashboard_region_cached_segment');
 }finally{vi.unstubAllGlobals();}
});
