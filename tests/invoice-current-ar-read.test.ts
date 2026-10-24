import {it,expect,vi} from 'vitest';
import {readInvoiceModel} from '../worker/invoice/read';
import {currentPacket} from './fixtures/invoice-current-ar-tax';
function fixture(){
 const p=currentPacket(),current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'},sim=p.arSimulations[0];
 const reader={account:vi.fn(async()=>({accountDetails:{...structuredClone(p.account),invoices:[structuredClone(current)]}})),invoiceHistory:vi.fn(),reservationFolios:vi.fn(async()=>({reservationFolioInformation:{reservationInfo:structuredClone(p.reservation),folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88},{invoiceNo:100,folioNo:88}]}]}})),financialTransactionDetail:vi.fn(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[structuredClone(current)]}]})),invoiceReservation:vi.fn(async()=>({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}})),invoicePostings:vi.fn(async()=>structuredClone(p.postings)),invoicePostingBreakdown:vi.fn(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:structuredClone(p.taxRows),offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn(async(ids:string[])=>ids.includes('60001')?structuredClone(p.arDetails[0].response):{trxCodesInfo:structuredClone(p.taxCodes)}),folioTypeName:vi.fn(async()=>({details:{hotelId:'KAT',folioReportName:'kat_folio'}})),folioReport:vi.fn(),invoiceTransactionCodeRules:vi.fn(async(code:string)=>structuredClone(code==='AR-ADJUSTMENT'?sim.rules:sim.generatedRules.find(r=>r.transactionCode.code===code))),invoiceChargeSimulation:vi.fn(async()=>structuredClone(sim.calculation))};
 return {p,current,reader};
}
it('qualifies current OPERA adjustment rules only after a second complete source read, without an ambiguous print',async()=>{
 const {p,reader}=fixture(),onPrint=vi.fn(),m=await readInvoiceModel(reader,p.manifest,undefined,onPrint);
 expect(m).toMatchObject({gross:341500,vat:22341,nonTaxable:0,outstanding:341500});expect(reader.account).toHaveBeenCalledTimes(2);expect(reader.invoicePostings).toHaveBeenCalledTimes(2);expect(reader.invoiceTransactionDetails.mock.calls.filter(([ids])=>ids.includes('60001'))).toHaveLength(2);expect(reader.folioReport).not.toHaveBeenCalled();expect(onPrint).not.toHaveBeenCalled();
});
it.each(['postings','tax','balance','ar-detail','rules','generated-rules'] as const)('refuses changed %s during current-rule qualification without native fallback',async kind=>{
 const {p,current,reader}=fixture(),original=reader.invoiceChargeSimulation.getMockImplementation()!;
 reader.invoiceChargeSimulation.mockImplementation(async()=>{const response=await original();
  if(kind==='postings')p.postings.invoicePostingsDetails[0].checkNo='CHANGED';
  if(kind==='tax')Reflect.set(p.taxRows[1].posting,'transactionCode','CHANGED');
  if(kind==='balance')current.balance.amount--;
  if(kind==='ar-detail')p.arDetails[0].response.transactions[0].deferredTax=true;
  if(kind==='rules')Object.assign(p.arSimulations[0].rules.transactionCode,{description:{defaultText:'Changed'}});
  if(kind==='generated-rules')p.arSimulations[0].generatedRules[0].transactionCode.description.defaultText='Changed';
  return response;
 });
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow();expect(reader.folioReport).not.toHaveBeenCalled();
});
it('does not admit a mixed NonVAT invoice through the all-VAT7 branch',async()=>{
 const {p,reader}=fixture();for(const row of p.taxRows)if('postingBreakdown' in row){row.postingBreakdown.netAmount=row.postingBreakdown.grossAmount;row.postingBreakdown.taxes=[];}
 await expect(readInvoiceModel(reader,p.manifest)).rejects.toThrow();expect(reader.folioReport).not.toHaveBeenCalled();
});
