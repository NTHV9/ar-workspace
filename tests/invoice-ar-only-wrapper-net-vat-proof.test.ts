import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {wrapperNetPacket,withWrapperNetProof} from './fixtures/invoice-ar-only-wrapper-net-vat';
function directResidual(){
 const {p,components}=wrapperNetPacket(),direct=structuredClone(p.taxRows[2]);if(!('postingBreakdown'in direct))throw Error('fixture');direct.posting.transactionNo=40001;Reflect.deleteProperty(direct.posting,'referencePackageTransactionNo');
 direct.postingBreakdown.taxes.forEach((t,n)=>{t.transactionNo=400011+n;t.referenceTransactionNo=40001;});p.taxRows.push(direct);
 p.postings.invoicePostingsDetails.push({transactionNo:40001,transactionCode:'FULL-BASE',transactionDate:'2026-01-02',debitAmount:{amount:117.7,currencyCode:'THB'},checkNo:'DIRECT',reference:''});p.postings.trxCodesInfo.push({hotelId:'KAT',transactionCode:'FULL-BASE',description:'Direct full-VAT revenue'});
 p.manifest.open=352.4;p.invoice.amount.amount=p.invoice.balance.amount=352.4;return {p,components,direct};
}
it.each([1,-1])('preserves independently posted signed net-base VAT and full-base residuals (%s)',sign=>{
 const {p,components}=wrapperNetPacket(sign),m=arOnlyInvoiceModel(withWrapperNetProof(p,components));
 expect(m).toMatchObject({gross:sign*11700+11770,vat:sign*700+770,nonTaxable:0,taxableNet:sign*11000+11000});expect(m.lines).toHaveLength(1);
 expect(p.postings.trxCodesInfo).toHaveLength(1); // No invented component definitions.
});
it.each(['wrong-bucket','service-after-vat','wrong-vat-rate','wrong-service-rate','service-role','vat-role','parent-code','parent-changed','leaf-changed','missing-child','missing-proof','extra-proof','wrong-component','wrong-package','component-alias','tax-alias','wrong-date','wrong-window','missing-window','currency','non-revenue','native','current','pos','nonvat','ar','snapshot'] as const)('rejects unsupported wrapper exception: %s',kind=>{
 const {p,components}=wrapperNetPacket(),e=components[0],component=p.taxRows[1];if(!('postingBreakdown'in component))throw Error('fixture');
 if(kind==='wrong-bucket')e.rules.transactionCode.generatesSetup.generates[0].addGeneratedAmtTo.bucket1=true;
 if(kind==='service-after-vat')e.rules.transactionCode.generatesSetup.generates.reverse();
 if(kind==='wrong-vat-rate')e.rules.transactionCode.generatesSetup.generates[1].rule.percentage.amount=8;if(kind==='wrong-service-rate')e.rules.transactionCode.generatesSetup.generates[0].rule.percentage.amount=9;
 if(kind==='service-role')e.generatedRules[0].transactionCode.classification.group.code='F&B';if(kind==='vat-role')e.generatedRules[1].transactionCode.classification.transactionType.code='Others';
 if(kind==='parent-code')e.rules.transactionCode.code='OTHER';
 e.rulesAfter=structuredClone(e.rules);e.generatedRulesAfter=structuredClone(e.generatedRules);
 if(kind==='parent-changed')e.rulesAfter.transactionCode.compTransaction=true;if(kind==='leaf-changed')e.generatedRulesAfter[0].transactionCode.compTransaction=true;
 if(kind==='missing-child')component.postingBreakdown.taxes.pop();if(kind==='missing-proof')components.pop();if(kind==='extra-proof')components.push(structuredClone(e));
 if(kind==='wrong-component')e.componentId='30002';if(kind==='wrong-package')e.packageReference='99999';
 if(kind==='component-alias')component.posting.transactionNo=10001;if(kind==='tax-alias')component.postingBreakdown.taxes[0].transactionNo=10001;
 if(kind==='wrong-date')Reflect.set(component.posting,'transactionDate','2026-01-03');if(kind==='wrong-window')Reflect.set(component.posting,'folioWindowNo',2);if(kind==='missing-window')Reflect.deleteProperty(component.posting,'folioWindowNo');
 if(kind==='currency')component.postingBreakdown.taxes[0].amount.currencyCode='USD';if(kind==='non-revenue')component.posting.transactionType='NonRevenue';
 const q=withWrapperNetProof(p,components),prop=({native:'nativeTaxControls',current:'currentArTaxProof',pos:'arOnlyPosProof',nonvat:'arOnlyNonVatProof'} as Record<string,string>)[kind];if(prop)Reflect.set(q,prop,kind==='native'?undefined:{});if(kind==='ar')q.arDetails=[{ids:['1'],response:{}}];
 if(kind==='snapshot')Reflect.set(q.arOnlyWrapperNetVatProof!,'sourceBefore',{});
 expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
it('verifies cancelling net-base components independently rather than using wrapper totals',()=>{
 const {p,components}=wrapperNetPacket(),negative=structuredClone(p.taxRows[1]);if(!('postingBreakdown'in negative))throw Error('fixture');
 negative.posting.transactionNo=30003;Reflect.set(negative.posting,'debitAmount',{amount:-117,currencyCode:'THB'});Reflect.set(negative.posting,'postedAmount',{amount:-117,currencyCode:'THB'});
 negative.postingBreakdown.grossAmount.amount=-117;negative.postingBreakdown.netAmount.amount=-100;negative.postingBreakdown.taxes.forEach((t,n)=>{t.transactionNo=300031+n;t.referenceTransactionNo=30003;t.amount.amount*=-1;});p.taxRows.push(negative);
 components.push({...structuredClone(components[0]),componentId:'30003',generateIds:['300031','300032']});p.manifest.open=117.7;p.invoice.amount.amount=p.invoice.balance.amount=117.7;p.postings.invoicePostingsDetails[0].debitAmount.amount=117.7;Reflect.set(p.taxRows[0].posting,'postedAmount',{amount:117.7,currencyCode:'THB'});
 expect(arOnlyInvoiceModel(withWrapperNetProof(p,components))).toMatchObject({gross:11770,vat:770,nonTaxable:0,taxableNet:11000});
 const positive=p.taxRows[1];if(!('postingBreakdown'in positive))throw Error('fixture');
 for(const e of [positive,negative]){const delta=e.postingBreakdown.netAmount.amount>0?1:-1;e.postingBreakdown.taxes[1].amount.amount+=delta;e.postingBreakdown.grossAmount.amount+=delta;Reflect.set(e.posting,'postedAmount',{...e.postingBreakdown.grossAmount});Reflect.set(e.posting,'debitAmount',{...e.postingBreakdown.grossAmount});}
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow('document_invoice_ar_only_wrapper_net_vat_unverified');
});
it('rejects two wrappers claiming the same package even when their aggregate amounts reconcile',()=>{
 const {p,components}=wrapperNetPacket(),s=structuredClone(p.postings.invoicePostingsDetails[0]),root=structuredClone(p.taxRows[0]);s.transactionNo=10002;root.posting.transactionNo=10002;p.postings.invoicePostingsDetails.push(s);p.taxRows.push(root);p.manifest.open*=2;p.invoice.amount.amount=p.invoice.balance.amount=p.manifest.open;
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow();
});
it('retains a strict residual profile for all components not consumed by the net-base proof',()=>{
 const {p,components}=wrapperNetPacket(),ordinary=p.taxRows[2];if(!('postingBreakdown'in ordinary))throw Error('fixture');ordinary.postingBreakdown.taxes=[];ordinary.postingBreakdown.netAmount={...ordinary.postingBreakdown.grossAmount};
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow();
});
it('retains independently taxed full-VAT Revenue rows outside selected wrappers',()=>{
 const {p,components}=directResidual();
 expect(arOnlyInvoiceModel(withWrapperNetProof(p,components))).toMatchObject({gross:35240,vat:2240,nonTaxable:0,taxableNet:33000});
});
it.each(['udf','bracket','associated','descendant-rule','root-adjustment','leaf-adjustment','posted-leaf-descendant','posted-leaf-deferred'] as const)('rejects unsupported rule or posted leaf behavior: %s',kind=>{
 const {p,components}=wrapperNetPacket(),e=components[0],part=p.taxRows[1];if(!('postingBreakdown'in part))throw Error('fixture');
 if(kind==='udf')Object.assign(e.rules.transactionCode.generatesSetup.generates[1].rule,{uDFFunctionName:'Unexpected'});
 if(kind==='bracket')e.rules.transactionCode.generatesSetup.generates[1].rule.percentage.useTaxBracket=true;
 if(kind==='associated')Object.assign(e.rules.transactionCode,{associatedTransactionCodes:[{code:'OTHER'}]});
 if(kind==='descendant-rule')Object.assign(e.generatedRules[1].transactionCode.generatesSetup,{generates:[{code:'OTHER'}]});
 if(kind==='root-adjustment')Object.assign(e.rules.transactionCode,{transactionAdjustments:[{code:'OTHER'}]});
 if(kind==='leaf-adjustment')Object.assign(e.generatedRules[1].transactionCode,{transactionAdjustments:[{code:'OTHER'}]});
 if(kind==='posted-leaf-descendant')Object.assign(part.postingBreakdown.taxes[1],{subPostings:[{transactionNo:99999,referenceTransactionNo:300012,transactionCode:'OTHER',amount:{amount:1,currencyCode:'THB'}}]});
 if(kind==='posted-leaf-deferred')Object.assign(part.postingBreakdown.taxes[1],{deferredTax:true});
 e.rulesAfter=structuredClone(e.rules);e.generatedRulesAfter=structuredClone(e.generatedRules);
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow();
});
it.each([10001,90001,30001,300012])('rejects unexplained standalone children referencing owned posting %s',reference=>{
 const {p,components}=wrapperNetPacket(),child=structuredClone(p.taxRows[1]);child.posting.transactionNo=99999;Reflect.deleteProperty(child.posting,'referencePackageTransactionNo');Object.assign(child.posting,{referenceTransactionNo:reference});p.taxRows.push(child);
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow();
});
it.each(['debit-credit','transaction-amount'] as const)('reconciles supplied wrapper %s with the selected posting',kind=>{
 const {p,components}=wrapperNetPacket();Object.assign(p.taxRows[0].posting,kind==='debit-credit'?{debitAmount:{amount:1,currencyCode:'THB'}}:{transactionAmount:1});
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow();
});
it('accepts supplied wrapper money only when all provided views match the selected posting',()=>{
 const {p,components}=wrapperNetPacket();Object.assign(p.taxRows[0].posting,{debitAmount:{amount:234.7,currencyCode:'THB'},transactionAmount:234.7});
 expect(arOnlyInvoiceModel(withWrapperNetProof(p,components))).toMatchObject({gross:23470,vat:1470});
});
it.each(['direct-first','wrapper-first'] as const)('enforces direct and wrapper embedded tax ownership in both directions: %s',order=>{
 for(const kind of ['direct-to-wrapper','direct-to-component','direct-to-net-tax','net-tax-to-direct','net-tax-to-direct-tax','ordinary-tax-to-direct-tax']){
  const {p,components,direct}=directResidual(),net=p.taxRows[1],ordinary=p.taxRows[2];if(!('postingBreakdown'in net)||!('postingBreakdown'in ordinary))throw Error('fixture');
  const date=order==='direct-first'?'2026-01-01':'2026-01-03';p.postings.invoicePostingsDetails[1].transactionDate=date;Reflect.set(direct.posting,'transactionDate',date);direct.postingBreakdown.taxes.forEach(t=>Reflect.set(t,'transactionDate',date));
  if(kind==='direct-to-wrapper')direct.postingBreakdown.taxes[1].transactionNo=10001;
  if(kind==='direct-to-component')direct.postingBreakdown.taxes[1].transactionNo=30001;
  if(kind==='direct-to-net-tax')direct.postingBreakdown.taxes[1].transactionNo=300012;
  if(kind==='net-tax-to-direct'){net.postingBreakdown.taxes[1].transactionNo=40001;components[0].generateIds[1]='40001';}
  if(kind==='net-tax-to-direct-tax'){net.postingBreakdown.taxes[1].transactionNo=400012;components[0].generateIds[1]='400012';}
  if(kind==='ordinary-tax-to-direct-tax')ordinary.postingBreakdown.taxes[1].transactionNo=400012;
  expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components)),kind).toThrow('document_invoice_ar_only_wrapper_net_vat_unverified');
 }
});
it.each(['tax-is-package','component-is-package','wrapper-is-package'] as const)('rejects ambiguous package/posting identity overlap: %s',kind=>{
 const {p,components}=wrapperNetPacket(),part=p.taxRows[1];if(!('postingBreakdown'in part))throw Error('fixture');
 if(kind==='tax-is-package'){part.postingBreakdown.taxes[1].transactionNo=90001;components[0].generateIds[1]='90001';}
 else{const reference=kind==='component-is-package'?30001:10001;for(const entry of p.taxRows)entry.posting.referencePackageTransactionNo=reference;components[0].packageReference=String(reference);}
 expect(()=>arOnlyInvoiceModel(withWrapperNetProof(p,components))).toThrow('document_invoice_ar_only_wrapper_net_vat_unverified');
});
