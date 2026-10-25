import {expect,it} from 'vitest';
import {verifyPostedPosFeeClaims,verifyPostedPosFeeIdentities} from '../worker/invoice/ar-only-posted-pos-fee-claims';
import {verifyArOnlyDirectZeroClaims,type VerifiedDirectZeroClaims} from '../worker/invoice/ar-only-zero-vat-net-proof';
import {postedPosFeePacket,feeAmount,addFeeAtom,pairFeeEvidence} from './fixtures/invoice-ar-only-posted-pos-fee';
import {sourceClaimsPacket} from './fixtures/invoice-ar-only-source-claims';
import {money} from './fixtures/invoice-packet';

it('preserves the legacy positive fee identities and exact source cents without altering the packet',()=>{
 const f=postedPosFeePacket(),before=JSON.stringify(f),claims=verifyPostedPosFeeClaims(f.p,f.evidence);
 expect([...claims]).toEqual([
  ['60001',{role:'taxable',signedCents:100000,component:'posted-pos-mapped-fee'}],
  ['60002',{role:'taxable',signedCents:10000,component:'posted-pos-mapped-fee'}],
  ['60003',{role:'vat',signedCents:7700,component:'posted-pos-mapped-fee'}],
 ]);expect(JSON.stringify(f)).toBe(before);
});
it('retains a signed fee and adjusted actual VAT without a nominal percentage or sign partition',()=>{
 const f=postedPosFeePacket();feeAmount(f,60001,-900);feeAmount(f,60002,-23.45);feeAmount(f,60003,61.23);
 expect([...verifyPostedPosFeeClaims(f.p,f.evidence).values()].map(c=>c.signedCents)).toEqual([-90000,-2345,6123]);
});
it('returns independent native tax and fee identities for display without guessing service from a sign',()=>{
 const f=postedPosFeePacket();feeAmount(f,60001,-900);feeAmount(f,60002,-23.45);
 expect([...verifyPostedPosFeeIdentities(f.p,f.evidence)]).toEqual([
  ['60001',{role:'base',signedCents:-90000}],['60002',{role:'fee',signedCents:-2345}],['60003',{role:'vat',signedCents:7700}],
 ]);
});
it('requires an independently mapped fee rather than accepting only ordinary base/service/VAT',()=>{
 const f=postedPosFeePacket();f.evidence.definitions[1].before.transactionCode.classification.group.code='SVC';
 Reflect.set(f.p.postings.trxCodesInfo[2],'transactionGroup','SVC');pairFeeEvidence(f);
 expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});
it('owns every positive and negative VAT atom once, including a cancelling pair',()=>{
 const f=postedPosFeePacket();feeAmount(f,60001,900);feeAmount(f,60002,-15);addFeeAtom(f,60003,60004,-77);addFeeAtom(f,60003,60005,19.23);
 const claims=verifyPostedPosFeeClaims(f.p,f.evidence);expect(claims.size).toBe(5);
 expect(['60003','60004','60005'].map(id=>claims.get(id))).toEqual([7700,-7700,1923].map(signedCents=>({role:'vat',signedCents,component:'posted-pos-mapped-fee'})));
});
it('retains ordinary signed scopes alongside a fee scope',()=>{
 const f=postedPosFeePacket();addFeeAtom(f,60001,60010,-20);addFeeAtom(f,60003,60011,-5);
 for(const id of [60010,60011]){f.p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!.checkNo='other';Reflect.set(f.p.taxRows.find(e=>e.posting.transactionNo===id)!.posting,'checkNo','other');}
 expect(verifyPostedPosFeeClaims(f.p,f.evidence).get('60010')).toEqual({role:'taxable',signedCents:-2000,component:'posted-pos-mapped-fee'});
});
it('checks every distinct fee code rather than inferring a shared role',()=>{
 const f=postedPosFeePacket();addFeeAtom(f,60002,60004,-20);
 f.p.postings.invoicePostingsDetails.find(s=>s.transactionNo===60004)!.transactionCode='FEE-TWO';
 Reflect.set(f.p.taxRows.find(e=>e.posting.transactionNo===60004)!.posting,'transactionCode','FEE-TWO');
 f.p.postings.trxCodesInfo.push({...f.p.postings.trxCodesInfo[2],transactionCode:'FEE-TWO'});
 const d=structuredClone(f.evidence.definitions[1]);d.before.transactionCode.code='FEE-TWO';f.evidence.definitions.push(d);
 const info=f.evidence.interfaces.mappings[0].before.details.transactionsInfo;
 info.itemizers.push({splitCode:'SC3',splitPost:22,splitFactor:1});info.transactionCodes[0].itemizersShortInfo.push({code:'FEE-TWO',itemNumber:22});pairFeeEvidence(f);
 expect(verifyPostedPosFeeClaims(f.p,f.evidence).get('60004')?.signedCents).toBe(-2000);
 info.itemizers[2].splitCode='DC1';pairFeeEvidence(f);expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});

it.each(['ST1','DC1','TX1','TP1','SC0'])('rejects conflicting or uncorroborated mapped family %s even with matching money',alias=>{
 const f=postedPosFeePacket(),info=f.evidence.interfaces.mappings[0].before.details.transactionsInfo;
 if(alias==='SC0')info.itemizers[1].splitCode=alias;else info.itemizers.push({...info.itemizers[1],splitCode:alias});
 pairFeeEvidence(f);expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});
it.each(['default','allCharges','minibar','posting-account','tip-only','split-factor','item-number','missing-map','duplicate-map','wrong-logo','missing-discovery','duplicate-discovery','other-hotel','changed-map','changed-discovery'] as const)('rejects incomplete or conflicting whole-property mappings: %s',kind=>{
 const f=postedPosFeePacket(),interfaces=f.evidence.interfaces,info=interfaces.mappings[0].before.details.transactionsInfo;
 if(kind==='default')info.transactionCodes[0].code='SERVICE';
 if(kind==='allCharges')Reflect.set(info,'allChargesCode','SERVICE');
 if(kind==='minibar')Reflect.set(info,'miniBarCode','SERVICE');
 if(kind==='posting-account')Reflect.set(info,'postingAccounts',[{transactionCode:'SERVICE'}]);
 if(kind==='tip-only'){Reflect.set(info.transactionCodes[0],'tipCode','SERVICE');info.transactionCodes[0].itemizersShortInfo=[];}
 if(kind==='split-factor')info.itemizers[1].splitFactor=2;
 if(kind==='item-number')info.transactionCodes[0].itemizersShortInfo[0].itemNumber=1.5;
 if(kind==='missing-map')interfaces.mappings=[];
 if(kind==='duplicate-map')interfaces.mappings.push(structuredClone(interfaces.mappings[0]));
 if(kind==='wrong-logo')interfaces.mappings[0].logo='unknown';
 if(kind==='missing-discovery')interfaces.discoveryBefore.hotelInterfaces=[];
 if(kind==='duplicate-discovery')interfaces.discoveryBefore.hotelInterfaces.push(structuredClone(interfaces.discoveryBefore.hotelInterfaces[0]));
 if(kind==='other-hotel')interfaces.hotel='TSAN';pairFeeEvidence(f);
 if(kind==='changed-map')interfaces.mappings[0].after.details.transactionsInfo.itemizers[1].splitFactor=2;
 if(kind==='changed-discovery')interfaces.discoveryAfter.hotelInterfaces[0].logo='changed';
 expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});
it('checks a second active interface even when the first mapping is sufficient',()=>{
 const f=postedPosFeePacket(),e=f.evidence.interfaces;
 e.discoveryBefore.hotelInterfaces.push({...e.discoveryBefore.hotelInterfaces[0],logo:'OTHER'});
 e.mappings.push({...structuredClone(e.mappings[0]),logo:'OTHER'});pairFeeEvidence(f);
 expect(verifyPostedPosFeeClaims(f.p,f.evidence).size).toBe(3);
 e.mappings[1].before.details.transactionsInfo.itemizers[1].splitCode='ST1';pairFeeEvidence(f);expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});

it.each(['subtype','inclusive','non-taxable','manual','comp','adjustment','generated','associated','classification','group','changed','missing','duplicate','extra-key','evidence-key'] as const)('rejects unknown fee metadata or incomplete paired coverage: %s',kind=>{
 const f=postedPosFeePacket(),definition=f.evidence.definitions[1],d=definition.before.transactionCode;
 if(kind==='subtype')Reflect.deleteProperty(d.classification,'transactionType');
 if(kind==='inclusive')d.trxSetup.taxInclusive=true;
 if(kind==='non-taxable')d.trxSetup.nonTaxable=true;
 if(kind==='manual')Reflect.set(d.trxSetup,'manualPosting',true);
 if(kind==='comp')Reflect.set(d,'compTransaction',true);
 if(kind==='adjustment')Reflect.set(d,'transactionAdjustments',[{}]);
 if(kind==='generated')Reflect.set(d.generatesSetup,'generates',[{transactionCode:'VAT'}]);
 if(kind==='associated')Reflect.set(d,'associatedTransactionCodes',[{}]);
 if(kind==='classification')d.classification.type='Other';
 if(kind==='group')d.classification.group.code='MISC';
 pairFeeEvidence(f);
 if(kind==='changed')definition.after.transactionCode.description.defaultText='changed';
 if(kind==='missing')f.evidence.definitions.pop();
 if(kind==='duplicate')f.evidence.definitions[2]=structuredClone(f.evidence.definitions[1]);
 if(kind==='extra-key')Reflect.set(definition,'claims',[]);
 if(kind==='evidence-key')Reflect.set(f.evidence,'claims',[]);
 expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});
it.each(['no-base','no-vat','fee-scope-no-base','fee-scope-no-vat','check-mismatch','unknown-ordinary'] as const)('rejects incomplete fee context: %s',kind=>{
 const f=postedPosFeePacket();
 if(kind==='no-base'||kind==='no-vat'){const id=kind==='no-base'?60001:60003;f.p.postings.invoicePostingsDetails=f.p.postings.invoicePostingsDetails.filter(s=>s.transactionNo!==id);f.p.taxRows=f.p.taxRows.filter(e=>e.posting.transactionNo!==id);f.evidence.definitions.splice(kind==='no-base'?0:2,1);}
 if(kind==='fee-scope-no-base'||kind==='fee-scope-no-vat'){const id=kind==='fee-scope-no-base'?60001:60003;f.p.postings.invoicePostingsDetails.find(s=>s.transactionNo===id)!.checkNo='other';Reflect.set(f.p.taxRows.find(e=>e.posting.transactionNo===id)!.posting,'checkNo','other');}
 if(kind==='check-mismatch')f.p.postings.invoicePostingsDetails[2].checkNo=' '+f.p.postings.invoicePostingsDetails[2].checkNo;
 if(kind==='unknown-ordinary'){f.evidence.definitions[0].before.transactionCode.classification.transactionType.code='Others';pairFeeEvidence(f);}
 expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});
it.each(['selected-amount','source-amount','selected-id','direct-id','unselected-sibling','unknown-window-sibling','reverse','nested','cashier','currency','hotel','window','date'] as const)('preserves unchanged full-source identity and closure rejection: %s',kind=>{
 const f=postedPosFeePacket(),source=f.p.taxRows[4].posting;
 if(kind==='selected-amount')f.p.postings.invoicePostingsDetails[2].debitAmount=money(99);
 if(kind==='source-amount')Reflect.set(source,'postedAmount',money(99));
 if(kind==='selected-id')f.p.postings.invoicePostingsDetails.push(structuredClone(f.p.postings.invoicePostingsDetails[2]));
 if(kind==='direct-id')f.p.taxRows.push(structuredClone(f.p.taxRows[4]));
 if(['unselected-sibling','unknown-window-sibling','reverse'].includes(kind)){const e=structuredClone(f.p.taxRows[4]);e.posting.transactionNo=99999;if(kind==='unknown-window-sibling')Reflect.deleteProperty(e.posting,'folioWindowNo');if(kind==='reverse')Reflect.set(e.posting,'referenceTransactionNo',60002);f.p.taxRows.push(e);}
 if(kind==='nested')Reflect.set(source,'subPostings',[{transactionNo:99999}]);
 if(kind==='cashier'){Reflect.set(source,'cashierInfo',{cashierId:3});Reflect.set(f.p.taxRows[3].posting,'cashierInfo',{cashierId:4});}
 if(kind==='currency')Reflect.set(source,'postedAmount',{amount:100,currencyCode:'USD'});
 if(kind==='hotel')source.hotelId='TSAN';if(kind==='window')Reflect.deleteProperty(source,'folioWindowNo');if(kind==='date')Reflect.set(source,'transactionDate','2026-01-03');
 expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence)).toThrow();
});
it('does not let forged or stale zero tokens hide unknown monetary atoms',()=>{
 const f=postedPosFeePacket();expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence,{} as VerifiedDirectZeroClaims)).toThrow();
 const z=sourceClaimsPacket(),token=verifyArOnlyDirectZeroClaims(z.p,z.proof.directZero.groups);
 expect(()=>verifyPostedPosFeeClaims(f.p,f.evidence,token)).toThrow();
});
it('composes with a verified source-bound direct-zero exclusion without filtering the packet',()=>{
 const z=sourceClaimsPacket(),f=postedPosFeePacket();
 for(const e of f.evidence.definitions){e.before.transactionCode.hotelId='TSAN';}
 f.evidence.interfaces.hotel='TSAN';f.evidence.interfaces.discoveryBefore.hotelInterfaces.forEach(e=>e.hotelId='TSAN');pairFeeEvidence(f);
 const packet={...z.p,postings:{...z.p.postings,trxCodesInfo:z.p.postings.trxCodesInfo.map(d=>d.transactionCode==='SERVICE'?{...d,transactionGroup:'F&B'}:d)}};
 const token=verifyArOnlyDirectZeroClaims(packet,z.proof.directZero.groups),before=JSON.stringify(packet);
 expect(verifyPostedPosFeeClaims(packet,f.evidence,token).size).toBe(3);expect(JSON.stringify(packet)).toBe(before);
 Reflect.set(packet.postings.invoicePostingsDetails[0],'reference','changed');
 expect(()=>verifyPostedPosFeeClaims(packet,f.evidence,token)).toThrow();
});
