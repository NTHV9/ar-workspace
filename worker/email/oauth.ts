import {mailboxSender,hotelMailbox,parseMailbox,type MailboxId} from '../../src/domain/mailboxes';
import {documentJob} from '../documents/jobs';
import {seal,unseal,hash,url64,type Cipher} from './crypto';
import {emailRpc,emailJson,googleJson,type EmailEnv} from './shared';
const origin='https://ar-workspace.ar-c82.workers.dev';
const callback=origin+'/api/gmail/callback';
export const gmailReadScope='https://www.googleapis.com/auth/gmail.readonly';
export const gmailScope='https://www.googleapis.com/auth/gmail.compose';
interface Token {refresh_token:string;access_token:string;expires_at:number}
interface Connection {email:string;payload:Cipher;scope:string;mailbox:MailboxId;cipher_version:number;revision:number}
export function gmailConfigured(env:EmailEnv){return !!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_TOKEN_KEY);}
export async function gmailConnect(env:EmailEnv,owner:string,job?:string,region?:MailboxId){
 let mailbox=region??'phuket';if(job){const j=await documentJob(env,job);if(!j||j.owner!==owner)throw Error('email_forbidden');const derived=hotelMailbox(j.hotel);if(region&&region!==derived)throw Error('email_forbidden');mailbox=derived;}
 if(!gmailConfigured(env))throw Error('gmail_not_configured');const connection=await connectionFor(env,owner,mailbox);
const state=url64(crypto.getRandomValues(new Uint8Array(32))),verifier=url64(crypto.getRandomValues(new Uint8Array(48)));
 const stateHash=await hash(new TextEncoder().encode(state));const payload=await seal(env.GMAIL_TOKEN_KEY!,'oauth:'+state,{verifier});
 const saved=await emailRpc<boolean>(env,'ar_gmail_state_create_region',{p_owner:owner,p_hash:stateHash,p_job:job??null,p_verifier:payload,p_mailbox:mailbox,p_revision:connection?.revision??0});if(!saved)throw Error('email_forbidden');
 const challenge=url64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:env.GMAIL_CLIENT_ID!,redirect_uri:callback,response_type:'code',scope:gmailScope+' '+gmailReadScope,access_type:'offline',prompt:'consent',login_hint:mailboxSender(mailbox),state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
 const r=emailJson({url:url.toString()});r.headers.set('Set-Cookie',`__Host-ar_gmail_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);return r;
}
export async function gmailCallback(request:Request,env:EmailEnv){let job='',mailbox:MailboxId='phuket';const redirect=(status:string)=>new Response(null,{status:303,headers:{Location:origin+'/?'+new URLSearchParams({...(job?{documentJob:job,compose:'1'}:{settings:'1'}),region:mailbox,gmail:status}),'Set-Cookie':'__Host-ar_gmail_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 try{if(!gmailConfigured(env))throw Error();const u=new URL(request.url);const state=u.searchParams.get('state')??'',cookies=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-ar_gmail_state=')),cookie=cookies.length===1?cookies[0].slice('__Host-ar_gmail_state='.length):null;
 if(u.origin!==origin||u.searchParams.getAll('state').length!==1||u.searchParams.getAll('code').length>1||!/^[-_A-Za-z0-9]{43}$/.test(state)||cookie!==state)throw Error();
 const s=await emailRpc<{owner:string;document_job_id:string|null;verifier:Cipher;mailbox:MailboxId;connection_revision:number}|null>(env,'ar_gmail_state_consume',{p_hash:await hash(new TextEncoder().encode(state))});if(!s)throw Error();job=s.document_job_id??'';mailbox=parseMailbox(s.mailbox);
 const code=u.searchParams.get('code');if(!code||code.length>4096||u.searchParams.has('error'))throw Error();const pkce=await unseal<{verifier:string}>(env.GMAIL_TOKEN_KEY!,'oauth:'+state,s.verifier);
 const tokens=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,redirect_uri:callback,code,code_verifier:pkce.verifier}).toString()});
 if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||typeof tokens.expires_in!=='number'||typeof tokens.scope!=='string'||![gmailScope,gmailReadScope].every(scope=>(tokens.scope as string).split(' ').includes(scope)))throw Error();
 const profile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+tokens.access_token}});if(typeof profile.emailAddress!=='string'||profile.emailAddress.toLowerCase()!==mailboxSender(mailbox))throw Error();
 const payload=await seal(env.GMAIL_TOKEN_KEY!,credentialAad(s.owner,mailbox),{refresh_token:tokens.refresh_token,access_token:tokens.access_token,expires_at:Date.now()+tokens.expires_in*1000});
 if(!await emailRpc(env,'ar_gmail_connection_put_region',{p_owner:s.owner,p_mailbox:mailbox,p_email:profile.emailAddress,p_payload:payload,p_scope:tokens.scope,p_revision:s.connection_revision,p_cipher_version:2}))throw Error();return redirect('connected');
 }catch{return redirect('failed');}
}
export const credentialAad=(owner:string,mailbox:MailboxId)=>'gmail:v2:'+owner+':'+mailbox;
async function connectionFor(env:EmailEnv,owner:string,mailbox:MailboxId){
 const c=await emailRpc<Connection|null>(env,'ar_gmail_connection_get_region',{p_owner:owner,p_mailbox:mailbox});
 if(c&&(c.mailbox!==mailbox||c.email.toLowerCase()!==mailboxSender(mailbox)||![1,2].includes(c.cipher_version)||!Number.isSafeInteger(c.revision)||c.revision<1))throw Error('gmail_reconnect_required');
 return c;
}
export async function gmailToken(env:EmailEnv,owner:string,mailbox:MailboxId='phuket'){
 if(!gmailConfigured(env))throw Error('gmail_not_configured');const c=await connectionFor(env,owner,mailbox);if(!c)throw Error('gmail_not_connected');
 if(c.cipher_version===1&&mailbox!=='phuket')throw Error('gmail_reconnect_required');
 let tokens=await unseal<Token>(env.GMAIL_TOKEN_KEY!,c.cipher_version===1?'gmail:'+owner:credentialAad(owner,mailbox),c.payload);
 if(tokens.expires_at<Date.now()+60000){
  const t=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:env.GMAIL_CLIENT_ID!,client_secret:env.GMAIL_CLIENT_SECRET!,refresh_token:tokens.refresh_token}).toString()});
  if(typeof t.access_token!=='string'||typeof t.expires_in!=='number')throw Error('gmail_reconnect_required');tokens={...tokens,access_token:t.access_token,expires_at:Date.now()+t.expires_in*1000};
  const refreshedProfile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+tokens.access_token}});if(typeof refreshedProfile.emailAddress!=='string'||refreshedProfile.emailAddress.toLowerCase()!==mailboxSender(mailbox))throw Error('gmail_reconnect_required');
  const saved=await emailRpc(env,'ar_gmail_connection_refresh_region',{p_owner:owner,p_mailbox:mailbox,p_payload:await seal(env.GMAIL_TOKEN_KEY!,credentialAad(owner,mailbox),tokens),p_scope:c.scope,p_revision:c.revision});
  if(!saved)throw Error('gmail_reconnect_required');
 }
 // An unexpired credential is already profile-verified at OAuth/refresh and bound to this mailbox by authenticated encryption.
 return tokens.access_token;
}
export async function gmailStatus(env:EmailEnv,owner:string,mailbox:MailboxId='phuket'){
 const identity={region:mailbox,expectedEmail:mailboxSender(mailbox)};
 if(!gmailConfigured(env))return {...identity,configured:false,connected:false};
 try{const token=await gmailToken(env,owner,mailbox);const profile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token}});if(typeof profile.emailAddress!=='string'||profile.emailAddress.toLowerCase()!==mailboxSender(mailbox))throw Error('gmail_reconnect_required');return {...identity,configured:true,canRead:await gmailCanRead(env,owner,mailbox),connected:true,email:mailboxSender(mailbox)};}catch{return {...identity,configured:true,connected:false};}
}
export async function gmailCanRead(env:EmailEnv,owner:string,mailbox:MailboxId='phuket'){const c=await connectionFor(env,owner,mailbox);return !!c?.scope.split(' ').includes(gmailReadScope);}
