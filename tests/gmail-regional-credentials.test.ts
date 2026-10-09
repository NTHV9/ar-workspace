import {afterEach,expect,it,vi} from 'vitest';
import {gmailToken,gmailConnect,gmailCallback,gmailStatus,credentialAad,gmailReadScope,gmailScope} from '../worker/email/oauth';
import {seal} from '../worker/email/crypto';
const owner='00000000-0000-4000-8000-000000000001',key='11'.repeat(32),env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',GMAIL_CLIENT_ID:'synthetic-client',GMAIL_CLIENT_SECRET:'synthetic-secret',GMAIL_TOKEN_KEY:key};
const scope=gmailReadScope+' '+gmailScope;
afterEach(()=>vi.unstubAllGlobals());
it.each(['revoked','wrong-profile','correct-profile'])('checks live mailbox profile for cached token status: %s',async mode=>{
 const payload=await seal(key,credentialAad(owner,'khao-lak'),{refresh_token:'synthetic-refresh',access_token:'synthetic-cached',expires_at:Date.now()+3600000});
 vi.stubGlobal('fetch',async(url:string)=>{
  if(url.endsWith('get_region'))return Response.json({mailbox:'khao-lak',email:'ar@thesandskhaolak.com',cipher_version:2,revision:1,payload,scope});
  if(url.endsWith('/profile'))return mode==='revoked'?Response.json({error:{code:401}},{status:401}):Response.json({emailAddress:mode==='wrong-profile'?'ar@katathani.com':'ar@thesandskhaolak.com'});
  throw Error('unexpected_provider_request');
 });
 expect(await gmailStatus(env,owner,'khao-lak')).toMatchObject({region:'khao-lak',expectedEmail:'ar@thesandskhaolak.com',configured:true,connected:mode==='correct-profile'});
});
it('opens regional settings OAuth without generating a customer document and freezes expected identity',async()=>{
 const calls:{url:string;args:Record<string,unknown>}[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{const args=JSON.parse(String(init.body));calls.push({url,args});return Response.json(url.endsWith('get_region')?null:true);});
 const response=await gmailConnect(env,owner,undefined,'khao-lak'),url=new URL((await response.json() as {url:string}).url);
 expect(url.searchParams.get('login_hint')).toBe('ar@thesandskhaolak.com');expect(calls.map(c=>c.url.split('/').at(-1))).toEqual(['ar_gmail_connection_get_region','ar_gmail_state_create_region']);expect(calls[1].args).toMatchObject({p_mailbox:'khao-lak',p_job:null,p_revision:0});
});
it('preserves the explicit legacy Phuket cipher reader and never decrypts it as Khao Lak',async()=>{
 const payload=await seal(key,'gmail:'+owner,{refresh_token:'synthetic-refresh',access_token:'synthetic-access',expires_at:Date.now()+3600000});
 vi.stubGlobal('fetch',async(url:string)=>Response.json(url.includes('/rpc/')?{mailbox:'phuket',email:'ar@katathani.com',cipher_version:1,revision:1,payload,scope}:{emailAddress:'ar@katathani.com'}));
 expect(await gmailToken(env,owner,'phuket')).toBe('synthetic-access');await expect(gmailToken(env,owner,'khao-lak')).rejects.toThrow('gmail_reconnect_required');
});
it('does not fall back to Phuket when the Khao Lak mailbox is disconnected',async()=>{const f=vi.fn(async(_url:string,_init:RequestInit={})=>Response.json(null));vi.stubGlobal('fetch',f);await expect(gmailToken(env,owner,'khao-lak')).rejects.toThrow('gmail_not_connected');expect(JSON.parse(String(f.mock.calls[0][1]?.body)).p_mailbox).toBe('khao-lak');expect(f).toHaveBeenCalledTimes(1);});
it('binds encrypted credentials to both owner and mailbox',async()=>{
 const payload=await seal(key,credentialAad(owner,'phuket'),{refresh_token:'synthetic-refresh',access_token:'synthetic-access',expires_at:Date.now()+3600000});
 vi.stubGlobal('fetch',async()=>Response.json({mailbox:'khao-lak',email:'ar@thesandskhaolak.com',cipher_version:2,revision:1,payload,scope}));await expect(gmailToken(env,owner,'khao-lak')).rejects.toThrow();
});
it('wrong Google account during callback leaves both connections untouched',async()=>{
 const state='a'.repeat(43),verifier=await seal(key,'oauth:'+state,{verifier:'synthetic-pkce'}),writes:string[]=[];
 vi.stubGlobal('fetch',async(url:string)=>{if(url.includes('state_consume'))return Response.json({owner,mailbox:'khao-lak',connection_revision:7,document_job_id:null,verifier});if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope});if(url.endsWith('/profile'))return Response.json({emailAddress:'ar@katathani.com'});writes.push(url);return Response.json(true);});
 const r=await gmailCallback(new Request('https://ar-workspace.ar-c82.workers.dev/api/gmail/callback?state='+state+'&code=synthetic',{headers:{Cookie:'__Host-ar_gmail_state='+state}}),env);expect(r.headers.get('Location')).toContain('region=khao-lak');expect(r.headers.get('Location')).toContain('settings=1');expect(r.headers.get('Location')).toContain('gmail=failed');expect(writes).toEqual([]);
});
it('stale token refresh cannot replace a newer reconnect and cannot use the stale token',async()=>{
 const payload=await seal(key,credentialAad(owner,'khao-lak'),{refresh_token:'synthetic-refresh',access_token:'expired',expires_at:0}),calls:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{if(url.endsWith('get_region'))return Response.json({mailbox:'khao-lak',email:'ar@thesandskhaolak.com',cipher_version:2,revision:7,payload,scope});if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'refreshed',expires_in:3600});if(url.endsWith('/profile'))return Response.json({emailAddress:'ar@thesandskhaolak.com'});calls.push(JSON.parse(String(init.body)));return Response.json(false);});
 await expect(gmailToken(env,owner,'khao-lak')).rejects.toThrow('gmail_reconnect_required');expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({p_mailbox:'khao-lak',p_revision:7});
});
