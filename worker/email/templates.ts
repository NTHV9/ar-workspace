import {emailRpc,emailJson,jsonBody,type EmailEnv} from './shared';
import {parseTemplate} from '../../src/email/templates';
import {uuidPattern} from '../documents/jobs';
export async function templateRequest(request:Request,env:EmailEnv,actor:string):Promise<Response>{
 try{
  const url=new URL(request.url),match=/^\/api\/email\/templates(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname);if(!match)return emailJson({error:'not_found'},404);
  if(match[1]&&!uuidPattern.test(match[1]))return emailJson({error:'template_invalid'},400);
  let result:unknown;
  if(request.method==='GET'){
   const offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)return emailJson({error:'template_invalid'},400);
   result=await emailRpc(env,'ar_template_list',{p_actor:actor,p_id:match[1]??null,p_offset:offset});
  }else if(request.method==='PUT'&&match[1]){
   const v=await jsonBody(request);if(Object.keys(v).some(k=>!['revision','content','policyVersion'].includes(k))||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return emailJson({error:'template_invalid'},400);
   if(v.policyVersion!==undefined&&(!Number.isSafeInteger(v.policyVersion)||Number(v.policyVersion)<1))return emailJson({error:'template_invalid'},400);
   result=await emailRpc(env,'ar_template_save',{p_actor:actor,p_id:match[1],p_revision:v.revision,p_content:{...parseTemplate(v.content),...(typeof v.policyVersion==='number'?{policyVersion:v.policyVersion}:{})}});
  }else return emailJson({error:'method_not_allowed'},405);
  if(result&&typeof result==='object'&&'error' in result){const code=String(result.error);return emailJson({error:code},['template_revision_conflict','template_policy_revision_conflict'].includes(code)?409:code==='template_missing'?404:code==='email_forbidden'?403:400);}
  return emailJson(result);
 }catch(e){const c=e instanceof Error?e.message:'';return emailJson({error:['template_invalid','template_token_invalid','rich_message_invalid','rich_message_too_large'].includes(c)?c:'template_unavailable'},['template_invalid','template_token_invalid','rich_message_invalid','rich_message_too_large'].includes(c)?400:503);}
}
