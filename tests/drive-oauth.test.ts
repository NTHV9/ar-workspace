import {afterEach,expect,it,vi} from 'vitest';
import {driveCallback,driveConnect} from '../worker/drive/oauth';
import {seal,unseal} from '../worker/email/crypto';
import {driveScope} from '../worker/drive/shared';
const owner='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',GMAIL_CLIENT_ID:'synthetic-client',GMAIL_CLIENT_SECRET:'synthetic-secret',GMAIL_TOKEN_KEY:'11'.repeat(32)};
afterEach(()=>vi.unstubAllGlobals());
it('uses separate encrypted state, PKCE and a narrow Drive grant on the registered callback',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json(true));vi.stubGlobal('fetch',f);const r=await driveConnect(env,owner),u=new URL((await r.json() as {url:string}).url);
 expect(u.searchParams.get('state')).toMatch(/^d\.[\w-]{43}$/);expect(u.searchParams.get('scope')).toBe(driveScope);expect(u.searchParams.get('include_granted_scopes')).toBe('false');expect(u.searchParams.get('code_challenge_method')).toBe('S256');expect(u.searchParams.get('redirect_uri')).toBe('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback');
 expect(r.headers.get('Set-Cookie')).toContain('__Host-ar_drive_state=');expect(r.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Lax');const saved=JSON.parse(f.mock.calls[0][1].body);expect(saved.p_hash).toMatch(/^[a-f0-9]{64}$/);expect(saved.p_verifier.verifier).toBeUndefined();
 await expect(unseal(env.GMAIL_TOKEN_KEY,'oauth:'+u.searchParams.get('state'),saved.p_verifier)).rejects.toThrow();
});
it('rejects missing, wrong, Gmail and foreign-origin callback cookies before exchanging codes',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);const state='d.'+'a'.repeat(43);
 for(const [origin,cookie,s] of [['https://ar-workspace.ar-c82.workers.dev','',state],['https://ar-workspace.ar-c82.workers.dev','__Host-ar_gmail_state='+state,state],['https://app.test','__Host-ar_drive_state='+state,state],['https://ar-workspace.ar-c82.workers.dev','__Host-ar_drive_state='+'a'.repeat(43),'a'.repeat(43)]]){const r=await driveCallback(new Request(origin+'/api/gmail/callback?state='+s+'&code=synthetic',{headers:{Cookie:cookie}}),env);expect(r.headers.get('Location')).toContain('drive=failed');}
 expect(f).not.toHaveBeenCalled();
});
it('saves only a Drive-encrypted provider grant after checking about.user, with no token in the response',async()=>{
 const state='d.'+'a'.repeat(43),verifier=await seal(env.GMAIL_TOKEN_KEY,'drive-oauth:'+state,{verifier:'synthetic-verifier'});const calls:{url:string;init?:RequestInit}[]=[];
 vi.stubGlobal('fetch',async(url:URL|string,init?:RequestInit)=>{const u=String(url);calls.push({url:u,init});if(u.endsWith('ar_drive_state_consume'))return Response.json({owner,verifier});if(u==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope:driveScope});if(u.includes('/about?'))return Response.json({user:{emailAddress:'ar@katathani.com'}});if(u.endsWith('ar_drive_connection_put'))return Response.json(true);throw Error('unexpected call');});
 const r=await driveCallback(new Request('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback?state='+state+'&code=synthetic',{headers:{Cookie:'__Host-ar_drive_state='+state}}),env);expect(r.headers.get('Location')).toContain('drive=connected');expect(await r.text()).toBe('');
 const saved=JSON.parse(String(calls.at(-1)?.init?.body));expect(saved.p_scope).toBe(driveScope);expect(JSON.stringify(saved)).not.toContain('synthetic-refresh');await expect(unseal(env.GMAIL_TOKEN_KEY,'gmail:'+owner,saved.p_payload)).rejects.toThrow();expect(calls.every(c=>c.init?.redirect==='manual')).toBe(true);
});
it('never saves a wrong-account or overbroad provider grant',async()=>{
 for(const broad of [false,true]){const state='d.'+'a'.repeat(43),verifier=await seal(env.GMAIL_TOKEN_KEY,'drive-oauth:'+state,{verifier:'synthetic'}),calls:string[]=[];
  vi.stubGlobal('fetch',async(url:URL|string)=>{const u=String(url);calls.push(u);if(u.endsWith('ar_drive_state_consume'))return Response.json({owner,verifier});if(u.includes('/token'))return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope:broad?driveScope+' https://www.googleapis.com/auth/drive':driveScope});if(u.includes('/about?'))return Response.json({user:{emailAddress:'other@example.test'}});throw Error('unexpected save');});
  const r=await driveCallback(new Request('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback?state='+state+'&code=synthetic',{headers:{Cookie:'__Host-ar_drive_state='+state}}),env);expect(r.headers.get('Location')).toContain('drive=failed');expect(calls.some(u=>u.endsWith('ar_drive_connection_put'))).toBe(false);
 }
});
