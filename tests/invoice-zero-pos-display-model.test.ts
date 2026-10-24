import {it,expect} from 'vitest';
import {zeroPosDisplayFixture} from './fixtures/invoice-zero-pos-display';
import {invoiceModel} from '../worker/invoice/model';
import {deriveInvoiceDisplayModel,validatedInvoiceDisplayLines} from '../worker/invoice/derive-display-model';
import {createPosDisplaySuppressionCatalog} from '../worker/invoice/zero-pos-display-proof';
import {verifyArPosDisplayProof} from '../worker/invoice/pos-display-proof';
import {verifyArOnlySourceClaimsWithDisplayRegion} from '../worker/invoice/ar-only-source-claims';
const totals=['gross','taxableNet','vat','nonTaxable','outstanding','debit','credit'] as const;
function fixture(){const f=zeroPosDisplayFixture(),model=invoiceModel(f.packet),region=verifyArOnlySourceClaimsWithDisplayRegion(f.packet).posRegion!,groups=verifyArPosDisplayProof(f.packet,f.proof,region).groups,catalog=createPosDisplaySuppressionCatalog(f.packet,f.proof)!,dates=new Map((f.packet.postings as {invoicePostingsDetails:{transactionNo:number;transactionDate:string}[]}).invoicePostingsDetails.map(s=>[String(s.transactionNo),s.transactionDate]));return {...f,model,groups,catalog,dates};}
it('omits only the certified cancelling group while retaining every financial source ID and footer',()=>{
 const f=fixture(),before=structuredClone(f.model);for(const line of f.model.lines)Object.freeze(line);Object.freeze(f.model.lines);const derived=deriveInvoiceDisplayModel(f.model,f.groups,f.dates,undefined,f.catalog);expect(derived.lines).toBe(f.model.lines);expect(derived.displayLines?.map(l=>l.id)).toEqual(['10001']);expect(derived.posDisplaySuppressionSource?.suppressed[0].sourceIds).toHaveLength(8);for(const key of totals)expect(derived[key]).toBe(before[key]);expect(f.model).toEqual(before);expect(validatedInvoiceDisplayLines(JSON.parse(JSON.stringify(derived)))).toHaveLength(1);
});
it('integrates suppression after full financial verification and the existing complete POS proof',()=>{
 const f=fixture(),before=invoiceModel(f.packet);f.packet.arPosDisplayProof=f.proof;const after=invoiceModel(f.packet);expect(after.lines).toEqual(before.lines);expect(after.displayLines).toHaveLength(1);for(const key of totals)expect(after[key]).toBe(before[key]);expect(after.posDisplaySuppressionSource).toBeDefined();
});

it.each(['catalog-removed','fabricated-ids','duplicate-descriptor','visible-overlap','missing-visible','footer','owner','financial-source','full-date','hidden-flag'] as const)('rejects a forged or incomplete serialized coverage union: %s',kind=>{
 const f=fixture(),derived=JSON.parse(JSON.stringify(deriveInvoiceDisplayModel(f.model,f.groups,f.dates,undefined,f.catalog)));if(kind==='catalog-removed')delete derived.posDisplaySuppressionSource;if(kind==='fabricated-ids')derived.posDisplaySuppressionSource.suppressed[0].sourceIds[0]='99991';if(kind==='duplicate-descriptor')derived.posDisplaySuppressionSource.suppressed.push(structuredClone(derived.posDisplaySuppressionSource.suppressed[0]));if(kind==='visible-overlap')derived.displayLines[0].sourceIds.push('60001');if(kind==='missing-visible')derived.displayLines=[];if(kind==='footer')derived.vat++;if(kind==='owner')derived.posDisplaySuppressionSource.packet.manifest.account_id='999';if(kind==='financial-source')derived.posDisplaySuppressionSource.packet.postings.invoicePostingsDetails[0].debitAmount.amount++;if(kind==='full-date')derived.displayLines[0].sourceDate='1926-01-02';if(kind==='hidden-flag')derived.posDisplaySuppressionSource.hidden=true;expect(()=>validatedInvoiceDisplayLines(derived)).toThrow();
});
import {paymentOffsetFixture} from './fixtures/invoice-payment-offset-display';
import {arOnlyTaxSource} from '../worker/invoice/current-ar-tax';
import {rebindZeroPosDisplayFixture} from './fixtures/invoice-zero-pos-display';
it('composes disjoint suppressed POS IDs with visible City Ledger auxiliary IDs',()=>{
 const f=zeroPosDisplayFixture(),city=paymentOffsetFixture();for(const payment of city.payments){payment.hotelId='TSAN';f.packet.taxRows.push({posting:payment});}for(const detail of city.proof.details)for(const raw of [detail.before,detail.after]){const page=raw as {transactions:Record<string,unknown>[];trxCodesInfo:Record<string,unknown>[]};for(const transaction of page.transactions)transaction.hotelId='TSAN';for(const code of page.trxCodesInfo)code.hotelId='TSAN';}rebindZeroPosDisplayFixture(f);city.proof.sourceBefore=structuredClone(arOnlyTaxSource(f.packet));city.proof.sourceAfter=structuredClone(arOnlyTaxSource(f.packet));const before=invoiceModel(f.packet);f.packet.arPosDisplayProof=f.proof;f.packet.arPaymentOffsetDisplayProof=city.proof;const after=invoiceModel(f.packet);expect(after.displayLines?.map(l=>l.id)).toEqual(['10001','70001','70002']);expect(after.lines).toEqual(before.lines);for(const key of totals)expect(after[key]).toBe(before[key]);expect(validatedInvoiceDisplayLines(JSON.parse(JSON.stringify(after)))).toHaveLength(3);
});
import {syntheticInvoice} from './browser/fixtures/invoice-pdf';
import {PDFDocument,PDFRawStream,PDFContentStream,decodePDFRawStream} from 'pdf-lib';
it('renders the serialized catalog with no fictitious zero monetary row',async()=>{
 const f=fixture(),model=JSON.parse(JSON.stringify(deriveInvoiceDisplayModel(f.model,f.groups,f.dates,undefined,f.catalog))),pdf=await PDFDocument.load(await syntheticInvoice(1,'VCH','A',false,model));const commands=pdf.getPages().flatMap(page=>page.node.normalizedEntries().Contents!.asArray().map(ref=>pdf.context.lookup(ref))).map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n'),texts=[...commands.matchAll(/<([\dA-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString());expect(texts).not.toContain('Closed cancelling venue');expect(texts).toContain('Accommodation charge');expect(model.lines).toHaveLength(9);
});
