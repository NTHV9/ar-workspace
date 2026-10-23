import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {zeroVatNetReaderFixture} from './fixtures/invoice-ar-only-zero-vat-net-reader';
import {nonVatReaderFixture} from './fixtures/invoice-ar-only-nonvat-reader';
it.each([false,true])('pairs complete sources and exact signed zero calculation layouts (inclusive=%s)',async inclusive=>{
 const {p,reader}=zeroVatNetReaderFixture(inclusive),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyZeroVatNetProof?.kind).toBe('ar-only-direct-zero-vat-net');expect(q.arOnlyNonVatProof).toBeUndefined();expect(arOnlyInvoiceModel(q).nonTaxable).toBe(0);expect(reader.invoiceChargeSimulation.mock.calls).toEqual([['ZERO-NET',20],['ZERO-NET',20]]);expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('retains the existing all-explicit-NonVAT route and calculation call contract',async()=>{
 const {p,reader}=nonVatReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyNonVatProof?.kind).toBe('ar-only-direct-nonvat');expect(q.arOnlyZeroVatNetProof).toBeUndefined();expect(reader.invoiceChargeSimulation.mock.calls).toEqual([['6000',20],['6002',-10],['6000',20],['6002',-10]]);
});
it.each(['source','rules','calculation','provider'] as const)('rejects zero-net %s changes without native fallback',async kind=>{
 const {p,proof,reader}=zeroVatNetReaderFixture();if(kind==='provider')reader.invoiceChargeSimulation.mockRejectedValue(Error('CalcUnavailable'));else{const original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';if(kind==='rules')proof.groups[0].rules.transactionCode.compTransaction=true;if(kind==='calculation')proof.groups[0].calculation.result.totalAmount=21;}return original();});}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow(kind==='provider'?'CalcUnavailable':'document_source_changed');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
