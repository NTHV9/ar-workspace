import {it,expect} from 'vitest';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import {inspectArRateDisplayBindings,verifyArRateDisplayProof,type ArRateDisplayProof} from '../worker/invoice/ar-rate-display-proof';
import {wrapperNetPacket} from './fixtures/invoice-ar-only-wrapper-net-vat';

function fixture(){
 const {p}=wrapperNetPacket();
 const reservation={reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],roomStay:{roomRates:[{start:'2026-01-02',end:'2026-01-02',ratePlanCode:'SYNTHETIC'}]}}]}};
 const header={ratePlans:[{hotelId:'KAT',ratePlanCode:'SYNTHETIC',primaryDetails:{description:{defaultText:'Synthetic rate description',translatedTexts:[]}},transactionDetails:{packageTransactionCode:'ROOM',folioText:{translatedTexts:[]}}}]};
 const proof:ArRateDisplayProof={version:1,kind:'kat-current-ar-english-rate-display',sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),reservationBefore:structuredClone(reservation),reservationAfter:structuredClone(reservation),headers:[{ratePlanCode:'SYNTHETIC',before:structuredClone(header),after:structuredClone(header)}]};
 return {p,reservation,header,proof};
}
it('uses a uniquely dated source rate description only when explicit folio text is blank',()=>{
 const {p,proof}=fixture(),before=structuredClone(p);
 expect([...verifyArRateDisplayProof(p,proof)]).toEqual([['10001','Synthetic rate description']]);
 expect(p).toEqual(before);
});
it('preserves explicit folio text over a different rate description for ordinary negative controls',()=>{
 const {p,proof}=fixture();
 for(const pair of proof.headers)for(const raw of [pair.before,pair.after])Reflect.set((raw as ReturnType<typeof fixture>['header']).ratePlans[0].transactionDetails.folioText,'defaultText','Accommodation Charge');
 expect([...verifyArRateDisplayProof(p,proof)]).toEqual([['10001','Accommodation Charge']]);
});
it.each(['hotel','reservation','overlap','wrong-date','missing-code','duplicate-header','wrong-header-hotel','wrong-header-code','wrong-package','changed-header','changed-reservation','changed-money','source-code','source-date','translated-only','missing-default','native','profile'] as const)('refuses unsupported or changed display evidence: %s',kind=>{
 const {p,proof}=fixture();const r=proof.reservationBefore as ReturnType<typeof fixture>['reservation'],after=proof.reservationAfter as typeof r;
 const before=proof.headers[0].before as ReturnType<typeof fixture>['header'],headerAfter=proof.headers[0].after as typeof before;
 if(kind==='hotel')p.manifest.hotel='TSAN';
 if(kind==='reservation')for(const value of [r,after])value.reservations.reservation[0].reservationIdList[0].id='999';
 if(kind==='overlap')for(const value of [r,after])value.reservations.reservation[0].roomStay.roomRates.push({...value.reservations.reservation[0].roomStay.roomRates[0]});
 if(kind==='wrong-date')for(const value of [r,after])value.reservations.reservation[0].roomStay.roomRates[0].start='2026-01-03';
 if(kind==='missing-code')for(const value of [r,after])value.reservations.reservation[0].roomStay.roomRates[0].ratePlanCode='';
 if(kind==='duplicate-header')proof.headers.push(structuredClone(proof.headers[0]));
 if(kind==='wrong-header-hotel')for(const value of [before,headerAfter])value.ratePlans[0].hotelId='TSAN';
 if(kind==='wrong-header-code')for(const value of [before,headerAfter])value.ratePlans[0].ratePlanCode='OTHER';
 if(kind==='wrong-package')for(const value of [before,headerAfter])value.ratePlans[0].transactionDetails.packageTransactionCode='OTHER';
 if(kind==='changed-header')headerAfter.ratePlans[0].primaryDetails.description.defaultText='Changed';
 if(kind==='changed-reservation')after.reservations.reservation[0].roomStay.roomRates[0].ratePlanCode='OTHER';
 if(kind==='changed-money')p.invoice.amount.amount+=1;
 if(kind==='source-code')Reflect.set(p.taxRows[0].posting,'transactionCode','OTHER');
 if(kind==='source-date')Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-03');
 // Rebind snapshots for these cases so the selected/source ownership guard,
 // rather than the general mutation fence, must detect the wrong source.
 if(kind==='source-code'||kind==='source-date'){proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));}
 if(kind==='translated-only')for(const value of [before,headerAfter])Reflect.set(value.ratePlans[0].transactionDetails.folioText,'translatedTexts',[{language:'FR',value:'French display'}]);
 if(kind==='missing-default')for(const value of [before,headerAfter])value.ratePlans[0].primaryDetails.description.defaultText='';
 if(kind==='native')Reflect.set(p,'nativeTaxControls',undefined);
 if(kind==='profile')Reflect.set(proof,'kind','other-profile');
 expect(()=>verifyArRateDisplayProof(p,proof)).toThrow('document_invoice_ar_rate_display_unverified');
});
it('accepts only one actual matching inclusive rate interval, without choosing a label by native text',()=>{
 const {p,reservation}=fixture();reservation.reservations.reservation[0].roomStay.roomRates[0].start='2026-01-01';reservation.reservations.reservation[0].roomStay.roomRates[0].end='2026-01-03';
 expect(inspectArRateDisplayBindings(p,reservation)).toEqual([{postingId:'10001',date:'2026-01-02',transactionCode:'ROOM',ratePlanCode:'SYNTHETIC'}]);
});
it.each(['TLFO','TLKL','TSK','WAKL'] as const)('uses the same source-bound empirical policy for qualified property %s',hotel=>{
 const {p,proof}=fixture();p.manifest.hotel=hotel;for(const entry of p.taxRows)Reflect.set(entry.posting,'hotelId',hotel);for(const raw of [proof.reservationBefore,proof.reservationAfter])(raw as ReturnType<typeof fixture>['reservation']).reservations.reservation[0].hotelId=hotel;for(const raw of [proof.headers[0].before,proof.headers[0].after])(raw as ReturnType<typeof fixture>['header']).ratePlans[0].hotelId=hotel;Reflect.set(proof,'kind','current-ar-english-rate-display');proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));const before=structuredClone(p);
 expect([...verifyArRateDisplayProof(p,proof)]).toEqual([['10001','Synthetic rate description']]);for(const raw of [proof.headers[0].before,proof.headers[0].after])Reflect.set((raw as ReturnType<typeof fixture>['header']).ratePlans[0].transactionDetails.folioText,'defaultText','Configured explicit folio');expect([...verifyArRateDisplayProof(p,proof)]).toEqual([['10001','Configured explicit folio']]);expect(p).toEqual(before);
});
it('does not treat the legacy KAT proof kind as a newly qualified hotel policy',()=>{
 const {p,proof}=fixture();p.manifest.hotel='TLFO';expect(()=>verifyArRateDisplayProof(p,proof)).toThrow();
});

it('qualifies only nonrouted TSAN wrapper bindings without a rate-code whitelist',()=>{
 const {p,proof}=fixture();p.manifest.hotel='TSAN';for(const entry of p.taxRows)Reflect.set(entry.posting,'hotelId','TSAN');for(const raw of [proof.reservationBefore,proof.reservationAfter])(raw as ReturnType<typeof fixture>['reservation']).reservations.reservation[0].hotelId='TSAN';for(const raw of [proof.headers[0].before,proof.headers[0].after])(raw as ReturnType<typeof fixture>['header']).ratePlans[0].hotelId='TSAN';proof.kind='current-ar-english-rate-display';
 const selected=structuredClone(p.postings.invoicePostingsDetails[0]),source=structuredClone(p.taxRows[0]);selected.transactionNo=10002;Reflect.set(selected,'reference','[NA Pkg. Trx] Routed From prior reservation');source.posting.transactionNo=10002;Reflect.set(source.posting,'reference','[NA Pkg. Trx] Routed From prior reservation');p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));const before=structuredClone(p);
 expect([...verifyArRateDisplayProof(p,proof)]).toEqual([['10001','Synthetic rate description']]);expect(p).toEqual(before);
});
it.each(['selected','posted'] as const)('keeps a TSAN wrapper outside the domain when only its %s reference declares routing',kind=>{
 const {p,reservation}=fixture();p.manifest.hotel='TSAN';for(const entry of p.taxRows)Reflect.set(entry.posting,'hotelId','TSAN');reservation.reservations.reservation[0].hotelId='TSAN';const selected=structuredClone(p.postings.invoicePostingsDetails[0]),source=structuredClone(p.taxRows[0]);selected.transactionNo=10002;source.posting.transactionNo=10002;Reflect.set(kind==='selected'?selected:source.posting,'reference','Routed From prior reservation');p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);expect(inspectArRateDisplayBindings(p,reservation).map(v=>v.postingId)).toEqual(['10001']);
});

it.each(['KAT','TLFO','TLKL','TSK','WAKL'])('retains the separately qualified routed policy for %s',hotel=>{
 const {p,proof}=fixture();p.manifest.hotel=hotel;Reflect.set(p.postings.invoicePostingsDetails[0],'reference','Routed From prior reservation');for(const entry of p.taxRows){Reflect.set(entry.posting,'hotelId',hotel);Reflect.set(entry.posting,'reference','Routed From prior reservation');}for(const raw of [proof.reservationBefore,proof.reservationAfter])(raw as ReturnType<typeof fixture>['reservation']).reservations.reservation[0].hotelId=hotel;for(const raw of [proof.headers[0].before,proof.headers[0].after])(raw as ReturnType<typeof fixture>['header']).ratePlans[0].hotelId=hotel;proof.kind='current-ar-english-rate-display';proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(arOnlyTaxSource(p));expect([...verifyArRateDisplayProof(p,proof)]).toEqual([['10001','Synthetic rate description']]);
});
