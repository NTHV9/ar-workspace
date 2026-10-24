import {it,expect} from 'vitest';
import {beginArRateDisplayRead} from '../worker/invoice/ar-rate-display-read';
import {verifyArRateDisplayProof} from '../worker/invoice/ar-rate-display-proof';
import {wrapperNetPacket} from './fixtures/invoice-ar-only-wrapper-net-vat';

function fixture(){
 const {p}=wrapperNetPacket();
 const reservation={reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],roomStay:{roomRates:[{start:'2026-01-02',end:'2026-01-02',ratePlanCode:'SYNTHETIC'}]}}]}};
 const header={ratePlans:[{hotelId:'KAT',ratePlanCode:'SYNTHETIC',primaryDetails:{description:{defaultText:'Example family room',translatedTexts:[]}},transactionDetails:{packageTransactionCode:'ROOM',folioText:{translatedTexts:[]}}}]};
 return {p,reservation,header};
}
it('pairs each unique rate header around the caller source fence with an invoice-local cache',async()=>{
 const {p,reservation,header}=fixture(),calls:string[]=[];
 const second=structuredClone(p.postings.invoicePostingsDetails[0]);second.transactionNo=10002;p.postings.invoicePostingsDetails.push(second);
 const root=structuredClone(p.taxRows[0]);root.posting.transactionNo=10002;p.taxRows.push(root);
 const reader={invoiceReservation:async(id:string)=>{calls.push('reservation:'+id);return structuredClone(reservation);},invoiceRatePlanFolioText:async(code:string)=>{calls.push('rate:'+code);return structuredClone(header);}};
 const session=await beginArRateDisplayRead(reader,p);calls.push('source-fence');const result=await session.finish(structuredClone(p));
 expect(calls).toEqual(['reservation:777','rate:SYNTHETIC','source-fence','reservation:777','rate:SYNTHETIC']);
 expect(result.gap).toBeUndefined();expect([...verifyArRateDisplayProof(p,result.proof!)]).toEqual([['10001','Example family room'],['10002','Example family room']]);
 await beginArRateDisplayRead(reader,p);expect(calls.filter(c=>c==='rate:SYNTHETIC')).toHaveLength(3);
});
it.each(['source','header','reservation'])('rejects changes across the source fence: %s',async kind=>{
 const {p,reservation,header}=fixture();
 const reader={invoiceReservation:async()=>structuredClone(reservation),invoiceRatePlanFolioText:async()=>structuredClone(header)};
 const session=await beginArRateDisplayRead(reader,p),fresh=structuredClone(p);
 if(kind==='source')fresh.invoice.amount.amount+=1;
 if(kind==='header')header.ratePlans[0].primaryDetails.description.defaultText='Changed';
 if(kind==='reservation')reservation.reservations.reservation[0].roomStay.roomRates[0].end='2026-01-03';
 await expect(session.finish(fresh)).rejects.toThrow('document_source_changed');
});
it('retains existing descriptors with a diagnostic gap outside the qualified hotel or capability',async()=>{
 const {p}=fixture();let calls=0;const reader={invoiceReservation:async()=>{calls++;throw Error('must not read');}};
 const missing=await beginArRateDisplayRead(reader,p);expect(await missing.finish(p)).toEqual({gap:'rate-display-capability'});expect(calls).toBe(0);
 p.manifest.hotel='OTHER';const other=await beginArRateDisplayRead(reader,p);expect(await other.finish(p)).toEqual({gap:'rate-display-profile'});expect(calls).toBe(0);
});
it('does not attach proof for unresolved translations or unsupported reservation dates',async()=>{
 const {p,reservation,header}=fixture();Reflect.set(header.ratePlans[0].transactionDetails.folioText,'translatedTexts',[{language:'FR',value:'French label'}]);
 const reader={invoiceReservation:async()=>structuredClone(reservation),invoiceRatePlanFolioText:async()=>structuredClone(header)};
 const session=await beginArRateDisplayRead(reader,p);expect(await session.finish(p)).toEqual({gap:'rate-display-evidence'});
 reservation.reservations.reservation[0].roomStay.roomRates.push(structuredClone(reservation.reservations.reservation[0].roomStay.roomRates[0]));
 const overlap=await beginArRateDisplayRead(reader,p);expect(await overlap.finish(p)).toEqual({gap:'rate-display-evidence'});
});
it.each(['TLFO','TLKL','TSK','WAKL','TSAN'] as const)('pairs reservation and rate reads around the source fence for qualified property %s',async hotel=>{
 const {p,reservation,header}=fixture(),calls:string[]=[];p.manifest.hotel=hotel;for(const entry of p.taxRows)Reflect.set(entry.posting,'hotelId',hotel);reservation.reservations.reservation[0].hotelId=hotel;header.ratePlans[0].hotelId=hotel;const reader={invoiceReservation:async()=>{calls.push('reservation');return structuredClone(reservation);},invoiceRatePlanFolioText:async()=>{calls.push('rate');return structuredClone(header);}};const session=await beginArRateDisplayRead(reader,p);calls.push('fence');const result=await session.finish(structuredClone(p));expect(result.gap).toBeUndefined();expect(result.proof?.kind).toBe('current-ar-english-rate-display');expect([...verifyArRateDisplayProof(p,result.proof!)]).toEqual([['10001','Example family room']]);expect(calls).toEqual(['reservation','rate','fence','reservation','rate']);
});

it.each(['mixed','all-routed'] as const)('retains explicit routed gaps for a TSAN %s packet and reads only eligible headers',async kind=>{
 const {p,reservation,header}=fixture();p.manifest.hotel='TSAN';for(const entry of p.taxRows)Reflect.set(entry.posting,'hotelId','TSAN');reservation.reservations.reservation[0].hotelId='TSAN';header.ratePlans[0].hotelId='TSAN';
 if(kind==='mixed'){const selected=structuredClone(p.postings.invoicePostingsDetails[0]),source=structuredClone(p.taxRows[0]);selected.transactionNo=10002;source.posting.transactionNo=10002;Reflect.set(selected,'reference','Routed From prior reservation');Reflect.set(source.posting,'reference','Routed From prior reservation');p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(source);}else{Reflect.set(p.postings.invoicePostingsDetails[0],'reference','Routed From prior reservation');Reflect.set(p.taxRows[0].posting,'reference','Routed From prior reservation');}
 let reads=0;const reader={invoiceReservation:async()=>structuredClone(reservation),invoiceRatePlanFolioText:async()=>{reads++;return structuredClone(header);}},session=await beginArRateDisplayRead(reader,p),result=await session.finish(structuredClone(p));expect(result.gap).toBe('rate-display-evidence');expect(reads).toBe(kind==='mixed'?2:0);if(kind==='mixed')expect([...verifyArRateDisplayProof(p,result.proof!)]).toEqual([['10001','Example family room']]);else expect(result.proof).toBeUndefined();
});
