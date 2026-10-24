import {it,expect} from 'vitest';
import {verifyArPosDisplayProof} from '../worker/invoice/pos-display-proof';
import {readVerifiedSourceClaimsPosRegion} from '../worker/invoice/ar-only-source-claims';
import {sourceClaimsPosDisplayFixture} from './fixtures/invoice-source-claims-pos-display';
it.each(['v1','posted','signed-fee','explicit','exclusive','zero-group'] as const)('uses only the opaque successfully verified %s financial POS region',kind=>{
 const f=sourceClaimsPosDisplayFixture(kind),before=JSON.stringify(f.packet),result=verifyArPosDisplayProof(f.packet,f.proof,f.region);expect(result.groups).toHaveLength(1);expect(result.gaps).toEqual([]);expect(result.groups[0].sourceIds).toEqual([...readVerifiedSourceClaimsPosRegion(f.packet,f.region).identities.keys()].sort());expect(result.groups[0].description).toBe('Source-claimed venue');expect(result.groups[0].reference).toBe('Room# 101 : CHECK# 10');expect(JSON.stringify(f.packet)).toBe(before);
});
it.each(['forged','serialized','map','cross-source'] as const)('rejects a %s financial authority instead of accepting caller exclusions or renamed roles',kind=>{
 const f=sourceClaimsPosDisplayFixture(),other=sourceClaimsPosDisplayFixture('posted');const authority=kind==='forged'?{}:kind==='serialized'?JSON.parse(JSON.stringify(f.region)):kind==='map'?f.claims:other.region;expect(()=>Reflect.apply(verifyArPosDisplayProof,undefined,[f.packet,f.proof,authority])).toThrow();
});
it.each(['zero-member','unselected-member','changed-page','wrong-cashier','wrong-reference'] as const)('keeps exact full metadata closure for %s',kind=>{
 const f=sourceClaimsPosDisplayFixture();for(const raw of [f.proof.contexts[0].before[0],f.proof.contexts[0].after[0]]){const p=raw as typeof f.page,rows=p.windows[0].folios[0].postings;if(kind==='zero-member'||kind==='unselected-member'){const extra=structuredClone(rows[1]);extra.transactionNo=kind==='zero-member'?'11001':'99991';rows.push(extra);rows[0].groupTypeInfo.groupCount=4;}if(kind==='wrong-cashier')rows[1].cashierInfo.cashierId=4;if(kind==='wrong-reference')rows[1].reference='Other';}if(kind==='changed-page')f.proof.contexts[0].after=[];expect(()=>verifyArPosDisplayProof(f.packet,f.proof,f.region)).toThrow();
});

import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import {verifyArOnlySourceClaimsWithDisplayRegion} from '../worker/invoice/ar-only-source-claims';
it('preserves canonical null/absent/whitespace references in a fully owned SourceClaims group',()=>{
 const f=sourceClaimsPosDisplayFixture('posted'),selected=(f.packet.postings as {invoicePostingsDetails:Record<string,unknown>[]}).invoicePostingsDetails;for(const [index,key]of ['60001','60002','60003'].entries()){const s=selected.find(s=>String(s.transactionNo)===key)!,p=(f.packet.taxRows.find(e=>String((e as {posting:{transactionNo:unknown}}).posting.transactionNo)===key) as {posting:Record<string,unknown>}).posting;if(index===0){s.reference=null;p.reference=null;}else if(index===1){delete s.reference;delete p.reference;}else{s.reference='  ';p.reference='  ';}for(const raw of [f.proof.contexts[0].before[0],f.proof.contexts[0].after[0]])Reflect.set((raw as typeof f.page).windows[0].folios[0].postings.find(r=>String(r.transactionNo)===key&&r.groupTypeInfo.subGroupId)!,'reference',s.reference);}
 f.packet.arOnlySourceClaimsProof!.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.packet.arOnlySourceClaimsProof!.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));const region=verifyArOnlySourceClaimsWithDisplayRegion(f.packet).posRegion!;expect(verifyArPosDisplayProof(f.packet,f.proof,region).groups[0]?.reference).toBe('');
});
