import {it,expect,vi} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {readArOnlyInvoicePacket,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import {OperaError} from '../worker/opera/client';
import {paymentOffsetFixture} from './fixtures/invoice-payment-offset-display';
import {posDisplayFixture} from './fixtures/invoice-pos-display';
import {posReaderFixture} from './fixtures/invoice-ar-only-pos-reader';
const now=new Date('2026-10-23T00:00:00Z');
function readerFixture(){const f=posReaderFixture(),city=paymentOffsetFixture();Reflect.set(f.p,'taxRows',[...f.p.taxRows,...city.payments.map(posting=>({posting:structuredClone(posting)}))]);const phases:number[]=[],detail=vi.fn(async(ids:string[])=>{if(ids.includes('70001')){phases.push(f.reader.invoicePostings.mock.calls.length);return structuredClone(city.response);}return {trxCodesInfo:structuredClone(f.p.taxCodes)};});return {...f,city,phases,reader:{...f.reader,invoiceTransactionDetails:detail}};}
it('adds only source-qualified auxiliary rows after the financial model succeeds',()=>{
 const f=paymentOffsetFixture(),before=invoiceModel(f.packet,now),snapshot=JSON.stringify(f.packet);Reflect.set(f.packet,'arPaymentOffsetDisplayProof',f.proof);const after=invoiceModel(f.packet,now);expect(after.lines).toEqual(before.lines);expect(after.displayLines?.filter(r=>r.kind==='payment-offset').map(r=>[r.id,r.debit,r.credit])).toEqual([['70001',0,10000],['70002',0,-10000]]);const {displayLines,paymentOffsetDisplaySource,...financial}=after;expect(financial).toEqual(before);Reflect.deleteProperty(f.packet,'arPaymentOffsetDisplayProof');expect(JSON.stringify(f.packet)).toBe(snapshot);
});
it('combines existing POS groups with independently proved offset atoms exactly once',()=>{
 const f=paymentOffsetFixture(),pos=posDisplayFixture().proof;pos.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));pos.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));Reflect.set(f.packet,'arPosDisplayProof',pos);Reflect.set(f.packet,'arPaymentOffsetDisplayProof',f.proof);const model=invoiceModel(f.packet,now);expect(model.displayLines?.map(r=>r.id)).toEqual(['10001','60002','70001','70002']);expect(model.lines).toHaveLength(4);
});
it('does not let display evidence rescue invalid financial amounts',()=>{
 const f=paymentOffsetFixture();Reflect.set(f.packet,'arPaymentOffsetDisplayProof',f.proof);Reflect.set(f.packet.invoice as object,'amount',{amount:1,currencyCode:'THB'});expect(()=>invoiceModel(f.packet,now)).toThrow('document_source_changed');
});
it('pairs offset metadata across the existing single fresh financial read',async()=>{
 const f=readerFixture(),q=await readArOnlyInvoicePacket(f.reader,f.p.manifest),model=arOnlyInvoiceModel(q,now);expect(q.arPaymentOffsetDisplayProof?.kind).toBe('ar-owned-payment-offset-display');expect(f.phases).toEqual([1,2]);expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);expect(f.reader.account).toHaveBeenCalledTimes(2);expect(model.displayLines?.filter(r=>r.kind==='payment-offset')).toHaveLength(2);expect(f.reader.folioReport).not.toHaveBeenCalled();expect(f.reader.invoiceChargeSimulation).not.toHaveBeenCalled();
});
it('makes no new detail calls for an invoice without unselected balanced Payment candidates',async()=>{
 const f=posReaderFixture(),q=await readArOnlyInvoicePacket(f.reader,f.p.manifest);expect(q.arPaymentOffsetDisplayProof).toBeUndefined();expect(q.arPaymentOffsetDisplayGap).toBeUndefined();expect(f.reader.invoiceTransactionDetails).toHaveBeenCalledTimes(2);expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);
});
it('keeps optional provider failure separate from financial qualification',async()=>{
 const f=readerFixture(),original=f.reader.invoiceTransactionDetails.getMockImplementation()!;f.reader.invoiceTransactionDetails.mockImplementation(async ids=>{if(ids.includes('70001'))throw new OperaError('provider_rejected');return original(ids);});const q=await readArOnlyInvoicePacket(f.reader,f.p.manifest);expect(q.arPaymentOffsetDisplayProof).toBeUndefined();expect(q.arPaymentOffsetDisplayGap).toBe('payment-offset-display-provider');expect(arOnlyInvoiceModel(q,now).displayLines).toBeUndefined();expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);
});
it('rejects changed ownership detail after the financial source fence without retrying or falling back',async()=>{
 const f=readerFixture(),original=f.reader.invoiceTransactionDetails.getMockImplementation()!;let count=0;f.reader.invoiceTransactionDetails.mockImplementation(async ids=>{const response=await original(ids);if(ids.includes('70001')&&count++)Reflect.set((response as typeof f.city.response).transactions[0].aRInfo,'invoiceNo',100);return response;});await expect(readArOnlyInvoicePacket(f.reader,f.p.manifest)).rejects.toThrow('document_source_changed');expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);expect(f.reader.folioReport).not.toHaveBeenCalled();
});
