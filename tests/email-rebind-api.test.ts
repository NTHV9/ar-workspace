import {afterEach,expect,it,vi} from 'vitest';
import {emailApi} from '../worker/email/api';
const actor=crypto.randomUUID(),job=crypto.randomUUID(),draft=crypto.randomUUID(),env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const request=(extra:object)=>new Request('https://app.test/api/email/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:job,documentRevision:4,...extra})});
afterEach(()=>vi.unstubAllGlobals());
it('rebinds the explicit prior workspace revision instead of creating a default email',async()=>{
 const calls:{name:string;body:unknown}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{calls.push({name:String(input).split('/').pop()!,body:JSON.parse(String(init.body))});return Response.json({error:'email_handoff_pending'});});
 const r=await emailApi(request({previousDraft:{id:draft,revision:2}}),env,actor);
 expect(r.status).toBe(409);
 expect(calls).toEqual([{name:'ar_email_rebind',body:{p_actor:actor,p_id:draft,p_revision:2,p_job_id:job,p_document_revision:4,p_max_bytes:10485760}}]);
});
it('rejects malformed prior draft identity before any private request',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const previousDraft of [{id:'bad',revision:1},{id:draft,revision:-1},{id:draft},{id:draft,revision:1,owner:actor},null]){
  expect((await emailApi(request({previousDraft}),env,actor)).status).toBe(400);
 }
 expect(fetcher).not.toHaveBeenCalled();
});
