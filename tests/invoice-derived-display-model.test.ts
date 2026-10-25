import {it,expect} from 'vitest';
import {deriveInvoiceDisplayModel,validatedInvoiceDisplayLines} from '../worker/invoice/derive-display-model';
import {verifyArPosDisplayProof,type VerifiedPosDisplayGroup} from '../worker/invoice/pos-display-proof';
import {arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {posDisplayFixture} from './fixtures/invoice-pos-display';
import {syntheticInvoice} from './browser/fixtures/invoice-pdf';
import {PDFDocument,PDFRawStream,PDFContentStream,decodePDFRawStream} from 'pdf-lib';

function fixture(){const f=posDisplayFixture(),model=arOnlyInvoiceModel(f.packet),groups=verifyArPosDisplayProof(f.packet,f.proof,f.roles).groups,dates=new Map(f.raw.postings.invoicePostingsDetails.map(p=>[String(p.transactionNo),p.transactionDate]));return {model,groups,dates};}
it('keeps financial lines immutable and derives complete owned display rows independently',()=>{
 const {model,groups,dates}=fixture(),before=structuredClone(model);for(const line of model.lines)Object.freeze(line);Object.freeze(model.lines);
 const derived=deriveInvoiceDisplayModel(model,groups,dates);expect(model).toEqual(before);expect(derived.lines).toBe(model.lines);expect(derived.displayLines).toHaveLength(2);
 const grouped=derived.displayLines!.find(row=>row.kind==='pos-group')!;expect(grouped).toMatchObject({id:'60002',sourceIds:['60001','60002','60003'],description:'Example cafe',debit:117700,credit:0});expect(derived.vat).toBe(model.vat);expect(derived.gross).toBe(model.gross);
});
it('preserves negative debit and distinct positive credit by literal independent column sums',()=>{
 const {model}=fixture();model.lines=[{id:'1',date:'03/01/26',description:'Base',reference:'A',debit:200,credit:0},{id:'2',date:'03/01/26',description:'Negative debit',reference:'B',debit:-40,credit:0},{id:'3',date:'03/01/26',description:'Positive credit',reference:'C',debit:0,credit:53}];Object.assign(model,{debit:160,credit:53,gross:107,taxableNet:100,nonTaxable:0,vat:7,outstanding:107});const before=structuredClone(model);
 const groups:VerifiedPosDisplayGroup[]=[{representativeId:'2',sourceIds:['1','2','3'],date:'2026-01-03',description:'Grouped',reference:'Exact reference'}];const derived=deriveInvoiceDisplayModel(model,groups,new Map(model.lines.map(row=>[row.id,'2026-01-03'])));
 expect(derived.displayLines![0]).toMatchObject({debit:160,credit:53});expect(derived).toMatchObject({debit:160,credit:53,gross:107,vat:7,taxableNet:100});expect(model).toEqual(before);
});
it.each(['overlap','missing-source','foreign-representative','wrong-date','missing-date'] as const)('rejects invalid descriptor ownership: %s',kind=>{
 const {model,groups,dates}=fixture();if(kind==='overlap')groups.push(structuredClone(groups[0]));if(kind==='missing-source')groups[0].sourceIds.push('999');if(kind==='foreign-representative')groups[0].representativeId='10001';if(kind==='wrong-date')groups[0].date='2026-01-04';if(kind==='missing-date')dates.delete('60001');expect(()=>deriveInvoiceDisplayModel(model,groups,dates)).toThrow('document_invoice_display_invalid');
});
it.each(['money','missing-coverage','duplicated-coverage','representative','date','order'] as const)('revalidates derived rows before rendering: %s',kind=>{
 const {model,groups,dates}=fixture(),derived=deriveInvoiceDisplayModel(model,groups,dates),row=derived.displayLines![1];if(kind==='money')row.debit++;if(kind==='missing-coverage')row.sourceIds.pop();if(kind==='duplicated-coverage')row.sourceIds.push(row.sourceIds[0]);if(kind==='representative')row.id='999';if(kind==='date')row.sourceDate='2026-01-04';if(kind==='order')derived.displayLines!.reverse();expect(()=>validatedInvoiceDisplayLines(derived)).toThrow('document_invoice_display_invalid');
});
it('prints validated derived rows while preserving the original model and footer money',async()=>{
 const {model,groups,dates}=fixture();for(const line of model.lines)line.description='RAW-'+line.id;const before=structuredClone(model),derived=deriveInvoiceDisplayModel(model,groups,dates),pdf=await PDFDocument.load(await syntheticInvoice(4,'VCH','A',false,derived));
 const commands=pdf.getPages().flatMap(page=>page.node.normalizedEntries().Contents!.asArray().map(ref=>pdf.context.lookup(ref))).map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n');const texts=[...commands.matchAll(/<([\dA-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString());
 expect(texts).toContain('Example cafe');expect(texts).toContain('RAW-10001');expect(texts).not.toContain('RAW-60001');expect(texts).not.toContain('RAW-60002');expect(texts).not.toContain('RAW-60003');expect(model).toEqual(before);
});
it('orders adjacent 16-digit representatives exactly while keeping minimum reference anchors separate',()=>{
 const {model}=fixture(),ids=['9007199254740993','9007199254740992','9007199254740991'];model.lines=ids.map((id,i)=>({id,date:'03/01/26',description:'Raw '+i,reference:'Raw ref '+i,debit:10,credit:0}));Object.assign(model,{debit:30,credit:0,gross:30});
 const groups:VerifiedPosDisplayGroup[]=[{representativeId:ids[0],sourceIds:[ids[2],ids[0]],date:'2026-01-03',description:'Rep after ungrouped',reference:'Minimum reference'}],derived=deriveInvoiceDisplayModel(model,groups,new Map(ids.map(id=>[id,'2026-01-03'])));
 expect(derived.displayLines!.map(row=>row.id)).toEqual([ids[1],ids[0]]);expect(derived.displayLines![1].reference).toBe('Minimum reference');expect(derived.lines.map(row=>row.id)).toEqual(ids);expect(validatedInvoiceDisplayLines(derived)).toBe(derived.displayLines);
});
it('preserves financially qualified payment-adjusted gross without deriving it again from visible columns',()=>{
 const {model,groups,dates}=fixture();model.gross-=25000;model.taxableNet-=25000;model.outstanding-=25000;const before=structuredClone(model),derived=deriveInvoiceDisplayModel(model,groups,dates);expect(derived.gross).toBe(before.gross);expect(derived.taxableNet).toBe(before.taxableNet);expect(derived.outstanding).toBe(before.outstanding);expect(derived.debit).toBe(before.debit);expect(derived.credit).toBe(before.credit);expect(model).toEqual(before);expect(validatedInvoiceDisplayLines(derived)).toHaveLength(2);
});
