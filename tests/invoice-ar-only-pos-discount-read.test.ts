import {money} from './fixtures/invoice-packet';
import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {discountReaderFixture} from './fixtures/invoice-ar-only-pos-discount-reader';
it('plans negative mapped discount proof before any receipt request and captures all mapping pairs',async()=>{
 const {p,reader}=discountReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);
 expect(q.arOnlyPosDiscountProof?.kind).toBe('ar-only-pos-mapped-discount-vat7');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.invoicePosInterfaces).toHaveBeenCalledTimes(2);expect(reader.invoicePosTransactionCodes).toHaveBeenCalledTimes(2);expect(reader.folioReport).not.toHaveBeenCalled();
});
it.each(['source','rules','mapping','discovery'] as const)('refuses changed discount %s without provider fallback',async kind=>{
 const {p,proof,reader}=discountReaderFixture(),original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){
 if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';if(kind==='rules')proof.definitions[3].before.transactionCode.description.defaultText='Changed';if(kind==='mapping')proof.interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitFactor=2;if(kind==='discovery')proof.interfaces.discoveryBefore.hotelInterfaces[0].logo='OTHER_';}return original();});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
it('does not fall back to receipt evidence after a mapping provider fails',async()=>{
 const {p,reader}=discountReaderFixture();reader.invoicePosTransactionCodes.mockRejectedValue(Error('MappingUnavailable'));
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('MappingUnavailable');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});

it('selects posted-native V2 when a valid discount-shaped scope coexists with ordinary repeated VAT',async()=>{const {p,reader}=discountReaderFixture();for(const [copy,key,amount]of [[60001,60010,100],[60003,60011,3],[60003,60012,4]]){const selected=structuredClone(p.postings.invoicePostingsDetails.find(s=>s.transactionNo===copy)!),entry=structuredClone(p.taxRows.find(e=>e.posting.transactionNo===copy)!);selected.transactionNo=key;selected.checkNo='OTHER';selected.debitAmount=money(amount);Object.assign(entry.posting,{transactionNo:key,checkNo:'OTHER',debitAmount:money(amount),postedAmount:money(amount),transactionAmount:amount});if(!('postingBreakdown'in entry))throw Error('fixture');entry.postingBreakdown.grossAmount=entry.postingBreakdown.netAmount=money(amount);p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(entry);}p.manifest.open+=107;p.invoice.amount.amount=p.invoice.balance.amount=p.manifest.open;const q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlySourceClaimsProof?.version).toBe(2);expect(q.arOnlyPosDiscountProof).toBeUndefined();expect(q.arOnlyPosMultiVatProof).toBeUndefined();expect(reader.invoicePosInterfaces).not.toHaveBeenCalled();expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();});
