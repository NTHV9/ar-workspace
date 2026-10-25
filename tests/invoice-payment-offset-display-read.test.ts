import {it,expect} from 'vitest';
import {OperaError} from '../worker/opera/client';
import {beginArPaymentOffsetDisplayRead} from '../worker/invoice/payment-offset-display-read';
import {verifyArPaymentOffsetDisplayProof} from '../worker/invoice/payment-offset-display-proof';
import {paymentOffsetFixture} from './fixtures/invoice-payment-offset-display';

it('pairs complete bounded detail blocks across the existing caller financial fence',async()=>{
 const f=paymentOffsetFixture(),calls:string[]=[];const reader={invoiceTransactionDetails:async(ids:string[])=>{calls.push(ids.join(','));return structuredClone(f.response);}};const session=await beginArPaymentOffsetDisplayRead(reader,f.packet);calls.push('financial-fence');const fresh=structuredClone(f.packet),selected=(fresh.postings as {invoicePostingsDetails:unknown[]}).invoicePostingsDetails;selected.reverse();const result=await session.finish(fresh);expect(calls).toEqual(['70001,70002','financial-fence','70001,70002']);expect(verifyArPaymentOffsetDisplayProof(fresh,result.proof!).atoms).toHaveLength(2);await expect(session.finish(fresh)).rejects.toThrow('document_source_changed');
});
it('makes no additional requests when the complete source has no candidates',async()=>{
 const f=paymentOffsetFixture();f.packet.taxRows.splice(-2);let calls=0;const session=await beginArPaymentOffsetDisplayRead({invoiceTransactionDetails:async()=>{calls++;throw Error('unexpected');}},f.packet);expect(await session.finish(f.packet)).toEqual({});expect(calls).toBe(0);
});
it('reads every candidate exactly once in each phase without splicing provider response blocks',async()=>{
 const f=paymentOffsetFixture(Array.from({length:44},(_,i)=>i<2?99:100)),calls:string[][]=[];const read=async(ids:string[])=>{calls.push([...ids]);return {...structuredClone(f.response),transactions:f.response.transactions.filter(p=>ids.includes(String(p.transactionNo)))};};const session=await beginArPaymentOffsetDisplayRead({invoiceTransactionDetails:read},f.packet),result=await session.finish(f.packet);expect(calls.map(c=>c.length)).toEqual([40,4,40,4]);expect(result.proof!.details.map(d=>d.ids.length)).toEqual([40,4]);expect(verifyArPaymentOffsetDisplayProof(f.packet,result.proof!).atoms).toHaveLength(2);
});
it.each(['source','detail','response-order'] as const)('retains fail-closed mutation behavior for %s',async kind=>{
 const f=paymentOffsetFixture(),session=await beginArPaymentOffsetDisplayRead({invoiceTransactionDetails:async()=>structuredClone(f.response)},f.packet),fresh=structuredClone(f.packet);if(kind==='source')fresh.manifest.open++;if(kind==='detail')f.response.transactions[0].reference='Changed';if(kind==='response-order')f.response.transactions.reverse();await expect(session.finish(fresh)).rejects.toThrow('document_source_changed');
});
it('preserves the raw body with an explicit capability gap',async()=>{
 const f=paymentOffsetFixture(),session=await beginArPaymentOffsetDisplayRead({},f.packet);expect(await session.finish(f.packet)).toEqual({gap:'payment-offset-display-capability'});
});
it.each(['before','after'] as const)('keeps provider failures optional in the %s phase',async phase=>{
 const f=paymentOffsetFixture();let calls=0;const session=await beginArPaymentOffsetDisplayRead({invoiceTransactionDetails:async()=>{calls++;if(phase==='before'||calls>1)throw new OperaError('provider_rejected');return structuredClone(f.response);}},f.packet);expect(await session.finish(f.packet)).toEqual({gap:'payment-offset-display-provider'});
});
it('refuses unsupported first-read evidence without treating absence as an empty valid catalog',async()=>{
 const f=paymentOffsetFixture(),raw=structuredClone(f.response);raw.transactions.pop();let calls=0;const session=await beginArPaymentOffsetDisplayRead({invoiceTransactionDetails:async()=>{calls++;return raw;}},f.packet);expect(await session.finish(f.packet)).toEqual({gap:'payment-offset-display-evidence'});expect(calls).toBe(1);
});
