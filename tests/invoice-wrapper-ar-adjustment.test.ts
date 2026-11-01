import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {wrapperArAdjustmentFixture} from './fixtures/invoice-wrapper-ar-adjustment';
import {money} from './fixtures/invoice-packet';

it('combines posted wrapper VAT with a later same-account current AR rebate without inventing posted tax rows',()=>{
 const f=wrapperArAdjustmentFixture();
 expect(arOnlyInvoiceModel(f.p)).toMatchObject({gross:12770,vat:770,taxableNet:12000,nonTaxable:0,outstanding:12770});
 expect(f.p.taxRows.some(e=>e.posting.transactionNo===60001)).toBe(false);
 expect(f.p.arDetails[0].response.transactions).toHaveLength(1);
});
it.each(['foreign-account','foreign-invoice','foreign-folio','foreign-hotel','foreign-reservation','date','before-invoice','amount','selected-money','positive','deferred','reference','package','children','missing','extra','duplicate','source-alias','tax-alias','reverse-reference','parent-rule','leaf-rule','calculator','foreign-currency','stale-source','exclusion-list'] as const)('refuses incomplete or contradictory adjustment evidence: %s',kind=>{
 const f=wrapperArAdjustmentFixture(),e=f.adjustment.roots[0];
 if(kind==='foreign-account')f.root.aRInfo.accountNumber='OTHER';
 if(kind==='foreign-invoice')f.root.aRInfo.invoiceNo=100;
 if(kind==='foreign-folio')f.root.folioNo=89;
 if(kind==='foreign-hotel')Reflect.set(f.root,'hotelId','TSAN');
 if(kind==='foreign-reservation')Reflect.set(f.root,'guestInfo',{reservationId:{id:'999'}});
 if(kind==='date')f.root.transactionDate='2026-01-17';
 if(kind==='before-invoice'){f.root.transactionDate='2026-01-02';f.p.postings.invoicePostingsDetails[1].transactionDate='2026-01-02';}
 if(kind==='amount')f.root.postedAmount=money(-106);
 if(kind==='selected-money')f.p.postings.invoicePostingsDetails[1].debitAmount=money(-106);
 if(kind==='positive'){f.root.debitAmount=f.root.postedAmount=money(107);f.p.postings.invoicePostingsDetails[1].debitAmount=money(107);}
 if(kind==='deferred')f.root.deferredTax=true;
 if(kind==='reference')Reflect.set(f.root,'referenceTransactionNo',10001);
 if(kind==='package')Reflect.set(f.root,'referencePackageTransactionNo',90001);
 if(kind==='children')Reflect.set(f.root,'subPostings',[{transactionNo:60002}]);
 if(kind==='missing')f.p.arDetails[0].response.transactions=[];
 if(kind==='extra')f.p.arDetails[0].response.transactions.push({...structuredClone(f.root),transactionNo:60002});
 if(kind==='duplicate')f.adjustment.roots.push(structuredClone(e));
 if(kind==='source-alias')f.p.taxRows[1].posting.transactionNo=60001;
 if(kind==='tax-alias'){const row=f.p.taxRows[1];if(!('postingBreakdown'in row))throw Error('fixture');row.postingBreakdown.taxes[0].transactionNo=60001;}
 if(kind==='reverse-reference')Reflect.set(f.p.taxRows[1].posting,'referenceTransactionNo',60001);
 if(kind==='parent-rule')e.rulesAfter.transactionCode.trxSetup.nonTaxable=true;
 if(kind==='leaf-rule')e.generatedRulesAfter[0].transactionCode.hotelId='TSAN';
 if(kind==='calculator')e.calculationAfter.result.totalAmount=-106;
 if(kind==='foreign-currency')e.calculationAfter.result.charges.forEach(c=>Reflect.set(c,'currencyCode','USD'));
 if(kind==='exclusion-list')Reflect.set(f.proof,'excludeIds',['60001']);
 f.refresh();if(kind==='stale-source')Reflect.set(f.proof.sourceAfter,'invoice',{});
 expect(()=>arOnlyInvoiceModel(f.p)).toThrow();
});
it.each(['root','selected'] as const)('rejects a contradictory top-level reservation on the %s rebate view',view=>{
 const f=wrapperArAdjustmentFixture();Reflect.set(view==='root'?f.root:f.p.postings.invoicePostingsDetails[1],'reservationId',{id:'999'});f.refresh();
 expect(()=>arOnlyInvoiceModel(f.p)).toThrow();
});
it.each(['payment','wrong-tax-role','nonvat','comp','inclusive','manual','nested','bucket'] as const)('validates a distinct adjustment leaf rather than trusting its VAT label: %s',kind=>{
 const f=wrapperArAdjustmentFixture(),e=f.adjustment.roots[0],leaf=e.generatedRules[0].transactionCode;
 e.rules.transactionCode.generatesSetup.generates[0].code='ADJ-VAT';leaf.code='ADJ-VAT';e.calculation.result.charges[2].transactionCode='ADJ-VAT';
 if(kind==='payment')leaf.classification.type='Payment';
 if(kind==='wrong-tax-role')leaf.classification.transactionType.code='NonRevenue';
 if(kind==='nonvat')leaf.trxSetup.nonTaxable=true;
 if(kind==='comp')leaf.compTransaction=true;
 if(kind==='inclusive')leaf.trxSetup.taxInclusive=true;
 if(kind==='manual')leaf.trxSetup.manualPosting=true;
 if(kind==='nested')Reflect.set(leaf.generatesSetup,'generates',[{code:'OTHER'}]);
 if(kind==='bucket')leaf.generatesSetup.addBaseAmtTo.bucket1=true;
 e.rulesAfter=structuredClone(e.rules);e.generatedRulesAfter=structuredClone(e.generatedRules);e.calculationAfter=structuredClone(e.calculation);f.refresh();
 expect(()=>arOnlyInvoiceModel(f.p)).toThrow();
});
