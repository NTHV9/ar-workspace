import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {signedMultiVatReaderFixture} from './fixtures/invoice-ar-only-pos-signed-multi-vat-reader';
import {multiVatReaderFixture} from './fixtures/invoice-ar-only-pos-multi-vat-reader';
it('captures only paired source/rules for signed multiVAT and never requests maps, receipts or Guest capabilities',async()=>{
 const {p,reader}=signedMultiVatReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosSignedMultiVatProof?.kind).toBe('ar-only-pos-signed-multi-vat7');expect(reader.invoicePosInterfaces).not.toHaveBeenCalled();expect(reader.invoicePosTransactionCodes).not.toHaveBeenCalled();expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('retains the existing wholly positive multiVAT profile',async()=>{
 const {p,reader}=multiVatReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosMultiVatProof?.kind).toBe('ar-only-pos-positive-multi-vat7');expect(q.arOnlyPosSignedMultiVatProof).toBeUndefined();
});
it.each(['source','rules','provider'] as const)('rejects signed multiVAT %s changes without alternative-provider fallback',async kind=>{
 const {p,proof,reader}=signedMultiVatReaderFixture();if(kind==='provider')reader.invoiceTransactionCodeRules.mockRejectedValue(Error('RulesUnavailable'));else{const original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='source')p.postings.invoicePostingsDetails[1].reference='Changed';else proof.definitions[1].before.transactionCode.description.defaultText='Changed';}return original();});}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow(kind==='provider'?'RulesUnavailable':'document_source_changed');expect(reader.invoicePosInterfaces).not.toHaveBeenCalled();expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
import {posMultiVatPacket} from './fixtures/invoice-ar-only-pos-multi-vat';
import {money} from './fixtures/invoice-packet';
it('selects signed proof when another wholly positive repeated VAT check also exists',async()=>{
 const {p,reader}=signedMultiVatReaderFixture(),positive=posMultiVatPacket(),selected=structuredClone(positive.p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(positive.p.taxRows.slice(3));selected.forEach(s=>{s.transactionNo+=10;s.transactionDate='2026-01-04';});entries.forEach(e=>{e.posting.transactionNo+=10;Reflect.set(e.posting,'transactionDate','2026-01-04');});p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);p.manifest.open+=1177;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 const current=()=>({...structuredClone(p.invoice),reservationId:{id:'777'},internalFolioWindowID:'456'});reader.account.mockImplementation(async()=>({accountDetails:{...structuredClone(p.account),invoices:[current()]}}));reader.financialTransactionDetail.mockImplementation(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[current()]}]}));const q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosSignedMultiVatProof?.kind).toBe('ar-only-pos-signed-multi-vat7');expect(q.arOnlyPosMultiVatProof).toBeUndefined();
});
import {signedFeeReaderFixture} from './fixtures/invoice-ar-only-pos-signed-fee-reader';
it('captures paired SC maps only for separate ordinary positive fee checks composed with signed native VAT',async()=>{
 const {p,reader}=signedFeeReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlyPosSignedMultiVatProof?.interfaces?.hotel).toBe('KAT');expect(reader.invoicePosInterfaces).toHaveBeenCalledTimes(2);expect(reader.invoicePosTransactionCodes).toHaveBeenCalledTimes(2);expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
it.each(['maps','discovery','provider'] as const)('refuses signed fee %s failures without an alternate proof provider',async kind=>{
 const {p,proof,reader}=signedFeeReaderFixture();if(kind==='provider')reader.invoicePosTransactionCodes.mockRejectedValue(Error('MapsUnavailable'));else{const original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='maps')proof.interfaces.mappings[0].before.details.transactionsInfo.itemizers[1].splitFactor=2;else proof.interfaces.discoveryBefore.hotelInterfaces[0].logo='OTHER_';}return original();});}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow(kind==='provider'?'MapsUnavailable':'document_source_changed');expect(reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();
});
