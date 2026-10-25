import {it,expect} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {nonVatPacket,withNonVatProof} from './fixtures/invoice-ar-only-nonvat';
import {money} from './fixtures/invoice-packet';
import {posPacket} from './fixtures/invoice-ar-only-pos';
it('preserves signed explicit NonVAT, full-VAT wrapper totals and every selected line',()=>{
 const {p,groups}=nonVatPacket(),m=arOnlyInvoiceModel(withNonVatProof(p,groups));
 expect(m).toMatchObject({gross:332500,vat:21687,nonTaxable:1000,taxableNet:309813,outstanding:332500,debit:333500,credit:1000});expect(m.lines.map(l=>l.id)).toEqual(['10001','11001','11002']);
});
it('supports pure explicit NonVAT without a fabricated taxable remainder',()=>{
 const {p,groups}=nonVatPacket();p.postings.invoicePostingsDetails.shift();p.taxRows.splice(0,3);p.manifest.open=10;p.invoice.amount=p.invoice.balance=money(10);
 expect(arOnlyInvoiceModel(withNonVatProof(p,groups))).toMatchObject({gross:1000,vat:0,nonTaxable:1000,taxableNet:0,outstanding:1000,debit:2000,credit:1000});
});
it('preserves payment sides and outstanding separately from NonVAT and printed gross',()=>{
 const {p,groups}=nonVatPacket(),payment={transactionNo:12001,transactionCode:'PAYMENT',transactionDate:'2026-01-02',reference:'',checkNo:'',creditAmount:money(5)};
 p.postings.invoicePostingsDetails.push({...payment,debitAmount:money(0)});p.postings.trxCodesInfo.push({hotelId:'TSAN',transactionCode:'PAYMENT',description:'Payment'});
 p.taxRows.push({posting:{...payment,hotelId:'TSAN',folioNo:88,guestInfo:{reservationId:{id:'777',type:'Reservation'}},transactionType:'Payment',referencePackageTransactionNo:99001,postedAmount:money(5)}});
 p.manifest.open=3320;p.invoice.amount=p.invoice.balance=money(3320);
 const m=arOnlyInvoiceModel(withNonVatProof(p,groups));expect(m).toMatchObject({gross:332500,vat:21687,nonTaxable:1000,taxableNet:309813,outstanding:332000,debit:333500,credit:1500});expect(m.lines).toHaveLength(4);
});
it('qualifies cancelling same-code signed atoms independently',()=>{
 const {p,groups}=nonVatPacket([20,-20]);p.manifest.open=3315;p.invoice.amount=p.invoice.balance=money(3315);
 p.postings.invoicePostingsDetails[2].transactionCode='6000';Reflect.set(p.taxRows[4].posting,'transactionCode','6000');groups[1].rules=structuredClone(groups[0].rules);groups[1].rulesAfter=structuredClone(groups[0].rules);groups[1].provenance='opera-non-taxable';groups[1].calculation.result.charges[0].transactionCode='6000';groups[1].calculationAfter=structuredClone(groups[1].calculation);
 expect(arOnlyInvoiceModel(withNonVatProof(p,groups))).toMatchObject({gross:331500,vat:21687,nonTaxable:0});
 groups[1].calculation.result.charges[0].amount=20;groups[1].calculation.result.totalAmount=20;groups[1].calculationAfter=structuredClone(groups[1].calculation);
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow();
});
it.each(['missing','extra','duplicate','rule-change','calculation-change','wrong-amount','wrong-sign','extra-charge','foreign-currency','nonzero-generates','forged-policy','forged-hotel','forged-description','unknown-nonrevenue','native','legacy','current','pos','posted','embedded','transfer','ar-root','simulation','snapshot','unknown-kind'] as const)('rejects unsupported NonVAT evidence: %s',kind=>{
 const {p,groups}=nonVatPacket();
 if(kind==='missing')groups.pop();if(kind==='extra')groups.push({...structuredClone(groups[0]),postingId:'99999'});if(kind==='duplicate')groups[1]=structuredClone(groups[0]);
 if(kind==='rule-change')groups[0].rulesAfter.transactionCode.description.defaultText='Changed';if(kind==='calculation-change')groups[0].calculationAfter.result.totalAmount++;
 if(kind==='wrong-amount'||kind==='wrong-sign'){const amount=kind==='wrong-amount'?21:-20;groups[0].calculation.result.totalAmount=groups[0].calculation.result.charges[0].amount=amount;groups[0].calculationAfter=structuredClone(groups[0].calculation);}
 if(kind==='extra-charge'){groups[0].calculation.result.charges.push(structuredClone(groups[0].calculation.result.charges[0]));groups[0].calculationAfter=structuredClone(groups[0].calculation);}
 if(kind==='foreign-currency'){Object.assign(groups[0].calculation,{currencyCode:'USD'});groups[0].calculationAfter=structuredClone(groups[0].calculation);}
 if(kind==='nonzero-generates')Object.assign(groups[0].rules.transactionCode.generatesSetup,{generates:[{code:'VAT'}]});
 if(kind==='forged-policy')groups[0].rules.transactionCode.trxSetup.nonTaxable=false;
 if(kind==='forged-hotel')groups[1].rules.transactionCode.hotelId='KAT';if(kind==='forged-description')groups[1].rules.transactionCode.description.defaultText='Other transport';
 if(kind==='unknown-nonrevenue')groups[0].rules.transactionCode.classification.transactionType.code='NonRevenue';
 if(['nonzero-generates','forged-policy','forged-hotel','forged-description','unknown-nonrevenue'].includes(kind))for(const g of groups)g.rulesAfter=structuredClone(g.rules);
 const q=withNonVatProof(p,groups);
 const property=({native:'nativeTaxControls',legacy:'directZeroTaxProof',current:'currentArTaxProof',pos:'arOnlyPosProof',posted:'arOnlyPostedProof',embedded:'embeddedGenerateProof',transfer:'arTransfer'} as Record<string,string>)[kind];if(property)Reflect.set(q,property,kind==='native'?undefined:{});
 if(kind==='ar-root')q.arDetails=[{ids:['1'],response:{}}];if(kind==='simulation')q.arSimulations=[{postingId:'11001',rules:{},rulesAfter:{},generatedRules:[],generatedRulesAfter:[],calculation:{}}];
 if(kind==='snapshot')Reflect.set(q.arOnlyNonVatProof!,'sourceAfter',{});if(kind==='unknown-kind')Reflect.set(q.arOnlyNonVatProof!,'kind','future');
 expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
it.each(['wrapper-first','nonvat-first'] as const)('preclaims NonVAT IDs before embedded taxes: %s',order=>{
 const {p,groups}=nonVatPacket(),component=p.taxRows[1];if(!('postingBreakdown'in component))throw Error('fixture');component.postingBreakdown.taxes[1].transactionNo=11001;
 if(order==='nonvat-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow('document_invoice_tax_scope_invalid');
});
it.each(['wrapper-first','nonvat-first'] as const)('rejects wrapper-owned NonVAT identities before claims: %s',order=>{
 const {p,groups}=nonVatPacket();Reflect.set(p.taxRows[3].posting,'referencePackageTransactionNo',90001);
 if(order==='nonvat-first'){p.postings.invoicePostingsDetails[0].transactionDate='2026-01-04';Reflect.set(p.taxRows[0].posting,'transactionDate','2026-01-04');}
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow('document_invoice_ar_only_nonvat_unverified');
});
it.each(['non-revenue','net-only','embedded-fb','rate','taxless-wrapper'] as const)('retains strict taxable remainder checks: %s',kind=>{
 const {p,groups}=nonVatPacket(),component=p.taxRows[1];if(!('postingBreakdown'in component))throw Error('fixture');
 if(kind==='non-revenue')component.posting.transactionType='NonRevenue';
 if(kind==='embedded-fb')p.taxCodes[1].transactionGroup='F&B';
 if(kind==='net-only'||kind==='rate'){const b=component.postingBreakdown;b.taxes[1].amount.amount=b.netAmount.amount*(kind==='net-only'?.07:.08);b.grossAmount.amount=b.netAmount.amount+b.taxes.reduce((n,t)=>n+t.amount.amount,0);}
 if(kind==='taxless-wrapper'){component.postingBreakdown.taxes=[];component.postingBreakdown.netAmount=component.postingBreakdown.grossAmount;}
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow();
});
it.each(['hotel','reservation','folio','date','code','id','currency','signed-amount'] as const)('requires exact direct NonVAT %s',kind=>{
 const {p,groups}=nonVatPacket(),row=p.taxRows[3];
 if(kind==='hotel')row.posting.hotelId='KAT';if(kind==='reservation')row.posting.guestInfo.reservationId.id='999';if(kind==='folio')row.posting.folioNo=89;
 if(kind==='date')Reflect.set(row.posting,'transactionDate','2026-01-04');if(kind==='code')Reflect.set(row.posting,'transactionCode','OTHER');if(kind==='id')row.posting.transactionNo=99999;
 if(kind==='currency')Reflect.set(row.posting,'postedAmount',{amount:20,currencyCode:'USD'});if(kind==='signed-amount')Reflect.set(row.posting,'debitAmount',money(21));
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow();
});
it.each(['3592','8003'])('does not manufacture policy provenance for unresolved code %s',code=>{
 const {p,groups}=nonVatPacket();p.postings.invoicePostingsDetails[1].transactionCode=code;Reflect.set(p.taxRows[3].posting,'transactionCode',code);
 p.postings.trxCodesInfo.find(d=>d.transactionCode==='6000')!.transactionCode=code;groups[0].rules.transactionCode.code=code;groups[0].rules.transactionCode.trxSetup.nonTaxable=false;groups[0].rulesAfter=structuredClone(groups[0].rules);groups[0].calculation.result.charges[0].transactionCode=code;groups[0].calculationAfter=structuredClone(groups[0].calculation);
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow();
});
it('does not treat cancelling posted tax generates as an explicit zero-tax atom',()=>{
 const {p,groups}=nonVatPacket(),row=p.taxRows[3];if(!('postingBreakdown'in row))throw Error('fixture');
 Object.assign(row.postingBreakdown,{taxes:[{transactionNo:13001,referenceTransactionNo:11001,transactionCode:'VAT',amount:money(1)},{transactionNo:13002,referenceTransactionNo:11001,transactionCode:'VAT',amount:money(-1)}]});
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow();
});
it('does not admit a separately posted POS remainder with a NonVAT proof',()=>{
 const {p,groups}=nonVatPacket(),pos=posPacket().p;
 p.postings.invoicePostingsDetails.push(...pos.postings.invoicePostingsDetails.slice(1));p.postings.trxCodesInfo.push(...pos.postings.trxCodesInfo.slice(1).map(d=>({...d,hotelId:'TSAN'})));
 const extraRows=pos.taxRows.slice(3).map(e=>({...e,posting:{...e.posting,hotelId:'TSAN'}}));
 p.manifest.open+=1177;p.invoice.amount=p.invoice.balance=money(p.manifest.open);
 expect(()=>arOnlyInvoiceModel(withNonVatProof({...p,taxRows:[...p.taxRows,...extraRows]},groups))).toThrow('document_invoice_ar_only_unsupported');
});
it.each(['nested-vat','malformed-subpostings','null-subpostings','parent-reference','package-reference','deferred-tax'] as const)('rejects generated or deferred NonVAT candidates before admission: %s',kind=>{
 const {p,groups}=nonVatPacket(),posting=p.taxRows[3].posting;
 if(kind==='nested-vat')Object.assign(posting,{subPostings:[{transactionNo:13001,referenceTransactionNo:11001,transactionCode:'VAT',postedAmount:money(1)}]});
 if(kind==='malformed-subpostings')Object.assign(posting,{subPostings:{transactionNo:13001}});
 if(kind==='null-subpostings')Object.assign(posting,{subPostings:null});
 if(kind==='parent-reference')Object.assign(posting,{referenceTransactionNo:99991});
 if(kind==='package-reference')Object.assign(posting,{referencePackageTransactionNo:99991});
 if(kind==='deferred-tax')Object.assign(posting,{deferredTax:true});
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow('document_invoice_ar_only_nonvat_unverified');
});
it('also rejects generated indicators carried by the selected posting view',()=>{
 const {p,groups}=nonVatPacket();Object.assign(p.postings.invoicePostingsDetails[1],{subPostings:[{transactionNo:13001,referenceTransactionNo:11001,transactionCode:'VAT'}]});
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow('document_invoice_ar_only_nonvat_unverified');
});
it('allows explicit empty subpostings and non-deferred standalone atoms',()=>{
 const {p,groups}=nonVatPacket();for(const row of [p.taxRows[3].posting,p.postings.invoicePostingsDetails[1]])Object.assign(row,{subPostings:[],deferredTax:false});
 expect(arOnlyInvoiceModel(withNonVatProof(p,groups)).nonTaxable).toBe(1000);
});
it('rejects standalone generated children even when their signed amounts cancel',()=>{
 const {p,groups}=nonVatPacket();
 for(const [index,amount] of [[0,1],[1,-1]]){const child=structuredClone(p.taxRows[3]);child.posting.transactionNo=13001+index;Object.assign(child.posting,{referenceTransactionNo:11001,transactionCode:'VAT',debitAmount:money(amount),postedAmount:money(amount)});if('postingBreakdown'in child)Object.assign(child.postingBreakdown,{grossAmount:money(amount),netAmount:money(amount)});p.taxRows.push(child);}
 expect(()=>arOnlyInvoiceModel(withNonVatProof(p,groups))).toThrow('document_invoice_ar_only_nonvat_unverified');
});
