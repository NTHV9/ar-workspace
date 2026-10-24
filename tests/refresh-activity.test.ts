import {afterEach,expect,it,vi} from 'vitest';
import worker,{handleApi} from '../worker/index';
import {currentRefreshCron} from '../worker/refresh/schedule';
const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',SUPABASE_PUBLISHABLE_KEY:'synthetic',OPERA_REFRESH_ENABLED:'true',OPERA_HOTEL_IDS:'KAT,TSK,TLKL,WAKL,TLFO,TSAN',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',AR_REFRESH:{create:vi.fn(),get:vi.fn()}};
function harness(active:unknown=[]){
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const r=input instanceof Request?input:new Request(input,init),name=new URL(r.url).pathname.split('/').at(-1)!;
  if(name==='user')return Response.json({id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-01-01',is_anonymous:false});
  const args=JSON.parse(await r.text());calls.push({name,args});
  if(name==='ar_refresh_active_hotels'){if(active instanceof Error)throw active;return Response.json(active);}
  if(name==='ar_refresh_activity_touch')return Response.json({active:true});
  if(name==='ar_tracker_scheduled_bindings')return Response.json([]);
  if(name==='ar_request_refresh')return Response.json({status:'fresh',created:false});
  throw Error('unexpected synthetic RPC '+name);
 });return calls;
}
afterEach(()=>vi.unstubAllGlobals());
it('does not start optional OPERA work when nobody is active',async()=>{
 const calls=harness();await worker.scheduled({cron:currentRefreshCron},env);
 expect(calls.map(c=>c.name)).toEqual(['ar_refresh_active_hotels']);
});
it('refreshes only active configured hotels with the shared five-minute stale guard',async()=>{
 const calls=harness(['KAT','TSAN']);await worker.scheduled({cron:currentRefreshCron},env);
 expect(calls.filter(c=>c.name==='ar_request_refresh').map(c=>c.args)).toEqual(['KAT','TSAN'].map(hotel=>({p_hotel:hotel,p_account_id:null,p_reason:'open',p_stale_minutes:5})));
});
it.each([new Error('unavailable'),['UNKNOWN'],['KAT','KAT'],{}])('fails closed for invalid/unavailable activity without starting all hotels: %j',async value=>{
 const calls=harness(value);await expect(worker.scheduled({cron:currentRefreshCron},env)).resolves.toBeUndefined();expect(calls.some(c=>c.name==='ar_request_refresh')).toBe(false);
});
it('retains tracker fallback when OPERA has no active users',async()=>{
 const calls=harness();await worker.scheduled({cron:currentRefreshCron},{...env,TRACKER_SYNC_ENABLED:'true'});
 expect(calls.map(c=>c.name)).toEqual(['ar_tracker_scheduled_bindings','ar_refresh_active_hotels']);
});
it('daily ingestion still refreshes all configured hotels without requiring activity',async()=>{
 const calls=harness();await worker.scheduled({cron:'0 0,12 * * *'},env);
 expect(calls.map(c=>c.name)).toEqual(Array(6).fill('ar_request_refresh'));
 expect(calls.every(c=>c.args.p_reason==='scheduled')).toBe(true);
});
function request(body:unknown={region:'phuket'},extra:Record<string,string>={}){return new Request('https://app.test/api/refresh/activity',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json',Origin:'https://app.test',...extra},body:JSON.stringify(body)});}
it('activity is an authenticated regional lease, not a new OPERA job',async()=>{
 const calls=harness();const response=await handleApi(request(),env);
 expect(response.status).toBe(200);expect(calls).toEqual([{name:'ar_refresh_activity_touch',args:{p_actor:actor,p_hotels:['KAT','TSK']}}]);
});
it.each([{region:'bad'},{region:'phuket',expiresAt:'2099-01-01'},{region:'phuket',actor},{region:'phuket',hotel:'TSAN'},{}])('rejects client-owned scope/expiry or invalid activity body %j',async body=>{
 const calls=harness();expect((await handleApi(request(body),env)).status).toBe(400);expect(calls).toEqual([]);
});
it('rejects cross-origin, anonymous and held activity',async()=>{
 const calls=harness();expect((await handleApi(request(undefined,{Origin:'https://other.test'}),env)).status).toBe(403);
 expect((await handleApi(new Request('https://app.test/api/refresh/activity',{method:'POST'}),env)).status).toBe(401);
 expect((await handleApi(request(),{...env,OPERATIONS_WRITE_HOLD:'true'})).status).toBe(503);expect(calls).toEqual([]);
});
