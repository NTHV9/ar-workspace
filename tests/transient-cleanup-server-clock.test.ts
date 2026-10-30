import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),providers:vi.fn(),inspect:vi.fn(),remove:vi.fn()}));
vi.mock('../worker/refresh/backend',()=>({backendRpc:mocks.rpc}));
vi.mock('../worker/operations/retention-providers',()=>({retentionProviders:mocks.providers}));
import {cleanupTransientDocument} from '../worker/operations/retention-sweep';
const actor='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',objectId='33333333-3333-4333-8333-333333333333',itemId='44444444-4444-4444-8444-444444444444',file='55555555-5555-4555-8555-555555555555';
const workerNow=Date.parse('2026-10-30T00:00:00Z'),env={RETENTION_ENABLED:'true',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-test-only'};
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(workerNow);mocks.rpc.mockImplementation(async(_env:unknown,name:string,args:unknown)=>{expect(name).toBe('ar_document_cleanup_job_candidates');expect(args).toEqual({p_actor:actor,p_job_id:job,p_limit:10});return [{objectId,itemId:null}];});mocks.providers.mockReturnValue({supabase:{inspect:mocks.inspect,remove:mocks.remove}});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function server(mode:'delete'|'wait'|'busy'|'reconcile',ahead:number,state='waiting'){
 const calls:string[]=[],dueAt=new Date(workerNow+ahead).toISOString();let present=true;
 const target={store:'supabase',objectId,owner:actor,bucket:'ar-working-files',key:`jobs/${job}/originals/${file}.pdf`,updatedAt:new Date(workerNow-1000).toISOString(),etag:null,byteCount:100,sha256:'a'.repeat(64)};
 const item={id:itemId,revision:1,state,reason:'retention_due',eligibleSince:dueAt,dueAt,claimId:null,target};
 mocks.inspect.mockImplementation(async()=>{calls.push('inspect');return present?{state:'present',identityVerified:true}:{state:'absent'};});mocks.remove.mockImplementation(async()=>{calls.push('remove');present=false;});
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const name=new URL(String(input)).pathname.split('/').at(-1)!;calls.push(name);const args=JSON.parse(String(init?.body));
  if(name==='ar_retention_enroll')return Response.json(item);
  if(name==='ar_retention_claim')return Response.json({mode,item:{...item,state:['delete','reconcile'].includes(mode)?'claimed':item.state,claimId:['delete','reconcile'].includes(mode)?args.p_claim:null}});
  if(name==='ar_retention_arm')return Response.json({proceed:true,item:{...item,state:'claimed',claimId:args.p_claim}});
  if(name==='ar_retention_observe')return Response.json({...item,state:args.p_outcome==='absent'?'deleted':'waiting',reason:'retention_observed_'+args.p_outcome});
  throw Error('Unexpected RPC '+name);
 }));return calls;
}
it.each([1,1000,300000])('cleans this exact exited job when SQL is due while the Worker clock is %i ms behind',async ahead=>{
 const calls=server('delete',ahead);expect(await cleanupTransientDocument(env,actor,job)).toEqual({enabled:true,checked:1,deleted:1,errors:0});expect(calls).toEqual(['ar_retention_enroll','ar_retention_claim','inspect','ar_retention_arm','remove','inspect','ar_retention_observe']);expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it.each(['wait','busy'] as const)('never touches the provider when authoritative SQL returns %s',async mode=>{
 const calls=server(mode,86400000);expect(await cleanupTransientDocument(env,actor,job)).toEqual({enabled:true,checked:1,deleted:0,errors:0});expect(calls).toEqual(['ar_retention_enroll','ar_retention_claim']);expect(mocks.inspect).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
});
it('reconciles a prior uncertain outcome without issuing another provider deletion',async()=>{
 const calls=server('reconcile',1,'uncertain');expect(await cleanupTransientDocument(env,actor,job)).toMatchObject({checked:1,deleted:0,errors:0});expect(calls).toEqual(['ar_retention_enroll','ar_retention_claim','inspect','ar_retention_observe']);expect(mocks.remove).not.toHaveBeenCalled();
});
it('does not request a deletion claim for blocked work',async()=>{
 const calls=server('delete',1,'blocked');expect(await cleanupTransientDocument(env,actor,job)).toMatchObject({checked:1,deleted:0,errors:0});expect(calls).toEqual(['ar_retention_enroll']);expect(mocks.remove).not.toHaveBeenCalled();
});
