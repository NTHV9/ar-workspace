import {OperaError,type OperaReader} from './client';
import {readFinancialHistory,type FinancialHotel} from './financial-history';

type Scope={hotel:FinancialHotel;accountId:string;start:string;end:string;targetId:string};
type Check={variant:string;status:'checked'|'unavailable';invoices?:number;invoicesInPeriod?:number;payments?:number;targetPresent?:boolean;invoiceDates?:Record<string,number>;targetDateFields?:Record<string,string|null>;error?:string};
/** Read-only diagnostic; no source rows, names, account/transaction IDs or money in output. */
export async function probeFinancialMembership(reader:Pick<OperaReader,'financialMembershipProbePage'>,scope:Scope){
 if(!scope||typeof scope.targetId!=='string'||!/^\d{1,80}$/.test(scope.targetId))throw new OperaError('invalid_request',undefined,'financial_probe_scope');
 const checks:Check[]=[],query={hotel:scope.hotel,accountId:scope.accountId,start:scope.start,end:scope.end,kinds:['invoice','payment'] as const};
 for(const variant of ['dated','undated','unordered','include-unbilled','exclude-printed','include-both','extended-end']){
  try{
   const result=await readFinancialHistory({financialHistoryPage:(q,o,l)=>reader.financialMembershipProbePage(q,variant,o,l)},query,{maxPages:20,maxRows:1000});
   const target=result.invoices.find(i=>i.transactionId===scope.targetId);
   const invoiceDates:Record<string,number>={};for(const row of result.invoices){const key=row.transactionDate??'unknown';invoiceDates[key]=(invoiceDates[key]??0)+1;}
   checks.push({variant,status:'checked',invoices:result.invoices.length,invoicesInPeriod:result.invoices.filter(i=>i.transactionDate!==null&&i.transactionDate>=scope.start&&i.transactionDate<=scope.end).length,payments:result.payments.length,targetPresent:!!target,invoiceDates,
    ...(target?{targetDateFields:{transaction:target.transactionDate,posting:target.postingDate,revenue:target.revenueDate,transfer:target.transferDate,closed:target.closeDate}}:{})});
  }catch(error){checks.push({variant,status:'unavailable',error:error instanceof OperaError?error.code+(error.stage?':'+error.stage:''):'financial_probe_unavailable'});}
 }
 return {hotel:scope.hotel,from:scope.start,to:scope.end,checkedAt:new Date().toISOString(),checks};
}
