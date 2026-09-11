import {backendRpc} from '../refresh/backend';
import type {DriveEnv} from '../drive/shared';
import {driveToken} from '../drive/oauth';
import {google,identity,metadata,verifyFolder} from '../drive/provider';
import {boundedBody} from '../email/shared';
interface Closure {id:string;owner:string;folder:string;parent:string;summary:{phase:string;folderDeleteAcknowledged:boolean;bucketDeleteAcknowledged:boolean}}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,driveId=/^[A-Za-z0-9_-]{10,200}$/;
/** Only a sealed, zero-balance scenario whose exact files were already removed
 * can reach the empty-container cleanup. Unknown outcomes remain reviewable. */
export async function closeAcceptance(env:DriveEnv,actor:string,id:string){
 if(env.ACCEPTANCE_ENABLED!=='true'||env.ACCEPTANCE||!uuid.test(id)||!uuid.test(actor))throw Error('acceptance_inactive');
 const s=await backendRpc<Closure&{error?:string}>(env,'ar_acceptance_close_begin',{p_actor:actor,p_id:id});
 if(s.error)throw Error(s.error);if(s.id!==id||s.owner!==actor||!driveId.test(s.folder)||!driveId.test(s.parent)||s.folder===s.parent||!['closing','providers_removed','complete'].includes(s.summary?.phase))throw Error('acceptance_cleanup_invalid');
 if(s.summary.phase==='complete'||s.summary.phase==='providers_removed')return {closed:true};
 const record=async(step:string)=>{const r=await backendRpc<{error?:string}>(env,'ar_acceptance_close_record',{p_actor:actor,p_id:id,p_step:step});if(r.error)throw Error(r.error);};
 const token=await driveToken(env,actor);await identity(token);if((await verifyFolder(token,s.parent)).visibility!=='restricted')throw Error('acceptance_parent_unconfirmed');
 let folder=await metadata(token,s.folder);
 if(folder){
  if(folder.id!==s.folder||folder.mimeType!=='application/vnd.google-apps.folder'||folder.driveId||folder.parents?.length!==1||folder.parents[0]!==s.parent||folder.trashed!==false||folder.appProperties?.ar_acceptance!==id||folder.appProperties?.ar_owner!==actor||(await verifyFolder(token,s.folder)).visibility!=='restricted')throw Error('acceptance_folder_identity');
  // Include trashed children. A folder DELETE must never remove an untracked child.
  const q=new URLSearchParams({q:`'${s.folder}' in parents`,pageSize:'1',fields:'files(id),nextPageToken'});
  const listed=await google('https://www.googleapis.com/drive/v3/files?'+q,token);if(!listed.ok){await listed.body?.cancel();throw Error('acceptance_folder_unconfirmed');}
  const children=JSON.parse(new TextDecoder().decode(await boundedBody(listed,4096))) as {files?:unknown[];nextPageToken?:string};
  if(!Array.isArray(children.files)||children.files.length||children.nextPageToken)throw Error('acceptance_folder_not_empty');
  const removed=await google('https://www.googleapis.com/drive/v3/files/'+s.folder+'?supportsAllDrives=true',token,{method:'DELETE'});await removed.body?.cancel();if(!removed.ok)throw Error('acceptance_folder_unconfirmed');
  await record('folder');s.summary.folderDeleteAcknowledged=true;folder=await metadata(token,s.folder);
 }
 if(folder||s.summary.folderDeleteAcknowledged!==true)throw Error('acceptance_folder_unconfirmed');
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('acceptance_not_prepared');const base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw Error('acceptance_not_prepared');
 const url=base.origin+'/storage/v1/bucket/ar-acceptance-files',headers={apikey:env.SUPABASE_SECRET_KEY};
 if(!s.summary.bucketDeleteAcknowledged){
  // Supabase rejects non-empty bucket deletion; never use the emptyBucket API.
  const removed=await fetch(url,{method:'DELETE',headers,redirect:'manual',signal:AbortSignal.timeout(20000)});await removed.body?.cancel();if(!removed.ok)throw Error('acceptance_bucket_unconfirmed');await record('bucket');
 }
 await record('verified');return {closed:true};
}
