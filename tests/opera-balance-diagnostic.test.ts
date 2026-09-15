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
async function probe(raw:unknown){
 vi.spyOn(OperaReader.prototype,'accounts').mockResolvedValue({accountsDetails:[{hotelId:'TLFO',accountId:{id:'PRIVATE-ACCOUNT-ID'},balance:money(80)}],totalResults:1,hasMore:false});
 vi.spyOn(OperaReader.prototype,'account').mockResolvedValue(raw);
 vi.spyOn(OperaReader.prototype,'history').mockResolvedValue({details:[],offset:0,limit:20,totalResults:0,hasMore:false});
 vi.spyOn(OperaReader.prototype,'businessDate').mockResolvedValue({hotels:[{hotelId:'TLFO',businessDate:'2026-09-15'}]});
 const result=await probeOpera(env,'TLFO');
 if(!('normalizationChecks' in result)||!result.normalizationChecks?.[0])throw Error('synthetic_probe_missing');
 return result.normalizationChecks[0];
}
afterEach(()=>vi.restoreAllMocks());

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
