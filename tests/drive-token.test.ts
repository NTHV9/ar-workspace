import {afterEach,expect,it,vi} from 'vitest';
import {driveToken} from '../worker/drive/oauth';
import {seal,unseal,type Cipher} from '../worker/email/crypto';
import {driveScope} from '../worker/drive/shared';
const owner='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',GMAIL_CLIENT_ID:'synthetic-client',GMAIL_CLIENT_SECRET:'synthetic-secret',GMAIL_TOKEN_KEY:'11'.repeat(32)};
const tokens=(refresh:string,access:string,expires=Date.now()+3600000)=>({refresh_token:refresh,access_token:access,expires_at:expires});
afterEach(()=>vi.unstubAllGlobals());
for(const refreshFails of [false,true])it(`reuses the newer reconnect grant when an old refresh ${refreshFails?'fails':'finishes'} after reconnect`,async()=>{
 const old=await seal(env.GMAIL_TOKEN_KEY,'drive:'+owner,tokens('old-refresh','old-access',0)),reconnected=await seal(env.GMAIL_TOKEN_KEY,'drive:'+owner,tokens('new-refresh','new-access'));
 let current={revision:7,email:'ar@katathani.com',scope:driveScope,payload:old};const calls:{url:string;args:Record<string,unknown>|null}[]=[];
 vi.stubGlobal('fetch',async(input:string|URL,init?:RequestInit)=>{
  const url=String(input),args=url.includes('/rpc/')?JSON.parse(String(init?.body)) as Record<string,unknown>:null;calls.push({url,args});
  if(url.endsWith('ar_drive_connection_get'))return Response.json(current);
  if(url==='https://oauth2.googleapis.com/token'){expect(String(init?.body)).toContain('refresh_token=old-refresh');current={...current,revision:8,payload:reconnected};return refreshFails?new Response(null,{status:400}):Response.json({access_token:'old-refreshed-access',expires_in:3600,scope:driveScope});}
  if(url.includes('/about?'))return Response.json({user:{emailAddress:'ar@katathani.com'}});
  if(url.endsWith('ar_drive_connection_refresh')){expect(args?.p_expected_revision).toBe(7);if(args?.p_expected_revision!==current.revision)return Response.json(false);current={...current,revision:current.revision+1,payload:args.p_payload as Cipher};return Response.json(true);}
  throw Error('Unexpected unconditional grant write');
 });
 expect(await driveToken(env,owner)).toBe('new-access');expect(current.revision).toBe(8);expect(await unseal(env.GMAIL_TOKEN_KEY,'drive:'+owner,current.payload)).toMatchObject({refresh_token:'new-refresh',access_token:'new-access'});expect(calls.some(c=>c.url.endsWith('ar_drive_connection_put'))).toBe(false);expect(calls.filter(c=>c.url.endsWith('ar_drive_connection_get')).length).toBeGreaterThanOrEqual(2);
});
it('refreshes only the loaded revision and keeps its refresh token without replacing grant metadata',async()=>{
 let current={revision:3,email:'ar@katathani.com',scope:driveScope,payload:await seal(env.GMAIL_TOKEN_KEY,'drive:'+owner,tokens('existing-refresh','expired',0))};const calls:string[]=[];
 vi.stubGlobal('fetch',async(input:string|URL,init?:RequestInit)=>{const url=String(input);calls.push(url);if(url.endsWith('ar_drive_connection_get'))return Response.json(current);if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'refreshed-access',expires_in:3600,scope:driveScope});if(url.includes('/about?'))return Response.json({user:{emailAddress:'ar@katathani.com'}});if(url.endsWith('ar_drive_connection_refresh')){const args=JSON.parse(String(init?.body));expect(Object.keys(args).sort()).toEqual(['p_expected_revision','p_owner','p_payload']);expect(args.p_expected_revision).toBe(3);current={...current,revision:4,payload:args.p_payload};return Response.json(true);}throw Error('unexpected');});
 expect(await driveToken(env,owner)).toBe('refreshed-access');expect(await unseal(env.GMAIL_TOKEN_KEY,'drive:'+owner,current.payload)).toMatchObject({refresh_token:'existing-refresh',access_token:'refreshed-access'});expect(calls.some(c=>c.endsWith('ar_drive_connection_put'))).toBe(false);
});
