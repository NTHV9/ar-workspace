import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {operationBudgetLimits,reserveOperationBudget,startOperationBudget} from '../operations/budget';
import {driveRpc,type DriveEnv,type Target} from '../drive/shared';
import {driveToken} from '../drive/oauth';
import {google,identity,metadata,verifyFolder,generateId} from '../drive/provider';
interface Setup {id:string;owner:string;state:string;budget_id:string;drive_folder_id:string|null;parent_folder_id:string|null;bucket_verified:boolean}
const bucket='ar-acceptance-files';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const bytes={storedBytes:40*1048576,egressBytes:80*1048576,databaseBytes:24*1048576};
async function setup(env:RefreshEnv,actor:string,id:string){const r=await backendRpc<Setup&{error?:string}>(env,'ar_acceptance_setup',{p_actor:actor,p_id:id});if(r.error||r.id!==id||r.owner!==actor||!uuid.test(r.budget_id))throw Error('acceptance_not_prepared');return r;}
async function mark(env:RefreshEnv,actor:string,id:string,kind:string,value:string){return backendRpc<Setup>(env,'ar_acceptance_setup_record',{p_actor:actor,p_id:id,p_kind:kind,p_value:value});}
/** Provision only the pre-registered scenario. Every retry retains the same
 * bucket and preallocated Drive ID; no credentials enter durable fixture data. */
export async function prepareAcceptance(env:DriveEnv,actor:string,id:string){
 if(env.ACCEPTANCE_ENABLED!=='true'||!uuid.test(id)||env.OPERATIONS_BUDGET_ENABLED!=='true')throw Error('acceptance_inactive');
 let s=await setup(env,actor,id);if(s.state==='active')return {id,active:true};
 const limits=operationBudgetLimits(env),current=await backendRpc<{error?:string}>(env,'ar_operations_budget_current',{p_actor:actor,p_limits:limits});if(current.error)throw Error('acceptance_budget_unavailable');
 await reserveOperationBudget(env,actor,{id:s.budget_id,resource:'acceptance_scenario',bytes});await startOperationBudget(env,actor,s.budget_id);
 const original=await driveRpc<Target|null>(env,'ar_drive_target_get',{p_owner:actor});if(!original?.folder_id)throw Error('drive_target_missing');
 const token=await driveToken(env,actor);await identity(token);const parent=await verifyFolder(token,original.folder_id);if(parent.visibility!=='restricted')throw Error('drive_target_not_private');
 s=await mark(env,actor,id,'parent',original.folder_id);
 if(!s.drive_folder_id)s=await mark(env,actor,id,'folder',await generateId(token));
 if(!s.drive_folder_id)throw Error('acceptance_not_prepared');
 let folder=await metadata(token,s.drive_folder_id);
 if(!folder){const response=await google('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:s.drive_folder_id,name:'SYNTHETIC AR acceptance '+id.slice(0,8),mimeType:'application/vnd.google-apps.folder',parents:[original.folder_id],appProperties:{ar_acceptance:id,ar_owner:actor}})});await response.body?.cancel();if(!response.ok&&response.status!==409)throw Error('acceptance_folder_unconfirmed');folder=await metadata(token,s.drive_folder_id);}
 if(!folder||folder.id!==s.drive_folder_id||folder.mimeType!=='application/vnd.google-apps.folder'||folder.parents?.length!==1||folder.parents[0]!==original.folder_id||folder.appProperties?.ar_acceptance!==id||folder.appProperties?.ar_owner!==actor||folder.trashed!==false)throw Error('acceptance_folder_identity');
 if((await verifyFolder(token,s.drive_folder_id)).visibility!=='restricted')throw Error('acceptance_folder_identity');
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('acceptance_not_prepared');const base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error('acceptance_not_prepared');
 const headers={apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
 let info=await backendRpc<{exists:boolean;private:boolean}>(env,'ar_acceptance_bucket_info',{p_actor:actor,p_id:id});
 if(info.exists&&!s.bucket_verified)throw Error('acceptance_bucket_conflict');
 if(!info.exists){if(s.bucket_verified)throw Error('acceptance_bucket_missing');const response=await fetch(base.origin+'/storage/v1/bucket',{method:'POST',headers,body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:20971520,allowed_mime_types:['application/pdf','application/json','image/png','image/jpeg','application/octet-stream']}),redirect:'manual',signal:AbortSignal.timeout(20000)});await response.body?.cancel();if(!response.ok)throw Error('acceptance_bucket_unconfirmed');s=await mark(env,actor,id,'bucket','verified');info=await backendRpc(env,'ar_acceptance_bucket_info',{p_actor:actor,p_id:id});}
 if(info.exists!==true||info.private!==true)throw Error('acceptance_bucket_identity');
 const active=await backendRpc<{id?:string;error?:string}>(env,'ar_acceptance_activate',{p_actor:actor,p_id:id});if(active.error||active.id!==id)throw Error('acceptance_activation_failed');return {id,active:true};
}
