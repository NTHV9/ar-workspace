import {afterEach,expect,it,vi} from 'vitest';
import {initialOverview,applyOverviewSegment,loadOverviewSegments} from '../src/dashboard/progressive-overview';
import {overviewSource} from '../src/dashboard/hotel-data';
afterEach(()=>vi.unstubAllGlobals());
it('publishes fast results while a slow reader remains pending, bounds concurrency and stops on cancellation',async()=>{
 const pending=new Map<string,(r:Response)=>void>();let active=0,peak=0;
 vi.stubGlobal('fetch',vi.fn((url:string)=>new Promise<Response>(resolve=>{active++;peak=Math.max(peak,active);pending.set(new URL(url).searchParams.get('segment')!,r=>{active--;resolve(r);});})));
 const results:string[]=[],controller=new AbortController();
 const done=loadOverviewSegments('https://app.test/api/dashboard/hotel-overview?from=2026-09-01','synthetic',controller.signal,k=>results.push(k));
 expect([...pending.keys()]).toEqual(['entries','activity','balances']);
 pending.get('activity')!(Response.json({ok:true}));
 await vi.waitFor(()=>expect(results).toEqual(['activity']));
 expect(pending.has('external')).toBe(true);expect(results).not.toContain('entries');expect(peak).toBe(3);
 controller.abort();for(const [k,release] of pending)if(k!=='activity')release(Response.json({ok:true}));await done;
 expect(results).toEqual(['activity']);expect(pending.size).toBe(4);
});
it.each(['phuket','khao-lak'] as const)('%s keeps each comparison group atomic and distinguishes loading from failure',region=>{
 const previous=initialOverview('2026-09-01','2026-09-23',region);
 expect(overviewSource({state:'loading',data:previous},'activity').state).toBe('loading');
 const next=initialOverview(previous.from,previous.to,region);
 const activity={rows:[] as [],total:0,summary:{kinds:[],invoices:0,messages:0,missingAmounts:0}};
 next.total.activity=activity;next.hotels.forEach(h=>h.activity=activity);
 const loaded=applyOverviewSegment(previous,'activity',next);
 expect(overviewSource({state:'loading',data:loaded},'activity').state).toBe('ready');
 expect(overviewSource({state:'loading',data:loaded},'entries').state).toBe('loading');
 next.hotels[0].activity=null;
 const failed=applyOverviewSegment(loaded,'activity',next);
 expect(overviewSource({state:'loading',data:failed},'activity')).toEqual({state:'error',data:activity});
 expect(failed.hotels.every(h=>h.activity===activity)).toBe(true);
 expect(failed.retained).toContain('activity');
});

