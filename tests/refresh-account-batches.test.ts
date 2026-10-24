import {afterEach,expect,it,vi} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
import {stageRefreshAccounts,stageRefreshAccountBatches} from '../worker/refresh/accounts';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',OPERA_BASE_URL:'https://synthetic.opera.invalid',OPERA_HOTEL_IDS:'KAT',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',OPERA_ENTERPRISE_ID:'synthetic'};
const money=(amount:number)=>({amount,currencyCode:'THB'});
function setup({fail='',invalid='',stagedReply=undefined as unknown}={}){
 const cache=new Map<string,unknown>(),sourceIds:string[]=[],staged:string[]=[],completed:string[]=[];let active=0,peak=0,tokens=0;
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);
  if(url.origin===env.SUPABASE_URL){const args=await request.json() as {p_snapshot:{account:{id:string}};p_ids:string[]};
   if(url.pathname.endsWith('/ar_refresh_staged_accounts'))return Response.json(stagedReply===undefined?staged.filter(id=>args.p_ids.includes(id)):stagedReply);
   if(url.pathname.endsWith('/ar_refresh_previous_invoices'))return Response.json([]);
   if(url.pathname.endsWith('/ar_stage_account')){staged.push(args.p_snapshot.account.id);return Response.json(true);}
   if(url.pathname.endsWith('/ar_renew_refresh'))return Response.json(true);
   throw Error('Unexpected synthetic RPC');
  }
  if(url.pathname==='/oauth/v1/tokens'){tokens++;return Response.json({access_token:'synthetic',expires_in:3600});}
  const id=decodeURIComponent(url.pathname.split('/').at(-1)!);sourceIds.push(id);active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,id===fail?10:100));active--;completed.push(id);
  if(id===fail)return new Response('',{status:503});
  if(url.pathname.includes('/invoicePayments/'))return Response.json({details:[],totalResults:0,hasMore:false,offset:0,limit:20});
  return Response.json({accountDetails:{hotelId:'KAT',accountId:{id},accountName:'Synthetic account '+id,accountNo:id,type:'TA',balance:{amount:0},summary:{debit:money(0),credit:money(0),total:money(0)},agingInfo:{aging:[{agingBucketRange:'Up to 30',agingStartDay:0,agingEndDay:30,sequence:1,balanceInfo:{debit:money(0),credit:money(0),total:money(0)}}]},invoices:id===invalid?null:[],payments:[]}});
 });
 const step={do:(async(name:string,_config:unknown,callback:()=>Promise<unknown>)=>{if(cache.has(name))return cache.get(name);const value=await callback();cache.set(name,value);return value;}) as WorkflowStep['do']};
 return {step,cache,sourceIds,staged,completed,tokens:()=>tokens,activity:()=>({active,peak}),setFailure:(value:string)=>{fail=value;}};
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('verifies two accounts at a time, retains durable account identities and avoids re-reading on replay',async()=>{
 vi.useFakeTimers();const h=setup();const pending=stageRefreshAccounts(env,'synthetic-run','KAT',['a','b','c','d'],'2026-09-16',h.step);await vi.runAllTimersAsync();expect(await pending).toBe(0);
 expect(h.activity()).toEqual({active:0,peak:2});expect(h.tokens()).toBe(1);expect([...h.staged].sort()).toEqual(['a','b','c','d']);expect([...h.cache.keys()]).toEqual(['account-0','account-1','account-2','account-3']);
 const reads=h.sourceIds.length;expect(await stageRefreshAccounts(env,'synthetic-run','KAT',['a','b','c','d'],'2026-09-16',h.step)).toBe(0);expect(h.sourceIds).toHaveLength(reads);expect(JSON.stringify([...h.cache.values()])).not.toContain('Synthetic account');
});
it('a fatal read drains the admitted peer and never starts the next account pair',async()=>{
 vi.useFakeTimers();const h=setup({fail:'a'});let settled=false;
 const result=stageRefreshAccounts(env,'synthetic-run','KAT',['a','b','c'],'2026-09-16',h.step).catch(error=>{settled=true;return error;});
 await vi.advanceTimersByTimeAsync(20);expect(settled).toBe(false);await vi.runAllTimersAsync();expect(await result).toMatchObject({code:'provider_unavailable'});
 expect(h.activity().active).toBe(0);expect(h.staged).toEqual(['b']);expect(h.sourceIds).not.toContain('c');
});
it('keeps invalid accounts out of staging and returns their count to block publication',async()=>{
 vi.useFakeTimers();const h=setup({invalid:'a'});const result=stageRefreshAccounts(env,'synthetic-run','KAT',['a','b'],'2026-09-16',h.step);await vi.runAllTimersAsync();expect(await result).toBe(1);expect(h.staged).toEqual(['b']);
});
it('uses two durable groups for eleven verified accounts, three reads at a time, and replays without provider reads',async()=>{
 vi.useFakeTimers();const h=setup(),ids=Array.from({length:11},(_,i)=>String(i));
 const result=stageRefreshAccountBatches(env,'synthetic-run','KAT',ids,'2026-10-25',h.step);await vi.runAllTimersAsync();expect(await result).toBe(0);
 expect(h.activity()).toEqual({active:0,peak:3});expect(h.staged.sort()).toEqual([...ids].sort());expect(h.cache.size).toBe(2);expect(h.tokens()).toBe(1);
 const reads=h.sourceIds.length;expect(await stageRefreshAccountBatches(env,'synthetic-run','KAT',ids,'2026-10-25',h.step)).toBe(0);expect(h.sourceIds.length).toBe(reads);
 expect(JSON.stringify([...h.cache.values()])).not.toContain('Synthetic account');
});
it('drains a failed group and skips already staged snapshots when that group resumes',async()=>{
 vi.useFakeTimers();const h=setup({fail:'c'}),ids=['a','b','c','d','e'];
 const result=stageRefreshAccountBatches(env,'synthetic-run','KAT',ids,'2026-10-25',h.step).catch(error=>error);await vi.runAllTimersAsync();expect(await result).toMatchObject({code:'provider_unavailable'});
 expect(h.activity().active).toBe(0);expect(h.staged.sort()).toEqual(['a','b']);expect(h.sourceIds).not.toContain('d');
 h.setFailure('');const before=h.sourceIds.length;
 const resumed=stageRefreshAccountBatches(env,'synthetic-run','KAT',ids,'2026-10-25',h.step);await vi.runAllTimersAsync();expect(await resumed).toBe(0);
 expect(h.staged.sort()).toEqual(ids);expect(h.sourceIds.slice(before)).not.toContain('a');expect(h.sourceIds.slice(before)).not.toContain('b');
});
it('counts invalid snapshots so a batched refresh cannot publish partial coverage',async()=>{
 vi.useFakeTimers();const h=setup({invalid:'b'});const result=stageRefreshAccountBatches(env,'synthetic-run','KAT',['a','b','c'],'2026-10-25',h.step);await vi.runAllTimersAsync();expect(await result).toBe(1);expect(h.staged.sort()).toEqual(['a','c']);
});
it.each([['unknown'],['a','a'],{},null])('rejects invalid staged-ID evidence %j',async stagedReply=>{
 const h=setup({stagedReply});await expect(stageRefreshAccountBatches(env,'synthetic-run','KAT',['a'],'2026-10-25',h.step)).rejects.toThrow();expect(h.sourceIds).toEqual([]);
});
it('reduces durable checkpoints and elapsed wait at identical thirty-account source coverage',async()=>{
 vi.useFakeTimers();const ids=Array.from({length:30},(_,i)=>String(i));
 const measure=async(stage:typeof stageRefreshAccounts)=>{
  const h=setup(),start=Date.now();const result=stage(env,'synthetic-run','KAT',ids,'2026-10-25',h.step);
  await vi.runAllTimersAsync();expect(await result).toBe(0);return {elapsed:Date.now()-start,steps:h.cache.size,reads:h.sourceIds.length,staged:h.staged.length};
 };
 const legacy=await measure(stageRefreshAccounts),batched=await measure(stageRefreshAccountBatches);
 expect(legacy).toEqual({elapsed:3000,steps:30,reads:60,staged:30});
 expect(batched).toEqual({elapsed:2400,steps:3,reads:60,staged:30});
});
