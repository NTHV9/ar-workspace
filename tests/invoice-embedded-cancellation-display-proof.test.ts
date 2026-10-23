import {it,expect} from 'vitest';
import {embeddedCancellationFixture} from './fixtures/invoice-embedded-cancellation-display';
import {discoverEmbeddedCancellationContexts,verifyArEmbeddedCancellationDisplayProof,createEmbeddedCancellationCatalog,revalidateEmbeddedCancellationCatalog} from '../worker/invoice/embedded-cancellation-display-proof';
import {invoiceModel} from '../worker/invoice/model';
it('certifies only the exact complete selected embedded pair after V5 financial qualification',()=>{
 const f=embeddedCancellationFixture(),before=JSON.stringify(f.packet),financial=invoiceModel(f.packet);expect(discoverEmbeddedCancellationContexts(f.packet)).toEqual([{hotel:'TSAN',reservationId:'777',folioWindowNo:1}]);expect(verifyArEmbeddedCancellationDisplayProof(f.packet,f.proof)).toEqual([{representativeId:'80002',sourceIds:['80001','80002'],date:'2026-01-04'}]);const catalog=createEmbeddedCancellationCatalog(f.packet,f.proof);expect(revalidateEmbeddedCancellationCatalog(JSON.parse(JSON.stringify(catalog))).catalog).toEqual(catalog);expect(invoiceModel(f.packet)).toEqual(financial);expect(JSON.stringify(f.packet)).toBe(before);
});

import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
function rebind(f:ReturnType<typeof embeddedCancellationFixture>){const source=arOnlyTaxSource(f.packet);f.packet.arOnlySourceClaimsProof!.sourceBefore=structuredClone(source);f.packet.arOnlySourceClaimsProof!.sourceAfter=structuredClone(source);f.proof.sourceBefore=structuredClone(source);f.proof.sourceAfter=structuredClone(source);}
it('refuses an unselected root reusing a candidate child identity across the full source tree',()=>{
 const f=embeddedCancellationFixture(),entry=structuredClone(f.packet.taxRows.find(e=>(e as {posting:{transactionNo:number}}).posting.transactionNo===80001)!) as {posting:Record<string,unknown>;postingBreakdown:{taxes:Record<string,unknown>[]}};entry.posting.transactionNo=99990;entry.posting.checkNo='UNRELATED';entry.postingBreakdown.taxes[0].referenceTransactionNo=99990;f.packet.taxRows.push(entry);rebind(f);expect(()=>invoiceModel(f.packet)).not.toThrow();expect(()=>verifyArEmbeddedCancellationDisplayProof(f.packet,f.proof)).toThrow();
});
it.each(['folio','window','reservation','paid-out','deferred'] as const)('refuses contradictory supplied child %s scope',kind=>{
 const f=embeddedCancellationFixture(),child=(f.packet.taxRows.find(e=>(e as {posting:{transactionNo:number}}).posting.transactionNo===80001) as {postingBreakdown:{taxes:Record<string,unknown>[]}}).postingBreakdown.taxes[0];if(kind==='folio')child.folioNo=99;if(kind==='window')child.folioWindowNo=2;if(kind==='reservation')child.guestInfo={reservationId:{id:'999'}};if(kind==='paid-out')child.paidOut=true;if(kind==='deferred')child.deferredTax=true;rebind(f);expect(()=>verifyArEmbeddedCancellationDisplayProof(f.packet,f.proof)).toThrow();
});

it('refuses an unselected descendant whose new child ID points at an owned VAT child',()=>{
 const f=embeddedCancellationFixture(),entry=structuredClone(f.packet.taxRows.find(e=>(e as {posting:{transactionNo:number}}).posting.transactionNo===80001)!) as {posting:Record<string,unknown>;postingBreakdown:{taxes:Record<string,unknown>[]}};entry.posting.transactionNo=99990;entry.posting.checkNo='UNRELATED';entry.postingBreakdown.taxes[0].transactionNo=999901;entry.postingBreakdown.taxes[0].referenceTransactionNo=800011;f.packet.taxRows.push(entry);rebind(f);expect(()=>invoiceModel(f.packet)).not.toThrow();expect(()=>verifyArEmbeddedCancellationDisplayProof(f.packet,f.proof)).toThrow();
});
