import {afterEach,expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {readPaymentApplications} from '../worker/opera/payment-applications';
import {createFinancialProofReader} from '../worker/opera/proof-reader';
import {mapFinancialReads} from '../worker/opera/bounded-read';
import type {FinancialPayment} from '../worker/opera/financial-history';
const scope={hotel:'KAT' as const,accountId:'synthetic-proof-account'},date='2026-09-14',observedAt=date+'T00:00:00Z';
const money=(amount:number)=>({amount:String(amount)+'.00',currencyCode:'THB'});
function setup(){
 const invoices=Array.from({length:21},(_,n)=>({hotelId:'KAT',transactionNo:1001+n,invoiceNo:String(2001+n),invoiceType:'Normal',transactionDate:'2025-08-01',postingDate:'2025-08-02',originalAmount:money(300),amount:money(300),payments:money(300),balance:money(0),compressed:false,transferredIn:false,transferredOut:false}));
 const rawPayments=[301,302,303].map(transactionNo=>({hotelId:'KAT',transactionNo,transactionDate:date,postingDate:date,amount:money(-2300),amountUsed:money(2100),balance:money(200),transferredIn:false,transferredOut:false}));
 const payments:FinancialPayment[]=rawPayments.map(p=>({...scope,kind:'payment',transactionId:String(p.transactionNo),transactionCode:null,transactionDate:date,postingDate:date,revenueDate:null,transferDate:null,currency:'THB',amount:'-2300.00',appliedAmount:'2100.00',unallocatedAmount:'200.00',transferredIn:false,transferredOut:false,transfer:'none_reported',classification:'unknown',reversal:'unknown'}));
 const activity={calls:0,active:0,peak:0};
 const grouped=(i:unknown[]=[],p:unknown[]=[])=>({details:[{hotelId:'KAT',accountId:{id:scope.accountId},invoices:i,payments:p}]});
 const raw=new OperaReader({origin:'https://opera.synthetic.invalid',appKey:'synthetic',hotelId:'KAT'},async()=>'synthetic',async request=>{
  const u=new URL(request.url),id=Number(u.pathname.match(/\/transactions\/(\d+)\//)?.[1]);let value:unknown;
  if(u.pathname.includes('/invoicePayments/accounts/')){
   const paymentOnly=u.searchParams.getAll('fetchInstructions').join(',')==='Payments',numbers=u.searchParams.getAll('invoiceNo'),selected=paymentOnly?rawPayments:invoices.filter(i=>numbers.includes(i.invoiceNo));
   const offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit')),rows=selected.slice(offset,offset+limit);
   value={...grouped(paymentOnly?[]:rows,paymentOnly?rows:[]),offset:offset+limit,limit,hasMore:offset+limit<selected.length,totalResults:selected.length};
  }else if(u.pathname.endsWith('/invoiceAppliedPayments')){
   value={details:id<1000?invoices.map(i=>({transactionNo:i.transactionNo,invoiceNo:i.invoiceNo,originalAmount:money(300),appliedAmount:money(100),postingDate:i.postingDate})):rawPayments.map(p=>({transactionNo:p.transactionNo,originalAmount:money(-2300),appliedAmount:money(-100),postingDate:date}))};
  }else value=id<1000?grouped([],[rawPayments.find(p=>p.transactionNo===id)]):grouped([invoices.find(i=>i.transactionNo===id)]);
  activity.calls++;activity.active++;activity.peak=Math.max(activity.peak,activity.active);
  await new Promise(resolve=>setTimeout(resolve,100));activity.active--;return Response.json(value);
 });
 return {raw,payments,activity};
}
afterEach(()=>vi.useRealTimers());
it('keeps every proof result identical while sharing queued duplicates across independent payments',async()=>{
 vi.useFakeTimers();const before=setup(),start=Date.now();
 const serial=(async()=>{const rows=[];for(const payment of before.payments)rows.push(await readPaymentApplications(before.raw,payment,{observedAt}));return rows;})();
 await vi.runAllTimersAsync();const expected=await serial,serialMs=Date.now()-start;
 const after=setup(),scopeReader=createFinancialProofReader(after.raw),parallelStart=Date.now();
 const parallel=mapFinancialReads(after.payments,payment=>readPaymentApplications(scopeReader.reader,payment,{observedAt}));
 await vi.runAllTimersAsync();expect(await parallel).toEqual(expected);
 expect(after.activity.peak).toBeLessThanOrEqual(3);expect(after.activity.active).toBe(0);expect(after.activity.calls).toBeLessThan(before.activity.calls);
 expect(Date.now()-parallelStart).toBeLessThan(serialMs);expect(scopeReader.stats().joinedQueued).toBeGreaterThan(0);
 // Inspectable numeric benchmark only, without invoice/account identifiers.
 console.info(JSON.stringify({serialMs,parallelMs:Date.now()-parallelStart,serialCalls:before.activity.calls,parallelCalls:after.activity.calls,joined:scopeReader.stats().joinedQueued}));
});
