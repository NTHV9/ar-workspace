import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
const id='00000000-0000-4000-8000-000000000001';
afterEach(()=>vi.unstubAllGlobals());
it('authenticates every Drive route before touching provider grants or receipts',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 for(const [path,method] of [['status','GET'],['config','GET'],['connect','POST'],['verify-folder','POST'],['test','POST'],['jobs/'+id+'?revision=1','GET'],['jobs/'+id,'POST']])expect((await handleApi(new Request('https://app.test/api/drive/'+path,{method}),{})).status).toBe(401);
 expect(f).not.toHaveBeenCalled();
});
it('denies other verified accounts before serving Picker configuration or creating an archive',async()=>{
 const f=vi.fn().mockImplementation(async()=>Response.json({id,email:'other@example.test',email_confirmed_at:'2026-01-01'}));vi.stubGlobal('fetch',f);
 for(const [path,method] of [['config','GET'],['test','POST']])expect((await handleApi(new Request('https://app.test/api/drive/'+path,{method,headers:{Authorization:'Bearer synthetic'}}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic'})).status).toBe(403);
 expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls.every(c=>String(c[0]).endsWith('/auth/v1/user'))).toBe(true);
});
it('routes Drive callback state independently of Gmail and rejects a missing Drive cookie',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);const r=await handleApi(new Request('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback?state=d.'+'a'.repeat(43)+'&code=synthetic'),{GMAIL_CLIENT_ID:'synthetic',GMAIL_CLIENT_SECRET:'synthetic',GMAIL_TOKEN_KEY:'11'.repeat(32)});
 expect(r.status).toBe(303);expect(r.headers.get('Location')).toContain('drive=failed');expect(r.headers.get('Set-Cookie')).toContain('__Host-ar_drive_state=');expect(f).not.toHaveBeenCalled();
});
