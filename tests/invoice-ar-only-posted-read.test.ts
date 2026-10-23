import {expect,it,vi} from 'vitest';
import {OperaError} from '../worker/opera/client';
import {readArOnlyInvoiceModel,readArOnlyInvoicePacket} from '../worker/invoice/ar-only-read';
import {mixedPostedGeneratePacket} from './fixtures/invoice-posted-generates';
function fixture(){
 const p=mixedPostedGeneratePacket(),current={...p.invoice,reservationId:{id:'777'},internalFolioWindowID:'456'},rules=new Map<string,unknown>();
 for(const e of [...p.arPostedGenerates,...p.arSimulations]){rules.set(e.rules.transactionCode.code,e.rules);for(const leaf of e.generatedRules)rules.set(leaf.transactionCode.code,leaf);}
 const reader={account:vi.fn(async()=>({accountDetails:{...structuredClone(p.account),invoices:[structuredClone(current)]}})),invoiceHistory:vi.fn(),reservationFolios:vi.fn(async()=>({reservationFolioInformation:{reservationInfo:structuredClone(p.reservation),folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:99,folioNo:88}]}]}})),financialTransactionDetail:vi.fn(async()=>({details:[{hotelId:'KAT',accountId:{id:'101'},invoices:[structuredClone(current)]}]})),invoiceReservation:vi.fn(async()=>({reservations:{reservation:[{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}]}]}})),invoicePostings:vi.fn(async()=>structuredClone(p.postings)),invoicePostingBreakdown:vi.fn(async(_r:string,_w:number,_s:string,_e:string,offset:number,limit:number)=>({financialPostings:structuredClone(p.taxRows),offset,limit,hasMore:false,totalResults:p.taxRows.length})),invoiceTransactionDetails:vi.fn(async(ids:string[])=>ids.includes('60001')?structuredClone(p.arDetails[0].response):{trxCodesInfo:structuredClone(p.taxCodes)}),folioTypeName:vi.fn(async()=>{throw Error('forbidden');}),folioReport:vi.fn(async()=>{throw Error('forbidden');}),invoiceTransactionCodeRules:vi.fn(async(code:string)=>structuredClone(rules.get(code))),invoiceChargeSimulation:vi.fn(async(code:string,amount:number)=>{const e=p.arSimulations.find(e=>e.rules.transactionCode.code===code&&e.calculation.result.totalAmount===amount);if(!e)throw Error('Unexpected simulation');return structuredClone(e.calculation);})};
 return {p,current,reader,rules};
}
it('qualifies two graphs, wrapper components and two adjustment roots with no graph simulation or native capability',async()=>{
 const {p,reader}=fixture(),result=await readArOnlyInvoiceModel(reader,p.manifest);
 expect(result).toMatchObject({gross:336500,vat:22014,nonTaxable:0});expect(result.lines).toHaveLength(9);
 expect(reader.invoiceChargeSimulation.mock.calls).toEqual([['AR-ADJUSTMENT',100],['AR-ADJUSTMENT',-50]]);
 for(const code of ['POST-BASE','POST-SVC','POST-VAT','AR-ADJUSTMENT','VAT'])expect(reader.invoiceTransactionCodeRules.mock.calls.filter(c=>c[0]===code)).toHaveLength(2);
 expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['selected-amount','check','cashier','balance','wrapper-child','wrapper-tax','graph-child','graph-reference','ar-root','graph-parent-rule','graph-leaf-rule','simulation-parent-rule','simulation-leaf-rule'] as const)('rejects whole-source or rule mutation: %s',kind=>{
 const {p,current,reader,rules}=fixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoicePostings.mockImplementation(async()=>{if(reads++){
  if(kind==='selected-amount')p.postings.invoicePostingsDetails[0].debitAmount.amount++;
  if(kind==='check')p.postings.invoicePostingsDetails[0].checkNo='CHANGED';if(kind==='cashier')Reflect.set(p.postings.invoicePostingsDetails[0],'cashierInfo',{cashierId:9});if(kind==='balance')current.balance.amount--;
  if(kind==='wrapper-child')p.taxRows[1].posting.transactionType='NonRevenue';
  if(kind==='wrapper-tax'&&'postingBreakdown'in p.taxRows[1])p.taxRows[1].postingBreakdown.taxes[0].amount.amount++;
  if(kind==='graph-child')p.arDetails[0].response.transactions[1].debitAmount.amount++;
  if(kind==='graph-reference')Reflect.set(p.arDetails[0].response.transactions[1],'referenceTransactionNo',99999);
  if(kind==='ar-root')p.arDetails[0].response.transactions[6].deferredTax=true;
  const code=kind==='graph-parent-rule'?'POST-BASE':kind==='graph-leaf-rule'?'POST-SVC':kind==='simulation-parent-rule'?'AR-ADJUSTMENT':kind==='simulation-leaf-rule'?'VAT':undefined;
  if(code)Reflect.set(rules.get(code) as object,'changed',true);
 }return original();});
 return expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow().then(()=>{expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();});
});
it('normalizes selected row order and exposes exactly the posted proof route',async()=>{
 const {p,reader}=fixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;reader.invoicePostings.mockImplementation(async()=>{const r=await original();if(reads++)r.invoicePostingsDetails.reverse();return r;});
 const result=await readArOnlyInvoicePacket(reader,p.manifest);expect(result.arOnlyPostedProof?.kind).toBe('ar-only-posted-generates-vat7');expect(result.currentArTaxProof).toBeUndefined();
});
it('bounds pagination retries without acquiring forbidden capabilities',async()=>{
 const {p,reader}=fixture();reader.invoicePostings.mockImplementation(async()=>{throw new OperaError('pagination_changed');});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_source_unstable');expect(reader.account).toHaveBeenCalledTimes(3);expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('detects a rule mutation even when the provider returns aliased mutable objects',async()=>{
 const {p,reader,rules}=fixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoiceTransactionCodeRules.mockImplementation(async code=>rules.get(code));
 reader.invoicePostings.mockImplementation(async()=>{if(reads++)Reflect.set(rules.get('POST-BASE') as object,'changed',true);return original();});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');
});
it('limits distinct definition reads to four concurrent requests',async()=>{
 const {p,reader}=fixture(),original=reader.invoiceTransactionCodeRules.getMockImplementation()!;let active=0,peak=0;
 reader.invoiceTransactionCodeRules.mockImplementation(async code=>{active++;peak=Math.max(peak,active);await Promise.resolve();try{return await original(code);}finally{active--;}});
 expect(await readArOnlyInvoiceModel(reader,p.manifest)).toMatchObject({gross:336500});expect(peak).toBeLessThanOrEqual(4);
});
it('refuses an unsupported wrapper remainder without falling back to native capabilities',async()=>{
 const {p,reader}=fixture();p.taxRows[1].posting.transactionType='NonRevenue';
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_only_unsupported');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
