import {afterEach,expect,it,vi} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
import {runGranularFinancialHistory} from '../worker/financial/granular';
import type {FinancialPayment,FinancialInvoice} from '../worker/opera/financial-history';
import type {FinancialRun} from '../worker/financial/model';
const run:FinancialRun={stepsVersion:2,id:'00000000-0000-4000-8000-000000000010',owner:'00000000-0000-4000-8000-000000000001',hotel:'KAT',from:'2026-08-12',to:'2026-09-11',status:'running',proof:'synthetic',discovered:true,accounts:1,startedAt:'2026-09-11T00:00:00.123456+00:00',initialImport:true,counts:{invoices:0,payments:0,applications:0}};
const env={OPERA_BASE_URL:'https://synthetic.opera.invalid',OPERA_HOTEL_IDS:'KAT',OPERA_ENTERPRISE_ID:'synthetic',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic'};
const invoice=(n:number):FinancialInvoice=>({kind:'invoice',hotel:'KAT',accountId:'SYNTHETIC-A',transactionId:String(101+n),invoiceNo:String(201+n),folioNo:null,invoiceType:'Normal',transactionDate:'2026-09-01',postingDate:null,revenueDate:null,transferDate:null,transferredIn:false,transferredOut:false,currency:'THB',originalAmount:'100.00',currentAmount:'100.00',openAmount:'100.00',cumulativePayments:'0.00',closeDate:null,compressed:false,parentInvoiceNo:null,collectionRole:'standalone',entryClassification:'invoice'});
function setup(failLast=false){
 const invoices=Array.from({length:25},(_,n)=>invoice(n)),cache=new Map<string,unknown>(),calls:{name:string;args:any}[]=[];let failed=false;
 const mapping=vi.fn(async(_reader:unknown,i:FinancialInvoice)=>({links:[],...(i.transactionId==='102'?{error:'financial_mapping_payment'}:{})}));
 const rpc=vi.fn(async(name:string,args:any={})=>{calls.push({name,args});if(name==='ar_financial_claim'||name==='ar_financial_renew')return true;if(name==='ar_financial_account_get')return {accountId:'SYNTHETIC-A',historyReady:true,mappingCount:25,counts:{invoices:25,payments:0,applications:0}};if(name==='ar_financial_mapping_batch_get')return {saved:false,invoices:invoices.slice(args.p_batch*10,args.p_batch*10+10)};if(name==='ar_financial_mapping_batch_save'){if(failLast&&args.p_batch===2&&!failed){failed=true;throw Error('financial_storage_unavailable');}return {verified:args.p_verified.length,unknown:args.p_failures.length,links:args.p_links.length};}if(name==='ar_financial_history_finalize')return {invoices:25,payments:0,applications:0};if(name==='ar_financial_publish')return {status:'succeeded',accounts:1,invoices:25,payments:0,applications:0};throw Error('Unexpected synthetic RPC');});
 const step={sleep:vi.fn(async()=>{}),do:(async(name:string,_options:unknown,callback:()=>Promise<unknown>)=>{if(cache.has(name))return cache.get(name);const result=await callback();cache.set(name,result);return result;}) as WorkflowStep['do']};
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const u=new URL(input instanceof Request?input.url:String(input));if(u.pathname==='/oauth/v1/tokens')return Response.json({access_token:'synthetic',expires_in:3600});return Response.json({accountsDetails:[{hotelId:'KAT',accountId:{id:'SYNTHETIC-A'}}],offset:20,limit:20,totalResults:1,hasMore:false});});
 return {cache,calls,mapping,step,ports:{rpc:rpc as Parameters<typeof runGranularFinancialHistory>[3]['rpc'],stage:vi.fn(),context:()=>({name:'Synthetic account',type:'Agent',accountNo:null}),mapping}};
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('waits durably beyond ten minutes for another date range in the same hotel before any source work',async()=>{
 vi.useFakeTimers();const h=setup(),original=h.ports.rpc;let attempts=0;
 h.ports.rpc=async(name,args)=>{if(name==='ar_financial_claim')return (++attempts>25) as never;expect(attempts).toBe(26);return original(name,args);};
 const sleeps:string[]=[];
 const step={...h.step,sleep:async(name:string,duration:unknown)=>{expect(duration).toBe('1 minute');sleeps.push(name);expect(h.mapping).not.toHaveBeenCalled();expect(h.ports.stage).not.toHaveBeenCalled();vi.setSystemTime(Date.now()+60000);}};
 expect((await runGranularFinancialHistory(env,run,step,h.ports)).status).toBe('succeeded');expect(attempts).toBe(26);expect(new Set(sleeps).size).toBe(25);
});
it('does not park a terminal claim error in the busy hotel queue',async()=>{
 const h=setup();h.ports.rpc=async()=>{throw Error('financial_run_failed');};
 await expect(runGranularFinancialHistory(env,run,h.step,h.ports)).rejects.toThrow('financial_run_failed');
 expect(h.step.sleep).not.toHaveBeenCalled();expect(h.mapping).not.toHaveBeenCalled();expect(h.ports.stage).not.toHaveBeenCalled();
});

it('a rejected concurrent invoice proof drains its peers before any save or retry',async()=>{
 vi.useFakeTimers();const h=setup(),finished:string[]=[];let done=false;
 h.mapping.mockImplementation(async(_reader:unknown,i:FinancialInvoice)=>{await new Promise(resolve=>setTimeout(resolve,i.transactionId==='101'?10:100));finished.push(i.transactionId);if(i.transactionId==='101')throw Error('synthetic failure');return {links:[]};});
 const pending=runGranularFinancialHistory(env,run,h.step,h.ports).catch(error=>{done=true;return error;});
 await vi.advanceTimersByTimeAsync(20);expect(done).toBe(false);await vi.runAllTimersAsync();expect((await pending).message).toBe('synthetic failure');
 expect(finished).toEqual(['101','102','103']);expect(h.calls.some(call=>['ar_financial_mapping_batch_save','ar_financial_publish'].includes(call.name))).toBe(false);
});
it('overlaps independent invoice proofs within a bounded batch and preserves saved order',async()=>{
 vi.useFakeTimers();const h=setup();let active=0,peak=0;
 h.mapping.mockImplementation(async(_reader:unknown,i:FinancialInvoice)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,Number(i.transactionId)%3===0?30:10));active--;return {links:[]};});
 const pending=runGranularFinancialHistory(env,run,h.step,h.ports);await vi.runAllTimersAsync();await pending;
 expect(peak).toBe(3);expect(active).toBe(0);expect(h.mapping).toHaveBeenCalledTimes(25);
 expect(h.calls.filter(c=>c.name==='ar_financial_mapping_batch_save').flatMap(c=>c.args.p_verified)).toEqual(Array.from({length:25},(_,n)=>String(101+n)));
});
it('many invoices use bounded durable batches with counts-only outputs and full final discovery',async()=>{const h=setup();expect(await runGranularFinancialHistory(env,run,h.step,h.ports)).toMatchObject({status:'succeeded',invoices:25});const batches=h.calls.filter(c=>c.name==='ar_financial_mapping_batch_save');expect(batches.map(c=>c.args.p_ids.length)).toEqual([10,10,5]);expect(batches[0].args.p_failures).toEqual([{invoiceId:'102',code:'financial_mapping_payment'}]);expect(h.calls.at(-1)).toMatchObject({name:'ar_financial_publish',args:{p_accounts:['SYNTHETIC-A']}});expect(JSON.stringify([...h.cache.values()])).not.toMatch(/SYNTHETIC-A|Synthetic account|invoiceId/);const before=h.mapping.mock.calls.length;await runGranularFinancialHistory(env,run,h.step,h.ports);expect(h.mapping).toHaveBeenCalledTimes(before);});
it('resumes after a late checkpoint failure without re-reading completed invoice mappings',async()=>{const h=setup(true);await expect(runGranularFinancialHistory(env,run,h.step,h.ports)).rejects.toThrow('financial_storage_unavailable');expect(h.calls.some(c=>c.name==='ar_financial_publish')).toBe(false);await runGranularFinancialHistory(env,run,h.step,h.ports);expect(h.mapping.mock.calls.filter(c=>Number(c[1].transactionId)<121)).toHaveLength(20);expect(h.mapping.mock.calls.filter(c=>Number(c[1].transactionId)>=121)).toHaveLength(10);expect(h.calls.filter(c=>c.name==='ar_financial_publish')).toHaveLength(1);});

it('version3 maps payment-date rows in batches independently of invoice Bill Date and saves only aggregate step outputs',async()=>{
 const h=setup(),payments:FinancialPayment[]=Array.from({length:6},(_,n)=>({hotel:'KAT',accountId:'SYNTHETIC-A',kind:'payment',transactionId:String(900+n),transactionDate:'2026-09-14',postingDate:null,revenueDate:null,transferDate:null,transferredIn:false,transferredOut:false,currency:'THB',transactionCode:null,amount:'-100.00',appliedAmount:'100.00',unallocatedAmount:'0.00',transfer:'none_reported',classification:'unknown',reversal:'unknown'}));
 const original=h.ports.rpc,records:any[]=[];let failOnce=true;
 const rpc:typeof original=async(name,args:any={})=>{
  if(name==='ar_financial_payment_prepare')return {mappingCount:6} as never;
  if(name==='ar_financial_payment_batch_get')return {saved:false,payments:payments.slice(args.p_batch*5,args.p_batch*5+5)} as never;
  if(name==='ar_financial_payment_batch_save'){if(args.p_batch===1&&failOnce){failOnce=false;throw Error('financial_storage_unavailable');}records.push(args);return {verified:args.p_results.filter((r:any)=>!r.error).length,unknown:args.p_results.filter((r:any)=>r.error).length,links:0} as never;}
  return original(name,args);
 };
 const paymentMapping=vi.fn(async(_reader:unknown,payment:FinancialPayment)=>payment.transactionId==='901'?{paymentId:payment.transactionId,error:'financial_payment_pair_missing'}:{payment,invoices:[{...invoice(0),transactionDate:'2020-01-01'}],links:[]});
 const ports={...h.ports,rpc,paymentMapping},current={...run,stepsVersion:3 as const,from:'2026-09-14',to:'2026-09-14'};
 await expect(runGranularFinancialHistory(env,current,h.step,ports)).rejects.toThrow('financial_storage_unavailable');expect(h.calls.some(c=>c.name==='ar_financial_publish')).toBe(false);
 await runGranularFinancialHistory(env,current,h.step,ports);
 expect(records.map(r=>r.p_results.length)).toEqual([5,1]);expect(paymentMapping.mock.calls.filter(([,p])=>Number(p.transactionId)<905)).toHaveLength(5);expect(paymentMapping.mock.calls.filter(([,p])=>p.transactionId==='905')).toHaveLength(2);
 expect(records[0].p_results[0].invoices[0].transactionDate).toBe('2020-01-01');expect(records[0].p_results[1].error).toBe('financial_payment_pair_missing');expect(JSON.stringify([...h.cache.values()])).not.toMatch(/SYNTHETIC-A|transactionId|2020-01-01/);
 expect(new Set(paymentMapping.mock.calls.slice(0,5).map(([reader])=>reader)).size).toBe(1);
 expect(paymentMapping.mock.calls[5][0]).not.toBe(paymentMapping.mock.calls[6][0]);
});

it('does not start a payment proof or save when its lease renewal fails',async()=>{
 const h=setup(),original=h.ports.rpc;let paymentPhase=false;
 h.ports.rpc=async(name,args={})=>{
  if(name==='ar_financial_payment_prepare')return {mappingCount:1} as never;
  if(name==='ar_financial_payment_batch_get'){paymentPhase=true;return {saved:false,payments:[{hotel:'KAT',accountId:'SYNTHETIC-A',kind:'payment',transactionId:'900'}]} as never;}
  if(name==='ar_financial_renew'&&paymentPhase)return false as never;
  return original(name,args);
 };
 const paymentMapping=vi.fn();await expect(runGranularFinancialHistory(env,{...run,stepsVersion:3},h.step,{...h.ports,paymentMapping})).rejects.toThrow('financial_lease_invalid');
 expect(paymentMapping).not.toHaveBeenCalled();expect(h.calls.some(c=>c.name==='ar_financial_publish')).toBe(false);
});

it('drains admitted payment proofs before failing and never saves their partial results',async()=>{
 vi.useFakeTimers();const h=setup(),original=h.ports.rpc,finished:string[]=[];let paymentSaved=false,settled=false;
 h.ports.rpc=async(name,args={})=>{
  if(name==='ar_financial_payment_prepare')return {mappingCount:5} as never;
  if(name==='ar_financial_payment_batch_get')return {saved:false,payments:Array.from({length:5},(_,n)=>({hotel:'KAT',accountId:'SYNTHETIC-A',kind:'payment',transactionId:String(900+n)}))} as never;
  if(name==='ar_financial_payment_batch_save'){paymentSaved=true;return {} as never;}
  return original(name,args);
 };
 const paymentMapping=vi.fn(async(_reader:unknown,payment:FinancialPayment)=>{await new Promise(resolve=>setTimeout(resolve,payment.transactionId==='900'?10:100));finished.push(payment.transactionId);if(payment.transactionId==='900')throw Error('financial_test_failure');return {paymentId:payment.transactionId,error:'financial_test_unknown'};});
 const pending=runGranularFinancialHistory(env,{...run,stepsVersion:3},h.step,{...h.ports,paymentMapping}).catch(error=>{settled=true;return error;});
 await vi.advanceTimersByTimeAsync(20);expect(settled).toBe(false);await vi.runAllTimersAsync();expect((await pending).message).toBe('financial_test_failure');
 expect(finished).toEqual(['900','901','902']);expect(paymentSaved).toBe(false);expect(h.calls.some(c=>c.name==='ar_financial_publish')).toBe(false);
});
