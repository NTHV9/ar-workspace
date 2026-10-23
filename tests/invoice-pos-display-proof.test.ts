import {it,expect} from 'vitest';
import {verifyArPosDisplayProof,comparePosDisplayGroups} from '../worker/invoice/pos-display-proof';
import {posDisplayFixture,posDiscountDisplayFixture,posExtendedDisplayFixture} from './fixtures/invoice-pos-display';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';

it('derives only descriptors and exact source membership while preserving financial atoms',()=>{
 const {packet,roles,proof}=posDisplayFixture(),before=structuredClone(packet);
 expect(verifyArPosDisplayProof(packet,proof,roles)).toEqual({groups:[{representativeId:'60002',sourceIds:['60001','60002','60003'],date:'2026-01-03',description:'Example cafe',reference:'Room# 101 : CHECK# 10'}],gaps:[]});
 expect(packet).toEqual(before);
});
it('accepts the own representative alias despite its different synthetic header code',()=>{
 const {packet,roles,proof}=posDisplayFixture();expect(verifyArPosDisplayProof(packet,proof,roles).groups[0].representativeId).toBe('60002');
});
it.each(['missing-role','no-financial-proof','changed-source','changed-metadata','wrong-hotel','wrong-reservation','wrong-window','missing-member','duplicate-member','wrong-code','wrong-date','wrong-check','wrong-cashier','wrong-count','foreign-representative','ungrouped-alias','incomplete-page'] as const)('refuses invalid display proof: %s',kind=>{
 const {packet,roles,proof}=posDisplayFixture();const before=proof.contexts[0].before[0] as ReturnType<typeof posDisplayFixture>['page'],after=proof.contexts[0].after[0] as typeof before;
 for(const page of [before,after]){
  const window=page.windows[0],rows=window.folios[0].postings,header=rows[0],member=rows[1];
  if(kind==='wrong-hotel')page.hotelId='TSAN';if(kind==='wrong-reservation')page.reservationId='999';if(kind==='wrong-window')page.folioWindowNo=2;if(kind==='missing-member')rows.pop();if(kind==='duplicate-member')rows.push(structuredClone(member));if(kind==='wrong-code')member.transactionCode='OTHER';if(kind==='wrong-date')member.transactionDate='2026-01-04';if(kind==='wrong-check')member.checkNo='OTHER';if(kind==='wrong-cashier')member.cashierInfo.cashierId=4;if(kind==='wrong-count')Reflect.set(header.groupTypeInfo,'groupCount',4);if(kind==='foreign-representative')header.transactionNo=999;if(kind==='ungrouped-alias'){const alias=structuredClone(member);Reflect.deleteProperty(alias,'groupTypeInfo');rows.push(alias);window.totalResults++;}if(kind==='incomplete-page')window.totalPages=2;
 }
 if(kind==='missing-role')roles.delete('60001');if(kind==='no-financial-proof')Reflect.deleteProperty(packet,'arOnlyPosProof');if(kind==='changed-source'){if(!packet.invoice||typeof packet.invoice!=='object')throw Error('fixture');Reflect.set(packet.invoice,'reference','changed');};if(kind==='changed-metadata')Reflect.set(after.windows[0].folios[0].postings[0].groupTypeInfo,'groupDescription','Changed');
 expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow('document_invoice_ar_pos_display_unverified');
});
it('keeps routed or split references unresolved instead of deleting their history',()=>{
 const {packet,roles,proof}=posDisplayFixture();for(const page of [proof.contexts[0].before[0],proof.contexts[0].after[0]])for(const row of (page as ReturnType<typeof posDisplayFixture>['page']).windows[0].folios[0].postings.slice(1))row.reference+=' routed';
 // The metadata now contradicts the immutable AR reference, so no display proof.
 expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow();
});
it('sorts by date and exact representative ID, not provider order or minimum source ID',()=>{
 const a={representativeId:'9007199254740993',sourceIds:['9007199254740990','9007199254740993'],date:'2026-01-03',description:'A',reference:'A'},b={representativeId:'9007199254740992',sourceIds:['9007199254740991','9007199254740992'],date:'2026-01-03',description:'B',reference:'B'};
 expect([a,b].sort(comparePosDisplayGroups).map(row=>row.description)).toEqual(['B','A']);
});
it('preserves all routed text while suppressing only the first numeric interface marker',()=>{
 const {packet,roles,proof}=posDisplayFixture('Room# 101 : CHECK# 10 [99]  Source #101=>Target #102 [456]'),before=structuredClone(packet);
 expect(verifyArPosDisplayProof(packet,proof,roles).groups[0]?.reference).toBe('Room# 101 : CHECK# 10 Source #101=>Target #102 [456]');expect(packet).toEqual(before);
});
it('admits an already financially proved discount without replacing its negative atom',()=>{
 const {packet,roles,proof}=posDiscountDisplayFixture(),before=structuredClone(packet);
 expect(verifyArPosDisplayProof(packet,proof,roles).groups[0].sourceIds).toEqual(['60001','60002','60003','60004']);expect(roles.get('60004')).toEqual({role:'discount',signedCents:-20000});expect(packet).toEqual(before);
});
it.each(['vat','fee','service','base'] as const)('does not group a negative %s atom into a positive receipt',role=>{
 const {packet,roles,proof}=posDiscountDisplayFixture();roles.set('60004',{role,signedCents:-20000});
 expect(verifyArPosDisplayProof(packet,proof,roles)).toEqual({groups:[],gaps:[{category:'signed-partition-unsupported',sourceIds:['60001','60002','60003','60004']}]});
});
it('does not admit display grouping for a conflicting financial proof profile',()=>{
 const {packet,roles,proof}=posDisplayFixture();Reflect.set(packet,'directZeroTaxProof',{});expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow('document_invoice_ar_pos_display_unverified');
});
it.each(['representative','member'] as const)('rejects a cross-group %s alias even outside the selected invoice',kind=>{
 const {packet,roles,proof}=posDisplayFixture();for(const raw of [proof.contexts[0].before[0],proof.contexts[0].after[0]]){
  const page=raw as ReturnType<typeof posDisplayFixture>['page'],rows=page.windows[0].folios[0].postings,header=structuredClone(rows[0]),member=structuredClone(rows[1]);header.transactionNo=kind==='representative'?60002:60001;header.checkNo='OTHER';header.groupTypeInfo={groupId:'OTHER',groupCount:1,groupDescription:'Other'};member.transactionNo=kind==='representative'?70001:60001;member.checkNo='OTHER';member.groupTypeInfo={subGroupId:'OTHER'};rows.push(header,member);page.windows[0].totalResults=2;
 }
 expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow();
});
it.each(['true','wrong-type'] as const)('refuses a contradictory explicit pagination flag: %s',kind=>{
 const {packet,roles,proof}=posDisplayFixture();for(const raw of [proof.contexts[0].before[0],proof.contexts[0].after[0]])Reflect.set((raw as ReturnType<typeof posDisplayFixture>['page']).windows[0],'hasMore',kind==='true'?true:'true');expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow();
});
it.each(['header','member'] as const)('refuses unqualified declared financial membership on a %s',kind=>{
 const {packet,roles,proof}=posDisplayFixture();for(const raw of [proof.contexts[0].before[0],proof.contexts[0].after[0]])Reflect.set((raw as ReturnType<typeof posDisplayFixture>['page']).windows[0].folios[0].postings[kind==='header'?0:1],'financialTransactionIdList',[{id:'999',type:'Transaction'}]);expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow();
});
it.each(['arOnlyPosSignedMultiVatProof','arOnlyPosSalesProof','arOnlyZeroVatNetProof','arOnlySourceClaimsProof','sourceClaims'])('keeps an unqualified mixed financial envelope out of display admission: %s',key=>{
 const {packet,roles,proof}=posDisplayFixture();Reflect.set(packet,key,{});expect(()=>verifyArPosDisplayProof(packet,proof,roles)).toThrow();
});
it('keeps reference selection separate from representative and provider order when lexical and ID minima agree',()=>{
 const f=posDisplayFixture(),references=new Map([[60001,'Room# 101 : CHECK# 10 [99] Source #101=>Target #102'],[60002,'Room# 202 : CHECK# 20 [55] Representative'],[60003,'Room# 303 : CHECK# 30 [77] Latest']]);
 for(const [key,reference]of references){f.raw.postings.invoicePostingsDetails.find(p=>p.transactionNo===key)!.reference=reference;Reflect.set(f.raw.taxRows.find(p=>p.posting.transactionNo===key)!.posting,'reference',reference);}
 for(const raw of [f.proof.contexts[0].before[0],f.proof.contexts[0].after[0]]){
  const page=raw as typeof f.page,rows=page.windows[0].folios[0].postings;for(const row of rows.slice(1))row.reference=references.get(Number(row.transactionNo))!;rows.splice(1,3,rows[3],rows[2],rows[1]);
 }
 f.packet.arOnlyPosProof!.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.packet.arOnlyPosProof!.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));const before=structuredClone(f.packet);
 const group=verifyArPosDisplayProof(f.packet,f.proof,f.roles).groups[0];expect(group?.representativeId).toBe('60002');expect(group?.reference).toBe('Room# 101 : CHECK# 10 Source #101=>Target #102');expect(f.packet).toEqual(before);
});
it('preserves split text when it actually belongs to the selected minimum source reference',()=>{
 const {packet,roles,proof}=posDisplayFixture('Room# 101 : CHECK# 10 [99] 100.00 Split into 30.00 and 70.00.');expect(verifyArPosDisplayProof(packet,proof,roles).groups[0]?.reference).toBe('Room# 101 : CHECK# 10 100.00 Split into 30.00 and 70.00.');
});
it('refuses an unqualified nonnumeric marker instead of deleting it',()=>{
 const {packet,roles,proof}=posDisplayFixture('Room# 101 : CHECK# 10 [UNPROVEN]');expect(verifyArPosDisplayProof(packet,proof,roles)).toEqual({groups:[],gaps:[{category:'reference-unresolved',sourceIds:['60001','60002','60003']}]});
});


it.each(['signed','sales'] as const)('admits an independently financially proved %s profile without changing source atoms',kind=>{
 const f=posExtendedDisplayFixture(kind),before=structuredClone(f.packet),result=verifyArPosDisplayProof(f.packet,f.proof,f.roles);expect(result.gaps).toEqual([]);expect(result.groups).toHaveLength(1);expect(result.groups[0].sourceIds).toEqual([...f.roles.keys()].sort());expect(f.packet).toEqual(before);
});
it('does not allow a negative fee role under the signed display profile',()=>{
 const f=posExtendedDisplayFixture('signed');f.roles.set('60001',{...f.roles.get('60001')!,role:'fee'});expect(verifyArPosDisplayProof(f.packet,f.proof,f.roles)).toMatchObject({groups:[],gaps:[{category:'signed-partition-unsupported'}]});
});


function fixtureWithReferences(references:string[]){
 const f=posDisplayFixture();
 for(const [index,reference]of references.entries()){
  const key=60001+index;f.raw.postings.invoicePostingsDetails.find(p=>p.transactionNo===key)!.reference=reference;Reflect.set(f.raw.taxRows.find(p=>p.posting.transactionNo===key)!.posting,'reference',reference);
  for(const raw of [f.proof.contexts[0].before[0],f.proof.contexts[0].after[0]])(raw as typeof f.page).windows[0].folios[0].postings.find(row=>row.groupTypeInfo.subGroupId&&row.transactionNo===key)!.reference=reference;
 }
 f.packet.arOnlyPosProof!.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.packet.arOnlyPosProof!.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));return f;
}
it('selects lexical reference minimum rather than numeric member, representative, or API order',()=>{
 const f=fixtureWithReferences(['Room# 101 : CHECK# 10 [99] 900.60 Split into 630.60 and 270.00.','Room# 101 : CHECK# 10 [99] 220.89 Split into -49.11 and 270.00.','  Room# 101 : CHECK# 10 [99] 112.15 Split into -157.85 and 270.00.  ']);
 for(const raw of [f.proof.contexts[0].before[0],f.proof.contexts[0].after[0]]){const rows=(raw as typeof f.page).windows[0].folios[0].postings;rows.splice(1,3,rows[2],rows[1],rows[3]);}
 const before=structuredClone(f.packet),result=verifyArPosDisplayProof(f.packet,f.proof,f.roles);expect(result.groups[0]).toMatchObject({representativeId:'60002',reference:'Room# 101 : CHECK# 10 112.15 Split into -157.85 and 270.00.'});expect(f.packet).toEqual(before);
});
it('compares raw trimmed reference strings before removing the immediate marker',()=>{
 const f=fixtureWithReferences(['Room# 101 : CHECK# 10 [3] A','Room# 101 : CHECK# 10 [20] Z [456]','Room# 101 : CHECK# 10 [9] B']);expect(verifyArPosDisplayProof(f.packet,f.proof,f.roles).groups[0].reference).toBe('Room# 101 : CHECK# 10 Z [456]');
});
it('requires posted reference agreement even for a nonwinning member',()=>{
 const f=fixtureWithReferences(['Room# 101 : CHECK# 10 [99] A','Room# 101 : CHECK# 10 [99] Z','Room# 101 : CHECK# 10 [99] Y']);Reflect.set(f.raw.taxRows.find(p=>p.posting.transactionNo===60002)!.posting,'reference','contradiction');f.proof.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));f.proof.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));
 expect(verifyArPosDisplayProof(f.packet,f.proof,f.roles)).toEqual({groups:[],gaps:[{category:'reference-unresolved',sourceIds:['60001','60002','60003']}]});
});
it('keeps identical trimmed reference ties deterministic and source membership intact',()=>{
 const f=fixtureWithReferences([' Room# 101 : CHECK# 10 [99] Same ','Room# 101 : CHECK# 10 [99] Same','Room# 101 : CHECK# 10 [99] Same']);expect(verifyArPosDisplayProof(f.packet,f.proof,f.roles).groups[0]).toMatchObject({sourceIds:['60001','60002','60003'],reference:'Room# 101 : CHECK# 10 Same'});
});

it('keeps a fully verified all-blank group reference blank without substituting its check',()=>{
 const f=posDisplayFixture('');expect(verifyArPosDisplayProof(f.packet,f.proof,f.roles).groups[0]?.reference).toBe('');
});
it('does not collapse a mixed blank and nonblank reference group under the blank policy',()=>{
 const f=fixtureWithReferences(['','Room# 101 : CHECK# 10 [99]','']);expect(verifyArPosDisplayProof(f.packet,f.proof,f.roles)).toMatchObject({groups:[],gaps:[{category:'reference-unresolved'}]});
});
