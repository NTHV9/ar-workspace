import {afterEach,expect,it,vi} from 'vitest';
import {planWorkflowCleanup,purgeWorkflowBatch,readWorkflowPages,type WorkflowInstance,type SourceProof} from '../worker/operations/workflow-retention';

const now=Date.parse('2026-10-29T06:00:00Z'),day=86400000;
const item:WorkflowInstance={workflow:'ar-workspace-refresh',id:'10000000-0000-4000-8000-000000000001',workflow_id:'20000000-0000-4000-8000-000000000001',version_id:'30000000-0000-4000-8000-000000000001',status:'complete',created_on:new Date(now-3*day).toISOString(),ended_on:new Date(now-day-1).toISOString()};
const proof:SourceProof={observedAt:new Date(now).toISOString(),eligible:[{workflow:item.workflow,id:item.id,reason:'terminal_refresh'}]};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('uses terminal end time, exact boundaries and matching source authority',()=>{
 expect(planWorkflowCleanup([item],proof,now).eligible).toEqual([item]);
 for(const status of ['running','queued','waiting','paused','terminated','unknown'])expect(planWorkflowCleanup([{...item,status}],proof,now).eligible).toEqual([]);
 for(const ended_on of [null,'invalid',new Date(now-day).toISOString(),new Date(now+1).toISOString()])expect(planWorkflowCleanup([{...item,ended_on}],proof,now).eligible).toEqual([]);
 expect(planWorkflowCleanup([{...item,status:'errored'}],proof,now).eligible).toEqual([]);
 expect(planWorkflowCleanup([{...item,status:'errored',ended_on:new Date(now-7*day-1).toISOString(),created_on:new Date(now-9*day).toISOString()}],proof,now).eligible).toHaveLength(1);
 expect(planWorkflowCleanup([item],{...proof,eligible:[]},now).eligible).toEqual([]);
});
it('inventories legacy opaque IDs but holds them instead of authorizing deletion',async()=>{
 const legacy={...item,id:'historical-diagnostic-instance'};
 expect(await readWorkflowPages(async()=>[legacy],100)).toEqual([legacy]);
 expect(planWorkflowCleanup([legacy],proof,now).eligible).toEqual([]);
 expect(planWorkflowCleanup([legacy],proof,now).held).toEqual({unrecognized_identity:1});
});
it('rejects stale, future, duplicate and cross-workflow proof before any mutation',()=>{
 for(const p of [{...proof,observedAt:new Date(now-300001).toISOString()},{...proof,observedAt:new Date(now+1).toISOString()},{...proof,eligible:[...proof.eligible,...proof.eligible]},{...proof,eligible:[{...proof.eligible[0],workflow:'ar-workspace-documents' as const}]}])expect(()=>planWorkflowCleanup([item],p,now)).toThrow();
 expect(()=>planWorkflowCleanup([item,item],proof,now)).toThrow();
});
it('finishes pagination before selection and rejects repeated pages',async()=>{
 const calls:number[]=[];const records=await readWorkflowPages(async page=>{calls.push(page);return page===1?[item]:[];},1);expect(records).toEqual([item]);expect(calls).toEqual([1,2]);
 await expect(readWorkflowPages(async()=>[item],1)).rejects.toThrow('workflow_duplicate_instance');
});
it('rechecks provider and source and excludes changes without creating or sending anything',async()=>{
 const remove=vi.fn().mockResolvedValue({deleted:[{id:item.id}],errors:[]});
 const ports={now:()=>now,readInstances:vi.fn(async()=>[item]),readSource:vi.fn(async()=>proof),deleteBatch:remove};
 expect((await purgeWorkflowBatch([item],ports)).deleted).toEqual([item.id]);expect(remove).toHaveBeenCalledOnce();
 for(const changed of [{...item,status:'running'},{...item,version_id:'40000000-0000-4000-8000-000000000001'},{...item,ended_on:new Date(now).toISOString()}]){
  remove.mockClear();ports.readInstances.mockResolvedValue([changed]);expect((await purgeWorkflowBatch([item],ports)).deleted).toEqual([]);expect(remove).not.toHaveBeenCalled();
 }
 ports.readInstances.mockResolvedValue([item]);ports.readSource.mockResolvedValue({...proof,eligible:[]});expect((await purgeWorkflowBatch([item],ports)).deleted).toEqual([]);expect(remove).not.toHaveBeenCalled();
});
it('does not repeat a delete after a lost response or accept latest aliases',async()=>{
 const remove=vi.fn().mockRejectedValue(Error('lost response'));
 const result=await purgeWorkflowBatch([item],{now:()=>now,readInstances:async()=>[item],readSource:async()=>proof,deleteBatch:remove});expect(result.uncertain).toEqual([item.id]);expect(remove).toHaveBeenCalledOnce();
 await expect(purgeWorkflowBatch([{...item,id:'latest'}],{now:()=>now,readInstances:async()=>[],readSource:async()=>proof,deleteBatch:remove})).rejects.toThrow();expect(remove).toHaveBeenCalledOnce();
});
