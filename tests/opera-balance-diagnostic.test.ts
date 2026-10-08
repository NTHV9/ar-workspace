import {afterEach,expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {probeOpera} from '../worker/opera/probe';
import {balanceReconciliationDiagnostic} from '../worker/opera/balance-diagnostic';

const env={OPERA_BASE_URL:'https://synthetic.invalid',OPERA_ENTERPRISE_ID:'synthetic',OPERA_HOTEL_IDS:'TLFO',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic'};
const money=(amount:number)=>({amount,currencyCode:'THB'});
const triple=(debit:number,credit:number,total:number)=>({debit:money(debit),credit:money(credit),total:money(total)});
function current(summary=triple(100,20,80)){
 return {accountDetails:{hotelId:'TLFO',accountId:{id:'PRIVATE-ACCOUNT-ID'},accountName:'PRIVATE ACCOUNT NAME',type:'Agent',balance:money(80),summary,
  agingInfo:{aging:[{agingBucketRange:'Synthetic range',agingStartDay:0,agingEndDay:30,sequence:1,balanceInfo:triple(100,20,80)}]},
  invoices:[{hotelId:'TLFO',transactionNo:1,transactionDate:'2026-09-01',originalAmount:money(100),amount:money(100),payments:money(20),balance:money(80)}],
  payments:[{hotelId:'TLFO',transactionNo:2,amount:money(-20),amountUsed:money(0),balance:money(-20)}],
 }};
}
async function probe(raw:unknown,businessDate='2026-09-15'){
 vi.spyOn(OperaReader.prototype,'accounts').mockResolvedValue({accountsDetails:[{hotelId:'TLFO',accountId:{id:'PRIVATE-ACCOUNT-ID'},balance:money(80)}],totalResults:1,hasMore:false});
 vi.spyOn(OperaReader.prototype,'account').mockResolvedValue(raw);
 vi.spyOn(OperaReader.prototype,'history').mockResolvedValue({details:[],offset:0,limit:20,totalResults:0,hasMore:false});
 vi.spyOn(OperaReader.prototype,'businessDate').mockResolvedValue({hotels:[{hotelId:'TLFO',businessDate}]});
 const result=await probeOpera(env,'TLFO');
 if(!('normalizationChecks' in result)||!result.normalizationChecks?.[0])throw Error('synthetic_probe_missing');
 return result.normalizationChecks[0];
}
afterEach(()=>vi.restoreAllMocks());

it('reports exact source Aging dates and business date without customer fields',async()=>{
 const raw=current();
 Object.assign(raw.accountDetails.agingInfo.aging[0],{agingDate:{start:'2026-08-16',end:'2026-09-15',accountId:'PRIVATE-DATE-ID'}});
 const check=await probe(raw);
 expect(check.businessDate).toBe('2026-09-15');
 expect(check.agingRanges).toEqual([{start:0,end:30,sequence:1,agingDate:{start:'2026-08-16',end:'2026-09-15'}}]);
 expect(JSON.stringify(check.agingRanges)).not.toMatch(/PRIVATE|Synthetic|amount|accountId/);
});

it.each([
 {start:'2026-02-29',end:'PRIVATE-DATE'},
 {start:'2026-09-01T00:00:00Z',end:{id:'PRIVATE-DATE'}},
 {start:'2026-09-01',end:undefined},
 {start:'2024-02-29',end:'2026-09-15'},
 undefined,
 'PRIVATE-DATE',
])('only exposes valid calendar dates, allowing an unavailable open-tail end: %j',async(agingDate)=>{
 const raw=current();
 Object.assign(raw.accountDetails.agingInfo.aging[0],{agingDate});
 const check=await probe(raw);
 const expectedStart=agingDate&&typeof agingDate==='object'&&['2026-09-01','2024-02-29'].includes(agingDate.start)?agingDate.start:null;
 const expectedEnd=agingDate&&typeof agingDate==='object'&&agingDate.end==='2026-09-15'?'2026-09-15':null;
 expect(check.agingRanges?.[0].agingDate).toEqual({start:expectedStart,end:expectedEnd});
 expect(check.normalized).toBe('passed');
 expect(JSON.stringify(check.agingRanges)).not.toContain('PRIVATE');
});

it('redacts malformed numeric ranges and business date in diagnostics',async()=>{
 const raw=current();
 Object.assign(raw.accountDetails.agingInfo.aging[0],{agingStartDay:'PRIVATE-RANGE',agingEndDay:{id:'PRIVATE-ID'},sequence:'PRIVATE-SEQUENCE'});
 const check=await probe(raw,'PRIVATE-BUSINESS-DATE');
 expect(check.businessDate).toBeNull();
 expect(check.agingRanges).toEqual([{start:null,end:null,sequence:null,agingDate:{start:null,end:null}}]);
 expect(check.invoiceDatePatterns?.groups[0].dateDeltas).toEqual({transactionDate:null,transferDate:null,postingDate:null,revenueDate:null,folioDate:null,closeDate:null});
 expect(JSON.stringify(check.agingRanges)).not.toContain('PRIVATE');
});

it('groups source invoice date deltas without returning dates, amounts or identities',async()=>{
 const raw=current();
 const first={...raw.accountDetails.invoices[0],age:13,compressed:false,parentInvoiceNo:'PRIVATE-PARENT',transferDate:'2026-09-02',postingDate:'2026-09-01',revenueDate:'2026-08-31',folioDate:'2026-09-03',closeDate:'2026-09-04'};
 raw.accountDetails.invoices=[first,{...first,transactionNo:3}];
 const check=await probe(raw);
 expect(check.invoiceDatePatterns).toEqual({groups:[{age:13,compressed:false,parentReferencePresent:true,dateDeltas:{transactionDate:14,transferDate:13,postingDate:14,revenueDate:15,folioDate:12,closeDate:11},count:2}],omittedGroups:0,omittedInvoices:0});
 expect(JSON.stringify(check.invoiceDatePatterns)).not.toMatch(/PRIVATE|amount|transactionNo|2026-/);
});

it('keeps missing and invalid date deltas unknown instead of manufacturing zero',async()=>{
 const raw=current();
 Object.assign(raw.accountDetails.invoices[0],{age:'PRIVATE-AGE',compressed:'PRIVATE-COMPRESSED',transactionDate:'2026-02-29',transferDate:'PRIVATE-DATE',postingDate:'2026-09-15',parentInvoiceNo:null});
 const check=await probe(raw);
 expect(check.invoiceDatePatterns?.groups).toEqual([{age:null,compressed:null,parentReferencePresent:false,dateDeltas:{transactionDate:null,transferDate:null,postingDate:0,revenueDate:null,folioDate:null,closeDate:null},count:1}]);
 expect(JSON.stringify(check.invoiceDatePatterns)).not.toContain('PRIVATE');
});

it('caps date pattern output at 100 groups and reports omitted counts',async()=>{
 const raw=current();
 raw.accountDetails.invoices=Array.from({length:103},(_,index)=>({...raw.accountDetails.invoices[0],transactionNo:index+1,age:index<102?index:101}));
 const check=await probe(raw);
 expect(check.invoiceDatePatterns?.groups).toHaveLength(100);
 expect(check.invoiceDatePatterns).toMatchObject({omittedGroups:2,omittedInvoices:3});
});

it('classifies a reconciled signed-credit sample without returning any amounts or identities',async()=>{
 const check=await probe(current());
 expect(check.normalized).toBe('passed');
 expect(check.balanceDiagnostic).toMatchObject({
  summary:{debitSign:'positive',creditSign:'positive',totalSign:'positive',debitMinusCreditEqualsTotal:true,debitPlusCreditEqualsTotal:false},
  account:{balanceSign:'positive',balanceEqualsSummaryTotal:true},
  aging:{bucketCount:1,evaluableBuckets:1,debitMinusCreditEqualsTotal:true,debitPlusCreditEqualsTotal:false,aggregate:{totalEqualsSummaryTotal:true,debitEqualsSummaryDebit:true,creditEqualsSummaryCredit:true}},
  invoices:{rowCount:1,parsedBalances:1,netSign:'positive',netEqualsSummaryTotal:true},
  payments:{rowCount:1,parsedBalances:1,netSign:'negative'},
 });
 expect(JSON.stringify(check.balanceDiagnostic)).not.toMatch(/PRIVATE|Synthetic range|"amount"|"id"|100|80|20/);
});

it('isolates a summary sign-convention mismatch while normalization remains failed',async()=>{
 const check=await probe(current(triple(100,-20,80)));
 expect(check.normalized).toBe('normalize_summary_balance_reconciliation');
 expect(check.balanceDiagnostic).toMatchObject({summary:{debitSign:'positive',creditSign:'negative',totalSign:'positive',debitMinusCreditEqualsTotal:false,debitPlusCreditEqualsTotal:true},account:{balanceEqualsSummaryTotal:true}});
 expect(check.balanceDiagnostic.aging.aggregate).toMatchObject({totalEqualsSummaryTotal:true,debitEqualsSummaryDebit:true,creditEqualsSummaryCredit:false});
});

it('marks missing or malformed source money unknown without manufacturing zero',async()=>{
 const raw=current();Object.assign(raw.accountDetails.summary,{credit:null});raw.accountDetails.payments[0].balance={amount:'private'} as never;
 const check=await probe(raw);
 expect(check.normalized).toBe('normalize_summary_credit_shape');
 expect(check.balanceDiagnostic).toMatchObject({summary:{creditSign:'unknown',debitMinusCreditEqualsTotal:null,debitPlusCreditEqualsTotal:null},payments:{rowCount:1,parsedBalances:0,netSign:'unknown',netEqualsSummaryTotal:null}});
 expect(JSON.stringify(check.balanceDiagnostic)).not.toContain('private');
});

it('compares independent Aging totalOutstanding and invoice plus payment net with summary',()=>{
 const raw=current();Object.assign(raw.accountDetails.agingInfo,{totalOutstanding:triple(100,20,80)});
 const diagnostic=balanceReconciliationDiagnostic(raw);
 expect(diagnostic.aging.totalOutstanding).toMatchObject({present:true,debitMinusCreditEqualsTotal:true,debitPlusCreditEqualsTotal:false,totalEqualsSummaryTotal:true,debitEqualsSummaryDebit:true,creditEqualsSummaryCredit:true});
 expect(diagnostic.candidates).toMatchObject({invoicePlusPaymentBalanceEqualsSummaryTotal:false,invoiceMinusPaymentBalanceEqualsSummaryTotal:false});
 expect(JSON.stringify(diagnostic)).not.toMatch(/PRIVATE|Synthetic range|"amount"|"id"|100|80|20/);
});
