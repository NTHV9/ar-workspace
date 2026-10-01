import {afterEach,expect,it,vi} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
import {currentTickerId,dispatchCurrentTicker,runCurrentTicker} from '../worker/refresh/ticker';
const start=Date.parse('2026-10-01T11:30:00Z');
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',OPERA_REFRESH_ENABLED:'true',OPERA_HOTEL_IDS:'KAT,TSK,TLKL,WAKL,TLFO,TSAN',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic'};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function step(){const wakes:number[]=[],results:unknown[]=[];return {wakes,results,port:{sleepUntil:async(_name:string,time:Date)=>{wakes.push(time.getTime());vi.setSystemTime(Math.max(Date.now(),time.getTime()));},do:async(_name:string,_options:unknown,fn:()=>Promise<unknown>)=>{const result=await fn();results.push(result);return result;}} as unknown as Pick<WorkflowStep,'do'|'sleepUntil'>};}
it('dispatch retries join one exact maintenance window across different invocation times',async()=>{
 const ids=new Set<string>(),create=vi.fn(async({id}:{id:string})=>{if(ids.has(id))throw Error('exists');ids.add(id);}),get=vi.fn(async()=>({status:async()=>({status:'waiting'})}));
 const first=await dispatchCurrentTicker({...env,AR_REFRESH:{create,get}},start+3000),second=await dispatchCurrentTicker({...env,AR_REFRESH:{create,get}},start+120000);
 expect(first).toEqual(second);expect(ids.size).toBe(1);expect(get).toHaveBeenCalledOnce();expect(await currentTickerId(start+900000)).not.toBe(first.id);
});
it('uses three fixed five-minute wake-ups and stale checks for all six hotels',async()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const calls:{p_hotel:string;p_reason:string;p_stale_minutes:number}[]=[],create=vi.fn();
 vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));return Response.json({status:'fresh',created:false});});
 const s=step();expect(await runCurrentTicker({...env,AR_REFRESH:{create,get:vi.fn()}},start,s.port)).toEqual({status:'finished',ticks:3,hotels:6});
 expect(s.wakes).toEqual([start,start+300000,start+600000]);expect(calls).toHaveLength(18);expect(new Set(calls.map(c=>c.p_hotel)).size).toBe(6);expect(calls.every(c=>c.p_reason==='open'&&c.p_stale_minutes===5)).toBe(true);expect(create).not.toHaveBeenCalled();
});
it('one failed hotel cannot suppress peers or later fixed wake-ups',async()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const calls:string[]=[];
 vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{const args=JSON.parse(String(init.body));calls.push(args.p_hotel);return args.p_hotel==='KAT'?Response.json({}, {status:503}):Response.json({status:'fresh',created:false});});
 const s=step();await runCurrentTicker({...env,AR_REFRESH:{create:vi.fn(),get:vi.fn()}},start,s.port);expect(calls).toHaveLength(18);expect(s.results).toEqual(Array(3).fill({hotels:6,unavailable:1}));
});
it('a delayed window skips expired rounds instead of bursting obsolete reads',async()=>{
 vi.useFakeTimers();vi.setSystemTime(start+1200000);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const s=step();await runCurrentTicker(env,start,s.port);expect(s.results).toEqual(Array(3).fill({skipped:true}));expect(fetcher).not.toHaveBeenCalled();
});
it('rejects malformed windows before dispatch or sleeping',async()=>{
 const s=step();await expect(runCurrentTicker(env,start+1,s.port)).rejects.toThrow('refresh_ticker_invalid');expect(s.wakes).toEqual([]);
});
