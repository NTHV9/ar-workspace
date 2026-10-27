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
it('keeps the immutable id-only original separate from a fully verified current scope',async()=>{
 const batch=createBatch('actor','phuket',[{key:'group',hotel:'KAT',accountId:'10',accountName:'Synthetic',ids:['1'],stage:'Billing',purpose:'billing',amount:1}],{content:'both',layout:'combined'}),entry={...batch.entries[0],jobId:crypto.randomUUID()},current={id:'',owner:'actor',hotel:'KAT',account_id:'10',invoice_ids:['1']};current.id=entry.jobId;
 const original={job:{id:entry.jobId},outcome:'protected'};
 const result=await abandonVerifiedEntry(batch,entry,async()=>current,async()=>original as any);expect(result.job).toEqual({id:entry.jobId});expect((result as any).currentJob).toEqual(current);expect(original).toEqual({job:{id:entry.jobId},outcome:'protected'});
});
it.each(['owner','hotel','account_id','invoice_ids'])('id-only recovery still rejects a mismatched current %s',async field=>{
 const batch=createBatch('actor','phuket',[{key:'group',hotel:'KAT',accountId:'10',accountName:'Synthetic',ids:['1'],stage:'Billing',purpose:'billing',amount:1}],{content:'both',layout:'combined'}),entry={...batch.entries[0],jobId:crypto.randomUUID()},before={id:entry.jobId,owner:'actor',hotel:'KAT',account_id:'10',invoice_ids:['1']},wrong={...before,[field]:field==='invoice_ids'?['wrong']:'wrong'};
 await expect(abandonVerifiedEntry(batch,entry,async()=>before,async()=>({job:{id:entry.jobId},currentJob:wrong,outcome:'protected'}))).rejects.toThrow();
 await expect(abandonVerifiedEntry(batch,entry,async()=>before,async()=>({job:wrong,currentJob:before,outcome:'protected'}))).rejects.toThrow();
});
