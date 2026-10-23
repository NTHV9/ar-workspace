import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {serviceReaderFixture} from './fixtures/invoice-ar-only-pos-service-reader';
it('captures complete paired mappings and the exact opaque check around the whole source interval',async()=>{
 const {p,reader}=serviceReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);
 expect(q.arOnlyPosServiceProof?.kind).toBe('ar-only-pos-receipt-service-vat7');expect(q.arOnlyPosProof).toBeUndefined();expect(reader.invoiceCheckDetails.mock.calls.map(c=>c[0])).toEqual(['123456789012345678901','123456789012345678901']);expect(reader.invoicePosInterfaces).toHaveBeenCalledTimes(2);expect(reader.invoicePosTransactionCodes.mock.calls.map(c=>c[0])).toEqual(['SYN_POS_','SYN_POS_']);expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['source','rules','receipt','mapping','discovery'] as const)('rejects changed %s without Guest fallback',async kind=>{
 const {p,proof,reader}=serviceReaderFixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoicePostings.mockImplementation(async()=>{if(reads++){
  if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';
  if(kind==='rules')proof.definitions[0].before.transactionCode.description.defaultText='Changed';
  if(kind==='receipt')proof.receipts[0].before.checkDetailsInfo+='Changed';
  if(kind==='mapping')proof.interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitFactor=2;
  if(kind==='discovery')proof.interfaces.discoveryBefore.hotelInterfaces[0].logo='OTHER_';
 }return original();});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
