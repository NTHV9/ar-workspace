import {it,expect,vi} from 'vitest';
import {readArOnlyInvoicePacket,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {wrapperArAdjustmentFixture} from './fixtures/invoice-wrapper-ar-adjustment';

function fixture(){
 const f=wrapperArAdjustmentFixture(),p=f.p,current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'};
 const all=[...f.posted.components.flatMap(e=>[e.rules,...e.generatedRules]),...f.adjustment.roots.flatMap(e=>[e.rules,...e.generatedRules])];
 const definitions=new Map(all.map(d=>[d.transactionCode.code,d]));
 const reader={account:vi.fn(async()=>({accountDetails:{...structuredClone(p.account),invoices:[structuredClone(current)]}})),invoiceHistory:vi.fn(),reservationFolios:vi.fn(async()=>({reservationFolioInformation:{reservationInfo:structuredClone(p.reservation),folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}})),financialTransactionDetail:vi.fn(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[structuredClone(current)]}]})),invoiceReservation:vi.fn(async()=>({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}})),invoicePostings:vi.fn(async()=>structuredClone(p.postings)),invoicePostingBreakdown:vi.fn(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:structuredClone(p.taxRows),offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn(async(ids:string[])=>ids.includes('60001')?structuredClone(p.arDetails[0].response):{trxCodesInfo:structuredClone(p.taxCodes)}),invoiceTransactionCodeRules:vi.fn(async(code:string)=>structuredClone(definitions.get(code))),invoiceChargeSimulation:vi.fn(async()=>structuredClone(f.adjustment.roots[0].calculation)),folioTypeName:vi.fn(async()=>{throw Error('Forbidden Guest');}),folioReport:vi.fn(async()=>{throw Error('Forbidden Guest');}),accountsByNumber:vi.fn(async()=>{throw Error('Unexpected transfer');})};
 return {...f,current,reader};
}
it('reads a mixed wrapper/rebate source through one complete fence and keeps wrapper money unsimulated',async()=>{
 const f=fixture(),q=await readArOnlyInvoicePacket(f.reader,f.p.manifest);
 expect(q.arOnlySourceClaimsProof?.version).toBe(7);
 expect(arOnlyInvoiceModel(q)).toMatchObject({gross:12770,vat:770,taxableNet:12000,nonTaxable:0});
 expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);
 expect(f.reader.invoiceChargeSimulation.mock.calls).toEqual([['AR-ADJUSTMENT',-107],['AR-ADJUSTMENT',-107]]);
 expect(f.reader.folioReport).not.toHaveBeenCalled();expect(f.reader.folioTypeName).not.toHaveBeenCalled();expect(f.reader.accountsByNumber).not.toHaveBeenCalled();
});
it.each(['source','parent','calculator','provider'] as const)('propagates %s change/failure without selecting another source',async kind=>{
 const f=fixture();
 if(kind==='provider')f.reader.invoiceTransactionCodeRules.mockRejectedValue(Error('RulesUnavailable'));
 else if(kind==='calculator'){let n=0;f.reader.invoiceChargeSimulation.mockImplementation(async()=>{const c=structuredClone(f.adjustment.roots[0].calculation);if(n++)c.result.totalAmount=-106;return c;});}
 else {let n=0;f.reader.invoicePostings.mockImplementation(async()=>{if(n++){if(kind==='source')f.p.postings.invoicePostingsDetails[1].reference='Changed';else f.adjustment.roots[0].rules.transactionCode.trxSetup.nonTaxable=true;}return structuredClone(f.p.postings);});}
 await expect(readArOnlyInvoicePacket(f.reader,f.p.manifest)).rejects.toThrow(kind==='provider'?'RulesUnavailable':'document_source_changed');
 expect(f.reader.folioReport).not.toHaveBeenCalled();expect(f.reader.accountsByNumber).not.toHaveBeenCalled();
});
