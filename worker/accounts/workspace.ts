import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {previewSavedDraftThread,savedDraftForReview} from '../email/threads';
import type {EmailEnv} from '../email/shared';
import {parseRecipients} from '../settings/validation';
export interface SavedEmailReviewData {
 id:string;hotel:string;accountId:string;documentJobId:string;documentRevision:number;draftRevision:number;
 subject:string;body:string;purpose:'billing'|'collection';recipients:{to:string[];cc:string[];bcc:string[]};packageChanged:boolean;hasThread:boolean;
 delivery:{state:string;mode:'draft'|'send';sentAt:string|null;recorded:boolean}|null;gmailHandoff:string|null;
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const savedErrors:Record<string,number>={email_invalid:400,email_thread_invalid:400,email_forbidden:403,email_missing:404,email_thread_not_selected:404,email_revision_conflict:409,email_thread_changed:409,email_thread_unrelated:409,email_thread_subject_locked:409,email_thread_recipients_required:409,email_thread_unavailable:503,email_thread_too_large:413,gmail_read_permission_required:503,gmail_reconnect_required:503,gmail_not_connected:503,gmail_not_configured:503,gmail_unavailable:503};
function params(query:URLSearchParams,allowed:string[]){for(const key of query.keys())if(!allowed.includes(key)||query.getAll(key).length!==1)throw Error('account_workspace_invalid');}
function integer(value:string|null,fallback?:number):number {if(value===null&&fallback!==undefined)return fallback;if(value===null||!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('account_workspace_invalid');return Number(value);}
export async function accountWorkspaceApi(request:Request,env:RefreshEnv&EmailEnv,actor:string){
 if(!uuid.test(actor))return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const url=new URL(request.url),match=/^\/api\/account-workspace\/(KAT|TSK)\/([^/]+)\/(history|documents|email)(?:\/([0-9a-f-]{36})(?:\/(thread))?)?$/.exec(url.pathname);
  if(!match)throw Error('account_workspace_invalid');
  const account=decodeURIComponent(match[2]);
  if(!account.trim()||account.length>200||/[\u0000-\u001f\u007f]/.test(account))throw Error('account_workspace_invalid');
  if(match[3]==='email'){
   if(!match[4]||!uuid.test(match[4]))throw Error('account_workspace_invalid');const scope={hotel:match[1] as 'KAT'|'TSK',accountId:account,draftId:match[4]};
   if(match[5]){
    params(url.searchParams,['revision','offset','historyId']);const revision=integer(url.searchParams.get('revision')),offset=integer(url.searchParams.get('offset'),0),historyId=url.searchParams.get('historyId')??undefined;
    if(offset>0&&!historyId||historyId!==undefined&&!/^\d{1,30}$/.test(historyId))throw Error('account_workspace_invalid');
    return json(await previewSavedDraftThread(env,actor,scope,revision,offset,historyId));
   }
   params(url.searchParams,[]);const draft=await savedDraftForReview(env,actor,scope);
   const [delivery,attempt]=await Promise.all([
    backendRpc<{owner:string;draft_id:string;revision:number;state:string;mode:string;sent_at:string|null}|null>(env,'ar_mail_for_draft',{p_actor:actor,p_draft:draft.id,p_revision:draft.revision}),
    backendRpc<{state:string}|null>(env,'ar_gmail_attempt_get',{p_owner:actor,p_draft:draft.id,p_revision:draft.revision}),
   ]);
   if(delivery&&(delivery.owner!==actor||delivery.draft_id!==draft.id||delivery.revision!==draft.revision||!['pending','created','awaiting_evidence','sent','review_required'].includes(delivery.state)||!['draft','send'].includes(delivery.mode)||delivery.sent_at!==null&&(typeof delivery.sent_at!=='string'||!Number.isFinite(Date.parse(delivery.sent_at)))))throw Error('account_workspace_unavailable');
   if(attempt&&!['creating','created','uncertain'].includes(attempt.state))throw Error('account_workspace_unavailable');
   const result:SavedEmailReviewData={id:draft.id,hotel:draft.hotel,accountId:draft.account_id,documentJobId:draft.document_job_id,documentRevision:draft.document_revision,draftRevision:draft.revision,subject:draft.subject,body:draft.body,purpose:draft.purpose,recipients:parseRecipients(draft.recipients),packageChanged:draft.package_changed,hasThread:!!draft.thread,delivery:delivery?{state:delivery.state,mode:delivery.mode as 'draft'|'send',sentAt:delivery.sent_at,recorded:delivery.state==='sent'}:null,gmailHandoff:delivery?.state??attempt?.state??null};
   return json(result);
  }
  if(match[4]||match[5])throw Error('account_workspace_invalid');params(url.searchParams,['page']);const page=integer(url.searchParams.get('page'),0);
  if(!account.trim()||account.length>200||/[\u0000-\u001f]/.test(account)||!Number.isSafeInteger(page)||page<0||page>1000000)throw Error('account_workspace_invalid');
  const result=await backendRpc<{error?:string;rows:unknown[];total:number}>(env,'ar_account_workspace_read',{p_actor:actor,p_hotel:match[1],p_account:account,p_section:match[3],p_offset:page*20,p_limit:20});
  if(result?.error==='account_workspace_forbidden')return json({error:result.error},403);
  if(result?.error==='account_workspace_missing')return json({error:result.error},404);
  if(!result||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||result.total<0)throw Error('account_workspace_unavailable');
  return json(result);
 }catch(e){const code=e instanceof Error?e.message:'';if(Object.hasOwn(savedErrors,code))return json({error:code},savedErrors[code]);const invalid=e instanceof URIError||code==='account_workspace_invalid';return json({error:invalid?'account_workspace_invalid':'account_workspace_unavailable'},invalid?400:503);}
}
