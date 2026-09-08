import {afterEach,expect,it,vi} from 'vitest';
import {documentApi} from '../worker/documents/api';
const owner='00000000-0000-4000-8000-000000000001',jobId='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret'};
afterEach(()=>vi.unstubAllGlobals());
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
