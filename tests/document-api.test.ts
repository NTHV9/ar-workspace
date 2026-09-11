import {afterEach,expect,it,vi} from 'vitest';
import {documentApi} from '../worker/documents/api';
const owner='00000000-0000-4000-8000-000000000001',jobId='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret'};
afterEach(()=>vi.unstubAllGlobals());
const createInput={commandKey:'00000000-0000-4000-8000-000000000003',hotel:'KAT',accountId:'synthetic-account',ids:['A'],content:'statement',layout:'combined',purpose:'billing'};
function createRequest(input:Record<string,unknown>){return new Request('https://app.test/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});}
for(const content of ['statement','both'])it(`creates ${content} using the workspace source when no source is supplied`,async()=>{
 const calls:Record<string,unknown>[]=[];vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));return Response.json({id:jobId,files:[]});});
 const r=await documentApi(createRequest({...createInput,content}),{...env,AR_REFRESH:{create:async()=>{},get:async()=>({status:async()=>({status:'complete'})})}},owner,{});
 expect(r.status).toBe(202);expect(calls[0].p_statement_source).toBe('workspace');
});
it('rejects the retired native Statement source before database or provider work',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const r=await documentApi(createRequest({...createInput,statementSource:'native'}),env,owner,{});
 expect(r.status).toBe(400);expect(await r.json()).toEqual({error:'document_statement_source_retired'});expect(fetcher).not.toHaveBeenCalled();
});
it('does not let an omitted source bypass the workspace renderer selection limit',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const r=await documentApi(createRequest({...createInput,ids:Array.from({length:501},(_,i)=>String(i))}),env,owner,{});
 expect(r.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});
it('keeps Invoice-only creation native',async()=>{
 const calls:Record<string,unknown>[]=[];vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));return Response.json({id:jobId,files:[]});});
 const r=await documentApi(createRequest({...createInput,content:'invoices'}),{...env,AR_REFRESH:{create:async()=>{},get:async()=>({status:async()=>({status:'complete'})})}},owner,{});
 expect(r.status).toBe(202);expect(calls[0].p_statement_source).toBe('native');
});
it('blocks another owner before private file reads or uploads',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return Response.json({id:jobId,owner:'different-owner',files:[]});});
 for(const action of ['files/00000000-0000-4000-8000-000000000003','upload?kind=export']){const r=await documentApi(new Request(`https://app.test/api/documents/${jobId}/${action}`,{method:action.startsWith('upload')?'POST':'GET'}),env,owner,{Authorization:'Bearer synthetic'});expect(r.status).toBe(403);}
 expect(calls.every(url=>url.endsWith('/rpc/ar_document_get'))).toBe(true);
});
it('does not register malformed PDF uploads even with a PDF header',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return Response.json({id:jobId,owner,files:[{state:'ready'}]});});
 const r=await documentApi(new Request(`https://app.test/api/documents/${jobId}/upload?kind=export`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:'%PDF-invalid'}),env,owner,{Authorization:'Bearer synthetic'});
 expect(r.status).toBe(400);expect(calls).toHaveLength(1);
});
it('rejects forged cross-job file identity without storage access',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return Response.json({id:jobId,owner,files:[],exports:[]});});
 const r=await documentApi(new Request(`https://app.test/api/documents/${jobId}/files/00000000-0000-4000-8000-000000000004`),env,owner,{Authorization:'Bearer synthetic'});expect(r.status).toBe(404);expect(calls).toHaveLength(1);
});
it('does not show a substitute PDF when private storage fails',async()=>{
 const key=`jobs/${jobId}/originals/00000000-0000-4000-8000-000000000003.pdf`;
 vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/rpc/ar_document_get')?Response.json({id:jobId,owner,files:[{id:'00000000-0000-4000-8000-000000000003',state:'ready',storage_key:key}],exports:[]}):new Response('synthetic failure',{status:503}));
 const response=await documentApi(new Request(`https://app.test/api/documents/${jobId}/files/00000000-0000-4000-8000-000000000003`),env,owner,{Authorization:'Bearer synthetic'});
 expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'document_file_unavailable'});
});
