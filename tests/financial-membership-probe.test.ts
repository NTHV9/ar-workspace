import {expect,it} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {probeFinancialMembership} from '../worker/opera/financial-membership-probe';
it('detects a dated source omission without exposing source records or issuing writes',async()=>{
 const calls:URL[]=[];const reader=new OperaReader({origin:'https://opera.example',hotelId:'KAT',appKey:'test'},async()=>'test',async request=>{
  expect(request.method).toBe('GET');const url=new URL(request.url);calls.push(url);
  const included=!url.searchParams.has('start')||url.searchParams.get('unBilled')==='true';
  const money={amount:100,currencyCode:'THB'};
  return Response.json({details:[{hotelId:'KAT',accountId:{id:'PRIVATE-ACCOUNT'},invoices:included?[{transactionNo:123,transactionDate:'2026-09-13',invoiceType:'Normal',compressed:false,invoiceNo:45,originalAmount:money,amount:money,balance:money,payments:{amount:0,currencyCode:'THB'},guestName:'PRIVATE GUEST'}]:[]}],offset:20,limit:20,totalResults:included?1:0,hasMore:false});
 });
 const result=await probeFinancialMembership(reader,{hotel:'KAT',accountId:'PRIVATE-ACCOUNT',start:'2026-09-13',end:'2026-09-13',targetId:'123'});
 expect(result.checks.find(c=>c.variant==='dated')).toMatchObject({status:'checked',invoicesInPeriod:0,targetPresent:false});
 expect(result.checks.find(c=>c.variant==='undated')).toMatchObject({status:'checked',invoicesInPeriod:1,targetPresent:true});
 expect(result.checks.find(c=>c.variant==='include-unbilled')).toMatchObject({status:'checked',invoicesInPeriod:1,targetPresent:true});
 for(const secret of ['PRIVATE-ACCOUNT','PRIVATE GUEST','"transactionId"','100.00'])expect(JSON.stringify(result)).not.toContain(secret);
 expect(calls.length).toBe(7);expect(calls.every(u=>u.origin==='https://opera.example'&&u.pathname==='/ars/v1/invoicePayments/accounts/PRIVATE-ACCOUNT')).toBe(true);
});
