import {packet,money} from './invoice-packet';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import type {InvoicePacket} from '../../worker/invoice/model';
export function wrapperNetPacket(sign=1){
 const p=packet(1),date='2026-01-02';
 for(const [index,e]of p.taxRows.entries()){
  Object.assign(e.posting,{folioWindowNo:1,transactionDate:date});
  if(!('postingBreakdown'in e))continue;
  const s=index===1?sign:1,gross=s*(index===1?117:117.7),net=s*100,svc=s*10,vat=s*(index===1?7:7.7);
  Object.assign(e.posting,{transactionCode:index===1?'NET-BASE':'FULL-BASE',debitAmount:money(gross),postedAmount:money(gross)});
  e.postingBreakdown.grossAmount=money(gross);e.postingBreakdown.netAmount=money(net);e.postingBreakdown.taxes[0].amount=money(svc);e.postingBreakdown.taxes[1].amount=money(vat);
  for(const t of e.postingBreakdown.taxes)Object.assign(t,{transactionDate:date});
 }
 const gross=sign*117+117.7;p.manifest.open=gross;p.invoice.amount=p.invoice.balance=money(gross);p.postings.invoicePostingsDetails[0].debitAmount=money(gross);
 Object.assign(p.taxRows[0].posting,{transactionCode:'ROOM',postedAmount:money(gross)});
 const flags=(bucket1=false)=>({bucket1,bucket2:false,bucket3:false});
 const gen=(code:string,amount:number,calculatedOn:string)=>({code,level:'TransactionCode',rule:{percentage:{amount,calculatedOn,useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:flags()});
 const rules={transactionCode:{hotelId:'KAT',code:'NET-BASE',classification:{type:'Revenue',transactionType:{code:'FoodAndBeverage'},group:{code:'F&B'}},trxSetup:{generatesType:'INCLUSIVE',taxInclusive:true,nonTaxable:false},compTransaction:false,associatedTransactionCodes:[],generatesSetup:{addBaseAmtTo:flags(true),generates:[gen('SVC',10,'Base'),gen('VAT',7,'Bucket1')]}}};
 const leaf=(code:string,type:string,group:string)=>({transactionCode:{hotelId:'KAT',code,classification:{type:'Revenue',transactionType:{code:type,...type==='Tax'?{taxCode:1}:{}},group:{code:group}},trxSetup:{taxInclusive:false,nonTaxable:false,manualPosting:false},compTransaction:false,associatedTransactionCodes:[],generatesSetup:{addBaseAmtTo:flags()}}});
 const generatedRules=[leaf('SVC','NonRevenue','SVC'),leaf('VAT','Tax','TAX')];
 const component={wrapperId:'10001',packageReference:'90001',componentId:'30001',generateIds:['300011','300012'],rules,rulesAfter:structuredClone(rules),generatedRules,generatedRulesAfter:structuredClone(generatedRules)};
 return {p,components:[component]};
}
export function withWrapperNetProof(p:InvoicePacket,components:unknown[]):InvoicePacket{
 return Object.assign(p,{arOnlyWrapperNetVatProof:{version:1,kind:'ar-only-wrapper-net-vat7',sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),components}});
}
