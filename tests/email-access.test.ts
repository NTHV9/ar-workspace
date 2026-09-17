import {afterEach,it,expect,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {createGmailDraft} from '../worker/email/gmail-draft';
import {emailApi} from '../worker/email/api';
afterEach(()=>vi.unstubAllGlobals());
const id='00000000-0000-4000-8000-000000000000';
it('protects all message, attachment, and Gmail routes before provider calls',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 for(const [path,method] of [['/api/email/open','POST'],[`/api/email/${id}`,'GET'],[`/api/email/${id}/exports/0`,'GET'],[`/api/email/${id}/gmail-draft`,'POST'],['/api/gmail/connect','POST'],['/api/gmail/status','GET']])expect((await handleApi(new Request('https://app.test'+path,{method}),{})).status).toBe(401);
 expect(f).not.toHaveBeenCalled();
});
it('rejects other verified identities from Gmail handoff',async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json({id,email:'other@example.test',email_confirmed_at:'2026-01-01'})).mockResolvedValueOnce(Response.json(null));vi.stubGlobal('fetch',f);
 const r=await handleApi(new Request(`https://app.test/api/email/${id}/gmail-draft`,{method:'POST',headers:{Authorization:'Bearer synthetic'}}),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic-server'});expect(r.status).toBe(403);expect(f).toHaveBeenCalledTimes(2);
});
for(const state of ['created','creating','uncertain'])it(`does not repeat a ${state} Gmail attempt`,async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json({id,hotel:'KAT',revision:2,package_changed:false})).mockResolvedValueOnce(Response.json({id,state}));vi.stubGlobal('fetch',f);
 expect(await createGmailDraft({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},'owner',id,2)).toMatchObject({state,alreadyRequested:true});
 expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls.every(c=>String(c[0]).startsWith('https://example.supabase.co/rest/v1/rpc/'))).toBe(true);
});
it('rejects stale revisions before touching Gmail',async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json({id,revision:3,package_changed:false}));vi.stubGlobal('fetch',f);
 await expect(createGmailDraft({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},'owner',id,2)).rejects.toThrow('email_revision_conflict');expect(f).toHaveBeenCalledTimes(1);
});

for(const kind of ['exports','attachments'] as const)for(const expired of [true,false])it(`${kind} distinguishes verified expiry from an unavailable private file (${expired})`,async()=>{
 const jobId='00000000-0000-4000-8000-000000000001',fileId='00000000-0000-4000-8000-000000000002';
 const file={id:fileId,name:'Synthetic.pdf',storage_key:`jobs/${jobId}/exports/${fileId}.pdf`,mime:'application/pdf',byte_count:3,sha256:'a'.repeat(64)};
 const calls:string[]=[];
 vi.stubGlobal('fetch',async(url:string)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/rest/v1/rpc/ar_email_get')return Response.json({id,owner:id,document_job_id:jobId,exports:[file],attachments:[file]});
  if(path==='/rest/v1/rpc/ar_financial_service_actor')return Response.json(id);
  if(path==='/rest/v1/rpc/ar_retention_file_state')return Response.json({expired});
  if(path.startsWith('/storage/v1/object/authenticated/'))return new Response(null,{status:503});
  throw Error('Unexpected synthetic request');
 });
 const response=await emailApi(new Request(`https://app.test/api/email/${id}/${kind}/${kind==='exports'?'0':fileId}`),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic',RETENTION_ENABLED:'true'},id);
 expect(response.status).toBe(expired?410:503);
 expect(await response.json()).toEqual({error:expired?'storage_file_expired':'email_attachment_unavailable'});
 expect(calls.some(path=>path.startsWith('/storage/'))).toBe(!expired);
});
