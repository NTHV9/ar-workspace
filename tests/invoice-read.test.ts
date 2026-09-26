import {it,expect,vi} from 'vitest';
import {readInvoiceModel} from '../worker/invoice/read';
import {auditInvoiceRead} from '../worker/invoice/read-audit';
import {OperaError} from '../worker/opera/client';
import {packet,money,mixedTaxPacket,arAdjustmentPacket} from './fixtures/invoice-packet';
function fixture(count=2,p:ReturnType<typeof packet>|ReturnType<typeof mixedTaxPacket>=packet(count)){
 const current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'};
 const detail={details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[current]}]};
 const reader={invoiceReservation:vi.fn().mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],customReference:'CUSTOM-VOUCHER'}]}}),account:vi.fn().mockResolvedValue({accountDetails:{...p.account,invoices:[current]}}),invoiceHistory:vi.fn(),reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}}),financialTransactionDetail:vi.fn().mockImplementation(async()=>structuredClone(detail)),invoicePostings:vi.fn().mockResolvedValue(p.postings),invoicePostingBreakdown:vi.fn().mockImplementation(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:p.taxRows.slice(offset,offset+limit),offset,limit,hasMore:offset+limit<p.taxRows.length,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn().mockResolvedValue({trxCodesInfo:p.taxCodes})};
 return {p,reader,detail};
}
it('reads invoices spanning more than 30 calendar days in complete non-overlapping tax windows',async()=>{
 const p=packet(2);p.manifest.folio_date='2026-02-05';p.invoice.folioDate='2026-02-05';p.postings.invoicePostingsDetails[0].transactionDate='2026-01-01';p.postings.invoicePostingsDetails[1].transactionDate='2026-02-05';
 const {reader}=fixture(2,p);reader.invoicePostingBreakdown.mockImplementation(async(_r,_w,start,end,offset,limit)=>{if((Date.parse(end)-Date.parse(start))/86400000>=30)throw new OperaError('provider_rejected',400);const indices=start==='2026-01-01'?[0,2,3]:[1,4,5];const items=indices.map(i=>p.taxRows[i]);return {financialPostings:items,offset,limit,totalResults:items.length,hasMore:false};});
 expect((await readInvoiceModel(reader,p.manifest)).gross).toBe(663000);expect(reader.invoicePostingBreakdown.mock.calls.map(a=>a.slice(2,4))).toEqual([['2026-01-01','2026-01-30'],['2026-01-31','2026-02-05']]);
});
it('splits busy date windows before unstable OPERA pagination can lose package members',async()=>{
 const p=packet(20);p.postings.invoicePostingsDetails.forEach((r,n)=>r.transactionDate=n<10?'2026-01-02':'2026-01-10');const {reader}=fixture(20,p);
 reader.invoicePostingBreakdown.mockImplementation(async(_r,_w,start,end,offset,limit)=>{const items=p.taxRows.filter(r=>{const date=r.posting.referencePackageTransactionNo<=90010?'2026-01-02':'2026-01-10';return date>=start&&date<=end;});const batch=offset&&items.length>50?[items[49],...items.slice(51)]:items.slice(offset,offset+limit);return {financialPostings:batch,offset,limit,totalResults:items.length,hasMore:offset+limit<items.length};});
 expect((await readInvoiceModel(reader,p.manifest)).gross).toBe(6630000);expect(reader.invoicePostingBreakdown.mock.calls.every(a=>a[4]===0)).toBe(true);
});
it('reads an omitted optional taxes list and verifies separately posted VAT end-to-end',async()=>{
 const {p,reader}=fixture(1,mixedTaxPacket()),model=await readInvoiceModel(reader,p.manifest);
 expect(model.gross).toBe(454200);expect(model.vat).toBe(29387);expect(model.nonTaxable).toBe(5000);expect(reader.account).toHaveBeenCalledOnce();
});
it('reads missing AR adjustments by exact transaction ID with complete generated-posting evidence',async()=>{const p=arAdjustmentPacket(),{reader}=fixture(1,p);reader.invoiceTransactionDetails.mockImplementation(async(ids:string[])=>ids.includes('60001')?p.arDetails[0].response:{trxCodesInfo:p.taxCodes});const model=await readInvoiceModel(reader,p.manifest);expect(model.gross).toBe(341500);expect(model.nonTaxable).toBe(10000);expect(reader.invoiceTransactionDetails).toHaveBeenCalledWith(['60001']);});
it('reports a changed balance before a missing reservation selector on an old preparation',async()=>{const {p,reader,detail}=fixture(1);p.manifest.reservation_id='';reader.account.mockResolvedValue({accountDetails:{...p.account,invoices:[{...detail.details[0].invoices[0],balance:money(0)}]}});await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.reservationFolios).not.toHaveBeenCalled();});
it('reports the failing VAT page without returning customer rows or identities',async()=>{
 const {p,reader}=fixture(20);
 reader.invoicePostingBreakdown.mockImplementation(async(_r,_w,_s,_e,offset,limit)=>({financialPostings:offset?[p.taxRows[49],...p.taxRows.slice(51)]:p.taxRows.slice(0,50),offset,limit,hasMore:offset===0,totalResults:60}));
 const report=await auditInvoiceRead(reader,p.manifest);
 expect(report).toMatchObject({ok:false,stage:'invoicePostingBreakdown',error:'duplicate_member',pages:[{rows:50,acrossPages:0,withinPage:0},{rows:10,acrossPages:1,withinPage:0,changedDuplicates:0}]});
 expect(JSON.stringify(report)).not.toContain('Synthetic Travel');expect(JSON.stringify(report)).not.toContain('30001');
});
it('distinguishes a duplicate inside a VAT page from a page-boundary duplicate',async()=>{
 const {p,reader}=fixture();reader.invoicePostingBreakdown.mockResolvedValue({financialPostings:[p.taxRows[0],p.taxRows[0]],offset:0,limit:50,totalResults:2,hasMore:false});
 expect(await auditInvoiceRead(reader,p.manifest)).toMatchObject({ok:false,error:'duplicate_member',pages:[{withinPage:1,acrossPages:0}]});
});
it('restarts the entire invoice read when OPERA overlaps a VAT page, without mixing attempts',async()=>{
 const {p,reader}=fixture(20);let attempt=0;
 reader.invoicePostingBreakdown.mockImplementation(async(_r,_w,_s,_e,offset,limit)=>{
  if(offset===0)attempt++;
  const rows=offset===50&&attempt<3?[p.taxRows[49],...p.taxRows.slice(51)]:p.taxRows.slice(offset,offset+limit);
  return {financialPostings:rows,offset,limit,totalResults:60,hasMore:offset===0};
 });
 const model=await readInvoiceModel(reader,p.manifest);
 expect(model.lines).toHaveLength(20);expect(model.gross).toBe(6630000);
 expect(reader.invoicePostingBreakdown.mock.calls.map(c=>c[4])).toEqual([0,50,0,50,0,50]);
 expect(reader.account).toHaveBeenCalledTimes(3);expect(reader.invoicePostings).toHaveBeenCalledTimes(3);
});
it('bounds persistent duplicate recovery and never returns an incomplete model',async()=>{
 const {p,reader}=fixture();reader.invoicePostingBreakdown.mockResolvedValue({financialPostings:[p.taxRows[0],p.taxRows[0]],offset:0,limit:50,totalResults:2,hasMore:false});
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_source_unstable');
 expect(reader.account).toHaveBeenCalledTimes(3);expect(reader.invoiceTransactionDetails).not.toHaveBeenCalled();
});
it('does not retry or bypass a changed AR balance after recovering from overlapping pages',async()=>{
 const {p,reader,detail}=fixture();reader.invoicePostingBreakdown.mockResolvedValueOnce({financialPostings:[p.taxRows[0],p.taxRows[0]],offset:0,limit:50,totalResults:2,hasMore:false});
 const changed=structuredClone(detail);changed.details[0].invoices[0].balance=money(p.manifest.open-100);
 reader.financialTransactionDetail.mockResolvedValueOnce(detail).mockResolvedValueOnce(detail).mockResolvedValueOnce(changed);
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.account).toHaveBeenCalledTimes(2);
});
it('reads all VAT pages with the original-offset contract and rechecks the current AR balance',async()=>{
 const {p,reader}=fixture(20),model=await readInvoiceModel(reader,p.manifest);
 expect(model.lines).toHaveLength(20);expect(model.gross).toBe(6630000);expect(reader.invoicePostingBreakdown.mock.calls.map(c=>c.slice(4))).toEqual([[0,50],[50,50]]);expect(reader.financialTransactionDetail).toHaveBeenCalledTimes(2);
 expect(reader.invoicePostings).toHaveBeenCalledWith({hotel:'KAT',accountId:'101',transactionId:'500',invoiceNo:'99',folioNo:'88',internalFolioWindowId:'456'});
 expect(reader.invoicePostingBreakdown.mock.calls[0].slice(0,4)).toEqual(['777',1,'2026-01-02','2026-01-15']);
});
it('rejects a missing final VAT page rather than rendering a partial invoice',async()=>{
 const {p,reader}=fixture(20);reader.invoicePostingBreakdown.mockResolvedValue({financialPostings:p.taxRows.slice(0,50),offset:0,limit:50,hasMore:false,totalResults:60});await expect(readInvoiceModel(reader,p.manifest)).rejects.toMatchObject({message:'document_invoice_source_unstable',cause:{code:'pagination_incomplete'}});
});
it('does not reuse the unrelated invoicePayments next-offset convention',async()=>{
 const {p,reader}=fixture();reader.invoicePostingBreakdown.mockResolvedValue({financialPostings:p.taxRows,offset:50,limit:50,hasMore:false,totalResults:p.taxRows.length});await expect(readInvoiceModel(reader,p.manifest)).rejects.toMatchObject({message:'document_invoice_source_unstable',cause:{message:'document_invoice_pagination_changed'}});
});
it('stops when payment changes AR while the invoice is being prepared',async()=>{
 const {p,reader,detail}=fixture();const changed=structuredClone(detail);changed.details[0].invoices[0].balance=money(p.manifest.open-100);reader.financialTransactionDetail.mockResolvedValueOnce(detail).mockResolvedValueOnce(changed);await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');
});
it('rejects another hotel before reading posting or tax data',async()=>{
 const {p,reader}=fixture();reader.account.mockResolvedValue({accountDetails:{...p.account,hotelId:'WAKL'}});await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.invoicePostings).not.toHaveBeenCalled();
});
it('rejects an invoice detail from another account',async()=>{
 const {p,reader,detail}=fixture();detail.details[0].accountId.id='999';reader.financialTransactionDetail.mockResolvedValue(detail);await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.invoicePostings).not.toHaveBeenCalled();
});
it('includes selected adjustments posted after the original folio date',async()=>{const {p,reader}=fixture();p.postings.invoicePostingsDetails[1].transactionDate='2026-01-20';await readInvoiceModel(reader,p.manifest);expect(reader.invoicePostingBreakdown.mock.calls[0].slice(2,4)).toEqual(['2026-01-02','2026-01-20']);});
it('rejects a voucher response for another reservation',async()=>{const {p,reader}=fixture();reader.invoiceReservation.mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'999'}],customReference:'DO-NOT-USE'}]}});await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');});
it.each([true,false])('uses payee tax identity only when the selected window and AR profile agree (%s)',async agrees=>{
 const {p,reader}=fixture();const account={...p.account,profileId:{id:'123'}};reader.account.mockResolvedValue({accountDetails:{...account,invoices:[{...p.invoice,reservationId:{id:'777'}}]}});
 reader.reservationFolios.mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}],folioWindows:[{folioWindowNo:1,internalFolioWindowID:'456',payeeInfo:{payeeId:{id:agrees?'123':'999'},payeeTaxNumber:'SYNTHETIC-TAX'}}]}});
 expect((await readInvoiceModel(reader,p.manifest)).taxId).toBe(agrees?'SYNTHETIC-TAX':'');
});

it('identifies an AR credit without a reservation folio without fabricating an invoice',async()=>{
 const {p,reader}=fixture();const manifest={...p.manifest,reservation_id:null,folio_no:null};
 reader.account.mockResolvedValue({accountDetails:{...p.account,invoices:[{...p.invoice,reservationId:undefined,folioNo:undefined,invoiceType:'Credit'}]}});
 await expect(readInvoiceModel(reader,manifest)).rejects.toThrow('document_credit_without_folio');
 expect(reader.reservationFolios).not.toHaveBeenCalled();expect(reader.invoicePostings).not.toHaveBeenCalled();
});
