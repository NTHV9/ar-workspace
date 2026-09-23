import {afterEach,expect,it,vi} from 'vitest';
import {warmPeriodSummaries} from '../worker/dashboard/precompute';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const actor='00000000-0000-4000-8000-000000000001';
afterEach(()=>vi.unstubAllGlobals());
it('warms only validated missing summary tasks, tolerates a reader failure and never calls OPERA',async()=>{
 const calls:Array<{url:string;body:Record<string,unknown>}>=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));calls.push({url,body});
  if(url.endsWith('/ar_period_summary_plan'))return Response.json({actor,tasks:['entries','activity','paid'].map(segment=>({region:'phuket',from:'2026-09-01',to:'2026-09-24',segment}))});
  return Response.json(body.p_segment==='paid'?{error:'dashboard_unavailable'}:{region:'phuket'});
 });
 expect(await warmPeriodSummaries(env,'phuket')).toEqual({planned:3,completed:2,failed:1});
 expect(calls[0].body).toEqual({p_region:'phuket'});expect(calls.slice(1).every(c=>c.url.endsWith('/ar_dashboard_region_cached_segment')&&c.body.p_actor===actor&&c.body.p_type===null)).toBe(true);
});
it('skips acceptance/write-hold and rejects a plan outside the requested region',async()=>{
 const fetcher=vi.fn(async()=>Response.json({actor,tasks:[{region:'khao-lak',from:'2026-09-01',to:'2026-09-24',segment:'entries'}]}));vi.stubGlobal('fetch',fetcher);
 await warmPeriodSummaries({...env,OPERATIONS_WRITE_HOLD:'true'});expect(fetcher).not.toHaveBeenCalled();
 expect((await warmPeriodSummaries(env,'phuket')).failed).toBe(1);expect(fetcher).toHaveBeenCalledTimes(1);
});
