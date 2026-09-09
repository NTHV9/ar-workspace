import {afterEach,it,expect,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {createGmailDraft} from '../worker/email/gmail-draft';
afterEach(()=>vi.unstubAllGlobals());
const id='00000000-0000-4000-8000-000000000000';
it('protects all message, attachment, and Gmail routes before provider calls',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 for(const [path,method] of [['/api/email/open','POST'],[`/api/email/${id}`,'GET'],[`/api/email/${id}/exports/0`,'GET'],[`/api/email/${id}/gmail-draft`,'POST'],['/api/gmail/connect','POST'],['/api/gmail/status','GET']])expect((await handleApi(new Request('https://app.test'+path,{method}),{})).status).toBe(401);
 expect(f).not.toHaveBeenCalled();
});
it('rejects other verified identities from Gmail handoff',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json({id,email:'other@example.test',email_confirmed_at:'2026-01-01'}));vi.stubGlobal('fetch',f);
 const r=await handleApi(new Request(`https://app.test/api/email/${id}/gmail-draft`,{method:'POST',headers:{Authorization:'Bearer synthetic'}}),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic'});expect(r.status).toBe(403);expect(f).toHaveBeenCalledTimes(1);
});
for(const state of ['created','creating','uncertain'])it(`does not repeat a ${state} Gmail attempt`,async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json({id,revision:2,package_changed:false})).mockResolvedValueOnce(Response.json({id,state}));vi.stubGlobal('fetch',f);
 expect(await createGmailDraft({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},'owner',id,2)).toMatchObject({state,alreadyRequested:true});
 expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls.every(c=>String(c[0]).startsWith('https://example.supabase.co/rest/v1/rpc/'))).toBe(true);
});
it('rejects stale revisions before touching Gmail',async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json({id,revision:3,package_changed:false}));vi.stubGlobal('fetch',f);
 await expect(createGmailDraft({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},'owner',id,2)).rejects.toThrow('email_revision_conflict');expect(f).toHaveBeenCalledTimes(1);
});
