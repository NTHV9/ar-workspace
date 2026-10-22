import {it,expect} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {source,currentPacket} from './fixtures/invoice-current-ar-tax';
import {money} from './fixtures/invoice-packet';
it.each([100,-100,0.01])('uses a fresh whole-invoice VAT7 proof with OPERA adjustment calculation (%s)',amount=>{
 const p=currentPacket(amount),before=structuredClone(p),m=invoiceModel(p);expect(m.vat).toBe(Math.round((3315+amount)*7/107*100));expect(m.nonTaxable).toBe(0);expect(m.outstanding).toBe(Math.round((3315+amount)*100));expect(p).toEqual(before);
});
it('does not infer zero VAT from an AR-only row without its calculator evidence',()=>{const p=currentPacket();p.arSimulations=[];expect(()=>invoiceModel(p)).toThrow();});
it.each(['version','source-before','source-after','current-posting','generated-rules','missing-generated-after','wrong-rate','foreign-account'] as const)('rejects incomplete or changed current-rule evidence (%s)',kind=>{
 const p=currentPacket();
 if(kind==='version')Reflect.set(p.currentArTaxProof,'version',2);
 if(kind==='source-before')p.currentArTaxProof.sourceBefore.invoice.balance.amount++;
 if(kind==='source-after')p.currentArTaxProof.sourceAfter.invoice.balance.amount++;
 if(kind==='current-posting')p.postings.invoicePostingsDetails[0].checkNo='CHANGED';
 if(kind==='generated-rules')p.arSimulations[0].generatedRulesAfter[0].transactionCode.description.defaultText='Changed';
 if(kind==='missing-generated-after')Reflect.deleteProperty(p.arSimulations[0],'generatedRulesAfter');
 if(kind==='wrong-rate')p.arSimulations[0].rules.transactionCode.generatesSetup.generates[0].rule.percentage.amount=8;
 if(kind==='foreign-account')p.arDetails[0].response.transactions[0].aRInfo.accountNumber='OTHER';
 expect(()=>invoiceModel(p)).toThrow();
});
it('rejects a taxless component even when positive and negative NonVAT cancel',()=>{
 const p=currentPacket(),sample=p.taxRows.find(r=>'postingBreakdown' in r)!;
 if(!('postingBreakdown' in sample))throw Error('Fixture');
 for(const [id,amount] of [[80001,50],[80002,-50]]){
  const row=structuredClone(sample);Object.assign(row.posting,{transactionNo:id,referencePackageTransactionNo:id,transactionCode:'UNTAXED',transactionDate:'2026-01-02',postedAmount:money(Math.abs(amount))});row.postingBreakdown={grossAmount:money(amount),netAmount:money(amount),taxes:[]};p.taxRows.push(row);
  p.postings.invoicePostingsDetails.push({...p.postings.invoicePostingsDetails[0],transactionNo:id,transactionCode:'UNTAXED',debitAmount:money(amount)});
 }
 p.postings.trxCodesInfo.push({hotelId:'KAT',transactionCode:'UNTAXED',description:'Untaxed charge'});
 p.currentArTaxProof.sourceBefore=structuredClone(source(p));p.currentArTaxProof.sourceAfter=structuredClone(source(p));expect(()=>invoiceModel(p)).toThrow();
});
it('rejects a valid VAT7 rule that taxes net only while service is outside its VAT base',()=>{
 const p=currentPacket(),e=p.arSimulations[0],root=e.rules.transactionCode,vatRule=root.generatesSetup.generates[0],base=100/1.17;
 root.generatesSetup.generates=[{...structuredClone(vatRule),code:'SVC',rule:{...structuredClone(vatRule.rule),percentage:{amount:10,calculatedOn:'Base',useTaxBracket:false}}},vatRule];e.rulesAfter=structuredClone(e.rules);
 e.generatedRules.push({transactionCode:{hotelId:'KAT',code:'SVC',classification:{group:{code:'SVC'}},description:{defaultText:'Service'}}});e.generatedRulesAfter=structuredClone(e.generatedRules);
 e.calculation.result.charges=[{transactionCode:'AR-ADJUSTMENT',amount:100,basePosting:true,sequence:0},{transactionCode:'AR-ADJUSTMENT',amount:base,basePosting:false,sequence:0},{transactionCode:'SVC',amount:base*.1,basePosting:false,sequence:1},{transactionCode:'VAT',amount:base*.07,basePosting:false,sequence:2}];
 expect(()=>invoiceModel(p)).toThrow('document_invoice_current_ar_tax_unverified');
});
it('does not use a current-rule proof to admit mixed NonVAT',()=>{
 const p=currentPacket();for(const row of p.taxRows)if('postingBreakdown' in row){row.postingBreakdown.netAmount=row.postingBreakdown.grossAmount;row.postingBreakdown.taxes=[];}
 p.currentArTaxProof.sourceBefore=structuredClone(source(p));p.currentArTaxProof.sourceAfter=structuredClone(source(p));expect(()=>invoiceModel(p)).toThrow();
});
