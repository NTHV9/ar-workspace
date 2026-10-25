import {it,expect,vi} from 'vitest';
import {readArOnlyInvoiceModel,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {currentPacket} from './fixtures/invoice-current-ar-tax';
function fixture(){
 const p=currentPacket(),current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'},sim=p.arSimulations[0];
 const reader={account:vi.fn(async()=>({accountDetails:{...structuredClone(p.account),invoices:[structuredClone(current)]}})),invoiceHistory:vi.fn(),reservationFolios:vi.fn(async()=>({reservationFolioInformation:{reservationInfo:structuredClone(p.reservation),folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88},{invoiceNo:100,folioNo:88}]}]}})),financialTransactionDetail:vi.fn(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[structuredClone(current)]}]})),invoiceReservation:vi.fn(async()=>({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}})),invoicePostings:vi.fn(async()=>structuredClone(p.postings)),invoicePostingBreakdown:vi.fn(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:structuredClone(p.taxRows),offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn(async(ids:string[])=>ids.includes('60001')?structuredClone(p.arDetails[0].response):{trxCodesInfo:structuredClone(p.taxCodes)}),folioTypeName:vi.fn(async()=>({details:{hotelId:'KAT',folioReportName:'kat_folio'}})),folioReport:vi.fn(),invoiceTransactionCodeRules:vi.fn(async(code:string)=>structuredClone(code==='AR-ADJUSTMENT'?sim.rules:sim.generatedRules.find(r=>r.transactionCode.code===code))),invoiceChargeSimulation:vi.fn(async()=>structuredClone(sim.calculation))};
 return {p,current,reader};
}

it.each([false,true])('qualifies full VAT independently of native ambiguity=%s',async ambiguous=>{
 const {p,reader}=fixture();
 if(!ambiguous)reader.reservationFolios.mockImplementation(async()=>({reservationFolioInformation:{reservationInfo:structuredClone(p.reservation),folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}}));
 reader.folioReport.mockImplementation(()=>{throw Error('forbidden_folioReport');});reader.folioTypeName.mockImplementation(()=>{throw Error('forbidden_folioTypeName');});
 const result=await readArOnlyInvoiceModel(reader,p.manifest);
 expect(result).toMatchObject({gross:341500,vat:22341,nonTaxable:0});expect(reader.account).toHaveBeenCalledTimes(2);
 expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('rejects native controls before model qualification',()=>{
 const p=currentPacket();Object.assign(p,{nativeTaxControls:{vat:22341,nonTaxable:0}});
 expect(()=>arOnlyInvoiceModel(p)).toThrow('document_invoice_ar_only_native_proof_forbidden');
});
it('cannot accept legacy taxless inference as AR proof',async()=>{
 const {p,reader}=fixture();for(const row of p.taxRows)if('postingBreakdown' in row){row.postingBreakdown.netAmount=row.postingBreakdown.grossAmount;row.postingBreakdown.taxes=[];}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_only_unsupported');
 expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['postings','tax','balance','ar-detail','rules'] as const)('preserves %s change fence',async kind=>{
 const {p,current,reader}=fixture(),original=reader.invoiceChargeSimulation.getMockImplementation()!;
 reader.invoiceChargeSimulation.mockImplementation(async()=>{const result=await original();
 if(kind==='postings')p.postings.invoicePostingsDetails[0].checkNo='CHANGED';
 if(kind==='tax')Reflect.set(p.taxRows[1].posting,'transactionCode','CHANGED');
 if(kind==='balance')current.balance.amount--;
 if(kind==='ar-detail')p.arDetails[0].response.transactions[0].deferredTax=true;
 if(kind==='rules')Object.assign(p.arSimulations[0].rules.transactionCode,{description:{defaultText:'Changed'}});
 return result;});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');
 expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('qualifies posted-only full VAT with a distinct proof kind and two source snapshots',async()=>{
 const {p,reader,current}=fixture();p.postings.invoicePostingsDetails.splice(1,1);p.manifest.open=3315;current.amount={amount:3315,currencyCode:'THB'};current.balance=current.amount;
 const result=await readArOnlyInvoiceModel(reader,p.manifest);
 expect(result).toMatchObject({gross:331500,nonTaxable:0});expect(reader.account).toHaveBeenCalledTimes(2);expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('refuses unknown proof kinds rather than treating them as legacy current-rule proof',()=>{
 const p=currentPacket();Object.assign(p.currentArTaxProof,{kind:'future-unknown'});
 expect(()=>arOnlyInvoiceModel(p)).toThrow('document_invoice_ar_only_unsupported');
});
it('does not relax legacy proof requirement for simulations',()=>{
 const p=currentPacket();p.arSimulations=[];
 expect(()=>arOnlyInvoiceModel(p)).toThrow('document_invoice_ar_only_unsupported');
});
it('rejects direct taxless posted-only rows without inferring NonVAT',async()=>{
 const {p,reader,current}=fixture();p.postings.invoicePostingsDetails.splice(1,1);p.manifest.open=3315;current.amount={amount:3315,currencyCode:'THB'};current.balance=current.amount;
 for(const row of p.taxRows)if('postingBreakdown' in row){row.postingBreakdown.netAmount=row.postingBreakdown.grossAmount;row.postingBreakdown.taxes=[];}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_only_unsupported');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('drains every metadata posting page before qualifying',async()=>{
 const {p,reader}=fixture();p.postings.invoicePostingsDetails[1].transactionDate='2026-01-02';p.arDetails[0].response.transactions[0].transactionDate='2026-01-02';
 reader.invoicePostingBreakdown.mockImplementation(async(_r,_w,_s,_e,offset,limit)=>({financialPostings:structuredClone(p.taxRows.slice(offset/limit,offset/limit+1)),offset,limit,hasMore:offset/limit+1<p.taxRows.length,totalResults:p.taxRows.length}));
 expect(await readArOnlyInvoiceModel(reader,p.manifest)).toMatchObject({gross:341500});
 expect(reader.invoicePostingBreakdown.mock.calls.map(call=>call[4])).toEqual([0,50,100,0,50,100]);expect(reader.folioReport).not.toHaveBeenCalled();
});
it('restarts incomplete reads and bounds persistent duplicates without native fallback',async()=>{
 const {p,reader}=fixture();p.taxRows.push(structuredClone(p.taxRows[0]));
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_source_unstable');expect(reader.account).toHaveBeenCalledTimes(3);expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['hotel','reservation','code','amount','id'])('retains exact selected posted %s fences',async field=>{
 const {p,reader}=fixture(),row=p.taxRows[0].posting;
 if(field==='hotel')row.hotelId='TSK';if(field==='reservation')row.guestInfo.reservationId.id='999';if(field==='code')Reflect.set(row,'transactionCode','OTHER');if(field==='amount')Reflect.set(row,'postedAmount',{amount:1,currencyCode:'THB'});if(field==='id')row.transactionNo=999999;
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('accepts changed response order only when every selected posting identity and field is unchanged',async()=>{
 const {p,reader}=fixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoicePostings.mockImplementation(async()=>{const result=await original();if(reads++)result.invoicePostingsDetails.reverse();return result;});
 expect(await readArOnlyInvoiceModel(reader,p.manifest)).toMatchObject({gross:341500,vat:22341});expect(reader.folioReport).not.toHaveBeenCalled();
});
it.each(['duplicate','changed-amount','changed-reference','changed-cashier'])('does not hide %s when response order changes',async mutation=>{
 const {p,reader}=fixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoicePostings.mockImplementation(async()=>{const result=await original();if(reads++){result.invoicePostingsDetails.reverse();if(mutation==='duplicate')result.invoicePostingsDetails[1]=structuredClone(result.invoicePostingsDetails[0]);if(mutation==='changed-amount')result.invoicePostingsDetails[0].debitAmount.amount++;if(mutation==='changed-reference')result.invoicePostingsDetails[0].reference='Changed';if(mutation==='changed-cashier')Reflect.set(result.invoicePostingsDetails[0],'cashierInfo',{cashierId:99});}return result;});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow();expect(reader.folioReport).not.toHaveBeenCalled();
});
it('keeps legacy current-rule proof source order-sensitive',()=>{
 const p=currentPacket();p.postings.invoicePostingsDetails.reverse();
 expect(()=>arOnlyInvoiceModel(p)).toThrow('document_invoice_ar_only_unsupported');
});
