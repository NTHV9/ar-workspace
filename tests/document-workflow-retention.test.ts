import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {dispatchDocumentJob,type DocumentJob} from '../worker/documents/jobs';
const now=Date.parse('2026-10-29T06:00:00Z'),day=86400000;
const item={id:'10000000-0000-4000-8000-000000000001'};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it.each([{closed_at:'2026-10-29T05:59:00Z'},{discard_requested_at:'2026-10-29T05:59:00Z'},{bytes_released:true},{preparation_retirement:{accepted:true}}])('never dispatches a fresh preparation already exited or released (%j)',async closure=>{
 vi.useFakeTimers();vi.setSystemTime(now);const create=vi.fn(),get=vi.fn(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const closed={...job,created_at:new Date(now-60000).toISOString(),...closure};
 expect(await dispatchDocumentJob({AR_REFRESH:{create,get}},closed)).toBe(closed);expect(create).not.toHaveBeenCalled();expect(get).toHaveBeenCalledWith(job.id);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['complete','errored','running'])('an exited fresh job still reconciles known %s results without a new execution',async status=>{
 vi.useFakeTimers();vi.setSystemTime(now);const create=vi.fn(),changes:unknown[]=[];
 const exited={...job,created_at:new Date(now-60000).toISOString(),discard_requested_at:new Date(now-1000).toISOString()};
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{if(url.endsWith('/ar_document_fail_file'))changes.push(JSON.parse(String(options.body)));return Response.json(exited);});
 await dispatchDocumentJob({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',AR_REFRESH:{create,get:async()=>({status:async()=>({status})})}},exited);
 expect(create).not.toHaveBeenCalled();expect(changes).toHaveLength(status==='running'?0:2);
 if(status!=='running')expect(changes).toEqual([{p_job_id:job.id,p_file_id:'pending',p_code:'document_workflow_interrupted',p_uncertain:false},{p_job_id:job.id,p_file_id:'claimed',p_code:'document_workflow_interrupted',p_uncertain:true}]);
});
it('pins the requested retention on all four existing bindings without enabling logs',()=>{
 const c=JSON.parse(readFileSync('wrangler.jsonc','utf8'));expect(c.workflows).toHaveLength(4);
 for(const w of c.workflows){expect(w.default_retention).toEqual({success_retention:'1 day',error_retention:'7 days'});expect(w.concurrency).toEqual({limit:2});}
 expect(c.observability.enabled).toBe(false);
});
const job:DocumentJob={id:item.id,owner:'synthetic',hotel:'KAT',account_id:'synthetic',account_name:'Synthetic',content:'invoices',layout:'combined',purpose:'billing',invoice_ids:[],manifest:[],state:'running',revision:0,project_key:null,exports:[],acknowledged:false,created_at:new Date(now-2*day).toISOString(),files:[{id:'pending',kind:'invoice',invoice_id:null,ordinal:1,state:'pending',storage_key:null,error_code:null,byte_count:null,sha256:null},{id:'claimed',kind:'invoice',invoice_id:null,ordinal:2,state:'generating',storage_key:null,error_code:null,byte_count:null,sha256:null},{id:'ready',kind:'invoice',invoice_id:null,ordinal:3,state:'ready',storage_key:'synthetic-ready',error_code:null,byte_count:10,sha256:'a'.repeat(64)}]};
it.each(['refresh','documents'] as const)('never recreates expired old document work on the %s queue',async execution_queue=>{
 vi.useFakeTimers();vi.setSystemTime(now);const create=vi.fn(),get=vi.fn(async()=>{throw Error('instance not found');});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const result=await dispatchDocumentJob({AR_REFRESH:{create,get},AR_DOCUMENTS:{create,get}},{...job,execution_queue});expect(create).not.toHaveBeenCalled();expect(result.files).toEqual(job.files);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['complete','errored','running'])('old document status %s reconciles without creating/rendering or touching ready bytes',async status=>{
 vi.useFakeTimers();vi.setSystemTime(now);const create=vi.fn(),changes:unknown[]=[];
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{if(url.endsWith('/ar_document_fail_file'))changes.push(JSON.parse(String(options.body)));return Response.json(job);});
 await dispatchDocumentJob({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',AR_REFRESH:{create,get:async()=>({status:async()=>({status})})}},job);
 expect(create).not.toHaveBeenCalled();expect(changes).toHaveLength(status==='running'?0:2);expect(changes).not.toContainEqual(expect.objectContaining({p_file_id:'ready'}));
});
