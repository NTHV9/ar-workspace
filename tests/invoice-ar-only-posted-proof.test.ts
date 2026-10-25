import {expect,it} from 'vitest';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import type {InvoicePacket} from '../worker/invoice/model';
import {postedGeneratePacket,mixedPostedGeneratePacket} from './fixtures/invoice-posted-generates';
import {discoverPostedGenerates,verifyPostedGenerates} from '../worker/invoice/posted-generates';
import {verifyArOnlyPostedGraph} from '../worker/invoice/ar-only-posted-proof';
import {mixedTaxPacket,money} from './fixtures/invoice-packet';

export function qualifyPosted(p:InvoicePacket):InvoicePacket{
 Reflect.deleteProperty(p,'nativeTaxControls');Reflect.deleteProperty(p,'currentArTaxProof');
 return Object.assign(p,{arOnlyPostedProof:{version:1,kind:'ar-only-posted-generates-vat7',sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p))}});
}
it.each([1,-1])('admits signed posted graphs and all selected lines without native controls (%s)',sign=>{
 const m=arOnlyInvoiceModel(qualifyPosted(postedGeneratePacket(sign)));
 expect(m).toMatchObject({gross:331500+sign*11770,vat:21687+sign*770,nonTaxable:0});expect(m.lines.map(l=>l.id)).toEqual(['10001','60001','60002','60003']);
});
it.each(['base-omitted','service-omitted','service-after-vat','multiple-vat','changed-rule','extra-evidence','missing-evidence','simulation-overlap','unknown-kind','snapshot','native-undefined','current-proof','transfer','embedded','direct-zero'] as const)('refuses incomplete full-base graph proof: %s',kind=>{
 const p=postedGeneratePacket(),e=p.arPostedGenerates[0],setup=e.rules.transactionCode.generatesSetup;
 if(kind==='base-omitted')setup.addBaseAmtTo.bucket1=false;
 if(kind==='service-omitted')setup.generates[0].addGeneratedAmtTo.bucket1=false;
 if(kind==='service-after-vat')setup.generates.reverse();
 if(kind==='multiple-vat'){e.generatedRules[0].transactionCode.classification.group.code='TAX';e.generatedRules[0].transactionCode.description.defaultText='VAT';}
 e.rulesAfter=structuredClone(e.rules);e.generatedRulesAfter=structuredClone(e.generatedRules);
 const q=qualifyPosted(p);
 if(kind==='changed-rule')e.rulesAfter.transactionCode.code='CHANGED';
 if(kind==='extra-evidence')p.arPostedGenerates.push(structuredClone(e));if(kind==='missing-evidence')p.arPostedGenerates=[];
 if(kind==='simulation-overlap')q.arSimulations=[{postingId:e.postingId,rules:e.rules,rulesAfter:e.rulesAfter,generatedRules:e.generatedRules,generatedRulesAfter:e.generatedRulesAfter,calculation:{}}];
 if(kind==='unknown-kind')Reflect.set(q.arOnlyPostedProof!,'kind','future');
 if(kind==='snapshot')Reflect.set(q.arOnlyPostedProof!,'sourceBefore',{});
 if(kind==='native-undefined')Object.assign(q,{nativeTaxControls:undefined});
 if(kind==='current-proof')Object.assign(q,{currentArTaxProof:{version:1,sourceBefore:arOnlyTaxSource(q),sourceAfter:arOnlyTaxSource(q)}});
 if(kind==='transfer')Object.assign(q,{arTransfer:{}});if(kind==='embedded')Object.assign(q,{embeddedGenerateProof:{}});if(kind==='direct-zero')Object.assign(q,{directZeroTaxProof:{}});
 expect(()=>arOnlyInvoiceModel(q)).toThrow();
});
it.each(['non-revenue','taxless','net-vat','rate','embedded-fb'] as const)('graph proof retains strict wrapper admission: %s',kind=>{
 const p=postedGeneratePacket(),part=p.taxRows.find(r=>'postingBreakdown'in r)!;
 if(!('postingBreakdown'in part))throw Error('fixture');
 if(kind==='non-revenue')part.posting.transactionType='NonRevenue';
 if(kind==='taxless'){part.postingBreakdown.netAmount=part.postingBreakdown.grossAmount;part.postingBreakdown.taxes=[];}
 if(kind==='net-vat'||kind==='rate'){const b=part.postingBreakdown;b.taxes[1].amount.amount=b.netAmount.amount*(kind==='net-vat'?.07:.08);b.grossAmount.amount=b.netAmount.amount+b.taxes.reduce((n,t)=>n+t.amount.amount,0);}
 if(kind==='embedded-fb')p.taxCodes[1].transactionGroup='F&B';
 expect(()=>arOnlyInvoiceModel(qualifyPosted(p))).toThrow();
});
it.each(['base-omitted','service-omitted','service-after-vat'] as const)('rejects a financially self-consistent but incomplete VAT membership: %s',kind=>{
 const p=postedGeneratePacket(),e=p.arPostedGenerates[0],root=p.arDetails[0].response.transactions[0];if(!('subPostings'in root))throw Error('fixture');
 const setup=e.rules.transactionCode.generatesSetup;
 if(kind==='base-omitted')setup.addBaseAmtTo.bucket1=false;
 if(kind==='service-omitted')setup.generates[0].addGeneratedAmtTo.bucket1=false;
 if(kind==='service-after-vat')setup.generates.reverse();
 const vat=kind==='base-omitted'?.7:7;
 for(const row of [root.subPostings[1],p.arDetails[0].response.transactions[2]])row.debitAmount.amount=row.postedAmount.amount=row.transactionAmount=vat;
 p.postings.invoicePostingsDetails[3].debitAmount.amount=vat;e.rulesAfter=structuredClone(e.rules);
 const graph=discoverPostedGenerates(p.manifest,p.account,p.postings,p.arDetails)[0];
 expect(verifyPostedGenerates(graph,e,'KAT').vatCents).toBe(Math.round(vat*100));
 expect(()=>verifyArOnlyPostedGraph(graph,e,'KAT')).toThrow('document_invoice_ar_only_posted_unverified');
});
it('rejects two individually valid VAT leaves rather than combining them into a full-VAT claim',()=>{
 const p=postedGeneratePacket(),e=p.arPostedGenerates[0],root=p.arDetails[0].response.transactions[0];if(!('subPostings'in root))throw Error('fixture');
 for(const d of [p.arDetails[0].response.trxCodesInfo[1],p.postings.trxCodesInfo.find(d=>d.transactionCode==='POST-SVC')!])Reflect.set(d,'transactionGroup','TAX');
 e.generatedRules[0].transactionCode.classification.group.code='TAX';e.generatedRules[0].transactionCode.description.defaultText='VAT';
 for(const g of e.rules.transactionCode.generatesSetup.generates){g.rule.percentage.amount=7;g.rule.percentage.calculatedOn='Base';g.addGeneratedAmtTo.bucket1=false;}
 for(const child of root.subPostings){const top=p.arDetails[0].response.transactions.find(r=>r.transactionNo===child.transactionNo)!;for(const row of [child,top])row.debitAmount.amount=row.postedAmount.amount=row.transactionAmount=7;p.postings.invoicePostingsDetails.find(r=>r.transactionNo===child.transactionNo)!.debitAmount.amount=7;}
 e.rulesAfter=structuredClone(e.rules);e.generatedRulesAfter=structuredClone(e.generatedRules);
 const graph=discoverPostedGenerates(p.manifest,p.account,p.postings,p.arDetails)[0];expect(verifyPostedGenerates(graph,e,'KAT').vatCents).toBe(1400);
 expect(()=>verifyArOnlyPostedGraph(graph,e,'KAT')).toThrow('document_invoice_ar_only_posted_unverified');
});
it('keeps cancelling wrong graph children unqualified despite unchanged invoice totals',()=>{
 const p=mixedPostedGeneratePacket();
 for(const root of p.arDetails[0].response.transactions){if(!('subPostings'in root)||!root.subPostings.length)continue;const child=root.subPostings[1],top=p.arDetails[0].response.transactions.find(r=>r.transactionNo===child.transactionNo)!;
  const amount=child.debitAmount.amount>0?8.7:-8.7;
  for(const row of [child,top])row.debitAmount.amount=row.postedAmount.amount=row.transactionAmount=amount;
  p.postings.invoicePostingsDetails.find(r=>r.transactionNo===child.transactionNo)!.debitAmount.amount=amount;
 }
 expect(()=>arOnlyInvoiceModel(qualifyPosted(p))).toThrow('document_invoice_ar_tax_unverified');
});
it.each(['unclaimed-child','shared-child','nested-difference','duplicate-id'] as const)('retains closed graph identity constraints: %s',kind=>{
 const p=mixedPostedGeneratePacket(),root=p.arDetails[0].response.transactions[0];if(!('subPostings'in root))throw Error('fixture');
 if(kind==='unclaimed-child')root.subPostings.pop();
 if(kind==='shared-child'){const second=p.arDetails[0].response.transactions[3];if(!('subPostings'in second))throw Error('fixture');second.subPostings[0]=structuredClone(root.subPostings[0]);}
 if(kind==='nested-difference')root.subPostings[0].debitAmount.amount++;
 if(kind==='duplicate-id')p.postings.invoicePostingsDetails.push(structuredClone(p.postings.invoicePostingsDetails[0]));
 expect(()=>arOnlyInvoiceModel(qualifyPosted(p))).toThrow();
});
it.each(['taxless','pos'] as const)('does not admit a direct %s group alongside a valid graph',kind=>{
 const p=postedGeneratePacket(),direct=mixedTaxPacket();
 const extras=direct.postings.invoicePostingsDetails.slice(kind==='taxless'?4:1,kind==='taxless'?5:4);
 p.postings.invoicePostingsDetails.push(...extras.map(r=>({...r,transactionNo:r.transactionNo+100})));
 p.postings.trxCodesInfo.push(...direct.postings.trxCodesInfo.slice(1));
 for(const entry of direct.taxRows.slice(kind==='taxless'?6:3,kind==='taxless'?7:6)){entry.posting.transactionNo+=100;p.taxRows.push(entry as typeof p.taxRows[number]);}
 const total=p.postings.invoicePostingsDetails.reduce((n,r)=>n+r.debitAmount.amount,0);p.manifest.open=total;p.invoice.amount=p.invoice.balance=money(total);
 expect(()=>arOnlyInvoiceModel(qualifyPosted(p))).toThrow('document_invoice_ar_only_unsupported');
});
