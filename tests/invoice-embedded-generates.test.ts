import {expect,it} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {embeddedGeneratePacket} from './fixtures/invoice-embedded-generates';
it('uses explicit NonRevenue leaf proof for already posted amounts without native controls or label inference',()=>{
 const p=embeddedGeneratePacket();p.taxCodes[0].description='Generated component';p.embeddedGenerateProof.sourceBefore.taxCodes[0].description=p.embeddedGenerateProof.sourceAfter.taxCodes[0].description='Generated component';
 const m=invoiceModel(p);expect(m).toMatchObject({gross:11770,vat:770,nonTaxable:0,taxableNet:11000});expect('nativeTaxControls'in p).toBe(false);
});
it.each(['class','non-taxable','inclusive-leaf','manual-leaf','nested-leaf','partial-base','wrong-rate','changed-rules','wrong-hotel','wrong-code','child-id','child-parent','duplicate-child','net','currency','fresh-tax-change','missing-row','unclassified-direct'] as const)('refuses unclosed or inconsistent embedded source proof (%s)',kind=>{
 const p=embeddedGeneratePacket(),proof=p.embeddedGenerateProof,g=proof.groups[0],leaf=g.generatedRules[0].transactionCode;
 if(kind==='class')leaf.classification.transactionType.code='Tax';
 if(kind==='non-taxable')leaf.trxSetup.nonTaxable=true;
 if(kind==='inclusive-leaf')leaf.trxSetup.taxInclusive=true;
 if(kind==='manual-leaf')leaf.trxSetup.manualPosting=true;
 if(kind==='nested-leaf')Object.assign(leaf.generatesSetup,{generates:[{code:'OTHER'}]});
 if(kind==='partial-base')g.rules.transactionCode.generatesSetup.generates[1].rule.percentage.calculatedOn='Base';
 if(kind==='wrong-rate')g.rules.transactionCode.generatesSetup.generates[1].rule.percentage.amount=8;
 if(kind==='changed-rules')g.rulesAfter.transactionCode.trxSetup.nonTaxable=true;
 if(kind==='wrong-hotel')leaf.hotelId='TSAN';
 if(kind==='wrong-code')leaf.code='OTHER';
 if(kind==='child-id')g.generateIds[0]='99999';
 if(kind==='child-parent')p.taxRows[0].postingBreakdown.taxes[0].referenceTransactionNo=99999;
 if(kind==='duplicate-child')p.taxRows[0].postingBreakdown.taxes.push(structuredClone(p.taxRows[0].postingBreakdown.taxes[0]));
 if(kind==='net')p.taxRows[0].postingBreakdown.netAmount.amount++;
 if(kind==='currency')p.taxRows[0].postingBreakdown.taxes[0].amount.currencyCode='USD';
 if(kind==='fresh-tax-change')proof.sourceAfter.taxRows[0].postingBreakdown.taxes[0].amount.amount++;
 if(kind==='missing-row')p.taxRows=[];
 if(kind==='unclassified-direct'){
  const extra=structuredClone(p.taxRows[0]);extra.posting.transactionNo=10002;extra.posting.transactionCode='UNTAXED';extra.posting.debitAmount.amount=extra.posting.postedAmount.amount=50;extra.postingBreakdown.grossAmount.amount=extra.postingBreakdown.netAmount.amount=50;extra.postingBreakdown.taxes=[];p.taxRows.push(extra);
  p.postings.invoicePostingsDetails.push({...p.postings.invoicePostingsDetails[0],transactionNo:10002,transactionCode:'UNTAXED',debitAmount:{amount:50,currencyCode:'THB'}});p.postings.trxCodesInfo.push({hotelId:'KAT',transactionCode:'UNTAXED',transactionGroup:'MISC',description:'Direct charge'});p.manifest.open+=50;p.invoice.amount.amount+=50;p.invoice.balance.amount+=50;
 }
 if(kind!=='changed-rules')g.rulesAfter=structuredClone(g.rules);g.generatedRulesAfter=structuredClone(g.generatedRules);
 expect(()=>invoiceModel(p)).toThrow();
});

function resnapshot(p:ReturnType<typeof embeddedGeneratePacket>){const {embeddedGenerateProof,...source}=p;embeddedGenerateProof.sourceBefore=structuredClone(source);embeddedGenerateProof.sourceAfter=structuredClone(source);}
it('totals fractional posted VAT once across multiple complete groups',()=>{
 const p=embeddedGeneratePacket(1),q=embeddedGeneratePacket(1);q.taxRows[0].posting.transactionNo=10002;q.postings.invoicePostingsDetails[0].transactionNo=10002;q.taxRows[0].postingBreakdown.taxes.forEach(t=>{t.transactionNo+=2;t.referenceTransactionNo=10002;});q.embeddedGenerateProof.groups[0].postingId='10002';q.embeddedGenerateProof.groups[0].generateIds=['20003','20004'];
 p.taxRows.push(...q.taxRows);p.postings.invoicePostingsDetails.push(...q.postings.invoicePostingsDetails);p.embeddedGenerateProof.groups.push(...q.embeddedGenerateProof.groups);p.invoice.amount.amount=p.invoice.balance.amount=p.manifest.open=2;resnapshot(p);
 expect(invoiceModel(p)).toMatchObject({gross:200,vat:13,nonTaxable:0,taxableNet:187});
});
it('rejects a partial VAT base even when the missing generated amount fits currency rounding tolerance',()=>{
 const p=embeddedGeneratePacket(),b=p.taxRows[0].postingBreakdown,root=p.embeddedGenerateProof.groups[0].rules.transactionCode;
 b.netAmount.amount=100;b.taxes[0].amount.amount=.001;b.taxes[1].amount.amount=7;b.grossAmount.amount=107.001;p.postings.invoicePostingsDetails[0].debitAmount.amount=107;p.taxRows[0].posting.debitAmount.amount=p.taxRows[0].posting.postedAmount.amount=107;p.manifest.open=p.invoice.amount.amount=p.invoice.balance.amount=107;
 root.generatesSetup.generates[0].rule.percentage.amount=.001;root.generatesSetup.generates[1].rule.percentage.calculatedOn='Base';p.embeddedGenerateProof.groups[0].rulesAfter=structuredClone(p.embeddedGenerateProof.groups[0].rules);resnapshot(p);
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it.each(['missing-rule','duplicate-group','conditional-generate','tax-role','tax-code','associated','source-id','source-date','invoice-reservation'] as const)('binds the entire posted graph and stable source scope (%s)',kind=>{
 const p=embeddedGeneratePacket(),g=p.embeddedGenerateProof.groups[0];
 if(kind==='missing-rule')g.generatedRules.pop();
 if(kind==='duplicate-group')p.embeddedGenerateProof.groups.push(structuredClone(g));
 if(kind==='conditional-generate')Object.assign(g.rules.transactionCode.generatesSetup.generates[0],{condition:'UNKNOWN'});
 if(kind==='tax-role')g.generatedRules[1].transactionCode.classification.transactionType.code='NonRevenue';
 if(kind==='tax-code')g.generatedRules[1].transactionCode.classification.transactionType.taxCode=2.5;
 if(kind==='associated')Object.assign(g.generatedRules[0].transactionCode,{associatedTransactionCodes:[{code:'EXTRA'}]});
 if(kind==='source-id')p.embeddedGenerateProof.sourceAfter.taxRows[0].posting.transactionNo=999;
 if(kind==='source-date')p.embeddedGenerateProof.sourceAfter.taxRows[0].posting.transactionDate='2026-01-03';
 if(kind==='invoice-reservation')Object.assign(p.embeddedGenerateProof.sourceAfter.invoice,{reservationId:{id:'999'}});
 g.rulesAfter=structuredClone(g.rules);g.generatedRulesAfter=structuredClone(g.generatedRules);
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});

it.each([0,1])('accepts matching optional child scope for generated component %s and keeps absent fields optional',child=>{
 const p=embeddedGeneratePacket();Object.assign(p.taxRows[0].postingBreakdown.taxes[child],{hotelId:'KAT',folioNo:88,guestInfo:{reservationId:{id:'777'}}});resnapshot(p);
 expect(invoiceModel(p)).toMatchObject({gross:11770,vat:770,nonTaxable:0,taxableNet:11000});
});
it.each([0,1].flatMap(child=>['hotel','folio','reservation','null-hotel','null-folio','null-reservation'].map(scope=>({child,scope}))))('rejects conflicting optional child scope even when all snapshots agree ($child/$scope)',({child,scope})=>{
 const p=embeddedGeneratePacket(),tax=p.taxRows[0].postingBreakdown.taxes[child];
 if(scope==='hotel')Object.assign(tax,{hotelId:'TSAN'});
 if(scope==='folio')Object.assign(tax,{folioNo:999});
 if(scope==='reservation')Object.assign(tax,{guestInfo:{reservationId:{id:'999'}}});
 if(scope==='null-hotel')Object.assign(tax,{hotelId:null});
 if(scope==='null-folio')Object.assign(tax,{folioNo:null});
 if(scope==='null-reservation')Object.assign(tax,{guestInfo:{reservationId:null}});
 resnapshot(p);expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
