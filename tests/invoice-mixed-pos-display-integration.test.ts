import {it,expect} from 'vitest';
import {mixedPosDisplayFixture} from './fixtures/invoice-mixed-pos-display';
import {sourceClaimsPosDisplayReaderFixture} from './fixtures/invoice-source-claims-pos-display-reader';
import {invoiceModel} from '../worker/invoice/model';
import {readArOnlyInvoicePacket,arOnlyInvoiceModel} from '../worker/invoice/ar-only-read';
import {money} from './fixtures/invoice-packet';
const totals=['gross','taxableNet','vat','nonTaxable','outstanding','debit','credit'] as const;
it('derives a closed mixed group while retaining financial rows and all seven totals',()=>{
 const f=mixedPosDisplayFixture(),before=invoiceModel(f.packet),snapshot=JSON.stringify(f.packet);f.packet.arPosDisplayProof=f.proof;const after=invoiceModel(f.packet);expect(after.displayLines).toHaveLength(2);expect(after.displayLines?.find(l=>l.kind==='pos-group')).toMatchObject({id:'80001',sourceIds:['60001','60002','60003','60004','60005','80001'],reference:'A literal routing narrative #101=>#102',debit:128400,credit:0});expect(after.lines).toEqual(before.lines);for(const key of totals)expect(after[key]).toBe(before[key]);delete f.packet.arPosDisplayProof;expect(JSON.stringify(f.packet)).toBe(snapshot);
});
function readerFixture(){
 const f=sourceClaimsPosDisplayReaderFixture('posted'),mixed=mixedPosDisplayFixture();Object.assign(f.p,mixed.packet);Object.assign(f.page,mixed.page);const row=f.p.postings.invoicePostingsDetails.find((s:{transactionNo:number})=>s.transactionNo===60001),entry=f.p.taxRows.find((e:{posting:{transactionNo:number}})=>e.posting.transactionNo===60001);row.debitAmount=money(500);Object.assign(entry.posting,{debitAmount:money(500),postedAmount:money(500),transactionAmount:500});entry.postingBreakdown.netAmount=entry.postingBreakdown.grossAmount=money(500);f.p.manifest.open-=100;f.p.invoice.amount=f.p.invoice.balance=money(f.p.manifest.open);Object.assign(f.current,f.p.invoice);return f;
}
it('pairs existing metadata across one fresh source fence and keeps mixed financial membership separate',async()=>{
 const f=readerFixture(),q=await readArOnlyInvoicePacket(f.reader,f.p.manifest),model=arOnlyInvoiceModel(q);expect(q.arPosDisplayProof).toBeDefined();expect(f.phases).toEqual([1,2]);expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);expect(f.reader.account).toHaveBeenCalledTimes(2);expect(model.displayLines?.filter(l=>l.kind==='pos-group')).toHaveLength(1);expect(model.displayLines?.find(l=>l.kind==='pos-group')?.sourceIds).toContain('80001');expect(f.reader.folioReport).not.toHaveBeenCalled();
});

it('retains raw financially qualified rows for unsupported optional display membership',async()=>{
 const f=readerFixture(),entry=f.p.taxRows.find((e:{posting:{transactionNo:number}})=>e.posting.transactionNo===80001);entry.postingBreakdown.financialTransactionIdList=[{id:'80001'}];const q=await readArOnlyInvoicePacket(f.reader,f.p.manifest),model=arOnlyInvoiceModel(q);expect(q.arPosDisplayProof).toBeUndefined();expect(q.arPosDisplayGap).toBe('pos-display-evidence');expect(model.lines).toHaveLength(7);expect(model.displayLines).toBeUndefined();expect(f.reader.invoicePostings).toHaveBeenCalledTimes(2);
});
it('does not turn an invalid financial residual into a display gap or alternate money source',async()=>{
 const f=readerFixture(),entry=f.p.taxRows.find((e:{posting:{transactionNo:number}})=>e.posting.transactionNo===80001);entry.postingBreakdown.netAmount=money(999);await expect(readArOnlyInvoicePacket(f.reader,f.p.manifest)).rejects.toThrow();expect(f.reader.folioReport).not.toHaveBeenCalled();expect(f.reader.invoicePosDisplayFolios.mock.calls.length).toBeLessThanOrEqual(1);
});
