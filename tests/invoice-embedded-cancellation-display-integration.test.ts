import {it,expect,vi} from 'vitest';
import {embeddedCancellationFixture} from './fixtures/invoice-embedded-cancellation-display';
import {invoiceModel} from '../worker/invoice/model';
import {readArOnlyInvoicePacket,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {validatedInvoiceDisplayLines} from '../worker/invoice/derive-display-model';
import {nonVatReaderFixture} from './fixtures/invoice-ar-only-nonvat-reader';
const fields=['gross','taxableNet','vat','nonTaxable','outstanding','debit','credit'] as const;
it('omits only the closed embedded pair while preserving all financial rows and seven totals',()=>{
 const f=embeddedCancellationFixture(),before=invoiceModel(f.packet);f.packet.arEmbeddedCancellationDisplayProof=f.proof;const after=invoiceModel(f.packet);expect(after.lines).toEqual(before.lines);expect(after.displayLines).toHaveLength(before.lines.length-2);expect(after.posDisplaySuppressionSource?.kind).toBe('tsan-current-ar-closed-embedded-cancellation');for(const key of fields)expect(after[key]).toBe(before[key]);expect(validatedInvoiceDisplayLines(JSON.parse(JSON.stringify(after)))).toHaveLength(before.lines.length-2);
});
it('refuses an incompatible POS proof rather than selecting one suppression domain',()=>{
 const f=embeddedCancellationFixture();f.packet.arEmbeddedCancellationDisplayProof=f.proof;Reflect.set(f.packet,'arPosDisplayProof',{...f.proof,kind:'ar-pos-checkno-source-display'});expect(()=>invoiceModel(f.packet)).toThrow();
});
it('pairs metadata on the one existing financial source fence and attaches the independently verified proof',async()=>{
 const f=nonVatReaderFixture(),z=embeddedCancellationFixture();Object.assign(f.p,z.packet);Object.assign(f.current,z.packet.invoice);const proof=z.packet.arOnlySourceClaimsProof;if(proof?.version!==5)throw Error('fixture');const phases:number[]=[],reader={...f.reader,invoiceTransactionCodeRules:vi.fn(async(code:string)=>structuredClone(proof.components[0].groups.find(g=>g.rules&&Reflect.get(Reflect.get(g.rules as object,'transactionCode'),'code')===code)!.rules)),invoicePosDisplayFolios:vi.fn(async()=>{phases.push(f.reader.invoicePostings.mock.calls.length);return structuredClone(z.page);})};const q=await readArOnlyInvoicePacket(reader,f.p.manifest),model=arOnlyInvoiceModel(q);expect(q.arEmbeddedCancellationDisplayProof).toBeDefined();expect(phases).toEqual([1,2]);expect(reader.invoicePostings).toHaveBeenCalledTimes(2);expect(reader.account).toHaveBeenCalledTimes(2);expect(model.displayLines).toHaveLength(model.lines.length-2);expect(reader.folioReport).not.toHaveBeenCalled();
});
