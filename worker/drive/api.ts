import {documentJob} from '../documents/jobs';
import {uuidPattern} from '../documents/jobs';
import {hash} from '../email/crypto';
import {driveCallback,driveConfigured,driveConnect,driveToken} from './oauth';
import {identity,verifyFolder} from './provider';
import {runArchive,syntheticPdf} from './archive';
import {archiveView,driveRpc,driveScope,fileIdPattern,folderView,json,requestJson,safeError,type Archive,type DriveEnv,type Target} from './shared';
export {driveCallback};
const pickerConfigured=(env:DriveEnv)=>!!(env.GMAIL_CLIENT_ID&&env.GOOGLE_PICKER_BROWSER_KEY&&/^\d+$/.test(env.GOOGLE_PROJECT_NUMBER??''));
async function target(env:DriveEnv,actor:string){return driveRpc<Target|null>(env,'ar_drive_target_get',{p_owner:actor});}
async function checkTarget(env:DriveEnv,actor:string,token:string,t:Target){const meta=await verifyFolder(token,t.folder_id);return driveRpc<Target>(env,'ar_drive_target_verify',{p_owner:actor,p_folder:t.folder_id,p_revision:t.revision,p_name:meta.name,p_drive_id:meta.driveId,p_visibility:meta.visibility});}
async function retainedArchiveView(env:DriveEnv,actor:string,a:Archive){
 const view=archiveView(a);if(env.RETENTION_ENABLED!=='true')return view;
 const expired=await driveRpc<string[]>(env,'ar_retention_drive_expired',{p_actor:actor,p_ids:a.files.flatMap(f=>f.drive_file_id?[f.drive_file_id]:[])});
 if(!Array.isArray(expired)||expired.some(id=>typeof id!=='string'))throw Error('drive_unavailable');
 if(!expired.length)return view;
 return {...view,state:'expired',files:view.files.map(f=>f.driveFileId&&expired.includes(f.driveFileId)?{...f,state:'expired',url:null,error:'storage_file_expired'}:f)};
}
export async function driveApi(request:Request,env:DriveEnv,actor:string):Promise<Response>{
 try{
  if(!uuidPattern.test(actor))return json({error:'drive_forbidden'},403);
  const u=new URL(request.url),path=u.pathname;
  if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==u.origin)return json({error:'drive_forbidden'},403);
  if(path==='/api/drive/status'&&request.method==='GET'){
   const t=await target(env,actor),base={configured:driveConfigured(env),connected:false,email:null,folder:folderView(t),cleanupDisabled:env.RETENTION_ENABLED!=='true',pickerConfigured:pickerConfigured(env)};
   if(!base.configured)return json(base);
   try{const token=await driveToken(env,actor);await identity(token);const connected={...base,connected:true,email:'ar@katathani.com'};if(!t)return json(connected);
    try{const meta=await verifyFolder(token,t.folder_id);return json({...connected,folder:folderView({...t,name:meta.name,visibility:meta.visibility},!!t.verified_at)});}catch(e){return json({...connected,folder:folderView({...t,visibility:'unknown'}),error:safeError(e)});}
   }catch(e){return json({...base,error:safeError(e)});}
  }
  if(path==='/api/drive/config'&&request.method==='GET'){const t=await target(env,actor);if(!driveConfigured(env)||!pickerConfigured(env))throw Error('drive_not_configured');if(!t)throw Error('drive_target_missing');return json({clientId:env.GMAIL_CLIENT_ID,browserKey:env.GOOGLE_PICKER_BROWSER_KEY,projectNumber:env.GOOGLE_PROJECT_NUMBER,scope:driveScope,folderId:t.folder_id});}
  if(path==='/api/drive/connect'&&request.method==='POST'){await requestJson(request);return driveConnect(env,actor);}
  if(path==='/api/drive/verify-folder'&&request.method==='POST'){
   const v=await requestJson(request),t=await target(env,actor);if(!t)throw Error('drive_target_missing');if(typeof v.folderId!=='string'||!fileIdPattern.test(v.folderId)||v.folderId!==t.folder_id)throw Error('drive_folder_mismatch');
   const token=await driveToken(env,actor);await identity(token);return json(folderView(await checkTarget(env,actor,token,t),true));
  }
  const job=/^\/api\/drive\/jobs\/([0-9a-f-]{36})$/.exec(path);
  if(job&&uuidPattern.test(job[1])&&request.method==='GET'){const value=u.searchParams.get('revision'),revision=Number(value);if(value===null||!Number.isSafeInteger(revision)||revision<0)throw Error('drive_invalid');const a=await driveRpc<Archive|null>(env,'ar_drive_archive_get',{p_owner:actor,p_job:job[1],p_revision:revision});return json({archive:a?await retainedArchiveView(env,actor,a):null});}
  if(request.method==='POST'&&(path==='/api/drive/test'||(job&&uuidPattern.test(job[1])))){
   const v=await requestJson(request);if(v.confirmed!==true||typeof v.commandId!=='string'||!uuidPattern.test(v.commandId)||!Number.isSafeInteger(v.expectedTargetRevision)||Number(v.expectedTargetRevision)<1||(job&&(!Number.isSafeInteger(v.documentRevision)||Number(v.documentRevision)<1)))throw Error('drive_invalid');
   const t=await target(env,actor);if(!t)throw Error('drive_target_missing');if(t.revision!==v.expectedTargetRevision)throw Error('drive_target_changed');if(!t.verified_at)throw Error('drive_target_not_ready');
   if(job){const preparation=await documentJob(env,job[1]);if(!preparation||preparation.owner!==actor)return json({error:'drive_forbidden'},403);if(preparation.closed_at)return json({error:'document_closed'},410);if(preparation.lifecycle==='transient')return json({error:'document_archive_retired'},409);}
   const token=await driveToken(env,actor);await identity(token);
   const fresh=await checkTarget(env,actor,token,t);if(job&&fresh.visibility!=='restricted')throw Error('drive_target_not_private');
   const test=job?null:syntheticPdf();
   const a=await driveRpc<Archive>(env,'ar_drive_archive_open',{p_owner:actor,p_command:v.commandId,p_kind:job?'job':'test',p_job:job?job[1]:null,p_revision:job?Number(v.documentRevision):null,p_expected_target_revision:v.expectedTargetRevision,p_test_bytes:test?.length??null,p_test_sha:test?await hash(test):null});
   const updated=await runArchive(env,token,a);return json({archive:await retainedArchiveView(env,actor,updated)});
  }
  return json({error:'not_found'},404);
 }catch(e){const code=safeError(e);return json({error:code},code==='drive_forbidden'?403:/missing$/.test(code)?404:/invalid|folder_mismatch/.test(code)?400:/changed|conflict|ready|private|unreviewed|incomplete|busy/.test(code)?409:503);}
}
