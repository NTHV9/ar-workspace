import {afterEach,expect,it,vi} from 'vitest';
import {sweepFinancialLogs} from '../worker/operations/financial-log-retention';

const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',FINANCIAL_LOG_RETENTION_ENABLED:'true'};
const success={status:'succeeded',deleted:1000,moreEligible:true,retentionMonths:1,checkedAt:'2026-09-15T09:00:00Z'};
function harness(options:{actor?:unknown;result?:unknown;failing?:string;httpFailure?:boolean}={}){
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{
  const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url),name=url.pathname.split('/').at(-1)!;
  expect(url.origin).toBe('https://synthetic.supabase.co');
  expect(request.redirect).toBe('manual');
  calls.push({name,args:JSON.parse(await request.text())});
  if(options.failing===name){if(options.httpFailure)return Response.json({message:'private synthetic row or credential detail'},{status:503});throw Error('private synthetic row or credential detail');}
  if(name==='ar_financial_service_actor')return Response.json(Object.hasOwn(options,'actor')?options.actor:actor);
  if(name==='ar_financial_log_prune')return Response.json(Object.hasOwn(options,'result')?options.result:success);
  throw Error('Unexpected synthetic RPC');
 });
 return calls;
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it.each([undefined,'false','TRUE','true ','','unknown'])('does no service work unless the flag is exactly true (%s)',async(flag)=>{
 const calls=harness();expect(await sweepFinancialLogs({...env,FINANCIAL_LOG_RETENTION_ENABLED:flag})).toEqual({enabled:false});expect(calls).toEqual([]);
});
it.each(['true','TRUE','','unknown'])('write hold stops pruning before actor resolution (%s)',async(hold)=>{
 const calls=harness();expect(await sweepFinancialLogs({...env,OPERATIONS_WRITE_HOLD:hold})).toEqual({enabled:false});expect(calls).toEqual([]);
});
it('never routes financial log pruning into an acceptance workspace',async()=>{
 const calls=harness();expect(await sweepFinancialLogs({...env,ACCEPTANCE:{id:'00000000-0000-4000-8000-000000000002',owner:actor,recipientHash:'synthetic',sourceSha:'synthetic',clockOffsetDays:40}})).toEqual({enabled:false});expect(calls).toEqual([]);
});
it('uses the service actor and sends one capped batch without a caller-controlled cutoff',async()=>{
 const calls=harness();expect(await sweepFinancialLogs({...env,OPERATIONS_WRITE_HOLD:'false'})).toEqual({enabled:true,status:'succeeded',deleted:1000,moreEligible:true,retentionMonths:1,checkedAt:'2026-09-15T09:00:00Z'});
 expect(calls).toEqual([{name:'ar_financial_service_actor',args:{}},{name:'ar_financial_log_prune',args:{p_actor:actor,p_limit:1000}}]);
});
it.each([null,'','synthetic-owner',{},[],42].map(value=>({value})))('rejects an unavailable or malformed service actor before pruning ($value)',async({value})=>{
 const calls=harness({actor:value});await expect(sweepFinancialLogs(env)).rejects.toThrow('financial_log_cleanup_unavailable');expect(calls.map(c=>c.name)).toEqual(['ar_financial_service_actor']);
});
it.each(['ar_financial_service_actor','ar_financial_log_prune'])('sanitizes transport and HTTP failures from %s without retrying',async(name)=>{
 for(const httpFailure of [false,true]){
  const calls=harness({failing:name,httpFailure});
  await expect(sweepFinancialLogs(env)).rejects.toThrow(/^financial_log_cleanup_unavailable$/);
  expect(calls.filter(c=>c.name===name)).toHaveLength(1);
 }
});
it.each([
 ['empty',null],['array',[]],['unknown status',{...success,status:'done'}],
 ['negative count',{...success,deleted:-1}],['fractional count',{...success,deleted:1.5}],['too large count',{...success,deleted:1001}],['string count',{...success,deleted:'1'}],
 ['unknown eligibility',{...success,moreEligible:'false'}],['wrong retention',{...success,retentionMonths:2}],
 ['invalid time',{...success,checkedAt:'not a timestamp'}],['unscoped time',{...success,checkedAt:'2026-09-15'}],
 ['unexpected error',{...success,error:'private synthetic row detail'}],
 ['incomplete error',{...success,status:'error',deleted:0,moreEligible:false}],
])('rejects a malformed cleanup result: %s',async(_label,result)=>{
 harness({result});await expect(sweepFinancialLogs(env)).rejects.toThrow(/^financial_log_cleanup_unavailable$/);
});
it.each([
 {status:'succeeded',deleted:0,moreEligible:false,retentionMonths:1,checkedAt:'2026-09-15T16:00:00.123456+07:00'},
 {status:'busy',deleted:0,moreEligible:true,retentionMonths:1,checkedAt:'2026-09-15T09:00:00Z'},
 {status:'error',deleted:0,moreEligible:false,retentionMonths:1,checkedAt:'2026-09-15T09:00:00Z',error:'cleanup_failed'},
])('returns documented metadata for $status without leaking extra payload',async(result)=>{
 const log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error'),warn=vi.spyOn(console,'warn');
 harness({result:{...result,rows:[{id:'private synthetic row',before:'private synthetic financial detail'}],actor:'private synthetic actor'}});
 expect(await sweepFinancialLogs(env)).toEqual({enabled:true,...result});
 expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();
});
