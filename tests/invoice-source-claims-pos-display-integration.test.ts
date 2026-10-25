import {it,expect} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import {readArOnlyInvoicePacket,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {sourceClaimsPosDisplayFixture} from './fixtures/invoice-source-claims-pos-display';
import {sourceClaimsPosDisplayReaderFixture} from './fixtures/invoice-source-claims-pos-display-reader';
import {paymentOffsetFixture} from './fixtures/invoice-payment-offset-display';
const now=new Date('2026-10-23T00:00:00Z');
it.each(['v1','posted','signed-fee','explicit','exclusive','zero-group'] as const)('retains financial source rows and seven totals under %s grouped display',kind=>{
 const f=sourceClaimsPosDisplayFixture(kind),before=invoiceModel(f.packet,now),snapshot=JSON.stringify(f.packet);Reflect.set(f.packet,'arPosDisplayProof',f.proof);const after=invoiceModel(f.packet,now);expect(after.lines).toEqual(before.lines);const {displayLines,...financial}=after;expect(financial).toEqual(before);expect(displayLines?.filter(r=>r.kind==='pos-group')).toHaveLength(1);if(kind==='zero-group')expect(displayLines?.find(r=>r.kind==='pos-group')).toMatchObject({debit:0,credit:0,sourceIds:['60001','60002','60003','60004','60005','60006']});Reflect.deleteProperty(f.packet,'arPosDisplayProof');expect(JSON.stringify(f.packet)).toBe(snapshot);
});
it.each(['v1','posted','signed-fee','explicit','exclusive'] as const)('collects %s metadata across the SAME financial source read',async kind=>{
 const f=sourceClaimsPosDisplayReaderFixture(kind),q=await readArOnlyInvoicePacket(f.reader,f.p.manifest);expect(q.arOnlySourceClaimsProof).toBeDefined();expect(q.arPosDisplayProof).toBeDefined();expect(f.phases).toEqual([1,2]);expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);expect(f.reader.account).toHaveBeenCalledTimes(2);expect(arOnlyInvoiceModel(q,now).displayLines?.filter(r=>r.kind==='pos-group')).toHaveLength(1);expect(f.reader.invoiceCheckDetails).not.toHaveBeenCalled();expect(f.reader.folioReport).not.toHaveBeenCalled();
});
it('keeps rate labels, POS groups and City Ledger auxiliary sources orthogonal',()=>{
 const f=sourceClaimsPosDisplayFixture('posted'),city=paymentOffsetFixture();for(const posting of city.payments)f.packet.taxRows.push({posting});const source=arOnlyTaxSource(f.packet);f.packet.arOnlySourceClaimsProof!.sourceBefore=structuredClone(source);f.packet.arOnlySourceClaimsProof!.sourceAfter=structuredClone(source);f.proof.sourceBefore=structuredClone(source);f.proof.sourceAfter=structuredClone(source);city.proof.sourceBefore=structuredClone(source);city.proof.sourceAfter=structuredClone(source);
 const reservation={reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],roomStay:{roomRates:[{start:'2026-01-02',end:'2026-01-02',ratePlanCode:'SYN-RATE'}]}}]}},header={ratePlans:[{hotelId:'KAT',ratePlanCode:'SYN-RATE',transactionDetails:{packageTransactionCode:'ROOM',folioText:{defaultText:'Scoped room label'}}}]};Reflect.set(f.packet,'arRateDisplayProof',{version:1,kind:'kat-current-ar-english-rate-display',sourceBefore:structuredClone(source),sourceAfter:structuredClone(source),reservationBefore:reservation,reservationAfter:structuredClone(reservation),headers:[{ratePlanCode:'SYN-RATE',before:header,after:structuredClone(header)}]});const before=invoiceModel(f.packet,now);Reflect.set(f.packet,'arPaymentOffsetDisplayProof',city.proof);Reflect.set(f.packet,'arPosDisplayProof',f.proof);const after=invoiceModel(f.packet,now);expect(after.lines).toEqual(before.lines);expect(after.displayLines?.map(r=>r.id)).toEqual(['10001','60002','70001','70002']);expect(after.displayLines?.[0].description).toBe('Scoped room label');for(const field of ['gross','taxableNet','nonTaxable','vat','outstanding','debit','credit'] as const)expect(after[field]).toBe(before[field]);
});
it('rejects paired source metadata mutation without financial fallback',async()=>{
 const f=sourceClaimsPosDisplayReaderFixture(),original=f.reader.invoicePosDisplayFolios.getMockImplementation()!;let calls=0;f.reader.invoicePosDisplayFolios.mockImplementation(async()=>{const page=await original();if(calls++)page.windows[0].folios[0].postings[0].groupTypeInfo.groupDescription='Changed';return page;});await expect(readArOnlyInvoicePacket(f.reader,f.p.manifest)).rejects.toThrow('document_source_changed');expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);expect(f.reader.folioReport).not.toHaveBeenCalled();
});
import {transferProjectionReaderFixture} from './fixtures/invoice-ar-only-transfer-projection-reader';
import {zeroVatNetReaderFixture} from './fixtures/invoice-ar-only-zero-vat-net-reader';
it.each(['transfer','zero'] as const)('does not collect POS display metadata without a certified region: %s',async kind=>{
 const f=kind==='transfer'?transferProjectionReaderFixture():zeroVatNetReaderFixture();let calls=0;const q=await readArOnlyInvoicePacket({...f.reader,invoicePosDisplayFolios:async()=>{calls++;throw Error('ForbiddenPosDisplay');}},f.p.manifest);expect(calls).toBe(0);expect(q.arPosDisplayProof).toBeUndefined();expect(q.arPosDisplayGap).toBe('pos-display-profile');
});
it('never uses metadata as a fallback when financial classification is refused',async()=>{
 const f=sourceClaimsPosDisplayReaderFixture('posted');f.reader.invoiceTransactionCodeRules.mockRejectedValue(Error('FinancialRulesUnavailable'));await expect(readArOnlyInvoicePacket(f.reader,f.p.manifest)).rejects.toThrow('FinancialRulesUnavailable');expect(f.reader.invoicePosDisplayFolios).not.toHaveBeenCalled();expect(f.reader.folioReport).not.toHaveBeenCalled();
});
