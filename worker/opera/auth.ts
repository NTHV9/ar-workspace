import { OperaError, type FetchPort } from './client';
export const authReasons=['credentials_expired','client_credentials_rejected','enterprise_missing','enterprise_access_denied','scope_rejected','application_authentication_rejected','authentication_rejected'] as const;
export type AuthReason=typeof authReasons[number];
/** Classify bounded OAuth failures; never retain or return the upstream text. */
async function authenticationReason(response:Response):Promise<AuthReason>{
 let text='';if(!response.body)return 'authentication_rejected';const reader=response.body.getReader();
 try{
  const decoder=new TextDecoder();let bytes=0;
  while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>4096){await reader.cancel();return 'authentication_rejected';}text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();
  let code='';try{const json=JSON.parse(text);if(json&&typeof json==='object'&&typeof json.error==='string')code=json.error;}catch{/* Oracle also returns plain error titles. */}
  if(/(?:secret|credential|password|client).{0,30}(?:expired|has expired)/i.test(text))return 'credentials_expired';
  if(code==='invalid_client')return 'client_credentials_rejected';
  if(/enterprise id is required/i.test(text))return 'enterprise_missing';
  if(/enterprise does not have access to gateway/i.test(text))return 'enterprise_access_denied';
  if(code==='invalid_grant_type_or_scope'||code==='invalid_scope')return 'scope_rejected';
  if(/failed to authenticate application/i.test(text))return 'application_authentication_rejected';
  return 'authentication_rejected';
 }catch{return 'authentication_rejected';}finally{reader.releaseLock();}
}
export function safeAuthenticationDiagnostic(error:OperaError){
 const reason=error.diagnostics?.authReason;
 return error.stage==='authentication'&&typeof reason==='string'&&authReasons.some(r=>r===reason)?{authReason:reason}:undefined;
}
export interface OperaCredentials { grantType:'client_credentials'|'password'; clientId:string; clientSecret:string; appKey:string; scope?:string; username?:string; password?:string }
export function parseCredentials(value:string):OperaCredentials {
  let c:OperaCredentials;
  try {c=JSON.parse(value);} catch {throw new OperaError('invalid_configuration');}
  if(!c||!['client_credentials','password'].includes(c.grantType)||![c.clientId,c.clientSecret,c.appKey].every(v=>typeof v==='string'&&v.length>0))throw new OperaError('invalid_configuration');
  if(c.grantType==='client_credentials'&&(!c.scope||typeof c.scope!=='string'))throw new OperaError('invalid_configuration');
  if(c.grantType==='password'&&![c.username,c.password].every(v=>typeof v==='string'&&v.length>0))throw new OperaError('invalid_configuration');
  return c;
}
export function createTokenProvider(origin:string,enterpriseId:string,secret:string,transport:FetchPort=fetch) {
  const credentials=parseCredentials(secret);
  let url:URL;
  try {url=new URL(origin);} catch {throw new OperaError('invalid_configuration');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new OperaError('invalid_configuration');
  if(credentials.grantType==='client_credentials'&&!enterpriseId)throw new OperaError('invalid_configuration');
  // Scoped to a backend reader/job, never persisted to the browser, database or logs.
  let cached:{token:string;expiresAt:number}|undefined;
  let pending:Promise<string>|undefined;
  const obtain=async()=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try {
      const body=new URLSearchParams({grant_type:credentials.grantType});
      if(credentials.grantType==='client_credentials')body.set('scope',credentials.scope!);
      else {body.set('username',credentials.username!);body.set('password',credentials.password!);}
      const basic=btoa(String.fromCharCode(...new TextEncoder().encode(`${credentials.clientId}:${credentials.clientSecret}`)));
      const headers:Record<string,string>={Authorization:`Basic ${basic}`,'x-app-key':credentials.appKey,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'};
      if(credentials.grantType==='client_credentials')headers.enterpriseId=enterpriseId;
      const response=await transport(new Request(`${url.origin}/oauth/v1/tokens`,{method:'POST',headers,body,redirect:'manual',signal:controller.signal}));
      if(response.status>=300&&response.status<400){await response.body?.cancel();throw new OperaError('redirect_rejected');}
      if(!response.ok){const authReason=await authenticationReason(response);throw new OperaError('provider_unauthorized',response.status,'authentication',undefined,{authReason});}
      if(!response.body)throw new OperaError('invalid_response');
      const reader=response.body.getReader();let text='';let bytes=0;const decoder=new TextDecoder();
      try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>64*1024){await reader.cancel();throw new OperaError('response_too_large');}text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
      const result=JSON.parse(text) as {access_token?:string;expires_in?:number};
      if(typeof result.access_token!=='string'||!result.access_token)throw new OperaError('invalid_response');
      const lifetime=typeof result.expires_in==='number'&&Number.isFinite(result.expires_in)?Math.max(0,result.expires_in-120)*1000:0;
      cached={token:result.access_token,expiresAt:Date.now()+lifetime};return result.access_token;
    }catch(e){if(e instanceof OperaError)throw e;throw new OperaError(controller.signal.aborted?'timeout':'provider_unauthorized');}
    finally{clearTimeout(timer);}
  };
  return async()=>{
    if(cached&&Date.now()<cached.expiresAt)return cached.token;
    if(!pending)pending=obtain().finally(()=>{pending=undefined;});
    return pending;
  };
}
