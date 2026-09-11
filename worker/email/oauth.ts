import {seal,unseal,hash,url64,type Cipher} from './crypto';
import {emailRpc,emailJson,googleJson,type EmailEnv} from './shared';
const origin='https://ar-workspace.ar-c82.workers.dev';
const callback=origin+'/api/gmail/callback';
export const gmailReadScope='https://www.googleapis.com/auth/gmail.readonly';
export const gmailScope='https://www.googleapis.com/auth/gmail.compose';
interface Token {refresh_token:string;access_token:string;expires_at:number}
interface Connection {email:string;payload:Cipher;scope:string}
export function gmailConfigured(env:EmailEnv){return !!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_TOKEN_KEY);}
export async function gmailConnect(env:EmailEnv,owner:string,job:string){
 if(!gmailConfigured(env))throw Error('gmail_not_configured');const state=url64(crypto.getRandomValues(new Uint8Array(32))),verifier=url64(crypto.getRandomValues(new Uint8Array(48)));
 const stateHash=await hash(new TextEncoder().encode(state));const payload=await seal(env.GMAIL_TOKEN_KEY!,'oauth:'+state,{verifier});
 const saved=await emailRpc<boolean>(env,'ar_gmail_state_create',{p_owner:owner,p_hash:stateHash,p_job:job,p_verifier:payload});if(!saved)throw Error('email_forbidden');
 const challenge=url64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID!,redirect_uri:callback,response_type:'code',scope:gmailScope+' '+gmailReadScope,access_type:'offline',prompt:'consent',login_hint:'ar@katathani.com',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
 const r=emailJson({url:url.toString()});r.headers.set('Set-Cookie',`__Host-ar_gmail_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);return r;
}
export async function gmailCallback(request:Request,env:EmailEnv){let job='';const redirect=(status:string)=>new Response(null,{status:303,headers:{Location:origin+'/?'+new URLSearchParams({...job?{documentJob:job,compose:'1'}:{},gmail:status}),'Set-Cookie':'__Host-ar_gmail_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 try{if(!gmailConfigured(env))throw Error();const u=new URL(request.url);const state=u.searchParams.get('state')??'',cookie=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-ar_gmail_state='))?.slice('__Host-ar_gmail_state='.length);
 if(u.origin!==origin||!/^[-_A-Za-z0-9]{43}$/.test(state)||cookie!==state)throw Error();
 const s=await emailRpc<{owner:string;document_job_id:string;verifier:Cipher}|null>(env,'ar_gmail_state_consume',{p_hash:await hash(new TextEncoder().encode(state))});if(!s)throw Error();job=s.document_job_id;
 const code=u.searchParams.get('code');if(!code||code.length>4096||u.searchParams.has('error'))throw Error();const pkce=await unseal<{verifier:string}>(env.GMAIL_TOKEN_KEY!,'oauth:'+state,s.verifier);
 const tokens=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,redirect_uri:callback,code,code_verifier:pkce.verifier}).toString()});
 if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||typeof tokens.expires_in!=='number'||typeof tokens.scope!=='string'||![gmailScope,gmailReadScope].every(scope=>(tokens.scope as string).split(' ').includes(scope)))throw Error();
 const profile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+tokens.access_token}});if(typeof profile.emailAddress!=='string'||profile.emailAddress.toLowerCase()!=='ar@katathani.com')throw Error();
 const payload=await seal(env.GMAIL_TOKEN_KEY!,'gmail:'+s.owner,{refresh_token:tokens.refresh_token,access_token:tokens.access_token,expires_at:Date.now()+tokens.expires_in*1000});
 if(!await emailRpc(env,'ar_gmail_connection_put',{p_owner:s.owner,p_email:profile.emailAddress,p_payload:payload,p_scope:tokens.scope}))throw Error();return redirect('connected');
 }catch{return redirect('failed');}
}
export async function gmailToken(env:EmailEnv,owner:string){if(!gmailConfigured(env))throw Error('gmail_not_configured');const c=await emailRpc<Connection|null>(env,'ar_gmail_connection_get',{p_owner:owner});if(!c||c.email.toLowerCase()!=='ar@katathani.com')throw Error('gmail_not_connected');let tokens=await unseal<Token>(env.GMAIL_TOKEN_KEY!,'gmail:'+owner,c.payload);
 if(tokens.expires_at<Date.now()+60000){const t=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,refresh_token:tokens.refresh_token}).toString()});if(typeof t.access_token!=='string'||typeof t.expires_in!=='number')throw Error('gmail_reconnect_required');tokens={...tokens,access_token:t.access_token,expires_at:Date.now()+t.expires_in*1000};await emailRpc(env,'ar_gmail_connection_put',{p_owner:owner,p_email:c.email,p_payload:await seal(env.GMAIL_TOKEN_KEY!,'gmail:'+owner,tokens),p_scope:c.scope});}return tokens.access_token;
}
export async function gmailStatus(env:EmailEnv,owner:string){if(!gmailConfigured(env))return {configured:false,connected:false};try{const token=await gmailToken(env,owner);const p=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token}});return {configured:true,canRead:await gmailCanRead(env,owner),connected:p.emailAddress==='ar@katathani.com',email:p.emailAddress==='ar@katathani.com'?p.emailAddress:null};}catch{return {configured:true,connected:false};}}

export async function gmailCanRead(env:EmailEnv,owner:string){const c=await emailRpc<Connection|null>(env,'ar_gmail_connection_get',{p_owner:owner});return !!c?.scope.split(' ').includes(gmailReadScope);}
