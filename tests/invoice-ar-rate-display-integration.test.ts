import {salesReaderFixture} from './fixtures/invoice-ar-only-pos-sales-reader';
import {signedMultiVatReaderFixture} from './fixtures/invoice-ar-only-pos-signed-multi-vat-reader';
import {it,expect,vi} from 'vitest';
import {arOnlyInvoiceModel,readArOnlyInvoicePacket,readArOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {qualifiedArRateDisplayHotel} from '../worker/invoice/ar-rate-display-proof';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import {wrapperNetPacket,withWrapperNetProof} from './fixtures/invoice-ar-only-wrapper-net-vat';
import {wrapperNetReaderFixture} from './fixtures/invoice-ar-only-wrapper-net-vat-reader';
import {nonVatReaderFixture} from './fixtures/invoice-ar-only-nonvat-reader';
import {posReaderFixture} from './fixtures/invoice-ar-only-pos-reader';
import {serviceReaderFixture} from './fixtures/invoice-ar-only-pos-service-reader';
import {discountReaderFixture} from './fixtures/invoice-ar-only-pos-discount-reader';
import {multiVatReaderFixture} from './fixtures/invoice-ar-only-pos-multi-vat-reader';
const now=new Date('2026-10-23T00:00:00Z');
const reservation=()=>({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],roomStay:{roomRates:[{start:'2026-01-02',end:'2026-01-02',ratePlanCode:'SYNTHETIC'}]}}]}});
const header=()=>({ratePlans:[{hotelId:'KAT',ratePlanCode:'SYNTHETIC',primaryDetails:{description:{defaultText:'Synthetic room',translatedTexts:[]}},transactionDetails:{packageTransactionCode:'ROOM',folioText:{defaultText:'Synthetic room package',translatedTexts:[]}}}]});
function modelFixture(){const {p,components}=wrapperNetPacket(),q=withWrapperNetProof(p,components),source=structuredClone(arOnlyTaxSource(q));return {q,proof:{version:1 as const,kind:'kat-current-ar-english-rate-display' as const,sourceBefore:source,sourceAfter:structuredClone(source),reservationBefore:reservation(),reservationAfter:reservation(),headers:[{ratePlanCode:'SYNTHETIC',before:header(),after:header()}]}};}
it('uses only verified bound wrapper descriptions while preserving every financial/reference/identity field',()=>{
 const {q,proof}=modelFixture(),before=arOnlyInvoiceModel(q,now),after=arOnlyInvoiceModel(Object.assign(q,{arRateDisplayProof:proof}),now);
 expect(after.lines[0].description).toBe('Synthetic room package');expect({...after,lines:after.lines.map(({description,...line})=>line)}).toEqual({...before,lines:before.lines.map(({description,...line})=>line)});
});
it('rejects an attached display proof whose paired rate headers disagree',()=>{
 const {q,proof}=modelFixture();proof.headers[0].after.ratePlans[0].transactionDetails.folioText.defaultText='Changed';expect(()=>arOnlyInvoiceModel(Object.assign(q,{arRateDisplayProof:proof}),now)).toThrow('document_invoice_ar_rate_display_unverified');
});
const feeReaderFixture=()=>{const f=serviceReaderFixture();for(const e of f.proof.definitions)Object.assign(e.before.transactionCode,{compTransaction:false,trxSetup:{...e.before.transactionCode.trxSetup,manualPosting:false}});return f;};
it.each([['nonvat',nonVatReaderFixture],['wrapper',wrapperNetReaderFixture],['multi',multiVatReaderFixture],['signed-multi',signedMultiVatReaderFixture],['discount',discountReaderFixture],['fee',feeReaderFixture],['receipt',serviceReaderFixture],['ordinary',posReaderFixture],['sales',salesReaderFixture]] as const)('finishes display diagnostics on every financial success branch: %s',async(_name,fixture)=>{
 const {p,reader}=fixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(Reflect.get(q,'arRateDisplayGap')).toBe(qualifiedArRateDisplayHotel(p.manifest.hotel)?'rate-display-capability':'rate-display-profile');expect(Reflect.get(q,'arRateDisplayProof')).toBeUndefined();expect(reader.folioReport).not.toHaveBeenCalled();
});
function readerFixture(){const f=wrapperNetReaderFixture(),r=reservation(),h=header(),events:string[]=[];f.reader.invoiceReservation.mockImplementation(async()=>structuredClone(r));const get=f.reader.invoicePostings.getMockImplementation()!;let posts=0;f.reader.invoicePostings.mockImplementation(async()=>{events.push('source:'+ ++posts);return get();});const reader=Object.assign(f.reader,{invoiceRatePlanFolioText:vi.fn(async(_code:string)=>{events.push('header');return structuredClone(h);})});return {...f,reader,r,h,events};}
it('pairs display reads across the existing financial source fence and attaches a verified description proof',async()=>{
 const {p,reader,events}=readerFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(Reflect.get(q,'arRateDisplayProof')).toBeDefined();expect(arOnlyInvoiceModel(q,now).lines[0].description).toBe('Synthetic room package');expect(events).toEqual(['source:1','header','source:2','header']);expect(reader.folioReport).not.toHaveBeenCalled();
});
it.each(['header','reservation'] as const)('rejects changed display %s across the source fence',async kind=>{
 const {p,reader,h,r}=readerFixture(),get=reader.invoicePostings.getMockImplementation()!;let calls=0;reader.invoicePostings.mockImplementation(async()=>{if(calls++){if(kind==='header')h.ratePlans[0].transactionDetails.folioText.defaultText='Changed';else r.reservations.reservation[0].roomStay.roomRates[0].end='2026-01-03';}return get();});await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');
});
it('keeps the original descriptor with an internal evidence gap when the display provider is unavailable',async()=>{
 const {p,reader}=readerFixture();reader.invoiceRatePlanFolioText.mockRejectedValue(Error('Unavailable'));const q=await readArOnlyInvoicePacket(reader,p.manifest);expect(Reflect.get(q,'arRateDisplayGap')).toBe('rate-display-evidence');expect(arOnlyInvoiceModel(q,now).lines[0].description).toBe(p.postings.trxCodesInfo[0].description);
});
it('retains source descriptions for stable unsupported display translations',async()=>{
 const {p,reader,h}=readerFixture();Reflect.set(h.ratePlans[0].transactionDetails.folioText,'translatedTexts',[{language:'FR',value:'Unqualified label'}]);const q=await readArOnlyInvoicePacket(reader,p.manifest);expect(Reflect.get(q,'arRateDisplayGap')).toBe('rate-display-evidence');expect(arOnlyInvoiceModel(q,now).lines[0].description).toBe(p.postings.trxCodesInfo[0].description);
});
it('qualifies financial proof before finishing display evidence and never lets a label repair invalid money evidence',async()=>{
 const {p,reader,definitions}=readerFixture();definitions.find(d=>d.transactionCode.code==='SVC')!.transactionCode.compTransaction=true;await expect(readArOnlyInvoicePacket(reader,p.manifest)).rejects.toThrow();expect(reader.invoiceRatePlanFolioText).toHaveBeenCalledTimes(1);
});

it('keeps a mixed TSAN rate proof and routed gap together through the common reader and model',async()=>{
 const f=readerFixture(),{p,reader,r,h,current,definitions}=f;for(const raw of [p.account,p.invoice,p.reservation,current])Reflect.set(raw,'hotelId','TSAN');p.manifest.hotel='TSAN';for(const entry of p.taxRows)Reflect.set(entry.posting,'hotelId','TSAN');for(const code of [...p.taxCodes,...p.postings.trxCodesInfo])Reflect.set(code,'hotelId','TSAN');for(const d of definitions)d.transactionCode.hotelId='TSAN';r.reservations.reservation[0].hotelId='TSAN';h.ratePlans[0].hotelId='TSAN';reader.financialTransactionDetail.mockImplementation(async()=>({details:[{hotelId:'TSAN',accountId:{id:'101'},invoices:[structuredClone(current)]}]}));
 const amount=p.invoice.amount.amount*2;p.manifest.open=amount;p.invoice.amount={...p.invoice.amount,amount};p.invoice.balance={...p.invoice.balance,amount};current.amount=p.invoice.amount;current.balance=p.invoice.balance;
 const selected=structuredClone(p.postings.invoicePostingsDetails[0]);selected.transactionNo=10002;selected.reference='Routed From prior reservation';p.postings.invoicePostingsDetails.push(selected);
 for(const original of [...p.taxRows]){const entry=structuredClone(original);entry.posting.transactionNo=entry.posting.transactionType==='Wrapper'?10002:entry.posting.transactionNo+10;entry.posting.referencePackageTransactionNo=90002;if(entry.posting.transactionType==='Wrapper')Reflect.set(entry.posting,'reference',selected.reference);if('postingBreakdown'in entry)for(const tax of entry.postingBreakdown.taxes){tax.transactionNo+=100;tax.referenceTransactionNo+=10;}p.taxRows.push(entry);}
 const q=await readArOnlyInvoicePacket(reader,p.manifest),model=arOnlyInvoiceModel(q,now);expect(q.arRateDisplayProof).toBeDefined();expect(q.arRateDisplayGap).toBe('rate-display-evidence');expect(model.lines.find(line=>line.id==='10001')?.description).toBe('Synthetic room package');expect(model.lines.find(line=>line.id==='10002')?.description).toBe('Accommodation charge');expect(model.gross).toBe(Math.round(amount*100));expect(reader.invoiceRatePlanFolioText).toHaveBeenCalledTimes(2);
});

