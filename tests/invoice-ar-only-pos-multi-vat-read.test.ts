import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {multiVatReaderFixture} from './fixtures/invoice-ar-only-pos-multi-vat-reader';
import {serviceInterfaces} from './fixtures/pos-service-receipt';
it('captures paired sources/rules for positive multiVAT without requesting unused interfaces or receipts',async()=>{
 const {p,reader}=multiVatReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosMultiVatProof?.kind).toBe('ar-only-pos-positive-multi-vat7');expect(q.arOnlyPosMultiVatProof?.interfaces).toBeUndefined();expect(reader.invoicePosInterfaces).not.toHaveBeenCalled();expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
it('captures all paired maps only when strict mapped fees are actually present',async()=>{
 const {p,proof,reader}=multiVatReaderFixture(),interfaces=serviceInterfaces();proof.definitions[1].before.transactionCode.classification.group.code='F&B';Reflect.set(p.postings.trxCodesInfo[2],'transactionGroup','F&B');reader.invoicePosInterfaces.mockImplementation(async()=>structuredClone(interfaces.discoveryBefore));reader.invoicePosTransactionCodes.mockImplementation(async()=>structuredClone(interfaces.mappings[0].before));
 const q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosMultiVatProof?.interfaces?.hotel).toBe('KAT');expect(reader.invoicePosInterfaces).toHaveBeenCalledTimes(2);expect(reader.invoicePosTransactionCodes).toHaveBeenCalledTimes(2);expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();
});
it.each(['source','rules'] as const)('refuses changed multiVAT %s',async kind=>{
 const {p,proof,reader}=multiVatReaderFixture(),original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';else proof.definitions[1].before.transactionCode.description.defaultText='Changed';}return original();});await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();
});
it.each(['maps','discovery','provider'] as const)('refuses multiVAT fee %s evidence failures with zero receipt or Guest fallback',async kind=>{
 const {p,proof,reader}=multiVatReaderFixture(),interfaces=serviceInterfaces();proof.definitions[1].before.transactionCode.classification.group.code='F&B';Reflect.set(p.postings.trxCodesInfo[2],'transactionGroup','F&B');reader.invoicePosInterfaces.mockImplementation(async()=>structuredClone(interfaces.discoveryBefore));reader.invoicePosTransactionCodes.mockImplementation(async()=>structuredClone(interfaces.mappings[0].before));
 if(kind==='provider')reader.invoicePosTransactionCodes.mockRejectedValue(Error('MappingUnavailable'));else{const original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='maps')interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitFactor=2;else interfaces.discoveryBefore.hotelInterfaces[0].logo='OTHER_';}return original();});}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow(kind==='provider'?'MappingUnavailable':'document_source_changed');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
