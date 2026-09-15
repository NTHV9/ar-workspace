import {afterEach,expect,it,vi} from 'vitest';
import {dashboardHotelOverviewApi,parseDashboardHotelOverviewQuery} from '../worker/dashboard/hotel-api';
import type {DashboardHotelOverviewResponse,DashboardOverviewScope} from '../worker/dashboard/hotel-model';

const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const path='https://app.test/api/dashboard/hotel-overview?from=2026-09-01&to=2026-09-11';
const scope=():DashboardOverviewScope=>({balances:null,activity:null,external:null,entries:null,payments:null,paid:null});
const payload=():DashboardHotelOverviewResponse=>({from:'2026-09-01',to:'2026-09-11',total:scope(),hotels:[{hotel:'KAT',...scope()},{hotel:'TSK',...scope()}]});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

it('accepts only all-hotel date/type scope with calendar-valid nonfuture bounded dates',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-11T18:00:00Z'));
 expect(parseDashboardHotelOverviewQuery(new URL(path+'&type=Travel%20Agent'))).toEqual({p_from:'2026-09-01',p_to:'2026-09-11',p_type:'Travel Agent'});
 expect(parseDashboardHotelOverviewQuery(new URL(path.replace('to=2026-09-11','to=2026-09-12'))).p_to).toBe('2026-09-12');
 for(const query of ['from=2026-09-01','from=2026-02-30&to=2026-09-11','from=0000-01-01&to=0000-01-02','from=2026-09-12&to=2026-09-11','from=2026-09-01&to=2026-09-13','from=2010-01-01&to=2026-09-11','from=2026-09-01&to=2026-09-11&to=2026-09-11'])expect(()=>parseDashboardHotelOverviewQuery(new URL('https://app.test/api/dashboard/hotel-overview?'+query))).toThrow('dashboard_invalid');
 for(const suffix of ['hotel=KAT','account=A','limit=1','page=0','metric=open','surprise=1','type=','type=%20','type=x%7F','type=x&type=y'])expect(()=>parseDashboardHotelOverviewQuery(new URL(path+'&'+suffix))).toThrow('dashboard_invalid');
 expect(()=>parseDashboardHotelOverviewQuery(new URL(path.replace('hotel-overview','balances')))).toThrow('dashboard_invalid');
});

it('rejects unauthorized actor, non-GET and forbidden account filters before access',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect((await dashboardHotelOverviewApi(new Request(path),env,'invalid')).status).toBe(401);
 expect((await dashboardHotelOverviewApi(new Request(path,{method:'POST'}),env,actor)).status).toBe(405);
 expect((await dashboardHotelOverviewApi(new Request(path+'&hotel=KAT'),env,actor)).status).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();
});

it('uses one protected RPC and preserves a partial scope without inventing totals',async()=>{
 const result=payload();result.hotels[0].activity={rows:[],total:2,summary:{invoices:2,messages:1,missingAmounts:0,kinds:[{kind:'First billing',invoices:2,amount:90.25}]}};
 const fetcher=vi.fn(async(_url:string,_options:RequestInit)=>Response.json(result));vi.stubGlobal('fetch',fetcher);
 const response=await dashboardHotelOverviewApi(new Request(path),env,actor);
 expect(response.status).toBe(200);expect(await response.json()).toEqual(result);expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0]?.[0]).toBe('https://synthetic.supabase.co/rest/v1/rpc/ar_dashboard_hotel_overview');
 const call=fetcher.mock.calls[0];
 expect(JSON.parse(String(call[1].body))).toEqual({p_actor:actor,p_from:'2026-09-01',p_to:'2026-09-11',p_type:null});
});

it('propagates top-level authority and validation failures and conceals provider details',async()=>{
 for(const [error,status] of [['dashboard_forbidden',403],['dashboard_invalid',400],['private_details',503]] as const){vi.stubGlobal('fetch',async()=>Response.json({error}));const r=await dashboardHotelOverviewApi(new Request(path),env,actor);expect(r.status).toBe(status);if(status===503)expect(await r.text()).not.toContain('private_details');}
 vi.stubGlobal('fetch',async()=>{throw Error('private database stack');});const r=await dashboardHotelOverviewApi(new Request(path),env,actor);expect(r.status).toBe(503);expect(await r.text()).not.toContain('private database');
});

it('rejects mismatched periods, missing/duplicate hotel scope and leaked detail rows',async()=>{
 const malformed=[{...payload(),from:'2026-08-01'},{...payload(),hotels:[{hotel:'KAT',...scope()}]},{...payload(),hotels:[{hotel:'KAT',...scope()},{hotel:'KAT',...scope()}]},{...payload(),total:{}},{...payload(),total:{...scope(),activity:{rows:[{customer:'detail'}],total:1,summary:{}}}}];
 for(const value of malformed){vi.stubGlobal('fetch',async()=>Response.json(value));expect((await dashboardHotelOverviewApi(new Request(path),env,actor)).status).toBe(503);}
});
