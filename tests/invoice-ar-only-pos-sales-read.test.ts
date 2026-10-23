import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {salesReaderFixture} from './fixtures/invoice-ar-only-pos-sales-reader';
it('pairs actual source/rules/complete ST mappings without receipt or Guest capabilities',async()=>{
 const {p,reader}=salesReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosSalesProof?.kind).toBe('ar-only-pos-mapped-sales-vat7');expect(reader.invoicePosInterfaces).toHaveBeenCalledTimes(2);expect(reader.invoicePosTransactionCodes).toHaveBeenCalledTimes(2);expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
it.each(['source','rules','maps','discovery','provider'] as const)('refuses mapped sales %s failures with zero alternative-provider fallback',async kind=>{
 const {p,proof,reader}=salesReaderFixture();if(kind==='provider')reader.invoicePosTransactionCodes.mockRejectedValue(Error('MapsUnavailable'));else{const original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';if(kind==='rules')proof.definitions[0].before.transactionCode.description.defaultText='Changed';if(kind==='maps')proof.interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitFactor=2;if(kind==='discovery')proof.interfaces.discoveryBefore.hotelInterfaces[0].logo='OTHER_';}return original();});}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow(kind==='provider'?'MapsUnavailable':'document_source_changed');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
