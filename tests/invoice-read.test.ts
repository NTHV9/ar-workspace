import {it,expect,vi} from 'vitest';
import {readInvoiceModel} from '../worker/invoice/read';
import {auditInvoiceRead} from '../worker/invoice/read-audit';
import {packet,money,mixedTaxPacket} from './fixtures/invoice-packet';
function fixture(count=2,p:ReturnType<typeof packet>|ReturnType<typeof mixedTaxPacket>=packet(count)){
 const current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'};
 const detail={details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[current]}]};
 const reader={invoiceReservation:vi.fn().mockResolvedValue({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],customReference:'CUSTOM-VOUCHER'}]}}),account:vi.fn().mockResolvedValue({accountDetails:{...p.account,invoices:[current]}}),invoiceHistory:vi.fn(),reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}}),financialTransactionDetail:vi.fn().mockImplementation(async()=>structuredClone(detail)),invoicePostings:vi.fn().mockResolvedValue(p.postings),invoicePostingBreakdown:vi.fn().mockImplementation(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:p.taxRows.slice(offset,offset+limit),offset,limit,hasMore:offset+limit<p.taxRows.length,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn().mockResolvedValue({trxCodesInfo:p.taxCodes})};
 return {p,reader,detail};
}
it('reads an omitted optional taxes list and verifies separately posted VAT end-to-end',async()=>{
 const {p,reader}=fixture(1,mixedTaxPacket()),model=await readInvoiceModel(reader,p.manifest);
 expect(model.gross).toBe(454200);expect(model.vat).toBe(29387);expect(model.nonTaxable).toBe(5000);expect(reader.account).toHaveBeenCalledOnce();
});
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
