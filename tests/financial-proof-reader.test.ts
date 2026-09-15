import {afterEach,expect,it,vi} from 'vitest';
import {createFinancialProofReader,type FinancialProofReader} from '../worker/opera/proof-reader';
import {mapFinancialReads} from '../worker/opera/bounded-read';
const query={hotel:'KAT' as const,accountId:'synthetic-account',transactionId:'1'};
function fixture(read:(...args:unknown[])=>Promise<unknown>){return {financialTransactionDetail:read,financialHistoryPage:read,paymentAppliedInvoices:read,invoiceHistory:read,appliedInvoicePayments:read} satisfies FinancialProofReader;}
afterEach(()=>vi.useRealTimers());
it('shares only queued identical calls and delivers isolated objects',async()=>{
 const read=vi.fn(async()=>({rows:[{amount:1}]})),scoped=createFinancialProofReader(fixture(read));
 const results=await Promise.all([scoped.reader.financialTransactionDetail(query),scoped.reader.financialTransactionDetail(query)]);
 expect(read).toHaveBeenCalledTimes(1);expect(scoped.stats()).toMatchObject({calls:1,joinedQueued:1,copiedResponses:2});expect(results[0]).not.toBe(results[1]);
 (results[0] as {rows:{amount:number}[]}).rows[0].amount=99;expect(results[1]).toEqual({rows:[{amount:1}]});
 await scoped.reader.financialTransactionDetail(query);expect(read).toHaveBeenCalledTimes(2);
});
it('transfers exclusive ownership without copying an unshared response body',async()=>{
 const body={rows:Array.from({length:2000},(_,n)=>({id:n,values:Array(10).fill('synthetic')}))};
 const scoped=createFinancialProofReader(fixture(async()=>body));
 const result=await scoped.reader.financialTransactionDetail(query);expect(result===body).toBe(true);expect(scoped.stats().copiedResponses).toBe(0);
});
it('never joins a running older snapshot when another proof reaches its after barrier',async()=>{
 let version=1,release=()=>{};const hold=new Promise<void>(resolve=>{release=resolve;});
 const read=vi.fn(async()=>{const snapshot={version};if(version===1)await hold;return snapshot;}),scoped=createFinancialProofReader(fixture(read));
 const before=scoped.reader.financialTransactionDetail(query);await Promise.resolve();expect(read).toHaveBeenCalledTimes(1);
 version=2;const after=scoped.reader.financialTransactionDetail(query);expect(await after).toEqual({version:2});release();expect(await before).toEqual({version:1});expect(read).toHaveBeenCalledTimes(2);
});
it('keeps nested three-by-three proofs to three actual requests and preserves method/scope/page keys',async()=>{
 vi.useFakeTimers();let active=0,peak=0;
 const read=vi.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return {ok:true};});
 const scoped=createFinancialProofReader(fixture(read));
 const result=mapFinancialReads([0,1,2],async n=>mapFinancialReads([0,1,2],async m=>scoped.reader.financialTransactionDetail({...query,transactionId:String(n*3+m+1)})));
 await vi.runAllTimersAsync();await result;expect(peak).toBe(3);expect(active).toBe(0);expect(scoped.stats()).toMatchObject({calls:9,peakActive:3});
 const distinct=Promise.all([scoped.reader.financialHistoryPage({...query,start:'2026-09-01',end:'2026-09-01',kinds:['payment']},0,20),scoped.reader.financialHistoryPage({...query,start:'2026-09-01',end:'2026-09-01',kinds:['payment']},20,20),scoped.reader.financialTransactionDetail({...query,hotel:'TSK'}),scoped.reader.paymentAppliedInvoices({...query,paymentTransactionId:'1'})]);
 await vi.runAllTimersAsync();await distinct;expect(read).toHaveBeenCalledTimes(13);
 expect(JSON.stringify(scoped.stats())).not.toMatch(/KAT|TSK|synthetic|transactionId/);
});
it('removes failed queued requests and a retry reads fresh data',async()=>{
 const read=vi.fn().mockRejectedValueOnce(Error('synthetic failure')).mockResolvedValue({ok:true}),scoped=createFinancialProofReader(fixture(read));
 const attempts=await Promise.allSettled([scoped.reader.financialTransactionDetail(query),scoped.reader.financialTransactionDetail(query)]);
 expect(attempts.map(r=>r.status)).toEqual(['rejected','rejected']);expect(read).toHaveBeenCalledTimes(1);
 expect(await scoped.reader.financialTransactionDetail(query)).toEqual({ok:true});expect(scoped.stats()).toMatchObject({calls:2,failures:1});
});
it('freezes queued arguments and does not reuse a running paginated history snapshot',async()=>{
 const scope={hotel:'KAT' as const,accountId:'synthetic-account',start:'2026-09-01',end:'2026-09-01',kinds:['payment' as const]};
 let release=()=>{},version=1;const hold=new Promise<void>(resolve=>{release=resolve;});
 const source=fixture(async(...args)=>{const at=version;if(at===1)await hold;return {version:at,args};});
 const scoped=createFinancialProofReader(source),before=scoped.reader.financialHistoryPage(scope,0,20);
 await Promise.resolve();version=2;
 const after=scoped.reader.financialHistoryPage(scope,0,20);scope.start='2026-08-01';
 expect(await after).toMatchObject({version:2,args:[{start:'2026-09-01'},0,20]});release();expect(await before).toMatchObject({version:1});
});
