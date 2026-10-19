import {describe,it,expect} from 'vitest';
import {verifyArSimulation} from '../worker/invoice/ar-tax';
const rules=(code:string,group:string)=>({transactionCode:{hotelId:'TSAN',code,classification:{type:'Revenue',group:{code:group}},description:{defaultText:group==='TAX'?'Room VAT':'Service'},trxSetup:{generatesType:'INCLUSIVE',taxInclusive:true,nonTaxable:false},generatesSetup:{addBaseAmtTo:{bucket1:true,bucket2:false,bucket3:false},generates:[]},associatedTransactionCodes:[]}});
function evidence(amount=1350){
 const base=rules('ROOM','RM');Object.assign(base.transactionCode.generatesSetup,{generates:[{code:'SVC',rule:{percentage:{amount:10,calculatedOn:'Base',useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:{bucket1:true,bucket2:false,bucket3:false}},{code:'VAT',rule:{percentage:{amount:7,calculatedOn:'Bucket1',useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:{bucket1:false,bucket2:false,bucket3:false}}]});
 return {rules:base,rulesAfter:structuredClone(base),generatedRules:[rules('SVC','SVC'),rules('VAT','TAX')],calculation:{result:{totalAmount:amount,charges:[{transactionCode:'ROOM',amount,basePosting:true,sequence:0},{transactionCode:'ROOM',amount:amount/1.177,basePosting:false,sequence:0},{transactionCode:'SVC',amount:amount/1.177*.1,basePosting:false,sequence:1},{transactionCode:'VAT',amount:amount*7/107,basePosting:false,sequence:2}]}}};
}
describe('qualified OPERA AR charge decomposition',()=>{
 it.each([1350,-1350,0.01,537.43])('preserves signed fractional VAT without double counting input echo (%s)',amount=>{expect(verifyArSimulation(evidence(amount),'TSAN','ROOM',amount).vat).toBeCloseTo(amount*7/107,10);});
 it.each(['unknown','missing','duplicate','sign','gross','changed','udf','schedule','taxType','bracket','exclusive','advanced','rate','nested'] as const)('rejects incomplete or unsupported evidence (%s)',kind=>{
  const e:any=evidence();const root=e.rules.transactionCode,g=root.generatesSetup.generates;
  if(kind==='unknown')e.calculation.result.charges[3].transactionCode='OTHER';
  if(kind==='missing')e.calculation.result.charges.pop();
  if(kind==='duplicate')e.calculation.result.charges.push(e.calculation.result.charges[3]);
  if(kind==='sign')e.calculation.result.charges[3].amount*=-1;
  if(kind==='gross')e.calculation.result.totalAmount++;
  if(kind==='changed')e.rulesAfter.transactionCode.trxSetup.taxInclusive=false;
  if(kind==='udf')g[0].rule.uDFFunctionName='CUSTOM';
  if(kind==='schedule')g[0].rule.startDate='2026-01-01';
  if(kind==='taxType')g[0].rule.taxTypeBased={};
  if(kind==='bracket')g[0].rule.percentage.useTaxBracket=true;
  if(kind==='exclusive')root.trxSetup.generatesType='EXCLUSIVE';
  if(kind==='advanced')g[0].rule.posting.applicableDays=2;
  if(kind==='rate')g[1].rule.percentage.amount=10;
  if(kind==='nested')e.generatedRules[0].transactionCode.generatesSetup.generates=[g[1]];
  if(kind!=='changed')e.rulesAfter=structuredClone(e.rules);
  expect(()=>verifyArSimulation(e,'TSAN','ROOM',1350)).toThrow('document_invoice_ar_tax_unverified');
 });
});
