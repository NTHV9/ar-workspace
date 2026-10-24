import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {posMultiVatPacket} from './fixtures/invoice-ar-only-pos-multi-vat';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
const snapshot=(p:ReturnType<typeof posMultiVatPacket>['p'],proof:ReturnType<typeof posMultiVatPacket>['proof'])=>{proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));};
it('preserves both actual positive VAT postings and the exact taxable base',()=>{
 const {p,proof}=posMultiVatPacket();expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:proof}))).toMatchObject({gross:449200,vat:29387,nonTaxable:0,taxableNet:419813});
});
it.each(['negative-base','negative-service','negative-vat','zero','no-base','wrong-vat','duplicate','nested','reverse','window','cashier','source','rules','unknown','native','fee-proof','single-vat'] as const)('rejects unproven positive multiVAT: %s',kind=>{
 const {p,proof,amount}=posMultiVatPacket();if(kind==='negative-base')amount(60001,-1000);if(kind==='negative-service')amount(60002,-100);if(kind==='negative-vat')amount(60004,-37);if(kind==='zero')amount(60004,0);if(kind==='wrong-vat')amount(60004,38);
 if(kind==='no-base')proof.definitions[0].before.transactionCode.classification.transactionType.code='NonRevenue';if(kind==='unknown')proof.definitions[1].before.transactionCode.classification.transactionType.code='Others';
 if(kind==='nested')Reflect.set(p.taxRows[6].posting,'subPostings',[{transactionNo:99999,transactionType:'Tax'}]);if(kind==='reverse'){const c=structuredClone(p.taxRows[3]);c.posting.transactionNo=99999;Reflect.deleteProperty(c.posting,'checkNo');Reflect.set(c.posting,'referenceTransactionNo',60003);p.taxRows.push(c);}
 if(kind==='window')Reflect.deleteProperty(p.taxRows[6].posting,'folioWindowNo');if(kind==='cashier')Reflect.set(p.taxRows[6].posting,'cashierInfo',{cashierId:999});if(kind==='single-vat'){p.postings.invoicePostingsDetails.pop();p.taxRows.pop();p.manifest.open-=37;p.invoice.amount=p.invoice.balance={amount:p.manifest.open,currencyCode:'THB'};}
 proof.definitions.forEach(e=>e.after=structuredClone(e.before));snapshot(p,proof);if(kind==='duplicate')p.postings.invoicePostingsDetails[4].transactionNo=60003;if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';if(kind==='rules')proof.definitions[1].after.transactionCode.description.defaultText='Changed';
 const q=Object.assign(p,{arOnlyPosMultiVatProof:proof});if(kind==='native')Object.assign(q,{nativeTaxControls:undefined});if(kind==='fee-proof')Object.assign(q,{arOnlyPosFeeProof:{}});expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
import {serviceInterfaces} from './fixtures/pos-service-receipt';
import {posPacket} from './fixtures/invoice-ar-only-pos';
import {money} from './fixtures/invoice-packet';
it('retains a strict mapped fee that is not ten percent beside two actual VAT postings',()=>{
 const {p,proof,amount}=posMultiVatPacket();proof.definitions[1].before.transactionCode.classification.group.code='F&B';proof.definitions[1].after=structuredClone(proof.definitions[1].before);Reflect.set(p.postings.trxCodesInfo[2],'transactionGroup','F&B');amount(60002,50);amount(60004,33.5);snapshot(p,proof);
 const interfaces=serviceInterfaces(),envelope=Object.assign(proof,{interfaces});expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:envelope}))).toMatchObject({gross:443850,vat:29037,nonTaxable:0,taxableNet:414813});
 interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitCode='DC1';interfaces.mappings[0].after=structuredClone(interfaces.mappings[0].before);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:envelope}))).toThrow();
});
it('refuses cancellation of VAT errors across two independent positive multiVAT scopes',()=>{
 const {p,proof,amount}=posMultiVatPacket(),selected=structuredClone(p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(p.taxRows.slice(3));selected.forEach(s=>{s.transactionNo+=10;s.transactionDate='2026-01-04';});entries.forEach(e=>{e.posting.transactionNo+=10;Reflect.set(e.posting,'transactionDate','2026-01-04');});p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);p.manifest.open+=1177;p.invoice.amount=p.invoice.balance=money(p.manifest.open);snapshot(p,proof);
 expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:proof})).vat).toBe(37087);amount(60003,41);amount(60013,39);snapshot(p,proof);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:proof}))).toThrow('multi_vat_unverified');
});
it.each(['wrapper-first','pos-first'])('preclaims every multiVAT ID against embedded structures: %s',order=>{
 const {p,proof}=posMultiVatPacket(),row=p.taxRows[1];if(!('postingBreakdown'in row))throw Error('fixture');Reflect.get(row.postingBreakdown,'taxes')[1].transactionNo=60004;if(order==='pos-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}snapshot(p,proof);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:proof}))).toThrow('tax_scope_invalid');
});
it('retains independent ordinary positive and negative partitions beside a positive multiVAT scope',()=>{
 const {p,proof}=posMultiVatPacket();for(const [offset,sign] of [[10,1],[20,-1]] as const){const ordinary=posPacket(sign),selected=structuredClone(ordinary.p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(ordinary.p.taxRows.slice(3));selected.forEach(s=>{s.transactionNo+=offset;s.transactionDate='2026-01-04';});entries.forEach(e=>{e.posting.transactionNo+=offset;Reflect.set(e.posting,'transactionDate','2026-01-04');});p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);}snapshot(p,proof);expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosMultiVatProof:proof}))).toMatchObject({gross:449200,vat:29387});
});
