import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {posServicePacket} from './fixtures/invoice-ar-only-pos-service';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
const resnapshot=(p:ReturnType<typeof posServicePacket>['p'],proof:ReturnType<typeof posServicePacket>['proof'])=>{proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));};
it('uses receipt and typed SC membership together while preserving every posted amount',()=>{
 const {p,proof}=posServicePacket(),m=arOnlyInvoiceModel(Object.assign(p,{arOnlyPosServiceProof:proof}));
 expect(m).toMatchObject({gross:449200,vat:29387,nonTaxable:0,taxableNet:419813});expect(m.lines).toHaveLength(4);
});
it.each(['receipt-date','receipt-change','receipt-split','receipt-tip','receipt-key','receipt-hotel','mapping-change','missing-map','metadata-change','source-change','native','pos','nonvat','ar','duplicate-receipt','missing-receipt','extra-receipt'] as const)('rejects incomplete service proof: %s',kind=>{
 const {p,proof}=posServicePacket();
 if(kind==='receipt-date'){proof.receipts[0].before.checkDetailsInfo=proof.receipts[0].before.checkDetailsInfo.replaceAll("2 Jan'26","3 Jan'26");proof.receipts[0].after=structuredClone(proof.receipts[0].before);}
 if(kind==='receipt-change')proof.receipts[0].after.checkDetailsInfo+='Changed';
 if(kind==='receipt-split'){proof.receipts[0].before.checkDetailsInfo=proof.receipts[0].before.checkDetailsInfo.replace('ROOM CHARGE THB1,177.00','ROOM CHARGE THB500.00\nROOM CHARGE THB677.00');proof.receipts[0].after=structuredClone(proof.receipts[0].before);}
 if(kind==='receipt-tip'){proof.interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitCode='SC1';proof.interfaces.mappings[0].after=structuredClone(proof.interfaces.mappings[0].before);proof.receipts[0].before.checkDetailsInfo=proof.receipts[0].before.checkDetailsInfo.replace('Service Charge 10%','Tips');proof.receipts[0].after=structuredClone(proof.receipts[0].before);}
 if(kind==='receipt-key')proof.receipts[0].checkNumber='0099';if(kind==='receipt-hotel')proof.receipts[0].hotel='TSK';
 if(kind==='mapping-change')proof.interfaces.mappings[0].after.details.transactionsInfo.itemizers[1].splitFactor=2;
 if(kind==='missing-map')proof.interfaces.mappings=[];
 if(kind==='metadata-change')proof.definitions[0].after.transactionCode.description.defaultText='Changed';
 if(kind==='source-change')p.postings.invoicePostingsDetails[1].reference='Changed';
 if(kind==='duplicate-receipt')proof.receipts.push(structuredClone(proof.receipts[0]));if(kind==='missing-receipt')proof.receipts=[];if(kind==='extra-receipt')proof.receipts.push({...structuredClone(proof.receipts[0]),checkNumber:'OTHER'});
 const q=Object.assign(p,{arOnlyPosServiceProof:proof});if(kind==='native')Object.assign(q,{nativeTaxControls:undefined});if(kind==='pos')Object.assign(q,{arOnlyPosProof:{}});if(kind==='nonvat')Object.assign(q,{arOnlyNonVatProof:{}});if(kind==='ar')Object.assign(q,{arDetails:[{ids:['1'],response:{}}]});
 expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
it.each(['wrapper-first','pos-first'])('preclaims receipt-qualified POS IDs before other tax structures: %s',order=>{
 const {p,proof}=posServicePacket(),part=p.taxRows[1];if(!('postingBreakdown'in part))throw Error('fixture');const taxes=Reflect.get(part.postingBreakdown,'taxes');taxes[1].transactionNo=60002;
 if(order==='pos-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}resnapshot(p,proof);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosServiceProof:proof}))).toThrow('document_invoice_tax_scope_invalid');
});
it('rejects unexplained source children even when their check number is omitted',()=>{
 const {p,proof}=posServicePacket(),child=structuredClone(p.taxRows[4]);child.posting.transactionNo=99999;Reflect.deleteProperty(child.posting,'checkNo');Object.assign(child.posting,{referenceTransactionNo:60002});p.taxRows.push(child);resnapshot(p,proof);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosServiceProof:proof}))).toThrow('linked-descendant');
});
it.each(['deferred','nested','malformed','selected-deferred','selected-nested'] as const)('rejects hidden POS descendants: %s',kind=>{
 const {p,proof}=posServicePacket(),target=kind.startsWith('selected')?p.postings.invoicePostingsDetails[2]:p.taxRows[4].posting;
 if(kind.includes('deferred'))Reflect.set(target,'deferredTax',true);else Reflect.set(target,'subPostings',kind==='malformed'?{}:[{transactionNo:99991,transactionType:'Tax'}]);resnapshot(p,proof);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosServiceProof:proof}))).toThrow();
});
it('refuses a contradictory optional receipt check echo',()=>{
 const {p,proof}=posServicePacket();Object.assign(proof.receipts[0].before,{checkNumber:'OTHER'});proof.receipts[0].after=structuredClone(proof.receipts[0].before);
 expect(()=>arOnlyInvoiceModel(Object.assign(p,{arOnlyPosServiceProof:proof}))).toThrow();
});
