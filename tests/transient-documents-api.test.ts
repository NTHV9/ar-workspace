import {afterEach,expect,it,vi} from 'vitest';
import {documentApi} from '../worker/documents/api';
import {readMailFile} from '../worker/email/gmail-draft';
import type {EmailDraft} from '../worker/email/shared';
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret'};
const job={id,owner,lifecycle:'transient',state:'ready',files:[],exports:[],revision:0};
const post=(action:string,value:unknown)=>new Request(`https://app.test/api/documents/${id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
afterEach(()=>vi.unstubAllGlobals());
it('reviews exact exports through the owner-scoped RPC with no project field',async()=>{
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{if(url.endsWith('/ar_document_get'))return Response.json(job);expect(url).toMatch(/ar_document_review$/);expect(JSON.parse(String(init?.body))).toEqual({p_actor:owner,p_job_id:id,p_revision:0,p_exports:[],p_acknowledged:true});return Response.json({...job,revision:1});});vi.stubGlobal('fetch',fetcher);
 const response=await documentApi(post('review',{revision:0,exports:[],acknowledged:true}),env,owner,{});expect(response.status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(2);
});
for(const acknowledged of [false,null,undefined])it(`requires review acknowledgment ${acknowledged}`,async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json(job));vi.stubGlobal('fetch',fetcher);expect((await documentApi(post('review',{revision:0,exports:[],acknowledged}),env,owner,{})).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('blocks project save/upload/read before storage access',async()=>{
 const fetcher=vi.fn(async()=>Response.json(job));vi.stubGlobal('fetch',fetcher);
 for(const request of [post('save',{}),post('upload?kind=project',{}),new Request(`https://app.test/api/documents/${id}/project`)]){const r=await documentApi(request,env,owner,{});expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'document_project_retired'});}
 expect(fetcher).toHaveBeenCalledTimes(3);
});
it('preserves closed job metadata and supports idempotent discard while blocking bytes and mutations',async()=>{
 const closed={...job,closed_at:'2026-09-11T00:00:00Z',closed_reason:'discarded'};const fetcher=vi.fn(async(_url:string)=>Response.json(closed));vi.stubGlobal('fetch',fetcher);
 expect((await documentApi(new Request(`https://app.test/api/documents/${id}`),env,owner,{})).status).toBe(200);
 expect((await documentApi(post('discard',{}),env,owner,{})).status).toBe(200);
 for(const action of ['exports/0','files/00000000-0000-4000-8000-000000000003','project','review','upload?kind=export']){const r=await documentApi(action.startsWith('exports')||action.startsWith('files')||action==='project'?new Request(`https://app.test/api/documents/${id}/${action}`):post(action,{}),env,owner,{});expect(r.status).toBe(410);expect(await r.json()).toEqual({error:'document_closed'});}
 expect(fetcher.mock.calls.every(c=>!String(c[0]).includes('/storage/'))).toBe(true);
});
it('maps discard pending dependency to conflict and preserves the attempt',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/ar_document_get')?Response.json(job):Response.json({message:'document_mail_pending'},{status:400}));const r=await documentApi(post('discard',{}),env,owner,{});expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'document_mail_pending'});
});
it('closed mail bytes are rejected before any provider read',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const draft={document_closed_at:'2026-09-11T00:00:00Z'} as EmailDraft;
 await expect(readMailFile(env,draft,{name:'Synthetic.pdf',storage_key:`jobs/${id}/exports/x.pdf`,byte_count:10,sha256:'a'.repeat(64)})).rejects.toThrow('document_closed');expect(fetcher).not.toHaveBeenCalled();
});
