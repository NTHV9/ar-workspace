import {it,expect} from 'vitest';
import {beginEmbeddedCancellationDisplayRead} from '../worker/invoice/embedded-cancellation-display-read';
import {embeddedCancellationFixture} from './fixtures/invoice-embedded-cancellation-display';
import {verifyArEmbeddedCancellationDisplayProof} from '../worker/invoice/embedded-cancellation-display-proof';
it('reads paired complete pages around the caller single source fence',async()=>{
 const f=embeddedCancellationFixture(),events:string[]=[],reader={invoicePosDisplayFolios:async()=>{events.push('metadata');return structuredClone(f.page);}};const session=await beginEmbeddedCancellationDisplayRead(reader,f.packet);events.push('finance');const result=await session.finish(structuredClone(f.packet));expect(events).toEqual(['metadata','finance','metadata']);expect(result.proof).toBeDefined();expect(verifyArEmbeddedCancellationDisplayProof(f.packet,result.proof!)[0].sourceIds).toEqual(['80001','80002']);
});
it('makes no metadata request when there is no candidate source pair',async()=>{
 const f=embeddedCancellationFixture();(f.packet.postings as {invoicePostingsDetails:{transactionNo:number}[]}).invoicePostingsDetails=(f.packet.postings as {invoicePostingsDetails:{transactionNo:number}[]}).invoicePostingsDetails.filter(s=>s.transactionNo<80000);let calls=0;const session=await beginEmbeddedCancellationDisplayRead({invoicePosDisplayFolios:async()=>{calls++;throw Error('must not read');}},f.packet);expect(await session.finish(f.packet)).toEqual({gap:'embedded-cancellation-profile'});expect(calls).toBe(0);
});
it.each(['source','metadata'] as const)('rejects %s mutation across the same fence',async kind=>{
 const f=embeddedCancellationFixture(),reader={invoicePosDisplayFolios:async()=>structuredClone(f.page)},session=await beginEmbeddedCancellationDisplayRead(reader,f.packet),fresh=structuredClone(f.packet);if(kind==='source')Reflect.set(fresh.invoice as object,'reference','changed');else f.page.windows[0].folios[0].postings[0].reference='changed';await expect(session.finish(fresh)).rejects.toThrow('document_source_changed');
});
