import {afterEach,expect,it,vi} from 'vitest';
import {reportsApi,parseReportQuery} from '../worker/reports/api';
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const actor='00000000-0000-4000-8000-000000000001';
it('accepts stable custom stage keys without treating display labels as identities',()=>{
 expect(parseReportQuery(new URL('https://app.test/api/reports/current?kind=round_personal-followup')).p_kind).toBe('round_personal-followup');
 expect(()=>parseReportQuery(new URL('https://app.test/api/reports/current?kind=Personal%20follow-up'))).toThrow('reports_invalid');
});
it('rejects invalid calendar dates, reversed ranges, ambiguous accounts and oversized pages',()=>{
 for(const search of ['from=2026-02-30','from=2026-10-01&to=2026-09-01','account=A','limit=201','page=-1','hotel=OTHER','kind=Draft','page=1.5'])expect(()=>parseReportQuery(new URL('https://app.test/api/reports/activity?'+search))).toThrow('reports_invalid');
});
it('preserves hotel account identity and explicit page offsets for complete drilldown',()=>{
 expect(parseReportQuery(new URL('https://app.test/api/reports/activity?hotel=TSK&account=A%2CB&type=OTA&from=2026-09-01&to=2026-09-10&page=2&limit=25&invoice=I%3A1&kind=Rebilling'))).toEqual({p_mode:'activity',p_hotel:'TSK',p_account:'A,B',p_type:'OTA',p_from:'2026-09-01',p_to:'2026-09-10',p_offset:50,p_limit:25,p_invoice:'I:1',p_kind:'Rebilling'});
});
it('is read only and does not query without an authenticated actor',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 expect((await reportsApi(new Request('https://app.test/api/reports/activity'),env,'')).status).toBe(401);
 expect((await reportsApi(new Request('https://app.test/api/reports/activity',{method:'POST'}),env,actor)).status).toBe(405);
 expect(f).not.toHaveBeenCalled();
});
it('never converts provider failure or malformed responses into zero activity',async()=>{
 for(const response of [new Response('',{status:503}),Response.json(null),Response.json({rows:[]})]){
  vi.stubGlobal('fetch',async()=>response);
  expect((await reportsApi(new Request('https://app.test/api/reports/activity'),env,actor)).status).toBe(503);
 }
});
it('passes owner identity to the protected RPC and returns all-page totals separately from rows',async()=>{
 const data={rows:[{invoiceId:'last-page'}],total:51,summary:{invoices:51,amount:12345},offset:50,limit:25};
 let body:Record<string,unknown>={};vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{body=JSON.parse(String(init.body));return Response.json(data);});
 const r=await reportsApi(new Request('https://app.test/api/reports/activity?page=2&limit=25'),env,actor);
 expect(r.status).toBe(200);expect(await r.json()).toEqual(data);expect(body.p_actor).toBe(actor);expect(body.p_offset).toBe(50);expect(r.headers.get('Cache-Control')).toBe('no-store');
});
it('returns forbidden from database actor validation without leaking provider details',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({error:'reports_forbidden'}));
 expect((await reportsApi(new Request('https://app.test/api/reports/activity'),env,actor)).status).toBe(403);
});
