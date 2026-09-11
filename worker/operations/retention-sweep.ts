import {readManagedStorage} from './storage';
import {boundedBody} from '../email/shared';
import {writesHeld} from './write-hold';
import {backendRpc} from '../refresh/backend';
import {enrollRetention,retentionStatus,runRetentionItem} from './retention';
import {retentionProviders,type RetentionProviderEnv} from './retention-providers';
export async function sweepRetention(env:RetentionProviderEnv){
 if(writesHeld(env))return {enabled:false,paused:true};
 if(env.RETENTION_ENABLED!=='true')return {enabled:false};
 const actor=await backendRpc<string|null>(env,'ar_financial_service_actor',{});if(!actor)throw Error('retention_forbidden');
 const counts={checked:0,deleted:0,blocked:0,uncertain:0,errors:0};
 // Include tombstones so newly deleted rows never shift offset pagination.
 for(let offset=0;;offset+=50){
  const page=await backendRpc<{total:number;rows:{store:'supabase'|'drive';objectId:string;itemId:string|null;state:string}[]}>(env,'ar_retention_candidates',{p_actor:actor,p_offset:offset,p_limit:50,p_include_deleted:true});
  if(!Array.isArray(page.rows)||!Number.isSafeInteger(page.total))throw Error('retention_unavailable');
  for(const row of page.rows){
   if(row.state==='deleted')continue;
   try{
    let item=row.itemId?await retentionStatus(env,actor,row.itemId):await enrollRetention(env,actor,row.store,row.objectId);
    counts.checked++;
    if(item.state==='claimed'||item.state==='uncertain'||item.dueAt&&Date.parse(item.dueAt)<=Date.now()+(env.ACCEPTANCE?.clockOffsetDays??0)*86400000){
     const claim=crypto.randomUUID();item=await runRetentionItem(env,actor,item.id,claim,retentionProviders(env,actor,item.id,claim));
    }
    if(item.state==='deleted')counts.deleted++;if(item.state==='blocked')counts.blocked++;if(item.state==='uncertain'||item.state==='claimed')counts.uncertain++;
   }catch{counts.errors++;}
  }
  if(offset+page.rows.length>=page.total)break;if(!page.rows.length)throw Error('retention_pagination_changed');
 }
 return {enabled:true,...counts};
}

/** One bounded pass; SQL rotates exact objects so blocked rows cannot starve later work. */
export async function sweepTransientDocuments(env:RetentionProviderEnv){
 if(writesHeld(env)||env.RETENTION_ENABLED!=='true')return {enabled:false};
 const actor=await backendRpc<string|null>(env,'ar_financial_service_actor',{});if(!actor)throw Error('retention_forbidden');
 // Recover successful uploads whose browser/register response was lost. Absence
 // never clears an intent: an unconfirmed provider request might still complete.
 const pending=await backendRpc<{job_id:string;storage_key:string;byte_count:number;sha256:string}[]>(env,'ar_document_pending_uploads',{p_actor:actor});
 if(!Array.isArray(pending)||pending.length>5)throw Error('retention_unavailable');
 for(const upload of pending)try{
  const response=await readManagedStorage(env,upload.storage_key,upload.byte_count);if(!response.ok){await response.body?.cancel();continue;}
  const bytes=await boundedBody(response,upload.byte_count);
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.length===upload.byte_count&&digest===upload.sha256){
   if(upload.storage_key.split('/')[2]==='email')await backendRpc(env,'ar_document_observe_supplemental_upload',{p_actor:actor,p_key:upload.storage_key,p_sha256:digest});
   else await backendRpc(env,'ar_document_register_upload',{p_job_id:upload.job_id,p_storage_key:upload.storage_key,p_bytes:upload.byte_count,p_sha256:digest,p_mime:'application/pdf'});
  }
 }catch{/* Preserve unknown receipts; never re-upload or guess absence. */}
 const rows=await backendRpc<{objectId:string;itemId:string|null}[]>(env,'ar_document_cleanup_candidates',{p_actor:actor,p_limit:10});
 if(!Array.isArray(rows)||rows.length>10)throw Error('retention_unavailable');
 const counts={checked:0,deleted:0,errors:0};
 for(const row of rows){try{
  let item=row.itemId?await retentionStatus(env,actor,row.itemId):await enrollRetention(env,actor,'supabase',row.objectId);
  counts.checked++;
  if(item.state==='claimed'||item.state==='uncertain'||item.dueAt&&Date.parse(item.dueAt)<=Date.now()){
   const claim=crypto.randomUUID();item=await runRetentionItem(env,actor,item.id,claim,retentionProviders(env,actor,item.id,claim));
  }
  if(item.state==='deleted')counts.deleted++;
 }catch{counts.errors++;}}
 return {enabled:true,...counts};
}
