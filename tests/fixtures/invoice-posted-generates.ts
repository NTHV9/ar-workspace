import {packet,money} from './invoice-packet';
import {currentPacket} from './invoice-current-ar-tax';
export function postedGeneratePacket(sign=1){
 const base=packet(1),scope={hotelId:'KAT',folioNo:88,folioWindowNo:1,aRInfo:{accountNumber:'SYN-AR',invoiceNo:99}},date='2026-01-16';
 for(const row of base.postings.invoicePostingsDetails){const wrapper=base.taxRows.find(r=>r.posting.transactionNo===row.transactionNo);if(wrapper)Object.assign(wrapper.posting,{transactionCode:row.transactionCode,transactionDate:row.transactionDate,postedAmount:money(row.debitAmount.amount)});}
 const child=(id:number,code:string,amount:number)=>({...scope,transactionNo:id,referenceTransactionNo:60001,transactionCode:code,transactionDate:date,postingDate:date,transactionType:'Revenue',deferredTax:false,debitAmount:money(sign*amount),postedAmount:money(sign*amount),transactionAmount:sign*amount});
 const children=[child(60002,'POST-SVC',10),child(60003,'POST-VAT',7.7)];
 const root={...scope,transactionNo:60001,transactionCode:'POST-BASE',transactionDate:date,postingDate:date,transactionType:'Revenue',deferredTax:false,debitAmount:money(sign*100),postedAmount:money(sign*100),transactionAmount:sign*100,subPostings:structuredClone(children)};
 const transactions=[root,...children],definitions=[['POST-BASE','F&B','Posted base'],['POST-SVC','SVC','Service'],['POST-VAT','TAX','VAT']].map(([transactionCode,transactionGroup,description])=>({hotelId:'KAT',transactionCode,transactionGroup,description}));
 const flags=(bucket1=false)=>({bucket1,bucket2:false,bucket3:false});
 const rule=(code:string,amount:number,calculatedOn:string,bucket1=false)=>({code,rule:{percentage:{amount,calculatedOn,useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:flags(bucket1)});
 const rules={transactionCode:{hotelId:'KAT',code:'POST-BASE',classification:{type:'Revenue',group:{code:'F&B'}},trxSetup:{generatesType:'EXCLUSIVE',taxInclusive:false,nonTaxable:false},generatesSetup:{addBaseAmtTo:flags(true),generates:[rule('POST-SVC',10,'Base',true),rule('POST-VAT',7,'Bucket1')]},associatedTransactionCodes:[]}};
 const generatedRules=definitions.slice(1).map(d=>({transactionCode:{hotelId:'KAT',code:d.transactionCode,classification:{type:'Revenue',group:{code:d.transactionGroup}},description:{defaultText:d.description},generatesSetup:{addBaseAmtTo:flags()},associatedTransactionCodes:[]}}));
 const evidence={postingId:'60001',childIds:['60002','60003'],rules,rulesAfter:structuredClone(rules),generatedRules,generatedRulesAfter:structuredClone(generatedRules)};
 return {...base,account:{...base.account,accountNo:'SYN-AR'},manifest:{...base.manifest,open:3315+sign*117.7},invoice:{...base.invoice,amount:money(3315+sign*117.7),balance:money(3315+sign*117.7)},postings:{invoicePostingsDetails:[...base.postings.invoicePostingsDetails,...transactions.map(r=>({transactionNo:r.transactionNo,transactionCode:r.transactionCode,transactionDate:r.transactionDate,debitAmount:r.debitAmount,reference:'',checkNo:''}))],trxCodesInfo:[...base.postings.trxCodesInfo,...definitions]},arDetails:[{ids:transactions.map(r=>String(r.transactionNo)),response:{transactions,trxCodesInfo:definitions}}],arPostedGenerates:[evidence],nativeTaxControls:{vat:21687+sign*770,nonTaxable:0}};
}
/** Two independently identified posted graphs, a wrapper, and two standalone
 * inclusive roots. Neither graph nor its children can be simulated. */
export function mixedPostedGeneratePacket(){
 const p=postedGeneratePacket(),second=postedGeneratePacket(-1);
 for(const row of second.postings.invoicePostingsDetails.slice(1))row.transactionNo+=10;
 for(const row of second.arDetails[0].response.transactions){row.transactionNo+=10;if('referenceTransactionNo'in row)row.referenceTransactionNo+=10;if('subPostings'in row)for(const child of row.subPostings){child.transactionNo+=10;child.referenceTransactionNo+=10;}}
 second.arPostedGenerates[0].postingId='60011';second.arPostedGenerates[0].childIds=['60012','60013'];
 p.postings.invoicePostingsDetails.push(...second.postings.invoicePostingsDetails.slice(1));p.arDetails[0].response.transactions.push(...second.arDetails[0].response.transactions);p.arPostedGenerates.push(...second.arPostedGenerates);
 const simulations=[];
 for(const [n,amount] of [[0,100],[1,-50]]){
  const adjustment=currentPacket(amount),root=adjustment.arDetails[0].response.transactions[0];root.transactionNo=70001+n;root.aRInfo.accountNumber='SYN-AR';
  p.arDetails[0].response.transactions.push({...root,hotelId:'KAT',folioWindowNo:1,postingDate:root.transactionDate,transactionAmount:amount,subPostings:[]});
  p.postings.invoicePostingsDetails.push({...adjustment.postings.invoicePostingsDetails[1],transactionNo:70001+n});
  const e=adjustment.arSimulations[0];e.postingId=String(70001+n);simulations.push(e);
  if(!n){p.arDetails[0].response.trxCodesInfo.push(adjustment.arDetails[0].response.trxCodesInfo[0]);p.postings.trxCodesInfo.push(adjustment.postings.trxCodesInfo[1]);}
 }
 p.arDetails[0].ids=p.arDetails[0].response.transactions.map(row=>String(row.transactionNo));
 p.manifest.open=3365;p.invoice.amount=p.invoice.balance=money(3365);
 return {...p,arSimulations:simulations};
}
