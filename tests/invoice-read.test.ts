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
it('reads the exact invoice when unrelated historical folios share its reservation window',async()=>{
 const {reader,p}=fixture();
 reader.reservationFolios.mockResolvedValue({reservationFolioInformation:{reservationInfo:p.reservation,folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88},{invoiceNo:100,folioNo:89}]}]}});
 const model=await readInvoiceModel(reader,p.manifest);
 expect(model.gross).toBe(663000);
 expect(reader.invoicePostings).toHaveBeenCalledWith({hotel:'KAT',accountId:'101',transactionId:'500',invoiceNo:'99',folioNo:'88',internalFolioWindowId:'456'});
});
it('overlaps independent invoice header reads and keeps the final balance fence after postings',async()=>{
 const {reader,p}=fixture(),original=await reader.reservationFolios();reader.reservationFolios.mockClear();let release=()=>{};const gate=new Promise<void>(r=>{release=r;});
 reader.reservationFolios.mockImplementation(async()=>{await gate;return original;});
 const pending=readInvoiceModel(reader,p.manifest);
 try{await vi.waitFor(()=>{expect(reader.financialTransactionDetail).toHaveBeenCalledTimes(1);expect(reader.invoiceReservation).toHaveBeenCalledOnce();},{timeout:250,interval:10});expect(reader.invoicePostings).not.toHaveBeenCalled();}finally{release();await pending;}
 expect(reader.financialTransactionDetail).toHaveBeenCalledTimes(2);expect(reader.financialTransactionDetail.mock.invocationCallOrder[1]).toBeGreaterThan(reader.invoicePostings.mock.invocationCallOrder[0]);
});
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
it('reads missing AR adjustments by exact transaction ID with complete generated-posting evidence',async()=>{const p=arAdjustmentPacket(),{reader}=fixture(1,p);reader.invoiceTransactionDetails.mockImplementation(async(ids:string[])=>ids.includes('60001')?p.arDetails[0].response:{trxCodesInfo:p.taxCodes});await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_tax_unverified');expect(reader.invoiceTransactionDetails).toHaveBeenCalledWith(['60001']);});
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
 const profile=async()=>({profileIdList:[{id:'123',type:'Profile'}],profileDetails:{addresses:{addressInfo:[{id:'verified-primary',address:{...p.account.address.address,primaryInd:true}}],totalResults:1}}});
 expect((await readInvoiceModel({...reader,profile},p.manifest)).taxId).toBe(agrees?'SYNTHETIC-TAX':'');
});

it('identifies an AR credit without a reservation folio without fabricating an invoice',async()=>{
 const {p,reader}=fixture();const manifest={...p.manifest,reservation_id:null,folio_no:null};
 reader.account.mockResolvedValue({accountDetails:{...p.account,invoices:[{...p.invoice,reservationId:undefined,folioNo:undefined,invoiceType:'Credit'}]}});
 await expect(readInvoiceModel(reader,manifest)).rejects.toThrow('document_credit_without_folio');
 expect(reader.reservationFolios).not.toHaveBeenCalled();expect(reader.invoicePostings).not.toHaveBeenCalled();
});

it('uses the verified linked profile address when the AR account only supplies an address reference',async()=>{
 const {reader,p}=fixture();const current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'};
 reader.account.mockResolvedValue({accountDetails:{...p.account,profileId:{id:'202',type:'Profile'},address:{id:'address-7',type:'Address'},invoices:[current]}});
 const profile=vi.fn().mockResolvedValue({profileIdList:[{id:'202',type:'Profile'}],profileDetails:{addresses:{addressInfo:[{id:'address-7',address:{addressLine:['Synthetic Legal Name','1 Example Street','Sample Town 10000','Exampleland VAT ID: SYN-123'],primaryInd:false}}],totalResults:1}}});
 const linkedReader={...reader,profile};const model=await readInvoiceModel(linkedReader,p.manifest);
 expect(model.address).toEqual(['Synthetic Travel','Synthetic Legal Name','1 Example Street','Sample Town 10000','Exampleland VAT ID: SYN-123']);
});
it('includes country and VAT stationery from the exact profile address when AR supplies only three nonblank lines',async()=>{
 const {reader,p}=fixture(),full=['Synthetic Legal Name','1 Example Street','Sample Town 10000','Exampleland VAT ID: SYN-123'];
 reader.account.mockResolvedValue({accountDetails:{...p.account,profileId:{id:'202',type:'Profile'},address:{id:'address-7',address:{addressLine:full.slice(0,3),country:{}}},invoices:[{...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'}]}});
 const profile=async()=>({profileIdList:[{id:'202',type:'Profile'}],profileDetails:{addresses:{addressInfo:[{id:'address-7',address:{addressLine:full,primaryInd:false,country:{}}},{id:'another-primary',address:{addressLine:['Another Address'],primaryInd:true}}],totalResults:2}}});
 const model=await readInvoiceModel({...reader,profile},p.manifest);
 expect(model.address).toEqual(['Synthetic Travel',...full]);expect(model.gross).toBe(663000);expect(model.outstanding).toBe(Math.round(p.manifest.open*100));
});

it('reports bounded address shape on a failed linked profile without returning customer values',async()=>{
 const {reader,p}=fixture(),current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'};
 reader.account.mockResolvedValue({accountDetails:{...p.account,profileId:{id:'PRIVATE-PROFILE'},address:{id:'PRIVATE-ADDRESS'},invoices:[current]}});
 const profile=vi.fn().mockResolvedValue({profileIdList:[{id:'PRIVATE-PROFILE',type:'Profile'}],profileDetails:{addresses:{addressInfo:[{id:'PRIVATE-ADDRESS',address:{primaryInd:true,cityName:'PRIVATE-CITY'}}],totalResults:1}}});
 const report=await auditInvoiceRead({...reader,profile},p.manifest);
 expect(report).toMatchObject({ok:false,error:'document_addressee_unavailable',addressee:{profileIdentityMatches:true,attachedAddressPresent:true,addressesKind:'object',addressInfoKind:'array',addressCount:1,totalResults:1,rows:[{attachedMatch:true,primary:true,lineKind:'undefined',lineCount:null,nonblankLines:null,cityPresent:true}]}});
 expect(profile).toHaveBeenCalledOnce();
 expect(JSON.stringify(report)).not.toMatch(/PRIVATE-|Synthetic Travel/);
});
it('renders country-only verified profile stationery without inventing postal lines or changing invoice totals',async()=>{
 const {reader,p}=fixture();reader.account.mockResolvedValue({accountDetails:{...p.account,profileId:{id:'202',type:'Profile'},address:{id:'address-7',type:'Address'},invoices:[{...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'}]}});
 const profile=vi.fn().mockResolvedValue({profileIdList:[{id:'202',type:'Profile'}],profileDetails:{addresses:{addressInfo:[{id:'address-7',address:{addressLine:['','','',''],primaryInd:true,country:{code:'TH'}}}],totalResults:1}}});
 const model=await readInvoiceModel({...reader,profile},p.manifest);
 expect(model.address).toEqual(['Synthetic Travel','TH']);expect(model.gross).toBe(663000);expect(model.outstanding).toBe(Math.round(p.manifest.open*100));
});
it.each([undefined,null,{}, {addressInfo:null}])('diagnoses an absent address list without treating it as verified empty (%j)',async addresses=>{
 const {reader,p}=fixture();reader.account.mockResolvedValue({accountDetails:{...p.account,profileId:{id:'PRIVATE-PROFILE'},address:{},invoices:[{...p.invoice,reservationId:{id:'777'}}]}});
 const report=await auditInvoiceRead({...reader,profile:async()=>({profileIdList:[{id:'PRIVATE-PROFILE',type:'Profile'}],profileDetails:{addresses}})},p.manifest);
 expect(report).toMatchObject({ok:false,error:'document_addressee_unavailable',addressee:{profileIdentityMatches:true,addressCount:null,rows:[]}});
 expect(JSON.stringify(report)).not.toContain('PRIVATE-');
});
it('caps diagnostic rows and never returns untrusted count fields or dynamic profile keys',async()=>{
 const {reader,p}=fixture();reader.account.mockResolvedValue({accountDetails:{...p.account,profileId:{id:'PRIVATE-PROFILE'},address:{},invoices:[{...p.invoice,reservationId:{id:'777'}}]}});
 const report=await auditInvoiceRead({...reader,profile:async()=>({profileIdList:[{id:'PRIVATE-PROFILE',type:'Profile'}],profileDetails:{addresses:{'PRIVATE-KEY':'PRIVATE-TEXT',totalResults:'PRIVATE-TOTAL',count:'PRIVATE-COUNT',addressInfo:Array.from({length:25},()=>({id:'PRIVATE-ID',address:{addressLine:['PRIVATE-LINE'],cityName:'PRIVATE-CITY',postalCode:'PRIVATE-POSTAL',country:{code:'PRIVATE-COUNTRY'}}}))}}})},p.manifest);
 expect(report).toMatchObject({ok:false,error:'document_addressee_incomplete',addressee:{addressCount:25,totalResults:null,count:null,omittedRows:5}});
 expect('addressee' in report&&report.addressee?.rows).toHaveLength(20);
 expect(JSON.stringify(report)).not.toMatch(/PRIVATE-|Synthetic Travel/);
});
async function qualifiedTsAnReader(hotel='TSAN'){
 const p=JSON.parse(JSON.stringify(arAdjustmentPacket()).replaceAll('KAT',hotel));
 const {reader}=fixture(1,p);reader.invoiceReservation.mockResolvedValue({reservations:{reservation:[{hotelId:hotel,reservationIdList:[{type:'Reservation',id:'777'}]}]}});
 reader.financialTransactionDetail.mockResolvedValue({details:[{hotelId:hotel,accountId:{id:'101'},invoices:[{...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'}]}]});
 reader.invoiceTransactionDetails.mockImplementation(async(ids:string[])=>ids.includes('60001')?p.arDetails[0].response:{trxCodesInfo:p.taxCodes});
 const {PDFDocument,StandardFonts}=await import('pdf-lib'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([612,792]);
 for(const [label,value,y] of [['Folio No.','88',650],['Total VAT 7%','223.41',380],['Total Non VAT Amount','0.00',366]] as const){page.drawText(label,{x:320,y,size:9,font});page.drawText(value,{x:520,y,size:9,font});if(y<400)page.drawText('THB',{x:570,y,size:9,font});}
 const bytes=await pdf.save(),code='AR-ADJUSTMENT';
 const rules={transactionCode:{hotelId:hotel,code,classification:{type:'Revenue',group:{code:'RM'}},trxSetup:{generatesType:'INCLUSIVE',taxInclusive:true,nonTaxable:false},generatesSetup:{addBaseAmtTo:{bucket1:true,bucket2:false,bucket3:false},generates:[{code:'VAT',rule:{percentage:{amount:7,calculatedOn:'Base',useTaxBracket:false},posting:{adjustmentType:'NoAdjustment'}},addGeneratedAmtTo:{bucket1:false,bucket2:false,bucket3:false}}]},associatedTransactionCodes:[]}};
 return {p,reader:{...reader,folioTypeName:vi.fn().mockResolvedValue({details:{hotelId:hotel,folioReportName:({KAT:'kat_folio',TSK:'tsk_folio_vat',TLKL:'tlkl_folio_vat',WAKL:'wakl_folio_vat',TLFO:'tlfo_folio_vat',TSAN:'tsan_folio'} as Record<string,string>)[hotel]}}),folioReport:vi.fn().mockResolvedValue({folio:{hotelId:hotel,reservationId:{id:'777'},folio:Buffer.from(bytes).toString('base64')}}),invoiceTransactionCodeRules:vi.fn().mockImplementation(async(c:string)=>c===code?rules:{transactionCode:{hotelId:hotel,code:c,classification:{group:{code:'TAX'}},description:{defaultText:'VAT'}}}),invoiceChargeSimulation:vi.fn().mockResolvedValue({result:{totalAmount:100,charges:[{transactionCode:code,amount:100,sequence:0,basePosting:true},{transactionCode:code,amount:100/1.07,sequence:0,basePosting:false},{transactionCode:'VAT',amount:100*7/107,sequence:1,basePosting:false}]}})}};
}
it('keeps raw diagnostics read-only unless tax qualification is explicitly selected',async()=>{const {p,reader}=await qualifiedTsAnReader(),{readInvoicePacket}=await import('../worker/invoice/read');await readInvoicePacket(reader,p.manifest);expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();});
it('normal invoice generation automatically reconciles qualified TSAN adjustments',async()=>{const {p,reader}=await qualifiedTsAnReader();const model=await readInvoiceModel(reader,p.manifest);expect(model.vat).toBe(22341);expect(model.gross).toBe(341500);expect(reader.folioReport).toHaveBeenCalledOnce();});
it('qualifies the explicit diagnostic path with current native tax controls and full posting fence',async()=>{const {p,reader}=await qualifiedTsAnReader(),{readInvoicePacket}=await import('../worker/invoice/read'),{invoiceModel}=await import('../worker/invoice/model');const model=invoiceModel(await readInvoicePacket(reader,p.manifest,true));expect(model.vat).toBe(22341);expect(model.gross).toBe(341500);expect(reader.invoicePostings).toHaveBeenCalledTimes(2);expect(reader.folioReport).toHaveBeenCalledOnce();});
it('rejects an offsetting change to AR postings even when the invoice balance is unchanged',async()=>{const {p,reader}=await qualifiedTsAnReader(),{readInvoicePacket}=await import('../worker/invoice/read');const changed=structuredClone(p.postings);changed.invoicePostingsDetails[0].debitAmount.amount+=1;changed.invoicePostingsDetails[1].debitAmount.amount-=1;reader.invoicePostings.mockResolvedValueOnce(p.postings).mockResolvedValueOnce(changed);await expect(readInvoicePacket(reader,p.manifest,true)).rejects.toThrow('document_source_changed');});
it('marks native control printing before a timeout and does not restart the invoice read',async()=>{const {p,reader}=await qualifiedTsAnReader(),onPrint=vi.fn();reader.folioReport.mockRejectedValue(new OperaError('pagination_changed'));await expect(readInvoiceModel(reader,p.manifest,undefined,onPrint)).rejects.toMatchObject({code:'pagination_changed'});expect(onPrint).toHaveBeenCalledOnce();expect(reader.folioReport).toHaveBeenCalledOnce();expect(reader.invoiceChargeSimulation).toHaveBeenCalledOnce();});

it.each(['KAT','TSK','TLKL','WAKL','TLFO'])('automatically qualifies an adjustment for %s with its own report and tax definitions',async hotel=>{const {p,reader}=await qualifiedTsAnReader(hotel);const model=await readInvoiceModel(reader,p.manifest);expect(model.hotel).toBe(hotel);expect(model.vat).toBe(22341);expect(reader.folioTypeName).toHaveBeenCalledWith('Guest');expect(reader.folioReport).toHaveBeenCalledOnce();});
it('rejects a configured native report from another hotel before requesting a PDF',async()=>{const {p,reader}=await qualifiedTsAnReader('KAT');reader.folioTypeName.mockResolvedValue({details:{hotelId:'KAT',folioReportName:'tsan_folio'}});await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_tax_unverified');expect(reader.folioReport).not.toHaveBeenCalled();});
it('does not activate a pre-opening hotel through the tax fallback',async()=>{const {p,reader}=await qualifiedTsAnReader('TSUN');await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_tax_unverified');expect(reader.folioReport).not.toHaveBeenCalled();});
