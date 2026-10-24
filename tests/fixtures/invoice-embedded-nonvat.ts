import {embeddedGeneratePacket} from './invoice-embedded-generates';
import {money} from './invoice-packet';
export const nonVatCalculation=(transactionCode:string,amount:number)=>({result:{charges:[{transactionCode,level:'TransactionCode',amount,sequence:0,basePosting:true}],totalAmount:amount}});

/** Synthetic amounts and identities; shared metadata shape only. */
export function embeddedNonVatPacket(amounts=[20,30]){
 const p=embeddedGeneratePacket();p.manifest.hotel='TSAN';p.account.hotelId=p.invoice.hotelId=p.reservation.hotelId='TSAN';
 p.taxRows.forEach(row=>row.posting.hotelId='TSAN');p.taxCodes.forEach(row=>row.hotelId='TSAN');p.postings.trxCodesInfo.forEach(row=>row.hotelId='TSAN');
 const g=p.embeddedGenerateProof.groups[0];g.rules.transactionCode.hotelId='TSAN';g.generatedRules.forEach(rule=>rule.transactionCode.hotelId='TSAN');g.rulesAfter=structuredClone(g.rules);g.generatedRulesAfter=structuredClone(g.generatedRules);
 const nonVatGroups=amounts.map((amount,index)=>{
  const transactionCode=index===0?'6000':'6002',description=index===0?'Airport Transportation *':'Taxi Service *',transactionNo=11001+index;
  const row=structuredClone(p.taxRows[0]);row.posting.transactionNo=transactionNo;row.posting.transactionCode=transactionCode;row.posting.postedAmount=money(Math.abs(amount));
  row.posting.debitAmount=money(Math.max(0,amount));if(amount<0)Object.assign(row.posting,{creditAmount:money(-amount)});
  row.postingBreakdown={grossAmount:money(amount),netAmount:money(amount),taxes:[]};Reflect.deleteProperty(row.postingBreakdown,'taxes');p.taxRows.push(row);
  p.postings.invoicePostingsDetails.push({...p.postings.invoicePostingsDetails[0],transactionNo,transactionCode,debitAmount:money(Math.max(0,amount)),...amount<0?{creditAmount:money(-amount)}:{}});
  if(!p.postings.trxCodesInfo.some(d=>d.transactionCode===transactionCode))p.postings.trxCodesInfo.push({hotelId:'TSAN',transactionCode,transactionGroup:'MISC',description});
  const rules={transactionCode:{hotelId:'TSAN',code:transactionCode,description:{defaultText:description},classification:{type:'Revenue',transactionType:{code:'Others'},group:{code:'MISC'}},trxSetup:{nonTaxable:index===0,taxInclusive:false},compTransaction:false,associatedTransactionCodes:[] as unknown[],generatesSetup:{addBaseAmtTo:{bucket1:false,bucket2:false,bucket3:false}}}};
  const calculation=nonVatCalculation(transactionCode,amount);
  return {postingId:String(transactionNo),rules,rulesAfter:structuredClone(rules),calculation,calculationAfter:structuredClone(calculation),provenance:index===0?'opera-non-taxable' as const:'owner-confirmed-tsan-6002-non-vat' as const};
 });
 p.manifest.open=p.invoice.amount.amount=p.invoice.balance.amount=117.7+amounts.reduce((a,b)=>a+b,0);
 const {embeddedGenerateProof,...source}=p;
 return {...source,embeddedGenerateProof:{...embeddedGenerateProof,sourceBefore:structuredClone(source),sourceAfter:structuredClone(source),nonVatGroups}};
}
export function resnapshotNonVat(p:ReturnType<typeof embeddedNonVatPacket>){const {embeddedGenerateProof,...source}=p;embeddedGenerateProof.sourceBefore=structuredClone(source);embeddedGenerateProof.sourceAfter=structuredClone(source);}
