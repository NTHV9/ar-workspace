import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {posFeePacket} from './fixtures/invoice-ar-only-pos-fee';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
const snapshot=(p:ReturnType<typeof posFeePacket>['p'],proof:ReturnType<typeof posFeePacket>['proof'])=>{proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));};
it('qualifies the exact selected taxable POS portion without requiring a whole receipt',()=>{
 const {p,proof}=posFeePacket(),m=arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}));expect(m).toMatchObject({gross:449200,vat:29387,nonTaxable:0,taxableNet:419813});
});
it.each(['nonTaxable','manual','comp','generates','associated','adjustments','negative','multi-vat','sibling','hotel','missing-map','conflicting-map','tip-only','untyped','changed-rules','changed-map','changed-source','native','receipt-proof'] as const)('refuses unproven mapped fee: %s',kind=>{
 const {p,proof}=posFeePacket(),fee=proof.definitions[1].before.transactionCode,info=proof.interfaces.mappings[0].before.details.transactionsInfo;
 if(kind==='nonTaxable')fee.trxSetup.nonTaxable=true;if(kind==='manual')Reflect.set(fee.trxSetup,'manualPosting',true);if(kind==='comp')Reflect.set(fee,'compTransaction',true);
 if(kind==='generates')Reflect.set(fee.generatesSetup,'generates',[{transactionCode:'VAT'}]);if(kind==='associated')Reflect.set(fee,'associatedTransactionCodes',[{}]);if(kind==='adjustments')Reflect.set(fee,'transactionAdjustments',[{}]);
 if(kind==='negative'){p.postings.invoicePostingsDetails[2].debitAmount.amount=-100;Reflect.set(p.taxRows[4].posting,'deferredTax',true);}
 if(kind==='multi-vat'||kind==='sibling'){const extra=structuredClone(p.taxRows[kind==='multi-vat'?5:3]);extra.posting.transactionNo=99999;p.taxRows.push(extra);if(kind==='multi-vat'){const s=structuredClone(p.postings.invoicePostingsDetails[3]);s.transactionNo=99999;p.postings.invoicePostingsDetails.push(s);}}
 if(kind==='hotel')proof.interfaces.hotel='TSK';if(kind==='missing-map')proof.interfaces.mappings=[];
 if(kind==='conflicting-map')info.itemizers[1].splitCode='ST1';if(kind==='tip-only'){Reflect.set(info.transactionCodes[0],'tipCode','SERVICE');info.transactionCodes[0].itemizersShortInfo=[];}
 if(kind==='untyped')info.transactionCodes[0].code='SERVICE';
 proof.definitions.forEach(e=>e.after=structuredClone(e.before));proof.interfaces.mappings.forEach(e=>e.after=structuredClone(e.before));snapshot(p,proof);
 if(kind==='changed-rules')proof.definitions[1].after.transactionCode.description.defaultText='Changed';if(kind==='changed-map')proof.interfaces.mappings[0].after.details.transactionsInfo.itemizers[1].splitFactor=2;if(kind==='changed-source')p.postings.invoicePostingsDetails[1].reference='Changed';
 const q=Object.assign(p,{arOnlyPosFeeProof:proof});if(kind==='native')Object.assign(q,{nativeTaxControls:undefined});if(kind==='receipt-proof')Object.assign(q,{arOnlyPosServiceProof:{}});
 expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
import {money} from './fixtures/invoice-packet';
function replaceAmount(p:ReturnType<typeof posFeePacket>['p'],id:number,value:number){
 const selected=p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!,source=p.taxRows.find(e=>e.posting.transactionNo===id)!,delta=value-selected.debitAmount.amount;
 selected.debitAmount=money(value);Object.assign(source.posting,{debitAmount:money(value),postedAmount:money(value),transactionAmount:value});if('postingBreakdown'in source)Object.assign(source.postingBreakdown,{grossAmount:money(value),netAmount:money(value)});
 p.manifest.open+=delta;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
}
it('preserves a mapped fee without inventing a ten-percent service assertion',()=>{
 const {p,proof}=posFeePacket();replaceAmount(p,60002,50);replaceAmount(p,60003,73.5);snapshot(p,proof);
 expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}))).toMatchObject({gross:443850,vat:29037,nonTaxable:0,taxableNet:414813});
});
it('refuses adjusted base when actual VAT no longer proves seven percent',()=>{
 const {p,proof}=posFeePacket();replaceAmount(p,60001,900);snapshot(p,proof);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}))).toThrow('partition-vat');
});
it('checks every distinct fee code and allows multiple independently numbered SC mappings',()=>{
 const {p,proof}=posFeePacket();replaceAmount(p,60002,50);
 const selected=structuredClone(p.postings.invoicePostingsDetails[2]),source=structuredClone(p.taxRows[4]),definition=structuredClone(proof.definitions[1]);selected.transactionNo=60004;selected.transactionCode='SECOND-FEE';source.posting.transactionNo=60004;Reflect.set(source.posting,'transactionCode','SECOND-FEE');definition.before.transactionCode.code='SECOND-FEE';definition.after=structuredClone(definition.before);
 p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);p.postings.trxCodesInfo.push({...p.postings.trxCodesInfo[2],transactionCode:'SECOND-FEE'});proof.definitions.push(definition);p.manifest.open+=50;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 const mapping=proof.interfaces.mappings[0];mapping.before.details.transactionsInfo.transactionCodes[0].itemizersShortInfo.push({code:'SECOND-FEE',itemNumber:22});mapping.before.details.transactionsInfo.itemizers.push({splitCode:'SC3',splitPost:22,splitFactor:1});mapping.after=structuredClone(mapping.before);snapshot(p,proof);
 expect(arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof})).gross).toBe(449200);
 mapping.before.details.transactionsInfo.itemizers[2].splitCode='TX1';mapping.after=structuredClone(mapping.before);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}))).toThrow();
});
it('refuses cancelling negative fee atoms even when the net partition still matches VAT',()=>{
 const {p,proof}=posFeePacket(),selected=structuredClone(p.postings.invoicePostingsDetails[2]),source=structuredClone(p.taxRows[4]);selected.transactionNo=60004;source.posting.transactionNo=60004;p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);p.manifest.open+=100;replaceAmount(p,60002,200);replaceAmount(p,60004,-100);p.invoice.amount=p.invoice.balance=money(p.manifest.open);snapshot(p,proof);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}))).toThrow();
});
it.each(['wrapper-first','pos-first'])('preclaims fee IDs against embedded VAT aliases: %s',order=>{
 const {p,proof}=posFeePacket(),row=p.taxRows[1];if(!('postingBreakdown'in row))throw Error('fixture');Reflect.get(row.postingBreakdown,'taxes')[1].transactionNo=60002;
 if(order==='pos-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}snapshot(p,proof);expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}))).toThrow('tax_scope_invalid');
});

it('refuses two actual VAT atoms whose summed money matches the expected partition',()=>{
 const {p,proof}=posFeePacket(),selected=structuredClone(p.postings.invoicePostingsDetails[3]),source=structuredClone(p.taxRows[5]);selected.transactionNo=60004;source.posting.transactionNo=60004;p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);p.manifest.open+=77;replaceAmount(p,60003,40);replaceAmount(p,60004,37);snapshot(p,proof);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosFeeProof:proof}))).toThrow('document_invoice_ar_only_pos_fee_unverified');
});
