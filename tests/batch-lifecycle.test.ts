import {expect,it,vi} from 'vitest';
import {batchHasEdits,abandonVerifiedEntry} from '../src/batch/lifecycle';
import {createBatch} from '../src/batch/state';
it('keeps the leave warning when the active account is clean but a paused PDF has edits',()=>{
 expect(batchHasEdits(false,[{editor:{dirty:true,past:[]}}])).toBe(true);
 expect(batchHasEdits(false,[{editor:{dirty:false,past:[]}}])).toBe(false);
 expect(batchHasEdits(true,[])).toBe(true);
});
it('validates an authoritative document scope before any abandon mutation',async()=>{
 const batch=createBatch('actor','phuket',[{key:'group',hotel:'KAT',accountId:'10',accountName:'Synthetic',ids:['1'],stage:'Billing',purpose:'billing',amount:1}],{content:'both',layout:'combined'});
 const entry={...batch.entries[0],jobId:crypto.randomUUID()},abandon=vi.fn();
 await expect(abandonVerifiedEntry(batch,entry,async()=>({id:entry.jobId,owner:'actor',hotel:'TSK',account_id:'10',invoice_ids:['1']}),abandon)).rejects.toThrow();
 expect(abandon).not.toHaveBeenCalled();
});
