import {expect,it,vi} from 'vitest';
import {inspectDirectZeroTax,readDirectZeroTaxEvidence,verifyDirectZeroTaxProof} from '../worker/invoice/direct-zero-tax';
import {embeddedNonVatPacket,nonVatCalculation} from './fixtures/invoice-embedded-nonvat';
import {invoiceModel} from '../worker/invoice/model';
function fixture(){const {embeddedGenerateProof:_,...p}=embeddedNonVatPacket([20,-10]);p.taxCodes[0].transactionGroup='SVC';return p;}
function readers(p=fixture()){
 const original=embeddedNonVatPacket([20,-10]).embeddedGenerateProof.nonVatGroups;
 return {rules:vi.fn(async(code:string):Promise<unknown>=>structuredClone(original.find(g=>g.rules.transactionCode.code===code)!.rules)),calculation:vi.fn(async(code:string,amount:number)=>nonVatCalculation(code,amount)),fresh:vi.fn(async()=>structuredClone(p)),native:vi.fn(async()=>({vat:770,nonTaxable:1000,fullTotals:{currency:'THB' as const,gross:12770,net:11000,vat:770,nonTaxable:1000}}))};
}
it('retains individual signed charges and proves explicit NonVAT without native rendering',async()=>{
 const p=fixture(),r=readers(p);expect(inspectDirectZeroTax(p).candidates.map(c=>c.signedCents)).toEqual([2000,-1000]);
 const qualified=await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native);
 expect(verifyDirectZeroTaxProof(qualified)).toBe('explicit');expect(invoiceModel(qualified)).toMatchObject({nonTaxable:1000,vat:770});expect(r.native).not.toHaveBeenCalled();
});
it('qualifies an otherwise successful but wrong zero-tax inference against full native totals',async()=>{
 const p=fixture(),r=readers(p);r.rules.mockResolvedValue({});r.native.mockResolvedValue({vat:770,nonTaxable:0,fullTotals:{currency:'THB',gross:12770,net:12000,vat:770,nonTaxable:0}});
 expect(invoiceModel(p).nonTaxable).toBe(1000);
 const q=await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native);expect(invoiceModel(q)).toMatchObject({nonTaxable:0,taxableNet:12000,vat:770});
});
it.each(['scope','date','amount','duplicate','net'] as const)('rejects invalid posting proof: %s',kind=>{
 const p=fixture(),raw=p.taxRows[1];if(kind==='scope')raw.posting.hotelId='KAT';if(kind==='date')raw.posting.transactionDate='2026-01-03';if(kind==='amount')raw.posting.debitAmount.amount++;if(kind==='duplicate')p.taxRows.push(structuredClone(raw));if(kind==='net')raw.postingBreakdown.netAmount.amount++;
 expect(()=>inspectDirectZeroTax(p)).toThrow();
});
it.each(['source','rules','calculation'] as const)('rejects changing %s across the proof interval',async kind=>{
 const p=fixture(),r=readers(p);if(kind==='source'){const changed=structuredClone(p);changed.invoice.amount.amount++;r.fresh.mockResolvedValue(changed);}
 if(kind==='rules'){let n=0;r.rules.mockImplementation(async code=>{const v=embeddedNonVatPacket([20,-10]).embeddedGenerateProof.nonVatGroups.find(g=>g.rules.transactionCode.code===code)!.rules;return ++n>2?{...v,changed:true}:v;});}
 if(kind==='calculation'){let n=0;r.calculation.mockImplementation(async(code,amount)=>({...nonVatCalculation(code,amount),changed:++n>2}));}
 await expect(readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native)).rejects.toThrow('document_source_changed');
});
it('requires complete native totals and propagates ambiguous native source',async()=>{
 const p=fixture(),r=readers(p);r.rules.mockResolvedValue({});r.native.mockResolvedValue({vat:770,nonTaxable:1000} as never);
 await expect(readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native)).rejects.toThrow();
 r.native.mockRejectedValue(Error('folio_window_ambiguous'));await expect(readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native)).rejects.toThrow('folio_window_ambiguous');
});

it.each(['missing','duplicate','rules','calculation','source','scope'] as const)('rebinds all explicit evidence and rejects tampering: %s',async kind=>{
 const p=fixture(),r=readers(p),q=await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native),proof=q.directZeroTaxProof!;
 if(kind==='missing')proof.groups.pop();if(kind==='duplicate')proof.groups[1]=structuredClone(proof.groups[0]);
 if(kind==='rules')proof.groups[0].rulesAfter={};if(kind==='calculation')proof.groups[0].calculationAfter={};
 if(kind==='source')proof.sourceAfter.invoice={};if(kind==='scope')q.manifest={...q.manifest,id:'501'};
 expect(()=>invoiceModel(q)).toThrow();
});
it('does not qualify separate posted VAT groups, including POS service rows',async()=>{
 const {mixedTaxPacket}=await import('./fixtures/invoice-packet'),p=mixedTaxPacket();p.taxRows=p.taxRows.filter(r=>r.posting.transactionNo!==60004);p.postings.invoicePostingsDetails=p.postings.invoicePostingsDetails.filter(r=>r.transactionNo!==60004);p.manifest.open=p.invoice.amount.amount=p.invoice.balance.amount=4492;
 expect(inspectDirectZeroTax(p).candidates).toEqual([]);const r=readers();expect(await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native)).toBe(p);expect(r.rules).not.toHaveBeenCalled();expect(r.native).not.toHaveBeenCalled();
});
it('binds complete native totals to the unchanged financial source and selected invoice',async()=>{
 const p=fixture(),r=readers(p);r.rules.mockResolvedValue({});const q=await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native);
 q.nativeTaxControls={...q.nativeTaxControls!,nonTaxable:0};expect(()=>invoiceModel(q)).toThrow('document_invoice_direct_zero_tax_unverified');
});
it('rejects an invalid effective calculation even with unchanged explicit rules',async()=>{
 const p=fixture(),r=readers(p);r.calculation.mockImplementation(async(code,amount)=>({...nonVatCalculation(code,amount),result:{charges:[],totalAmount:amount}}));
 await expect(readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native)).rejects.toThrow('document_invoice_direct_zero_tax_unverified');expect(r.native).not.toHaveBeenCalled();
});
it('bounds effective calculation requests by distinct code and signed amount while proving every posting',async()=>{
 const {embeddedGenerateProof:_,...p}=embeddedNonVatPacket([20,30,30]);p.taxCodes[0].transactionGroup='SVC';const r=readers(p);
 const q=await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native);expect(q.directZeroTaxProof?.groups).toHaveLength(3);expect(r.calculation).toHaveBeenCalledTimes(4);
});
it('accepts reordered complete selected postings without ignoring any posting facts',async()=>{
 const p=fixture(),r=readers(p),fresh=structuredClone(p);fresh.postings.invoicePostingsDetails.reverse();r.fresh.mockResolvedValue(fresh);
 const q=await readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native);expect(invoiceModel(q).nonTaxable).toBe(1000);
 q.postings=structuredClone(fresh.postings);expect(invoiceModel(q).nonTaxable).toBe(1000);
});
it.each(['duplicate','date','code','amount','reference'] as const)('rejects reordered postings with changed %s',async kind=>{
 const p=fixture(),r=readers(p),fresh=structuredClone(p);fresh.postings.invoicePostingsDetails.reverse();const row=fresh.postings.invoicePostingsDetails[0];
 if(kind==='duplicate')fresh.postings.invoicePostingsDetails.push(structuredClone(row));if(kind==='date')row.transactionDate='2026-01-03';if(kind==='code')row.transactionCode='OTHER';if(kind==='amount')row.debitAmount.amount++;if(kind==='reference')row.reference='Changed';
 r.fresh.mockResolvedValue(fresh);await expect(readDirectZeroTaxEvidence(p,r.rules,r.fresh,r.calculation,r.native)).rejects.toThrow();
});
