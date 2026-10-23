import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {serviceReaderFixture} from './fixtures/invoice-ar-only-pos-service-reader';
function fixture(){const f=serviceReaderFixture();for(const e of f.proof.definitions)Object.assign(e.before.transactionCode,{compTransaction:false,trxSetup:{...e.before.transactionCode.trxSetup,manualPosting:false}});return f;}
it('plans mapped fees before any receipt request and captures paired complete mappings',async()=>{
 const {p,reader}=fixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);
 expect(q.arOnlyPosFeeProof?.kind).toBe('ar-only-pos-mapped-fee-vat7');expect(q.arOnlyPosServiceProof).toBeUndefined();expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.invoicePosInterfaces).toHaveBeenCalledTimes(2);expect(reader.invoicePosTransactionCodes).toHaveBeenCalledTimes(2);expect(reader.folioReport).not.toHaveBeenCalled();
});
it.each(['source','rules','mapping','discovery'] as const)('rejects changed mapped fee %s without receipt or native fallback',async kind=>{
 const {p,proof,reader}=fixture(),original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){
 if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';if(kind==='rules')proof.definitions[1].before.transactionCode.description.defaultText='Changed';if(kind==='mapping')proof.interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitFactor=2;if(kind==='discovery')proof.interfaces.discoveryBefore.hotelInterfaces[0].logo='OTHER_';}return original();});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
import {posPacket} from './fixtures/invoice-ar-only-pos';
import {money} from './fixtures/invoice-packet';
it.each([false,true])('keeps a mapped-fee group with independent ordinary signed partitions on its original path (positive+negative: %s)',async bothSigns=>{
 const {p,proof,reader}=fixture(),negative=posPacket(-1),selected=structuredClone(negative.p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(negative.p.taxRows.slice(3)),native=structuredClone(negative.rules[1]);
 native.transactionCode.code='NATIVE-SVC';Object.assign(native.transactionCode.trxSetup,{manualPosting:false});Object.assign(native.transactionCode,{compTransaction:false});proof.definitions.push({before:native,after:structuredClone(native)});
 selected.forEach(s=>{s.transactionNo+=10;s.transactionDate='2026-01-04';if(s.transactionCode==='SERVICE')s.transactionCode='NATIVE-SVC';});entries.forEach(e=>{e.posting.transactionNo+=10;Reflect.set(e.posting,'transactionDate','2026-01-04');if(Reflect.get(e.posting,'transactionCode')==='SERVICE')Reflect.set(e.posting,'transactionCode','NATIVE-SVC');});
 if(bothSigns){const positive=posPacket(),moreSelected=structuredClone(positive.p.postings.invoicePostingsDetails.slice(1)),moreEntries=structuredClone(positive.p.taxRows.slice(3));moreSelected.forEach(s=>{s.transactionNo+=20;s.transactionDate='2026-01-04';if(s.transactionCode==='SERVICE')s.transactionCode='NATIVE-SVC';});moreEntries.forEach(e=>{e.posting.transactionNo+=20;Reflect.set(e.posting,'transactionDate','2026-01-04');if(Reflect.get(e.posting,'transactionCode')==='SERVICE')Reflect.set(e.posting,'transactionCode','NATIVE-SVC');});selected.push(...moreSelected);entries.push(...moreEntries);p.manifest.open+=1177;}
 p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);p.postings.trxCodesInfo.push(Object.assign({...p.postings.trxCodesInfo[2]},{transactionCode:'NATIVE-SVC',transactionGroup:'SVC'}));p.manifest.open-=1177;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 // Existing reader closure snapshots the current invoice for both account reads.
 reader.account.mockImplementation(async()=>({accountDetails:{...structuredClone(p.account),invoices:[{...structuredClone(p.invoice),reservationId:{id:'777'},internalFolioWindowID:'456'}]}}));
 reader.financialTransactionDetail.mockImplementation(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[{...structuredClone(p.invoice),reservationId:{id:'777'},internalFolioWindowID:'456'}]}]}));
 const q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosFeeProof?.kind).toBe('ar-only-pos-mapped-fee-vat7');expect(q.arOnlyPosDiscountProof).toBeUndefined();expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect((await readArOnlyInvoiceModel(reader,p.manifest)).vat).toBe(bothSigns?29387:21687);
});
