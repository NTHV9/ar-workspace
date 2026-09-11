import {hash,seal,unseal,url64,type Cipher} from '../email/crypto';
import {allowedEmail,driveRpc,driveScope,json,readJson,type DriveEnv} from './shared';
import {identity} from './provider';
const origin='https://ar-workspace.ar-c82.workers.dev';
const callback=origin+'/api/gmail/callback';
interface Tokens {refresh_token:string;access_token:string;expires_at:number}
interface Connection {email:string;payload:Cipher;scope:string;revision:number}
export function driveConfigured(env:DriveEnv){return !!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_TOKEN_KEY&&/^[0-9a-f]{64}$/i.test(env.GMAIL_TOKEN_KEY));}
async function exchange(body:URLSearchParams){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),redirect:'manual',signal:AbortSignal.timeout(30000)});if(!r.ok){await r.body?.cancel();throw Error('drive_reconnect_required');}return readJson(r);}
export async function driveConnect(env:DriveEnv,owner:string){
 if(!driveConfigured(env))throw Error('drive_not_configured');const state='d.'+url64(crypto.getRandomValues(new Uint8Array(32))),verifier=url64(crypto.getRandomValues(new Uint8Array(48)));
 const saved=await driveRpc<boolean>(env,'ar_drive_state_create',{p_owner:owner,p_hash:await hash(new TextEncoder().encode(state)),p_verifier:await seal(env.GMAIL_TOKEN_KEY!,'drive-oauth:'+state,{verifier})});if(!saved)throw Error('drive_forbidden');
 const challenge=url64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID!,redirect_uri:callback,response_type:'code',scope:driveScope,include_granted_scopes:'false',access_type:'offline',prompt:'consent',login_hint:allowedEmail,state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
 const r=json({url:u.href});r.headers.set('Set-Cookie',`__Host-ar_drive_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);return r;
}
export async function driveCallback(request:Request,env:DriveEnv){const redirect=(status:string)=>new Response(null,{status:303,headers:{Location:origin+'/?drive='+status,'Set-Cookie':'__Host-ar_drive_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 try{
  if(!driveConfigured(env))throw Error('drive_not_configured');const u=new URL(request.url),state=u.searchParams.get('state')??'';
  const cookie=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-ar_drive_state='))?.slice('__Host-ar_drive_state='.length);
  if(u.origin!==origin||!/^d\.[-_A-Za-z0-9]{43}$/.test(state)||cookie!==state)throw Error('drive_forbidden');
  const s=await driveRpc<{owner:string;verifier:Cipher}|null>(env,'ar_drive_state_consume',{p_hash:await hash(new TextEncoder().encode(state))});if(!s)throw Error('drive_forbidden');
  const code=u.searchParams.get('code');if(!code||code.length>4096||u.searchParams.has('error'))throw Error('drive_forbidden');
  const pkce=await unseal<{verifier:string}>(env.GMAIL_TOKEN_KEY!,'drive-oauth:'+state,s.verifier);
  const t=await exchange(new URLSearchParams({grant_type:'authorization_code',client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,redirect_uri:callback,code,code_verifier:pkce.verifier}));
  if(typeof t.access_token!=='string'||typeof t.refresh_token!=='string'||typeof t.expires_in!=='number'||t.expires_in<=0||t.scope!==driveScope)throw Error('drive_reconnect_required');
  const email=await identity(t.access_token);
  const payload=await seal(env.GMAIL_TOKEN_KEY!,'drive:'+s.owner,{refresh_token:t.refresh_token,access_token:t.access_token,expires_at:Date.now()+t.expires_in*1000});
  if(!await driveRpc(env,'ar_drive_connection_put',{p_owner:s.owner,p_email:email,p_payload:payload,p_scope:driveScope}))throw Error('drive_forbidden');return redirect('connected');
 }catch{return redirect('failed');}
}
export async function driveToken(env:DriveEnv,owner:string){
 if(!driveConfigured(env))throw Error('drive_not_configured');
 for(let attempt=0;attempt<3;attempt++){
  const c=await driveRpc<Connection|null>(env,'ar_drive_connection_get',{p_owner:owner});if(!c||c.email!==allowedEmail||c.scope!==driveScope||!Number.isSafeInteger(c.revision)||c.revision<1)throw Error('drive_not_connected');
  const t=await unseal<Tokens>(env.GMAIL_TOKEN_KEY!,'drive:'+owner,c.payload);if(t.expires_at>=Date.now()+60000)return t.access_token;
  let refreshed:Tokens;
  try{const v=await exchange(new URLSearchParams({grant_type:'refresh_token',client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,refresh_token:t.refresh_token}));if(typeof v.access_token!=='string'||typeof v.expires_in!=='number'||v.expires_in<=0||(v.scope!==undefined&&v.scope!==driveScope))throw Error('drive_reconnect_required');
   await identity(v.access_token);refreshed={...t,access_token:v.access_token,expires_at:Date.now()+v.expires_in*1000};
  }catch(e){const current=await driveRpc<Connection|null>(env,'ar_drive_connection_get',{p_owner:owner});if(current&&current.revision!==c.revision)continue;throw e;}
  // Reconnect and other refreshes advance this revision. A stale response must never replace their grant.
  if(await driveRpc<boolean>(env,'ar_drive_connection_refresh',{p_owner:owner,p_expected_revision:c.revision,p_payload:await seal(env.GMAIL_TOKEN_KEY!,'drive:'+owner,refreshed)}))return refreshed.access_token;
 }
 throw Error('drive_busy');
}
