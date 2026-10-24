import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {posDiscountPacket} from './fixtures/invoice-ar-only-pos-discount';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
const snapshot=(p:ReturnType<typeof posDiscountPacket>['p'],proof:ReturnType<typeof posDiscountPacket>['proof'])=>{proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));};
it('uses the actual negative mapped discount and actual posted VAT on the signed net taxable base',()=>{
 const {p,proof}=posDiscountPacket(),m=arOnlyInvoiceModel(Object.assign(p,{arOnlyPosDiscountProof:proof}));expect(m).toMatchObject({gross:425660,vat:27847,nonTaxable:0,taxableNet:397813});expect(m.lines).toHaveLength(5);
});
it.each(['name-only','dc0','factor','mixed-st','unmatched','default','missing-map','metadata','positive-discount','negative-service','negative-vat','exhaust-base','wrong-vat','source','rules','mapping','native','fee-proof','sibling','nested','reverse'] as const)('rejects unproven discount: %s',kind=>{
 const {p,proof,amount}=posDiscountPacket(),mapping=proof.interfaces.mappings[0],info=mapping.before.details.transactionsInfo;
 if(kind==='name-only')info.itemizers=[];if(kind==='dc0')info.itemizers.pop();if(kind==='factor')info.itemizers[1].splitFactor=2;if(kind==='mixed-st')info.itemizers[1].splitCode='ST1';if(kind==='unmatched')info.transactionCodes[0].itemizersShortInfo[0].itemNumber=99;if(kind==='default')info.transactionCodes[0].code='DISCOUNT';if(kind==='missing-map')proof.interfaces.mappings=[];
 if(kind==='metadata')proof.definitions[3].before.transactionCode.trxSetup.nonTaxable=true;
 if(kind==='positive-discount')amount(60004,200);if(kind==='negative-service')amount(60002,-80);if(kind==='negative-vat')amount(60003,-61.6);if(kind==='exhaust-base')amount(60004,-1000);if(kind==='wrong-vat')amount(60003,62.6);
 if(kind==='sibling'||kind==='reverse'){const child=structuredClone(p.taxRows[3]);child.posting.transactionNo=99999;if(kind==='reverse'){Reflect.deleteProperty(child.posting,'checkNo');Reflect.set(child.posting,'referenceTransactionNo',60004);}p.taxRows.push(child);}
 if(kind==='nested')Reflect.set(p.taxRows[6].posting,'subPostings',[{transactionNo:99999,transactionType:'Tax'}]);
 proof.definitions.forEach(e=>e.after=structuredClone(e.before));mapping.after=structuredClone(mapping.before);snapshot(p,proof);
 if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';if(kind==='rules')proof.definitions[3].after.transactionCode.description.defaultText='Changed';if(kind==='mapping')mapping.after.details.transactionsInfo.itemizers[1].splitFactor=2;
 const q=Object.assign(p,{arOnlyPosDiscountProof:proof});if(kind==='native')Object.assign(q,{nativeTaxControls:undefined});if(kind==='fee-proof')Object.assign(q,{arOnlyPosFeeProof:{}});expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
it('refuses positive reuse of a proven DC code instead of allowing discount cancellation',()=>{
 const {p,proof,amount}=posDiscountPacket(),selected=structuredClone(p.postings.invoicePostingsDetails[4]),source=structuredClone(p.taxRows[6]);selected.transactionNo=60005;source.posting.transactionNo=60005;p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);p.manifest.open-=200;amount(60005,100);amount(60004,-300);snapshot(p,proof);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosDiscountProof:proof}))).toThrow('document_invoice_ar_only_pos_discount_unverified');
});
it.each(['wrapper-first','pos-first'])('claims discount IDs before embedded tax structures: %s',order=>{
 const {p,proof}=posDiscountPacket(),row=p.taxRows[1];if(!('postingBreakdown'in row))throw Error('fixture');Reflect.get(row.postingBreakdown,'taxes')[1].transactionNo=60004;
 if(order==='pos-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}snapshot(p,proof);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosDiscountProof:proof}))).toThrow('tax_scope_invalid');
});
it('checks net VAT independently when errors from two receipt scopes cancel overall',()=>{
 const {p,proof,amount}=posDiscountPacket(),selected=structuredClone(p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(p.taxRows.slice(3));
 selected.forEach(s=>{s.transactionNo+=10;s.transactionDate='2026-01-04';});entries.forEach(e=>{e.posting.transactionNo+=10;Reflect.set(e.posting,'transactionDate','2026-01-04');});p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);p.manifest.open+=941.6;p.invoice.amount=p.invoice.balance={amount:p.manifest.open,currencyCode:'THB'};snapshot(p,proof);
 expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosDiscountProof:proof})).vat).toBe(34007);
 amount(60003,62.6);amount(60013,60.6);snapshot(p,proof);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosDiscountProof:proof}))).toThrow('document_invoice_ar_only_pos_discount_unverified');
});
import {canPlanArOnlyPosDiscount} from '../worker/invoice/ar-only-pos-discount-proof';
import {inspectArOnlyPos} from '../worker/invoice/ar-only-pos-proof';
import {posPacket,withPosProof} from './fixtures/invoice-ar-only-pos';
it('preserves independently verified ordinary negative POS partitions instead of guessing a discount',()=>{
 const {p,rules}=posPacket(-1);for(const r of rules){Object.assign(r.transactionCode.trxSetup,{manualPosting:false});Object.assign(r.transactionCode,{compTransaction:false});}
 expect(canPlanArOnlyPosDiscount(inspectArOnlyPos(p),rules.map(before=>({before,after:structuredClone(before)})),p.manifest.hotel)).toBe(false);
 expect(arOnlyInvoiceModel(withPosProof(p,rules))).toMatchObject({gross:213800,vat:13987,nonTaxable:0});
});
it('retains ordinary positive and negative partitions alongside an independently mapped discount scope',()=>{
 const {p,proof}=posDiscountPacket();for(const [offset,sign] of [[10,1],[20,-1]] as const){const ordinary=posPacket(sign),selected=structuredClone(ordinary.p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(ordinary.p.taxRows.slice(3));selected.forEach(s=>{s.transactionNo+=offset;s.transactionDate='2026-01-04';});entries.forEach(e=>{e.posting.transactionNo+=offset;Reflect.set(e.posting,'transactionDate','2026-01-04');});p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);}
 snapshot(p,proof);expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosDiscountProof:proof}))).toMatchObject({gross:425660,vat:27847,nonTaxable:0});
});
