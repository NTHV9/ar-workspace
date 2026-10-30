import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {backendRpc} from '../worker/refresh/backend';
import {createDocumentJob,dispatchDocumentJob,type DocumentJob} from '../worker/documents/jobs';
import {canCreateDocumentWorkflow} from '../worker/operations/workflow-retention';
vi.mock('../worker/refresh/backend',()=>({backendRpc:vi.fn()}));
const now=Date.parse('2026-10-30T06:00:00Z'),minute=60000,hour=3600000;
const base:DocumentJob={id:'10000000-0000-4000-8000-000000000001',owner:'synthetic',hotel:'WAKL',account_id:'synthetic',account_name:'Synthetic',content:'invoices',layout:'combined',purpose:'billing',invoice_ids:['synthetic-invoice'],manifest:[],state:'queued',revision:0,project_key:null,exports:[],acknowledged:false,created_at:new Date(now).toISOString(),files:[{id:'synthetic-file',kind:'invoice',invoice_id:'synthetic-invoice',ordinal:1,state:'pending',storage_key:null,error_code:null,byte_count:null,sha256:null}]};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now);});
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks();vi.unstubAllGlobals();});
it.each(['documents','refresh'] as const)('dispatches a new preparation immediately when DB time leads Worker time on %s',async execution_queue=>{
 const job={...base,execution_queue,created_at:new Date(now+200).toISOString()};
 vi.mocked(backendRpc).mockResolvedValue(job);const create=vi.fn().mockResolvedValue({}),get=vi.fn(async()=>({status:async()=>({status:'queued'})}));
 const network=vi.fn();vi.stubGlobal('fetch',network);
 const result=await createDocumentJob({AR_DOCUMENTS:{create,get},AR_REFRESH:{create,get}},base.owner,{commandKey:'20000000-0000-4000-8000-000000000001',hotel:base.hotel,accountId:base.account_id,ids:base.invoice_ids,content:'invoices',layout:'combined',purpose:'billing'});
 expect(result.state).toBe('queued');expect(create).toHaveBeenCalledOnce();expect(create).toHaveBeenCalledWith({id:job.id,params:{runId:job.id,hotel:job.hotel,documentJob:true}});
 expect(backendRpc).toHaveBeenCalledOnce();expect(network).not.toHaveBeenCalled();
});
it.each([1,200,1000,5*minute])('allows bounded server-clock lead %d ms without removing the old-work fence',lead=>{
 expect(canCreateDocumentWorkflow(new Date(now+lead).toISOString(),now)).toBe(true);
 expect(canCreateDocumentWorkflow(new Date(now-24*hour).toISOString(),now-lead)).toBe(false);
});
it('holds excessive future times, invalid timestamps and the exact expiry boundary',()=>{
 expect(canCreateDocumentWorkflow(new Date(now+5*minute+1).toISOString(),now)).toBe(false);
 expect(canCreateDocumentWorkflow('invalid',now)).toBe(false);expect(canCreateDocumentWorkflow(new Date(now).toISOString(),NaN)).toBe(false);
 expect(canCreateDocumentWorkflow(new Date(now-23*hour).toISOString(),now)).toBe(false);
 expect(canCreateDocumentWorkflow(new Date(now-23*hour+1).toISOString(),now)).toBe(true);
});
it.each([{closed_at:new Date(now).toISOString()},{discard_requested_at:new Date(now).toISOString()},{bytes_released:true},{preparation_retirement:{accepted:true}}])('does not revive exited work even with an allowed clock lead (%j)',async closure=>{
 const create=vi.fn(),get=vi.fn(async()=>{throw Error('no original instance');});
 const job={...base,execution_queue:'documents' as const,created_at:new Date(now+200).toISOString(),...closure};
 expect(await dispatchDocumentJob({AR_DOCUMENTS:{create,get}},job)).toBe(job);expect(create).not.toHaveBeenCalled();expect(backendRpc).not.toHaveBeenCalled();
});
