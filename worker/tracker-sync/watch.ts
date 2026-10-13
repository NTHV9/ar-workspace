import type {WorkflowStep} from 'cloudflare:workers';
import {isRegionId,type RegionId} from '../../src/domain/hotels';
import {backendRpc} from '../refresh/backend';
import {driveToken} from '../drive/oauth';
import {google,identity} from '../drive/provider';
import {readJson} from '../drive/shared';
import {writesHeld} from '../operations/write-hold';
import {trackerFile,syncTracker,type TrackerEnv} from './service';
import {trackerAdapter} from './provider';

export interface TrackerWatchEnv extends TrackerEnv {
 TRACKER_PUSH_ENABLED?:string;
 AR_TRACKER?:{create(options:{id:string;params:{id:string}}):Promise<unknown>;get(id:string):Promise<{status():Promise<{status?:string}>}>};
}
const callback='https://ar-workspace.ar-c82.workers.dev/api/tracker/notifications';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enabled=(env:TrackerWatchEnv)=>env.TRACKER_PUSH_ENABLED==='true'&&env.TRACKER_SYNC_ENABLED==='true'&&!writesHeld(env);
const hex=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
async function hash(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
const response=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

/** Notification input is a wake hint only. Never fetch a URL from headers. */
export async function trackerWatchCallback(request:Request,env:TrackerWatchEnv,background?:{waitUntil(promise:Promise<unknown>):void}){
 if(request.method!=='POST')return response(405);
 if(!enabled(env))return response(503);
 const h=request.headers,channel=h.get('X-Goog-Channel-ID')??'',token=h.get('X-Goog-Channel-Token')??'',resource=h.get('X-Goog-Resource-ID')??'',message=h.get('X-Goog-Message-Number')??'',state=h.get('X-Goog-Resource-State')??'';
 if(new URL(request.url).search||!uuid.test(channel)||!/^[a-f0-9]{64}$/.test(token)||!/^[\x21-\x7e]{1,256}$/.test(resource)||!/^\d{1,20}$/.test(message)||BigInt(message)<1n||BigInt(message)>18446744073709551615n||!['sync','update','change','trash','untrash','remove','add'].includes(state))return response(400);
 try{
  const result=await backendRpc<{status:string;id?:string}>(env,'ar_tracker_watch_notify',{p_channel:channel,p_token_hash:await hash(token),p_resource:resource,p_message:message,p_state:state});
  if(result.status==='invalid')return response(403);
  if(!['accepted','ignored'].includes(result.status))return response(503);
  // The database request is durable before acknowledgement. Dispatch failure
  // leaves it discoverable by scheduled maintenance, never cleared as success.
  if(result.id){if(background){try{background.waitUntil(dispatchTrackerWakes(env));}catch{/* Cron retains the persisted request. */}}else await dispatchTrackerWakes(env);}
  return response(204);
 }catch{return response(503);}
}

export async function ensureTrackerWatch(env:TrackerWatchEnv,region:RegionId){
 if(!enabled(env))return;
 const channel=crypto.randomUUID(),token=hex(crypto.getRandomValues(new Uint8Array(32)));
 const prepared=await backendRpc<{status:string;owner?:string;fileId?:string}>(env,'ar_tracker_watch_prepare',{p_region:region,p_channel:channel,p_token_hash:await hash(token)});
 if(['current','busy','disabled'].includes(prepared.status))return;
 if(prepared.status!=='prepared'||!prepared.owner||!uuid.test(prepared.owner)||!prepared.fileId||prepared.fileId!==trackerFile(env,region)||!/^[A-Za-z0-9_-]{20,200}$/.test(prepared.fileId))throw Error('tracker_watch_binding_invalid');
 const access=await driveToken(env,prepared.owner);await identity(access);
 const result=await google('https://www.googleapis.com/drive/v3/files/'+prepared.fileId+'/watch?supportsAllDrives=true',access,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:channel,type:'web_hook',address:callback,token,expiration:String(Date.now()+86400000)})});
 if(!result.ok){await result.body?.cancel();throw Error('tracker_watch_registration_failed');}
 const value=await readJson(result,8192),expiration=typeof value.expiration==='string'&&/^\d{13}$/.test(value.expiration)?Number(value.expiration):NaN;
 if(value.id!==channel||typeof value.resourceId!=='string'||!/^[\x21-\x7e]{1,256}$/.test(value.resourceId)||!Number.isFinite(expiration)||expiration<=Date.now()||expiration>Date.now()+86700000)throw Error('tracker_watch_response_invalid');
 await backendRpc(env,'ar_tracker_watch_activate',{p_channel:channel,p_resource:value.resourceId,p_expiration:new Date(expiration).toISOString()});
}

/** Never remove pending work merely because Workflow creation timed out. */
export async function dispatchTrackerWakes(env:TrackerWatchEnv){
 if(!enabled(env)||!env.AR_TRACKER)return;
 try{
  const pending=await backendRpc<{id:string;region:RegionId}[]>(env,'ar_tracker_wake_pending',{});
  if(!Array.isArray(pending)||pending.length>2||pending.some(p=>!p||!uuid.test(p.id)||!isRegionId(p.region)))return;
  await Promise.allSettled(pending.map(async p=>{try{await env.AR_TRACKER!.create({id:p.id,params:{id:p.id}});}catch{try{
   const state=await(await env.AR_TRACKER!.get(p.id)).status();
   if(['complete','errored','terminated'].includes(state.status??''))await backendRpc(env,'ar_tracker_wake_restart',{p_id:p.id});
  }catch{/* Unknown transport outcomes retain the same durable ID. */}}}));
 }catch{/* Saved data and durable pending requests remain available. */}
}

export async function maintainTrackerWatches(env:TrackerWatchEnv){
 if(!enabled(env))return;
 await Promise.allSettled((['phuket','khao-lak'] as const).map(region=>ensureTrackerWatch(env,region)));
 await dispatchTrackerWakes(env);
}

export async function runTrackerWake(env:TrackerWatchEnv,id:string,step:Pick<WorkflowStep,'do'|'sleep'>){
 if(!enabled(env)||!uuid.test(id))return {status:'disabled'};
 await step.sleep('coalesce-file-edits','2 seconds');
 const job=await step.do('read-durable-wake',()=>backendRpc<{status:string;region:RegionId;owner:string;fileId:string;generation:string}>(env,'ar_tracker_wake_begin',{p_id:id}));
 if(job.status!=='ready')return {status:'obsolete'};
 const valid=isRegionId(job.region)&&uuid.test(job.owner)&&job.fileId===trackerFile(env,job.region)&&/^\d{1,19}$/.test(job.generation);
 let success=false;
 if(valid){
  try{success=await step.do('synchronize-original-tracker',{retries:{limit:0,delay:'5 seconds'},timeout:'8 minutes'},async()=>{
   if(!enabled(env))return false;
   const result=await syncTracker(env,job.owner,job.owner,job.region,trackerAdapter,true);return result.status==='checked';
  });}catch{/* Existing outbox uncertainty and lease rules survive any timeout. */}
 }
 const finished=await step.do('finish-durable-wake',()=>backendRpc<{status:string;retryAfterSeconds?:number}>(env,'ar_tracker_wake_finish',{p_id:id,p_generation:job.generation,p_success:success}));
 if(finished.retryAfterSeconds&&Number.isInteger(finished.retryAfterSeconds)&&finished.retryAfterSeconds>=1&&finished.retryAfterSeconds<=300)await step.sleep('retry-backoff',`${finished.retryAfterSeconds} seconds`);
 await step.do('dispatch-later-edits',async()=>{await dispatchTrackerWakes(env);return {dispatched:true};});
 return {status:success?'checked':'deferred'};
}
