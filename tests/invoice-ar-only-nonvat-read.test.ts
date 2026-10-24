import {nonVatReaderFixture} from './fixtures/invoice-ar-only-nonvat-reader';
import {it,expect,vi} from 'vitest';
import {readArOnlyInvoiceModel,readArOnlyInvoicePacket} from '../worker/invoice/ar-only-read';
import {nonVatPacket} from './fixtures/invoice-ar-only-nonvat';
import {nonVatCalculation} from './fixtures/invoice-embedded-nonvat';
import {money} from './fixtures/invoice-packet';

it('plans explicit zero candidates before POS and pairs same-signed calculations around complete source reads',async()=>{
 const {p,reader}=nonVatReaderFixture(),q=await readArOnlyInvoicePacket(reader,p.manifest);
 expect(q.arOnlyNonVatProof?.kind).toBe('ar-only-direct-nonvat');expect(q.directZeroTaxProof).toBeUndefined();expect(q.currentArTaxProof).toBeUndefined();expect(q.arOnlyPosProof).toBeUndefined();
 expect(reader.invoiceChargeSimulation.mock.calls).toEqual([['6000',20],['6002',-10],['6000',20],['6002',-10]]);
 expect(reader.account).toHaveBeenCalledTimes(2);expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['selected-check','posted-amount','wrapper-tax','balance','rules','calculation'] as const)('rejects changed %s without native fallback',async kind=>{
 const {p,groups,current,reader}=nonVatReaderFixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoicePostings.mockImplementation(async()=>{if(reads++){
  if(kind==='selected-check')p.postings.invoicePostingsDetails[1].checkNo='Changed';
  if(kind==='posted-amount')Reflect.set(p.taxRows[3].posting,'postedAmount',{amount:21,currencyCode:'THB'});
  if(kind==='wrapper-tax'){const b=p.taxRows[1];if('postingBreakdown'in b)b.postingBreakdown.taxes[0].amount.amount++;}
  if(kind==='balance')current.balance.amount--;
  if(kind==='rules')groups[0].rules.transactionCode.description.defaultText='Changed';
 }return original();});
 if(kind==='calculation'){let n=0;reader.invoiceChargeSimulation.mockImplementation(async(code,amount)=>({...nonVatCalculation(code,amount),changed:++n>2}));}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('refuses zero calculations without explicit NonVAT policy and never obtains native controls',async()=>{
 const {p,groups,reader}=nonVatReaderFixture();groups[0].rules.transactionCode.trxSetup.nonTaxable=false;
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['amount','sign','currency','extra-charge'] as const)('rejects an invalid effective calculation: %s',async kind=>{
 const {p,reader}=nonVatReaderFixture();reader.invoiceChargeSimulation.mockImplementation(async(code,amount)=>{
  const result=nonVatCalculation(code,amount);
  if(kind==='amount')result.result.charges[0].amount=result.result.totalAmount=amount+1;
  if(kind==='sign')result.result.charges[0].amount=result.result.totalAmount=-amount;
  if(kind==='extra-charge')result.result.charges.push({...result.result.charges[0],transactionCode:'VAT'});
  return kind==='currency'?{...result,currencyCode:'USD'}:result;
 });
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_direct_zero_tax_unverified');expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it('snapshots aliased rule and calculation responses across the source interval',async()=>{
 const {p,groups,reader}=nonVatReaderFixture(),calculation=nonVatCalculation('6000',20),original=reader.invoicePostings.getMockImplementation()!;let reads=0;
 reader.invoiceTransactionCodeRules.mockImplementation(async code=>groups.find(g=>g.rules.transactionCode.code===code)?.rules);
 reader.invoiceChargeSimulation.mockImplementation(async(code,amount)=>code==='6000'?calculation:nonVatCalculation(code,amount));
 reader.invoicePostings.mockImplementation(async()=>{if(reads++){groups[0].rules.transactionCode.description.defaultText='Changed';calculation.result.charges[0].amount++;}return original();});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_source_changed');
});
it('bounds calculations by distinct code and signed amount while covering every candidate',async()=>{
 const {p,reader}=nonVatReaderFixture([20,30,30]),q=await readArOnlyInvoicePacket(reader,p.manifest);
 expect(q.arOnlyNonVatProof?.groups).toHaveLength(3);expect(reader.invoiceChargeSimulation.mock.calls).toEqual([['6000',20],['6002',30],['6000',20],['6002',30]]);
});
it('normalizes selected row order without losing candidate identities',async()=>{
 const {p,reader}=nonVatReaderFixture(),original=reader.invoicePostings.getMockImplementation()!;let reads=0;reader.invoicePostings.mockImplementation(async()=>{const result=await original();if(reads++)result.invoicePostingsDetails.reverse();return result;});
 expect(await readArOnlyInvoiceModel(reader,p.manifest)).toMatchObject({gross:332500,vat:21687,nonTaxable:1000});
});
it('reads pure NonVAT without requiring AR graph or POS capabilities',async()=>{
 const {p,current,reader}=nonVatReaderFixture();p.postings.invoicePostingsDetails.shift();p.taxRows.splice(0,3);p.manifest.open=10;current.amount=current.balance=money(10);
 expect(await readArOnlyInvoiceModel(reader,p.manifest)).toMatchObject({gross:1000,vat:0,nonTaxable:1000,taxableNet:0});expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
it.each(['nested','malformed','parent','package','deferred'] as const)('rejects %s candidate indicators before rule or calculation delegation',async kind=>{
 const {p,reader}=nonVatReaderFixture(),posting=p.taxRows[3].posting;
 if(kind==='nested')Object.assign(posting,{subPostings:[{transactionNo:13001,referenceTransactionNo:11001,transactionCode:'VAT',postedAmount:money(1)}]});
 if(kind==='malformed')Object.assign(posting,{subPostings:{}});
 if(kind==='parent')Object.assign(posting,{referenceTransactionNo:99991});
 if(kind==='package')Object.assign(posting,{referencePackageTransactionNo:99991});
 if(kind==='deferred')Object.assign(posting,{deferredTax:true});
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow('document_invoice_ar_only_nonvat_unverified');
 expect(reader.invoiceTransactionCodeRules).not.toHaveBeenCalled();expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();expect(reader.folioReport).not.toHaveBeenCalled();expect(reader.folioTypeName).not.toHaveBeenCalled();
});
