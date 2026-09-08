import {afterEach,expect,it,vi} from 'vitest';
import {reconcileDocumentStatus,type DocumentJob} from '../worker/documents/jobs';
const job:DocumentJob={id:'00000000-0000-4000-8000-000000000001',owner:'owner',hotel:'KAT',account_id:'A',account_name:'Synthetic',content:'invoices',layout:'combined',purpose:'billing',invoice_ids:['A','B'],manifest:[],state:'running',revision:0,project_key:null,exports:[],acknowledged:false,created_at:'2026-09-09',files:['pending','generating'].map((state,i)=>({id:String(i),kind:'invoice',invoice_id:String(i),ordinal:i+1,state,storage_key:null,error_code:null,byte_count:null,sha256:null}))};
afterEach(()=>vi.unstubAllGlobals());
it('classifies interrupted pending and claimed files without repeating rendering',async()=>{
 const failures:unknown[]=[];vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{if(url.endsWith('/ar_document_fail_file'))failures.push(JSON.parse(String(options.body)));return Response.json(job);});
 const create=vi.fn();await reconcileDocumentStatus({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',AR_REFRESH:{create,get:async()=>({status:async()=>({status:'errored'})})}},job);
 expect(failures).toEqual([{p_job_id:job.id,p_file_id:'0',p_code:'document_workflow_interrupted',p_uncertain:false},{p_job_id:job.id,p_file_id:'1',p_code:'document_workflow_interrupted',p_uncertain:true}]);expect(create).not.toHaveBeenCalled();
});
it('does not turn a temporary status lookup failure into a terminal outcome',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const result=await reconcileDocumentStatus({AR_REFRESH:{create:async()=>{},get:async()=>{throw new Error('temporary');}}},job);expect(result).toBe(job);expect(fetcher).not.toHaveBeenCalled();
});
it('uses post-status state when a pending file was claimed during the lookup',async()=>{
 const failures:Record<string,unknown>[]=[];const claimed={...job,files:job.files.map(f=>({...f,state:'generating'}))};
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{if(url.endsWith('/ar_document_fail_file'))failures.push(JSON.parse(String(options.body)));return Response.json(claimed);});
 await reconcileDocumentStatus({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',AR_REFRESH:{create:async()=>{},get:async()=>({status:async()=>({status:'errored'})})}},job);
 expect(failures).toHaveLength(2);expect(failures.every(f=>f.p_uncertain===true)).toBe(true);
});
