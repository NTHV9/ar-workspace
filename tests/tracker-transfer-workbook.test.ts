import {expect,it} from 'vitest';
import {strToU8,strFromU8,unzipSync,zipSync} from 'fflate';
import {transferWorkbook,transferInput} from './fixtures/tracker-transfer';
import {patchTrackerTransfers,parseTrackerWorkbook} from '../worker/tracker-sync/workbook';
import {validateTransferBatch,transferWasWritten,type TransferWrite} from '../worker/tracker-sync/transfer-model';
it('patches only B, C and AG while preserving financials, dates, formulas, archive and binary members',()=>{
 const bytes=transferWorkbook(),before=unzipSync(bytes),out=patchTrackerTransfers(bytes,'phuket',[transferInput]),after=unzipSync(out);
 const name='xl/worksheets/sheet1.xml';
 expect(Object.keys(after)).toEqual(Object.keys(before));
 for(const part of Object.keys(before))if(part!==name)expect(after[part]).toEqual(before[part]);
 const redact=(xml:string)=>xml.replace(/<c\b[^>]*\br="(?:B3|C3|AG3)"[^>]*>[\s\S]*?<\/c>/g,'CHANGED');
 expect(redact(strFromU8(after[name]))).toBe(redact(strFromU8(before[name])));
 const parsed=parseTrackerWorkbook(out,'phuket');
 expect(parsed.rows[0]).toMatchObject({accountNo:'00012',agent:'NEW & AGENCY',rowKey:transferInput.newRowKey,fields:{S:'30'}});
 expect(transferWasWritten({...parsed,version:'after',capabilities:{conditionalWrite:'proven'}},transferInput)).toBe(true);
});
it.each(['accountNo','invoiceNo','folio','transactionDate'] as const)('rejects a changed %s preimage',field=>{
 expect(()=>patchTrackerTransfers(transferWorkbook(),'phuket',[{...transferInput,expectedIdentity:{...transferInput.expectedIdentity,[field]:'changed'}}])).toThrow('tracker_identity_conflict');
});
it('refuses source Agent changes and target key drift',()=>{
 expect(()=>patchTrackerTransfers(transferWorkbook(),'phuket',[{...transferInput,expectedAgent:'OTHER'}])).toThrow();
 expect(()=>patchTrackerTransfers(transferWorkbook(),'phuket',[{...transferInput,newRowKey:'KT|UNRELATED|I:17|1'}])).toThrow('tracker_transfer_invalid');
});
it('preserves the writer fence on formula identity cells',()=>{
 const entries=unzipSync(transferWorkbook()),name='xl/worksheets/sheet1.xml';
 entries[name]=strToU8(strFromU8(entries[name]).replace('<c r="B3" t="inlineStr"><is><t>OLD AGENCY</t></is></c>','<c r="B3" t="str"><f>OTHER()</f><v>OLD AGENCY</v></c>'));
 expect(()=>patchTrackerTransfers(zipSync(entries),'phuket',[transferInput])).toThrow();
});
it('rejects duplicate target plans before touching provider cells',()=>{
 const snapshot={...parseTrackerWorkbook(transferWorkbook(),'phuket'),version:'x',capabilities:{conditionalWrite:'proven' as const}};
 expect(()=>validateTransferBatch(snapshot,[transferInput,transferInput])).toThrow('tracker_transfer_invalid');
});
