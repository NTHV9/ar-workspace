import {parseSignature} from '../../src/email/signature';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
export async function signatureRequest(request:Request,env:RefreshEnv,actor:string){
 const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 try{
  if(new URL(request.url).search)throw Error('signature_invalid');
  if(request.method==='GET'){const value=await backendRpc(env,'ar_access_signature_get',{p_actor:actor});if(!value)return respond({error:'access_forbidden'},403);return respond(value);}
  if(request.method!=='PUT')return respond({error:'method_not_allowed'},405);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('signature_invalid');
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,8192)));
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['revision','enabled','signature'].includes(k))||!Number.isSafeInteger(v.revision)||v.revision<0||typeof v.enabled!=='boolean')throw Error('signature_invalid');
  const signature=parseSignature(v.signature);if(signature.staffId!==actor)return respond({error:'access_forbidden'},403);
  const value=await backendRpc<Record<string,unknown>>(env,'ar_access_signature_save',{p_actor:actor,p_revision:v.revision,p_enabled:v.enabled,p_signature:signature});
  if(value.error)return respond(value,value.error==='signature_revision_conflict'?409:value.error==='access_forbidden'?403:400);return respond(value);
 }catch(error){return respond({error:error instanceof Error&&error.message==='signature_invalid'?'signature_invalid':'signature_unavailable'},error instanceof Error&&error.message==='signature_invalid'?400:503);}
}
