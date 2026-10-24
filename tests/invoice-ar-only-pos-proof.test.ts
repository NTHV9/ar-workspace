import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {posPacket,withPosProof} from './fixtures/invoice-ar-only-pos';
import {money} from './fixtures/invoice-packet';
it.each([1,-1])('admits independently scoped signed POS atoms while retaining strict wrappers (%s)',sign=>{
 const {p,rules}=posPacket(sign),m=arOnlyInvoiceModel(withPosProof(p,rules));
 expect(m).toMatchObject({gross:331500+sign*117700,vat:21687+sign*7700,nonTaxable:0});expect(m.lines).toHaveLength(4);
});
it('admits an explicit Tax classification with an F&B ledger group',()=>{
 const {p,rules}=posPacket();rules[2].transactionCode.classification.group.code='F&B';Reflect.set(p.postings.trxCodesInfo[3],'transactionGroup','F&B');
 expect(arOnlyInvoiceModel(withPosProof(p,rules)).vat).toBe(29387);
});
it.each(['check','date','cashier','window','amount','scope','id','taxless','duplicate-vat','tax-role','service-role','base-role','metadata-hotel','metadata-code','metadata-unstable','native','snapshot','unknown-kind','non-revenue-wrapper'] as const)('rejects incomplete/ambiguous POS proof: %s',kind=>{
 const {p,rules}=posPacket(),atom=p.taxRows[3].posting;
 if(kind==='check')Reflect.set(atom,'checkNo','OTHER');if(kind==='date')Reflect.set(atom,'transactionDate','2026-01-04');if(kind==='cashier')Reflect.set(atom,'cashierInfo',{cashierId:4});if(kind==='window')Reflect.set(atom,'folioWindowNo',2);
 if(kind==='amount')Reflect.set(atom,'postedAmount',money(999));if(kind==='scope')Reflect.set(atom,'folioNo',89);if(kind==='id')atom.transactionNo=999999;
 if(kind==='taxless'){p.postings.invoicePostingsDetails.pop();p.taxRows.pop();p.manifest.open-=77;p.invoice.amount=p.invoice.balance=money(p.manifest.open);}
 if(kind==='duplicate-vat'){const selected=structuredClone(p.postings.invoicePostingsDetails[3]),entry=structuredClone(p.taxRows[5]);selected.transactionNo+=10;entry.posting.transactionNo+=10;p.postings.invoicePostingsDetails.push(selected);p.taxRows.push(entry);p.manifest.open+=77;p.invoice.amount=p.invoice.balance=money(p.manifest.open);}
 if(kind==='tax-role')rules[2].transactionCode.classification.transactionType.code='FoodAndBeverage';if(kind==='service-role')rules[1].transactionCode.classification.group.code='F&B';if(kind==='base-role')rules[0].transactionCode.classification.transactionType.code='Others';
 if(kind==='metadata-hotel')rules[0].transactionCode.hotelId='TSK';if(kind==='metadata-code')rules[0].transactionCode.code='OTHER';
 if(kind==='non-revenue-wrapper')p.taxRows[1].posting.transactionType='NonRevenue';
 const q=withPosProof(p,rules);
 if(kind==='metadata-unstable')Reflect.set(q.arOnlyPosProof!.definitions[0].after as object,'changed',true);
 if(kind==='native')Object.assign(q,{nativeTaxControls:undefined});if(kind==='snapshot')Reflect.set(q.arOnlyPosProof!,'sourceBefore',{});if(kind==='unknown-kind')Reflect.set(q.arOnlyPosProof!,'kind','future');
 expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
it('checks reused checks on distinct dates independently instead of pooling their VAT',()=>{
 const {p,rules}=posPacket();
 const selected=structuredClone(p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(p.taxRows.slice(3));
 selected.forEach(row=>{row.transactionNo+=10;row.transactionDate='2026-01-04';});entries.forEach(e=>{e.posting.transactionNo+=10;Reflect.set(e.posting,'transactionDate','2026-01-04');});
 p.postings.invoicePostingsDetails.push(...selected);p.taxRows.push(...entries);p.manifest.open+=1177;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 expect(arOnlyInvoiceModel(withPosProof(p,rules)).vat).toBe(37087);
 for(const [index,delta] of [[3,1],[6,-1]]){p.postings.invoicePostingsDetails[index].debitAmount.amount+=delta;const e=p.taxRows.find(e=>e.posting.transactionNo===p.postings.invoicePostingsDetails[index].transactionNo)!;Reflect.set(e.posting,'debitAmount',money(p.postings.invoicePostingsDetails[index].debitAmount.amount));Reflect.set(e.posting,'postedAmount',money(p.postings.invoicePostingsDetails[index].debitAmount.amount));if('postingBreakdown'in e)e.postingBreakdown.grossAmount=e.postingBreakdown.netAmount=money(p.postings.invoicePostingsDetails[index].debitAmount.amount);}
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow();
});
it('partitions same-check positive and negative VAT so cancellation cannot conceal wrong postings',()=>{
 const {p,rules}=posPacket(),negative=posPacket(-1).p;
 for(const row of negative.postings.invoicePostingsDetails.slice(1)){row.transactionNo+=10;p.postings.invoicePostingsDetails.push(row);}
 for(const e of negative.taxRows.slice(3)){e.posting.transactionNo+=10;p.taxRows.push(e);}
 p.manifest.open=3315;p.invoice.amount=p.invoice.balance=money(3315);
 expect(arOnlyInvoiceModel(withPosProof(p,rules)).vat).toBe(21687);
 for(const index of [3,6]){const selected=p.postings.invoicePostingsDetails[index],amount=selected.debitAmount.amount>0?78:-78;selected.debitAmount=money(amount);const e=p.taxRows.find(e=>e.posting.transactionNo===selected.transactionNo)!;Reflect.set(e.posting,'debitAmount',money(amount));Reflect.set(e.posting,'postedAmount',money(amount));if('postingBreakdown'in e)e.postingBreakdown.grossAmount=e.postingBreakdown.netAmount=money(amount);}
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow();
});
it.each(['selected-half-of-check','different-cashier','missing-breakdown'] as const)('rejects unexplained unselected same-check atoms: %s',kind=>{
 const {p,rules}=posPacket(),extra=structuredClone(p.taxRows[3]);extra.posting.transactionNo=80001;
 if(kind==='different-cashier')Reflect.set(extra.posting,'cashierInfo',{cashierId:7});
 if(kind==='missing-breakdown')Reflect.deleteProperty(extra,'postingBreakdown');
 p.taxRows.push(extra);
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow('unselected-check-sibling');
});
it('does not use unselected rows on a different day to alter invoice money',()=>{
 const {p,rules}=posPacket(),extra=structuredClone(p.taxRows[3]);extra.posting.transactionNo=80001;Reflect.set(extra.posting,'transactionDate','2026-01-04');p.taxRows.push(extra);
 expect(arOnlyInvoiceModel(withPosProof(p,rules))).toMatchObject({gross:449200,vat:29387});
});
it('rejects a split-check missing VAT even when another Invoice owns a matching tax row',()=>{
 const {p,rules}=posPacket();p.postings.invoicePostingsDetails.pop();p.manifest.open-=77;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow('unselected-check-sibling');
});
it('cannot partition a check by cashier to manufacture matching VAT subsets',()=>{
 const {p,rules}=posPacket();
 for(const selected of p.postings.invoicePostingsDetails.slice(2)){Reflect.set(selected,'cashierInfo',{cashierId:4});const source=p.taxRows.find(e=>e.posting.transactionNo===selected.transactionNo)!;Reflect.set(source.posting,'cashierInfo',{cashierId:4});}
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow('cashier-ambiguity');
});
it.each(['wrapper-first','pos-first'] as const)('claims POS identities before wrapper tax processing: %s',order=>{
 const {p,rules}=posPacket(),component=p.taxRows[1];if(!('postingBreakdown'in component))throw Error('fixture');
 const taxes=Reflect.get(component.postingBreakdown,'taxes');if(!Array.isArray(taxes))throw Error('fixture');taxes[1].transactionNo=60003;
 if(order==='pos-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow('document_invoice_tax_scope_invalid');
});
it('requires the posted window when selected POS atoms explicitly identify their window',()=>{
 const {p,rules}=posPacket();for(const e of p.taxRows.slice(3))Reflect.deleteProperty(e.posting,'folioWindowNo');
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow();
});
it.each(['missing-window','embedded-taxes'] as const)('refuses an ambiguous unselected check sibling: %s',kind=>{
 const {p,rules}=posPacket(),extra=structuredClone(p.taxRows[3]);extra.posting.transactionNo=99991;
 if(kind==='missing-window')Reflect.deleteProperty(extra.posting,'folioWindowNo');
 if(kind==='embedded-taxes'&&'postingBreakdown'in extra)Object.assign(extra.postingBreakdown,{taxes:[{transactionNo:99992,referenceTransactionNo:99991,transactionCode:'VAT',amount:money(1)}]});
 p.taxRows.push(extra);expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow('unselected-check-sibling');
});
it('can exclude an unselected same-check atom only when its distinct window is known',()=>{
 const {p,rules}=posPacket(),extra=structuredClone(p.taxRows[3]);extra.posting.transactionNo=99991;Reflect.set(extra.posting,'folioWindowNo',2);p.taxRows.push(extra);
 expect(arOnlyInvoiceModel(withPosProof(p,rules)).gross).toBe(449200);
});
it.each(['deferred','nested','selected-deferred','selected-nested','reverse-parent','reverse-package'] as const)('rejects hidden direct POS descendants: %s',kind=>{
 const {p,rules}=posPacket(),target=kind.startsWith('selected')?p.postings.invoicePostingsDetails[2]:p.taxRows[4].posting;
 if(kind.startsWith('reverse')){const child=structuredClone(p.taxRows[4]);child.posting.transactionNo=99999;Reflect.deleteProperty(child.posting,'checkNo');Reflect.set(child.posting,kind==='reverse-parent'?'referenceTransactionNo':'referencePackageTransactionNo',60002);p.taxRows.push(child);}
 else if(kind.includes('deferred'))Reflect.set(target,'deferredTax',true);else Reflect.set(target,'subPostings',[{transactionNo:99991,transactionType:'Tax'}]);
 expect(()=>arOnlyInvoiceModel(withPosProof(p,rules))).toThrow();
});
