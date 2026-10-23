import {it,expect} from 'vitest';
import {readArOnlyInvoicePacket,readArOnlyInvoiceModel,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {sourceClaimsReaderFixture} from './fixtures/invoice-ar-only-source-claims-reader';
function noFallback(reader:ReturnType<typeof sourceClaimsReaderFixture>['reader']){for(const name of ['folioReport','folioTypeName','invoicePosInterfaces','invoicePosTransactionCodes','invoiceCheckDetails'] as const)expect(reader[name]).not.toHaveBeenCalled();}
it.each([false,true])('collects one paired source and all exact component evidence (legacyOnly=%s)',async legacy=>{
 const {p,reader}=sourceClaimsReaderFixture(legacy),q=await readArOnlyInvoicePacket(reader,p.manifest);expect(q.arOnlySourceClaimsProof?.kind).toBe('ar-only-source-claims');expect(q.arOnlyZeroVatNetProof).toBeUndefined();expect(q.arRateDisplayGap).toBe('rate-display-capability');expect(arOnlyInvoiceModel(q).nonTaxable).toBe(-1000);expect(reader.invoicePostings).toHaveBeenCalledTimes(2);expect(reader.account).toHaveBeenCalledTimes(2);expect(reader.invoiceTransactionCodeRules).toHaveBeenCalledTimes(legacy?8:10);expect(reader.invoiceChargeSimulation).toHaveBeenCalledTimes(legacy?2:4);noFallback(reader);
});
it.each(['source','rules','calculation','provider','missing'] as const)('refuses %s evidence without financial fallback',async kind=>{
 const {p,proof,reader}=sourceClaimsReaderFixture();if(kind==='provider')reader.invoiceChargeSimulation.mockRejectedValue(Error('CalcUnavailable'));else if(kind==='missing')reader.invoiceTransactionCodeRules.mockResolvedValue(undefined);else{const original=reader.invoicePostings.getMockImplementation()!;let count=0;reader.invoicePostings.mockImplementation(async()=>{if(count++){if(kind==='source')p.postings.invoicePostingsDetails[1].reference='changed';if(kind==='rules')proof.directZero.groups[0].rules.transactionCode.compTransaction=true;if(kind==='calculation')proof.directZero.groups[0].calculation.result.totalAmount=21;}return original();});}
 await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow(kind==='provider'?'CalcUnavailable':kind==='missing'?'unverified':'document_source_changed');noFallback(reader);
});
it('refuses an unknown ordinary POS role without requesting alternate evidence',async()=>{const {p,proof,reader}=sourceClaimsReaderFixture();proof.ordinaryPos.definitions[0].before.transactionCode.classification.type='NonRevenue';await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow();noFallback(reader);});


it('reads both rule/calculation phases around the one fresh source, without provisional verification',async()=>{
 const {p,reader}=sourceClaimsReaderFixture(),events:string[]=[];for(const key of ['invoicePostings','invoiceTransactionCodeRules','invoiceChargeSimulation'] as const){const original=reader[key].getMockImplementation()!;reader[key].mockImplementation((async(...args:unknown[])=>{events.push(key);return (original as (...args:unknown[])=>unknown)(...args);}) as never);}
 await readArOnlyInvoicePacket(reader,p.manifest);const sources=events.flatMap((event,n)=>event==='invoicePostings'?[n]:[]);expect(sources).toHaveLength(2);const phases=[events.slice(sources[0]+1,sources[1]),events.slice(sources[1]+1)];for(const phase of phases){expect(phase.filter(e=>e==='invoiceTransactionCodeRules')).toHaveLength(5);expect(phase.filter(e=>e==='invoiceChargeSimulation')).toHaveLength(2);}noFallback(reader);
});
it.each(['duplicate','missing','provider'] as const)('refuses %s posted-source evidence without fallback',async kind=>{
 const {p,reader}=sourceClaimsReaderFixture();if(kind==='duplicate')p.taxRows.push(structuredClone(p.taxRows[0]));if(kind==='missing')p.taxRows.splice(p.taxRows.findIndex(e=>String(e.posting.transactionNo)==='60003'),1);if(kind==='provider')reader.invoicePostingBreakdown.mockRejectedValue(Error('SourceUnavailable'));await expect(readArOnlyInvoiceModel(reader,p.manifest)).rejects.toThrow();noFallback(reader);
});

it('refuses an unknown direct-zero footer policy before any calculator or fresh-source request',async()=>{const {p,proof,reader}=sourceClaimsReaderFixture();proof.directZero.groups[0].rules.transactionCode.classification.type='NonRevenue';await expect(readArOnlyInvoicePacket(reader,p.manifest)).rejects.toThrow('source_claims_unverified');expect(reader.invoiceChargeSimulation).not.toHaveBeenCalled();expect(reader.invoicePostings).toHaveBeenCalledTimes(1);noFallback(reader);});

