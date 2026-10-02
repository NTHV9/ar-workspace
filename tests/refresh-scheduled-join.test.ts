import {afterEach,expect,it,vi} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
import {requestRefresh,type RefreshParams} from '../worker/refresh/backend';
import {joinedScheduledMaintenance} from '../worker/refresh/post-publication';
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic'};
it.each(['open','manual'])('preserves a daily obligation when joining %s',async reason=>{
 const dispatched:{id:string;params:RefreshParams}[]=[];
 vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('ar_request_refresh')?{id:'synthetic-run',status:'running',created:false}:{hotel:'KAT',account_id:null,reason,status:'running'}));
 await requestRefresh({...env,AR_REFRESH:{async create(o){dispatched.push(o);if(o.id==='synthetic-run')throw Error('exists');},async get(){return {async status(){return {status:'running'};}};}}},'KAT',null,'scheduled');
 expect(dispatched[1]).toEqual({id:'synthetic-run-scheduled',params:{runId:'synthetic-run',hotel:'KAT',refreshReason:'scheduled',scheduledMaintenance:true}});
});
it('does not run maintenance until the joined publication succeeds',async()=>{
 let reads=0;const steps:string[]=[],sleeps:string[]=[];
 vi.stubGlobal('fetch',async()=>Response.json({hotel:'KAT',account_id:null,status:++reads===1?'running':'succeeded'}));
 const step={do:async(name:string,...args:unknown[])=>{steps.push(name);return name.startsWith('await-publication')?(args.at(-1) as ()=>Promise<unknown>)():{};},sleep:async(name:string)=>{sleeps.push(name);}} as unknown as WorkflowStep;
 await joinedScheduledMaintenance({...env,FINANCIAL_HISTORY_ENABLED:'true',RETENTION_ENABLED:'true'},{runId:'synthetic-run',hotel:'KAT'},step);
 expect(sleeps).toHaveLength(1);expect(steps).toEqual(['await-publication-0','await-publication-1','period-summary-precompute','enqueue-financial-history','completed-file-retention']);
});
it('does not treat a failed publication as current financial data',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({hotel:'KAT',account_id:null,status:'failed'}));const steps:string[]=[];
 const step={do:async(name:string,fn:()=>Promise<unknown>)=>{steps.push(name);return fn();}} as unknown as WorkflowStep;
 expect(await joinedScheduledMaintenance(env,{runId:'synthetic-run',hotel:'KAT'},step)).toEqual({status:'source_failed'});expect(steps).toEqual(['await-publication-0']);
});
