import {expect,it} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {postedGeneratePacket} from './fixtures/invoice-posted-generates';
it.each([1,-1])('counts actual exclusive posted VAT once and keeps all selected parent/child lines (%s)',sign=>{
 const p=postedGeneratePacket(sign),m=invoiceModel(p);expect(m).toMatchObject({gross:331500+sign*11770,vat:21687+sign*770,nonTaxable:0});expect(m.lines).toHaveLength(4);
});
it('refuses explicit generated postings without independent native controls',()=>{const p=postedGeneratePacket();Reflect.deleteProperty(p,'nativeTaxControls');expect(()=>invoiceModel(p)).toThrow('document_invoice_ar_tax_unverified');});
it.each(['nested-mismatch','missing-child','duplicate-child','wrong-parent','date','account','invoice','folio','currency','scope-code','wrong-rate','changed-rules','missing-rule','extra-rule','native-vat','native-nonvat','duplicate-evidence'] as const)('refuses incomplete or conflicting posted-generate evidence (%s)',kind=>{
 const p=postedGeneratePacket(),root=p.arDetails[0].response.transactions[0],child=p.arDetails[0].response.transactions[1],e=p.arPostedGenerates[0];
 if(!('subPostings'in root))throw Error('Fixture');
 if(kind==='nested-mismatch')root.subPostings[0].debitAmount.amount++;
 if(kind==='missing-child')p.arDetails[0].response.transactions.splice(1,1);
 if(kind==='duplicate-child')root.subPostings.push(structuredClone(root.subPostings[0]));
 if(kind==='wrong-parent')Object.assign(child,{referenceTransactionNo:99999});
 if(kind==='date')child.transactionDate='2026-01-17';
 if(kind==='account')child.aRInfo.accountNumber='OTHER';
 if(kind==='invoice')child.aRInfo.invoiceNo=100;
 if(kind==='folio')child.folioNo=89;
 if(kind==='currency')child.debitAmount.currencyCode='USD';
 if(kind==='scope-code')e.generatedRules[0].transactionCode.hotelId='TSAN';
 if(kind==='wrong-rate')e.rules.transactionCode.generatesSetup.generates[1].rule.percentage.amount=8;
 if(kind==='changed-rules')e.rulesAfter.transactionCode.trxSetup.taxInclusive=true;
 if(kind==='missing-rule')e.rules.transactionCode.generatesSetup.generates.pop();
 if(kind==='extra-rule')e.rules.transactionCode.generatesSetup.generates.push(structuredClone(e.rules.transactionCode.generatesSetup.generates[0]));
 if(kind==='native-vat')p.nativeTaxControls.vat++;
 if(kind==='native-nonvat')p.nativeTaxControls.nonTaxable=100;
 if(kind==='duplicate-evidence')p.arPostedGenerates.push(structuredClone(e));
 if(kind!=='changed-rules')e.rulesAfter=structuredClone(e.rules);
 e.generatedRulesAfter=structuredClone(e.generatedRules);
 expect(()=>invoiceModel(p)).toThrow();
});
function cancellingGraphs(){
 const p=postedGeneratePacket(),negative=postedGeneratePacket(-1);
 for(const row of negative.postings.invoicePostingsDetails.slice(1))row.transactionNo+=10;
 for(const row of negative.arDetails[0].response.transactions){row.transactionNo+=10;if('referenceTransactionNo'in row)row.referenceTransactionNo+=10;if('subPostings'in row)for(const child of row.subPostings){child.transactionNo+=10;child.referenceTransactionNo+=10;}}
 negative.arDetails[0].ids=negative.arDetails[0].response.transactions.map(r=>String(r.transactionNo));negative.arPostedGenerates[0].postingId='60011';negative.arPostedGenerates[0].childIds=['60012','60013'];
 p.postings.invoicePostingsDetails.push(...negative.postings.invoicePostingsDetails.slice(1));p.arDetails.push(...negative.arDetails);p.arPostedGenerates.push(...negative.arPostedGenerates);p.manifest.open=3315;p.invoice.amount.amount=p.invoice.balance.amount=3315;p.nativeTaxControls.vat=21687;
 return p;
}
it('verifies both cancellation graphs independently and never drops their selected rows',()=>{const m=invoiceModel(cancellingGraphs());expect(m).toMatchObject({gross:331500,vat:21687,nonTaxable:0});expect(m.lines).toHaveLength(7);});
it('cancelling wrong posted tax amounts cannot hide behind matching whole-invoice totals',()=>{
 const p=cancellingGraphs();
 for(const batch of p.arDetails){const parent=batch.response.transactions[0];if(!('subPostings'in parent))throw Error('Fixture');const child=batch.response.transactions[2],amount=child.debitAmount.amount>0?8.7:-8.7;
  for(const record of [child,parent.subPostings[1]]){record.debitAmount.amount=record.postedAmount.amount=record.transactionAmount=amount;}
  p.postings.invoicePostingsDetails.find(r=>r.transactionNo===child.transactionNo)!.debitAmount.amount=amount;
 }
 expect(()=>invoiceModel(p)).toThrow('document_invoice_ar_tax_unverified');
});
it.each(['cycle','unselected-nested','unclaimed-top-level','wrong-child-type','nested-account','posting-date','child-shared','embedded-duplicate','simulated-duplicate'] as const)('refuses ambiguous graph ownership (%s)',kind=>{
 const p=cancellingGraphs(),root=p.arDetails[0].response.transactions[0],child=p.arDetails[0].response.transactions[1];if(!('subPostings'in root))throw Error('Fixture');
 if(kind==='cycle')Object.assign(root,{referenceTransactionNo:child.transactionNo});
 if(kind==='unselected-nested')root.subPostings[0].transactionNo=99999;
 if(kind==='unclaimed-top-level')root.subPostings.pop();
 if(kind==='wrong-child-type'){p.arPostedGenerates[0].generatedRules[0].transactionCode.classification.type='Payment';p.arPostedGenerates[0].generatedRulesAfter=structuredClone(p.arPostedGenerates[0].generatedRules);}
 if(kind==='nested-account')root.subPostings[0].aRInfo.accountNumber='OTHER';
 if(kind==='posting-date'){child.postingDate='2026-01-17';root.subPostings[0].postingDate='2026-01-17';}
 if(kind==='child-shared'){const second=p.arDetails[1].response.transactions[0];if(!('subPostings'in second))throw Error('Fixture');second.subPostings[0]=structuredClone(root.subPostings[0]);}
 if(kind==='embedded-duplicate'){const component=p.taxRows.find(r=>'postingBreakdown'in r);if(!component||!('postingBreakdown'in component))throw Error('Fixture');component.postingBreakdown.taxes[1].transactionNo=60003;}
 if(kind==='simulated-duplicate')Object.assign(p,{arSimulations:[{...p.arPostedGenerates[0],calculation:{}}]});
 expect(()=>invoiceModel(p)).toThrow();
});
it('requires a real current account number even when both source fields are missing',()=>{
 const p=postedGeneratePacket();Reflect.deleteProperty(p.account,'accountNo');
 for(const batch of p.arDetails)for(const row of batch.response.transactions){Reflect.deleteProperty(row.aRInfo,'accountNumber');if('subPostings'in row)for(const child of row.subPostings)Reflect.deleteProperty(child.aRInfo,'accountNumber');}
 expect(()=>invoiceModel(p)).toThrow('document_invoice_ar_tax_unverified');
});
