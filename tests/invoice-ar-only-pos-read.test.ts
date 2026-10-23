import {posReaderFixture} from './fixtures/invoice-ar-only-pos-reader';
import {expect,it,vi} from 'vitest';
import {readArOnlyInvoiceModel,readArOnlyInvoicePacket} from '../worker/invoice/ar-only-read';
import {posPacket} from './fixtures/invoice-ar-only-pos';

it('collects paired POS definitions around two complete source reads without Guest capabilities or simulations',async()=>{
 const {p,reader}=posReaderFixture(),packet=await readArOnlyInvoicePacket(reader,p.manifest);
 expect(packet.arOnlyPosProof?.kind).toBe('ar-only-direct-pos-vat7');expect(packet.currentArTaxProof).toBeUndefined();
 expect(reader.invoiceTransactionCodeRules.mock.calls.map(c=>c[0])).toEqual(['FOOD','SERVICE','POSTED-VAT','FOOD','SERVICE','POSTED-VAT']);
 expect(reader.account).toHaveBeenCalledTimes(2);expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['selected','source','wrapper','balance','metadata'] as const)('detects %s mutation across the POS interval',async kind=>{
 const {p,rules,current,reader}=posReaderFixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoicePostings.mockImplementation(async()=>{if(reads++){
  if(kind==='selected')p.postings.invoicePostingsDetails[1].checkNo='OTHER';
  if(kind==='source')Reflect.set(p.taxRows[3].posting,'cashierInfo',{cashierId:4});
  if(kind==='wrapper')p.taxRows[1].posting.transactionType='NonRevenue';
  if(kind==='balance')current.balance.amount--;
  if(kind==='metadata')rules[0].transactionCode.classification.transactionType.code='Others';
 }return original();});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('rejects unsupported roles without attempting Guest fallback',async()=>{
 const {p,rules,reader}=posReaderFixture();rules[1].transactionCode.classification.group.code='F&B';
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_only_unsupported');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
