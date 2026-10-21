import {it,expect} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {packet,money,mixedTaxPacket} from './fixtures/invoice-packet';

function serviceExcluded(){
 const p=packet(1);p.manifest.open=1170;p.invoice.amount=money(1170);p.invoice.balance=money(1170);p.postings.invoicePostingsDetails[0].debitAmount=money(1170);
 p.taxRows=p.taxRows.slice(0,2);const component=p.taxRows[1];if(!('postingBreakdown' in component))throw Error('Fixture');
 component.postingBreakdown.grossAmount=money(1170);component.postingBreakdown.netAmount=money(1000);
 component.postingBreakdown.taxes[0].amount=money(100);component.postingBreakdown.taxes[1].amount=money(70);
 return p;
}
it('preserves generated VAT on the net charge when service charge is outside its taxable base',()=>{
 const m=invoiceModel(serviceExcluded());expect(m.gross).toBe(117000);expect(m.vat).toBe(7000);expect(m.taxableNet).toBe(110000);expect(m.nonTaxable).toBe(0);
});
it('does not accept arbitrary VAT merely because net, service and tax sum to gross',()=>{
 const p=serviceExcluded(),component=p.taxRows[1];if(!('postingBreakdown' in component))throw Error('Fixture');
 component.postingBreakdown.taxes[0].amount=money(95);component.postingBreakdown.taxes[1].amount=money(75);
 expect(()=>invoiceModel(p)).toThrow('tax_rate_unsupported');
});
it('keeps generated tax reconciliation when accepting a net-only VAT base',()=>{
 const p=serviceExcluded(),component=p.taxRows[1];if(!('postingBreakdown' in component))throw Error('Fixture');component.postingBreakdown.netAmount=money(1001);
 expect(()=>invoiceModel(p)).toThrow('tax_reconciliation_failed');
});
it('preserves OPERA generated VAT already rounded to currency precision',()=>{
 const p=serviceExcluded(),component=p.taxRows[1];if(!('postingBreakdown' in component))throw Error('Fixture');
 p.manifest.open=15100;p.invoice.amount=money(15100);p.invoice.balance=money(15100);p.postings.invoicePostingsDetails[0].debitAmount=money(15100);
 component.postingBreakdown.grossAmount=money(15100);component.postingBreakdown.netAmount=money(12829.23);component.postingBreakdown.taxes[0].amount=money(1282.92);component.postingBreakdown.taxes[1].amount=money(987.85);
 expect(invoiceModel(p).vat).toBe(98785);
 component.postingBreakdown.taxes[0].amount=money(1282.91);component.postingBreakdown.taxes[1].amount=money(987.86);
 expect(()=>invoiceModel(p)).toThrow('tax_rate_unsupported');
});
it('uses matching native whole-invoice tax controls for a nonuniform separately posted VAT group',()=>{
 const p=mixedTaxPacket();p.postings.invoicePostingsDetails.at(-1)!.checkNo='POS-CHECK';
 expect(()=>invoiceModel(p)).toThrow('tax_rate_unsupported');
 const m=invoiceModel({...p,nativeTaxControls:{vat:29387,nonTaxable:0}});
 expect(m.gross).toBe(454200);expect(m.vat).toBe(29387);expect(m.nonTaxable).toBe(0);expect(m.taxableNet).toBe(424813);
});
it.each([{vat:29388,nonTaxable:0},{vat:29387,nonTaxable:5000}])('rejects inconsistent native controls on a nonuniform VAT group (%j)',nativeTaxControls=>{
 const p=mixedTaxPacket();p.postings.invoicePostingsDetails.at(-1)!.checkNo='POS-CHECK';
 expect(()=>invoiceModel({...p,nativeTaxControls})).toThrow('ar_tax_unverified');
});
it('native totals cannot justify a VAT line without a matched receipt base',()=>{
 const p=mixedTaxPacket();p.postings.invoicePostingsDetails.at(-2)!.checkNo='UNKNOWN';
 expect(()=>invoiceModel({...p,nativeTaxControls:{vat:29387,nonTaxable:0}})).toThrow('tax_scope_invalid');
});
it('uses independent native controls when posted component rounding exceeds a single VAT rounding interval',()=>{
 const p=serviceExcluded(),component=p.taxRows[1];if(!('postingBreakdown' in component))throw Error('Fixture');
 p.manifest.open=300;p.invoice.amount=money(300);p.invoice.balance=money(300);p.postings.invoicePostingsDetails[0].debitAmount=money(300);
 component.postingBreakdown.grossAmount=money(300);component.postingBreakdown.netAmount=money(254.89);component.postingBreakdown.taxes[0].amount=money(25.49);component.postingBreakdown.taxes[1].amount=money(19.62);
 expect(()=>invoiceModel(p)).toThrow('tax_rate_unsupported');
 expect(invoiceModel({...p,nativeTaxControls:{vat:1962,nonTaxable:0}}).vat).toBe(1962);
 expect(()=>invoiceModel({...p,nativeTaxControls:{vat:1963,nonTaxable:0}})).toThrow('ar_tax_unverified');
});
it('requires native tax parity for generated service charges classified under food and beverage',()=>{
 const p=serviceExcluded(),svc=p.taxCodes.find(c=>c.transactionGroup==='SVC')!;svc.transactionGroup='F&B';svc.description='Restaurant SVC *';
 expect(()=>invoiceModel(p)).toThrow('tax_code_unsupported');
 expect(invoiceModel({...p,nativeTaxControls:{vat:7000,nonTaxable:0}}).taxableNet).toBe(110000);
 expect(()=>invoiceModel({...p,nativeTaxControls:{vat:7001,nonTaxable:0}})).toThrow('ar_tax_unverified');
 svc.description='Unrecognized generate';expect(()=>invoiceModel({...p,nativeTaxControls:{vat:7000,nonTaxable:0}})).toThrow('tax_code_unsupported');
});
it('recognizes a separately posted restaurant VAT only with independent native parity',()=>{
 const p=mixedTaxPacket();p.postings.trxCodesInfo=p.postings.trxCodesInfo.map(c=>c.transactionCode==='POSTED-VAT'?{...c,transactionGroup:'F&B',description:'Pool Bar VAT'}:c);
 expect(()=>invoiceModel(p)).toThrow('tax_code_unsupported');
 const m=invoiceModel({...p,nativeTaxControls:{vat:29387,nonTaxable:5000}});expect(m.vat).toBe(29387);expect(m.nonTaxable).toBe(5000);
 expect(()=>invoiceModel({...p,nativeTaxControls:{vat:29388,nonTaxable:5000}})).toThrow('ar_tax_unverified');
});
