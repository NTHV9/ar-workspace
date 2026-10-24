import {expect,it} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {verifyEmbeddedGenerateProof} from '../worker/invoice/embedded-generates';
import {embeddedNonVatPacket,resnapshotNonVat} from './fixtures/invoice-embedded-nonvat';

it('admits explicit API NonVAT and owner-confirmed TSAN Taxi alongside full posted VAT7 graphs',()=>{
 const p=embeddedNonVatPacket();expect(invoiceModel(p)).toMatchObject({gross:16770,vat:770,nonTaxable:5000,taxableNet:11000});
 expect([...verifyEmbeddedGenerateProof(p,p.embeddedGenerateProof)]).toEqual(['20001']);
});
it('applies the same transaction-code policy to a different invoice identity and signed Taxi reversal',()=>{
 const p=embeddedNonVatPacket([20,-30]);p.manifest.id=String(p.invoice.transactionNo=12345);p.manifest.invoice_no=String(p.invoice.invoiceNo=321);resnapshotNonVat(p);
 expect(invoiceModel(p)).toMatchObject({gross:10770,vat:770,nonTaxable:-1000,taxableNet:11000});
});
it('accepts the Taxi description without a harmless trailing print marker',()=>{
 const p=embeddedNonVatPacket(),g=p.embeddedGenerateProof.nonVatGroups[1];g.rules.transactionCode.description.defaultText='Taxi Service';g.rulesAfter=structuredClone(g.rules);
 expect(invoiceModel(p)).toMatchObject({nonTaxable:5000});
});
it('qualifies an explicit API NonVAT code independently of transport labels or hotel-specific overrides',()=>{
 const p=embeddedNonVatPacket([20]),g=p.embeddedGenerateProof.nonVatGroups[0];
 p.taxRows[1].posting.transactionCode=p.postings.invoicePostingsDetails[1].transactionCode=p.postings.trxCodesInfo[1].transactionCode=g.rules.transactionCode.code=g.calculation.result.charges[0].transactionCode='OTHER-EXEMPT';g.calculationAfter=structuredClone(g.calculation);p.postings.trxCodesInfo[1].description=g.rules.transactionCode.description.defaultText='Explicit exempt revenue';g.rulesAfter=structuredClone(g.rules);resnapshotNonVat(p);
 expect(invoiceModel(p)).toMatchObject({gross:13770,vat:770,nonTaxable:2000,taxableNet:11000});
});
it('proves both valid signed Taxi cancellation rows individually',()=>{
 const p=embeddedNonVatPacket([20,30,-30]);expect(invoiceModel(p)).toMatchObject({gross:13770,vat:770,nonTaxable:2000,taxableNet:11000});
 p.embeddedGenerateProof.nonVatGroups.pop();expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it.each(['unknown-code','other-hotel','label-only','wrong-source-description','wrong-rule-description','wrong-type','wrong-group','tax-role','inclusive','generates-type','generate','associated','bucket','comp','net','posted-tax','changed-rule','changed-source','missing-proof','duplicate-proof','wrong-posting','wrong-provenance','api-flag-false'] as const)('rejects an unproven direct NonVAT row (%s)',kind=>{
 const p=embeddedNonVatPacket(),proof=p.embeddedGenerateProof,g=proof.nonVatGroups[1],root=g.rules.transactionCode,row=p.taxRows[2],definition=p.postings.trxCodesInfo[2];
 if(kind==='unknown-code'||kind==='label-only'){root.code=row.posting.transactionCode=p.postings.invoicePostingsDetails[2].transactionCode=definition.transactionCode='6999';}
 if(kind==='other-hotel')root.hotelId='KAT';
 if(kind==='wrong-source-description')definition.description='Taxi Service VAT';
 if(kind==='wrong-rule-description')root.description.defaultText='Taxi Service VAT';
 if(kind==='wrong-type')root.classification.type='Payment';
 if(kind==='wrong-group')root.classification.group.code=definition.transactionGroup='ROOM';
 if(kind==='tax-role')root.classification.transactionType.code='Tax';
 if(kind==='inclusive')root.trxSetup.taxInclusive=true;
 if(kind==='generates-type')Object.assign(root.trxSetup,{generatesType:'EXCLUSIVE'});
 if(kind==='generate')Object.assign(root.generatesSetup,{generates:[{code:'VAT'}]});
 if(kind==='associated')root.associatedTransactionCodes.push({code:'VAT'});
 if(kind==='bucket')root.generatesSetup.addBaseAmtTo.bucket1=true;
 if(kind==='comp')root.compTransaction=true;
 if(kind==='net')row.postingBreakdown.netAmount.amount--;
 if(kind==='posted-tax'){row.postingBreakdown.netAmount.amount--;row.postingBreakdown.taxes=[{...p.taxRows[0].postingBreakdown.taxes[1],transactionNo:21001,referenceTransactionNo:row.posting.transactionNo,amount:{amount:1,currencyCode:'THB'}}];}
 if(kind==='missing-proof')proof.nonVatGroups=[];
 if(kind==='duplicate-proof')proof.nonVatGroups.push(structuredClone(g));
 if(kind==='wrong-posting')g.postingId='99999';
 if(kind==='wrong-provenance')g.provenance='opera-non-taxable';
 if(kind==='api-flag-false')proof.nonVatGroups[0].rules.transactionCode.trxSetup.nonTaxable=false;
 proof.nonVatGroups.forEach(e=>e.rulesAfter=structuredClone(e.rules));resnapshotNonVat(p);
 if(kind==='changed-rule')g.rulesAfter.transactionCode.description.defaultText='Changed';
 if(kind==='changed-source')proof.sourceAfter.postings.trxCodesInfo[2].description='Changed';
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it('requires every NonVAT cancellation row to qualify even when unknown charges cancel exactly',()=>{
 const p=embeddedNonVatPacket([20,30,-30]);
 for(const index of [2,3]){p.taxRows[index].posting.transactionCode=p.postings.invoicePostingsDetails[index].transactionCode='6999';const g=p.embeddedGenerateProof.nonVatGroups[index-1];g.rules.transactionCode.code='6999';g.rulesAfter=structuredClone(g.rules);}
 p.postings.trxCodesInfo[2].transactionCode='6999';resnapshotNonVat(p);
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it('treats omitted taxes and an empty taxes array as the same zero-tax source only under current NonVAT proof',()=>{
 const p=embeddedNonVatPacket();p.embeddedGenerateProof.sourceAfter.taxRows[1].postingBreakdown.taxes=[];
 expect(invoiceModel(p)).toMatchObject({nonTaxable:5000});
 p.embeddedGenerateProof.nonVatGroups=[];expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it.each([null,{},'missing',[null]])('rejects malformed explicit taxes instead of treating them as an omitted list (%j)',taxes=>{
 const p=embeddedNonVatPacket();Object.assign(p.taxRows[1].postingBreakdown,{taxes});resnapshotNonVat(p);
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it.each(['missing','extra-vat','amount','subprecision-amount','total','subprecision-total','code','sign','base','sequence','level','currency','result-currency','hotel','result-hotel','changed'] as const)('requires an exact unchanged effective zero-tax calculation per NonVAT amount (%s)',kind=>{
 const p=embeddedNonVatPacket(),g=p.embeddedGenerateProof.nonVatGroups[1],result=g.calculation.result,charge=result.charges[0];
 if(kind==='missing')Reflect.deleteProperty(g,'calculation');
 if(kind==='extra-vat')result.charges.push({...charge,transactionCode:'VAT',basePosting:false,amount:2,sequence:1});
 if(kind==='amount')charge.amount=30.001;
 if(kind==='subprecision-amount')charge.amount=30.0000000000001;
 if(kind==='total')result.totalAmount=31;
 if(kind==='subprecision-total')result.totalAmount=30.0000000000001;
 if(kind==='code')charge.transactionCode='6000';
 if(kind==='sign'){charge.amount=-30;result.totalAmount=-30;}
 if(kind==='base')charge.basePosting=false;
 if(kind==='sequence')charge.sequence=1;
 if(kind==='level')charge.level='TransactionGroup';
 if(kind==='currency')Object.assign(charge,{currencyCode:'USD'});
 if(kind==='result-currency')Object.assign(result,{currencyCode:'USD'});
 if(kind==='hotel')Object.assign(charge,{hotelId:'KAT'});
 if(kind==='result-hotel')Object.assign(result,{hotelId:'KAT'});
 g.calculationAfter=structuredClone(g.calculation);
 if(kind==='changed')g.calculationAfter.result.charges[0].amount=31;
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it.each(['2520','2200'])('does not infer NonVAT from a zero-tax calculator result for an unqualified F&B code (%s)',transactionCode=>{
 const p=embeddedNonVatPacket(),g=p.embeddedGenerateProof.nonVatGroups[1];
 p.postings.invoicePostingsDetails[2].transactionCode=p.taxRows[2].posting.transactionCode=p.postings.trxCodesInfo[2].transactionCode=g.rules.transactionCode.code=g.calculation.result.charges[0].transactionCode=transactionCode;
 p.postings.trxCodesInfo[2].transactionGroup=g.rules.transactionCode.classification.group.code='F&B';g.rules.transactionCode.classification.transactionType.code='FoodAndBeverage';p.postings.trxCodesInfo[2].description=g.rules.transactionCode.description.defaultText='Food charge';
 g.rulesAfter=structuredClone(g.rules);g.calculationAfter=structuredClone(g.calculation);resnapshotNonVat(p);
 expect(()=>invoiceModel(p)).toThrow('document_invoice_embedded_generates_unverified');
});
it('accepts explicitly matching optional calculation currency and hotel scope',()=>{
 const p=embeddedNonVatPacket();for(const g of p.embeddedGenerateProof.nonVatGroups){Object.assign(g.calculation.result,{hotelId:'TSAN',currencyCode:'THB'});Object.assign(g.calculation.result.charges[0],{hotelId:'TSAN',currencyCode:'THB'});g.calculationAfter=structuredClone(g.calculation);}
 expect(invoiceModel(p)).toMatchObject({nonTaxable:5000});
});
