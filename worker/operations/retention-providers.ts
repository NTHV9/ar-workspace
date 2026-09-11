import {workingBucket} from '../acceptance/routing';
import {backendRpc} from '../refresh/backend';
import {driveToken} from '../drive/oauth';
import {google,identity,metadata,verifyFolder,type Metadata} from '../drive/provider';
import type {DriveEnv} from '../drive/shared';
import {boundedBody} from '../email/shared';
import {readManagedStorage} from './storage';
import type {RetentionEnvironment,RetentionInspection,RetentionProvider,RetentionTarget} from './retention';
export type RetentionProviderEnv=DriveEnv&RetentionEnvironment;
type DriveTarget=Extract<RetentionTarget,{store:'drive'}>;
function driveMatches(m:Metadata,t:DriveTarget){
 const properties={ar_owner:t.owner,ar_archive:t.archiveId,ar_job:t.jobId,ar_revision:String(t.documentRevision),ar_test:'false',ar_sha256:t.sha256,ar_ordinal:String(t.ordinal)};
 return m.id===t.objectId&&m.mimeType==='application/pdf'&&typeof m.trashed==='boolean'&&!m.driveId&&m.parents?.length===1&&m.parents[0]===t.parentId&&m.owners?.some(o=>o.emailAddress?.toLowerCase()==='ar@katathani.com')===true&&m.size===String(t.byteCount)&&m.sha256Checksum?.toLowerCase()===t.sha256&&Object.entries(properties).every(([k,v])=>m.appProperties?.[k]===v);
}
export function retentionProviders(env:RetentionProviderEnv,actor:string,itemId:string,claimId:string):{supabase:RetentionProvider;drive:RetentionProvider}{
 const state=()=>backendRpc<{state?:string;identityVerified?:boolean;deleteAcknowledged?:boolean}>(env,'ar_retention_inspect',{p_actor:actor,p_id:itemId});
 const ack=async()=>{const result=await backendRpc<{acknowledged?:boolean}>(env,'ar_retention_delete_ack',{p_actor:actor,p_id:itemId,p_claim:claimId});if(result.acknowledged!==true)throw Error('retention_outcome_unknown');};
 const checkOwner=(target:RetentionTarget)=>{if(target.owner!==actor||target.store==='supabase'&&target.bucket!==workingBucket(env)||target.store==='drive'&&env.ACCEPTANCE&&target.parentId!==env.ACCEPTANCE.driveFolderId)throw Error('retention_forbidden');};
 let tokenPromise:Promise<string>|undefined;
 const token=()=>tokenPromise??=(async()=>{const t=await driveToken(env,actor);await identity(t);return t;})();
 const supabase:RetentionProvider={
  async inspect(target):Promise<RetentionInspection>{
   checkOwner(target);if(target.store!=='supabase')return {state:'unknown'};
   const s=await state();if(s.state==='absent')return {state:'absent'};if(s.state!=='present')return {state:'unknown'};if(s.identityVerified!==true)return {state:'present',identityVerified:false};
   const response=await readManagedStorage(env,target.key,target.byteCount);if(!response.ok){await response.body?.cancel();return {state:'unknown'};}
   const bytes=await boundedBody(response,target.byteCount),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
   return {state:'present',identityVerified:bytes.length===target.byteCount&&hash===target.sha256};
  },
  async remove(target){
   checkOwner(target);if(target.store!=='supabase')throw Error('retention_invalid');const s=await state();if(s.state!=='present'||s.identityVerified!==true)throw Error('retention_identity_mismatch');
   if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('retention_not_configured');const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error('retention_not_configured');
   const r=await fetch(u.origin+'/storage/v1/object/'+workingBucket(env),{method:'DELETE',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[target.key]}),redirect:'manual',signal:AbortSignal.timeout(30000)});await r.body?.cancel();if(!r.ok)throw Error('retention_outcome_unknown');await ack();
  }
 };
 const drive:RetentionProvider={
  async inspect(target):Promise<RetentionInspection>{
   checkOwner(target);if(target.store!=='drive')return {state:'unknown'};const t=await token(),m=await metadata(t,target.objectId);
   if(m)return {state:'present',identityVerified:driveMatches(m,target)};
   // A 404 alone can mean lost access. Require our durable acknowledged DELETE
   // and the same authenticated owner still seeing the restricted parent.
   const s=await state();if(s.deleteAcknowledged!==true)return {state:'unknown'};
   const folder=await verifyFolder(t,target.parentId);return folder.visibility==='restricted'?{state:'absent'}:{state:'unknown'};
  },
  async remove(target){
   checkOwner(target);if(target.store!=='drive')throw Error('retention_invalid');const t=await token(),m=await metadata(t,target.objectId);if(!m||!driveMatches(m,target))throw Error('retention_identity_mismatch');
   const folder=await verifyFolder(t,target.parentId);if(folder.visibility!=='restricted')throw Error('retention_forbidden');
   const r=await google('https://www.googleapis.com/drive/v3/files/'+target.objectId+'?supportsAllDrives=true',t,{method:'DELETE'});await r.body?.cancel();if(!r.ok)throw Error('retention_outcome_unknown');await ack();
  }
 };
 return {supabase,drive};
}
