type SourceObject=Record<string,unknown>;
type Sign='positive'|'zero'|'negative'|'unknown';
type Equation=boolean|null;
const MAX_BUCKETS=100;
const MAX_ROWS=5000;

function object(value:unknown):SourceObject|null {return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as SourceObject:null;}
function money(value:unknown,verifiedThb=false):number|null {
 const source=object(value);
 if(!source||source.currencyCode!=='THB'&&!(verifiedThb&&source.currencyCode===undefined)||typeof source.amount!=='number'||!Number.isFinite(source.amount))return null;
 const scaled=source.amount*100,cents=Math.round(scaled);
 return Number.isSafeInteger(cents)&&Math.abs(scaled-cents)<=1e-6?cents:null;
}
function sign(value:number|null):Sign {return value===null?'unknown':value===0?'zero':value<0?'negative':'positive';}
function equal(left:number|null,right:number|null):Equation {return left===null||right===null?null:left===right;}
function operation(left:number|null,right:number|null,kind:'plus'|'minus'):number|null {
 if(left===null||right===null)return null;
 const result=kind==='plus'?left+right:left-right;
 return Number.isSafeInteger(result)?result:null;
}
function sum(values:(number|null)[],limited=false):number|null {
 if(limited||values.some(value=>value===null))return null;
 const total=values.reduce<number>((acc,value)=>acc+(value??0),0);
 return Number.isSafeInteger(total)?total:null;
}
function triple(value:unknown,verifiedThb:boolean){const source=object(value),debit=money(source?.debit,verifiedThb),credit=money(source?.credit,verifiedThb),total=money(source?.total,verifiedThb);
 return {debit,credit,total,debitSign:sign(debit),creditSign:sign(credit),totalSign:sign(total),debitMinusCreditEqualsTotal:equal(operation(debit,credit,'minus'),total),debitPlusCreditEqualsTotal:equal(operation(debit,credit,'plus'),total)};
}
function balanceRows(value:unknown,verifiedThb:boolean,summaryTotal:number|null){
 const rows=Array.isArray(value)?value:null,rowCount=rows?.length??0,limited=rowCount>MAX_ROWS;
 const parsed=(rows??[]).slice(0,MAX_ROWS).map(row=>money(object(row)?.balance,verifiedThb));
 const net=sum(parsed,limited||rows===null),parsedBalances=parsed.filter(value=>value!==null).length;
 return {net,visible:{rowCount,inspectedRows:parsed.length,limited,parsedBalances,invalidBalances:parsed.length-parsedBalances,netSign:sign(net),netEqualsSummaryTotal:equal(net,summaryTotal)}};
}

/** Only static keys, signs, booleans and bounded counts cross the probe boundary. */
export function balanceReconciliationDiagnostic(raw:unknown){
 const account=object(object(raw)?.accountDetails),summary=object(account?.summary);
 // The source's explicit summary-total currency is the sole basis for accepting omitted component currency.
 const summaryTotal=money(summary?.total),verifiedThb=summaryTotal!==null;
 const s=triple(summary,verifiedThb),accountBalance=money(account?.balance,verifiedThb);
 const agingInfo=object(account?.agingInfo);
 const agingRows=Array.isArray(agingInfo?.aging)?agingInfo.aging as unknown[]:null;
 const bucketCount=agingRows?.length??0,limited=bucketCount>MAX_BUCKETS;
 const buckets=(agingRows??[]).slice(0,MAX_BUCKETS).map(row=>triple(object(row)?.balanceInfo,verifiedThb));
 const evaluableBuckets=buckets.filter(bucket=>bucket.debitMinusCreditEqualsTotal!==null&&bucket.debitPlusCreditEqualsTotal!==null).length;
 const all=(key:'debitMinusCreditEqualsTotal'|'debitPlusCreditEqualsTotal'):Equation=>agingRows===null||limited||evaluableBuckets!==bucketCount||bucketCount===0?null:buckets.every(bucket=>bucket[key]===true);
 const agingDebit=sum(buckets.map(bucket=>bucket.debit),agingRows===null||limited),agingCredit=sum(buckets.map(bucket=>bucket.credit),agingRows===null||limited),agingTotal=sum(buckets.map(bucket=>bucket.total),agingRows===null||limited);
 const invoices=balanceRows(account?.invoices,verifiedThb,s.total),payments=balanceRows(account?.payments,verifiedThb,s.total);
 const outstandingSource=agingInfo?.totalOutstanding,outstandingTriple=triple(outstandingSource,verifiedThb);
 const outstanding=outstandingTriple.total;
 return {
  summary:{debitSign:s.debitSign,creditSign:s.creditSign,totalSign:s.totalSign,debitMinusCreditEqualsTotal:s.debitMinusCreditEqualsTotal,debitPlusCreditEqualsTotal:s.debitPlusCreditEqualsTotal},
  account:{balancePresent:account?.balance!==null&&account?.balance!==undefined,balanceSign:sign(accountBalance),balanceEqualsSummaryTotal:equal(accountBalance,s.total)},
  aging:{bucketCount,inspectedBuckets:buckets.length,limited,evaluableBuckets,unknownBuckets:buckets.length-evaluableBuckets,debitMinusCreditEqualsTotal:all('debitMinusCreditEqualsTotal'),debitPlusCreditEqualsTotal:all('debitPlusCreditEqualsTotal'),totalOutstanding:{present:outstandingSource!==null&&outstandingSource!==undefined,debitSign:outstandingTriple.debitSign,creditSign:outstandingTriple.creditSign,totalSign:outstandingTriple.totalSign,debitMinusCreditEqualsTotal:outstandingTriple.debitMinusCreditEqualsTotal,debitPlusCreditEqualsTotal:outstandingTriple.debitPlusCreditEqualsTotal,totalEqualsSummaryTotal:equal(outstanding,s.total),debitEqualsSummaryDebit:equal(outstandingTriple.debit,s.debit),creditEqualsSummaryCredit:equal(outstandingTriple.credit,s.credit),totalEqualsBucketTotal:equal(outstanding,agingTotal)},aggregate:{totalSign:sign(agingTotal),debitSign:sign(agingDebit),creditSign:sign(agingCredit),totalEqualsSummaryTotal:equal(agingTotal,s.total),debitEqualsSummaryDebit:equal(agingDebit,s.debit),creditEqualsSummaryCredit:equal(agingCredit,s.credit)}},
  invoices:invoices.visible,payments:payments.visible,
  candidates:{invoicePlusPaymentBalanceEqualsSummaryTotal:equal(operation(invoices.net,payments.net,'plus'),s.total),invoiceMinusPaymentBalanceEqualsSummaryTotal:equal(operation(invoices.net,payments.net,'minus'),s.total)},
 };
}
