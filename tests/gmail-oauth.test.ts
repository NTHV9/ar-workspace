import {afterEach,expect,it,vi} from 'vitest';
import {gmailCallback,gmailConnect} from '../worker/email/oauth';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic-key',GMAIL_CLIENT_ID:'test-client',GMAIL_CLIENT_SECRET:'test-secret',GMAIL_TOKEN_KEY:'11'.repeat(32)};
afterEach(()=>vi.unstubAllGlobals());
it('uses a secure cookie, PKCE, and a hashed state stored with encrypted verifier',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json(true));vi.stubGlobal('fetch',fetcher);
 const r=await gmailConnect(env,'owner','job');const u=new URL((await r.json() as {url:string}).url);
 expect(u.searchParams.get('code_challenge_method')).toBe('S256');expect(u.searchParams.get('access_type')).toBe('offline');
 expect(r.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
 const saved=JSON.parse(fetcher.mock.calls[0][1].body);expect(saved.p_hash).not.toBe(u.searchParams.get('state'));expect(saved.p_verifier.verifier).toBeUndefined();
});
it('rejects missing or mismatched state cookies before any provider call',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 const r=await gmailCallback(new Request('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback?state='+'a'.repeat(43)+'&code=test'),env);
 expect(r.status).toBe(303);expect(r.headers.get('Location')).toContain('gmail=failed');expect(f).not.toHaveBeenCalled();
});
it('accepts the exact cookie value and consumes state once before exchanging a code',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json(null));vi.stubGlobal('fetch',f);const state='a'.repeat(43);
 const r=await gmailCallback(new Request('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback?state='+state+'&code=test',{headers:{Cookie:'__Host-ar_gmail_state='+state}}),env);
 expect(f).toHaveBeenCalledTimes(1);expect(f.mock.calls[0][0]).toContain('ar_gmail_state_consume');expect(r.headers.get('Location')).toContain('gmail=failed');
});
