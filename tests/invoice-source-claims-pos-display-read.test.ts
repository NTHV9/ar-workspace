import {it,expect} from 'vitest';
import {beginArSourceClaimsPosDisplayRead} from '../worker/invoice/source-claims-pos-display-read';
import {sourceClaimsPosDisplayFixture} from './fixtures/invoice-source-claims-pos-display';
import {zeroVatNetPacket} from './fixtures/invoice-ar-only-zero-vat-net';
import {verifyArPosDisplayProof} from '../worker/invoice/pos-display-proof';
import {OperaError} from '../worker/opera/client';
it('plans only bounded metadata contexts before the same financial fence and verifies membership afterward',async()=>{
 const f=sourceClaimsPosDisplayFixture(),calls:string[]=[];const session=await beginArSourceClaimsPosDisplayRead({invoicePosDisplayFolios:async()=>{calls.push('metadata');return structuredClone(f.page);}},f.packet);calls.push('financial-fence');const result=await session.finish(f.packet,f.region);expect(calls).toEqual(['metadata','financial-fence','metadata']);expect(verifyArPosDisplayProof(f.packet,result.proof!,f.region).groups).toHaveLength(1);await expect(session.finish(f.packet,f.region)).rejects.toThrow('document_source_changed');
});
it('does not mint a membership authority from a complete pre-financial page',async()=>{
 const f=sourceClaimsPosDisplayFixture(),session=await beginArSourceClaimsPosDisplayRead({invoicePosDisplayFolios:async()=>structuredClone(f.page)},f.packet);await expect(Reflect.apply(session.finish,undefined,[f.packet,{}])).rejects.toThrow();
});
it('makes no metadata calls for a standalone zero source without POS contexts',async()=>{
 const f=zeroVatNetPacket();let calls=0;const session=await beginArSourceClaimsPosDisplayRead({invoicePosDisplayFolios:async()=>{calls++;throw Error('forbidden');}},f.p);expect(await Reflect.apply(session.finish,undefined,[f.p,{}])).toEqual({gap:'pos-display-profile'});expect(calls).toBe(0);
});
it('keeps an initially unsupported full member set as a display gap rather than excluding a zero member',async()=>{
 const f=sourceClaimsPosDisplayFixture(),page=structuredClone(f.page),rows=page.windows[0].folios[0].postings,extra=structuredClone(rows[1]);extra.transactionNo='11001';rows.push(extra);rows[0].groupTypeInfo.groupCount=4;let calls=0;const session=await beginArSourceClaimsPosDisplayRead({invoicePosDisplayFolios:async()=>{calls++;return page;}},f.packet);expect(await session.finish(f.packet,f.region)).toEqual({gap:'pos-display-evidence'});expect(calls).toBe(1);
});
it.each(['source','metadata'] as const)('fails closed on a changed %s interval',async kind=>{
 const f=sourceClaimsPosDisplayFixture();let calls=0;const session=await beginArSourceClaimsPosDisplayRead({invoicePosDisplayFolios:async()=>{const p=structuredClone(f.page);if(calls++)p.windows[0].folios[0].postings[0].groupTypeInfo.groupDescription='Changed';return p;}},f.packet);if(kind==='source')f.packet.manifest.open++;await expect(session.finish(f.packet,f.region)).rejects.toThrow('document_source_changed');
});
it('retains the financial source body when a provider cannot supply optional metadata',async()=>{
 const f=sourceClaimsPosDisplayFixture();const session=await beginArSourceClaimsPosDisplayRead({invoicePosDisplayFolios:async()=>{throw new OperaError('provider_rejected');}},f.packet);expect(await session.finish(f.packet,f.region)).toEqual({gap:'pos-display-provider'});
});
