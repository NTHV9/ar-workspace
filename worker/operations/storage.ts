import {assertWritesEnabled} from './write-hold';
import {boundedBody} from '../email/shared';
import type {RetentionEnvironment} from './retention';
import {operationBudgetLimits,type BudgetEnvironment} from './budget';
export interface StorageBudgetEnv extends BudgetEnvironment,RetentionEnvironment{}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function base(env:StorageBudgetEnv,requireKey=true){if(!env.SUPABASE_URL||requireKey&&!env.SUPABASE_SECRET_KEY)throw Error('storage_not_configured');const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('storage_not_configured');return u.origin;}
function path(key:string){if(!/^(jobs|remittances|remittance-diagnostics|validation)\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key)||/(^|\/)\.\.?($|\/)/.test(key))throw Error('storage_path_invalid');return key;}
async function rpc<T>(env:StorageBudgetEnv,name:string,args:Record<string,unknown>):Promise<T>{const r=await fetch(base(env)+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY!,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok){await r.body?.cancel();throw Error('storage_budget_unavailable');}const raw=JSON.parse(new TextDecoder().decode(await boundedBody(r,65536)));if(raw?.error)throw Error(typeof raw.error==='string'&&/^(budget|storage)_[a-z_]+$/.test(raw.error)?raw.error:'storage_budget_unavailable');return raw as T;}
async function actor(env:StorageBudgetEnv){const value=await rpc<unknown>(env,'ar_financial_service_actor',{});if(typeof value!=='string'||!uuid.test(value))throw Error('storage_actor_unavailable');return value;}
async function sha(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function uploadId(owner:string,key:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ar-storage-upload:'+owner+':'+key)));bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const s=[...bytes.slice(0,16)].map(n=>n.toString(16).padStart(2,'0')).join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');}
/** Fixed app bucket only. Callers retain their owner, identity, MIME and SHA guards. */
export async function readManagedStorage(env:StorageBudgetEnv,key:string,ceiling:number,options:{headers?:HeadersInit;timeoutMs?:number;sizeError?:string}={}):Promise<Response>{
 path(key);if(!Number.isSafeInteger(ceiling)||ceiling<1||ceiling>104857600)throw Error('storage_size_invalid');
 if(env.RETENTION_ENABLED==='true'){const state=await rpc<{expired:boolean}>(env,'ar_retention_file_state',{p_actor:await actor(env),p_key:key});if(state.expired)throw Error('storage_file_expired');}
 let expected=ceiling;if(env.OPERATIONS_BUDGET_ENABLED==='true'){
  const receipt=await rpc<{byteCount:number}>(env,'ar_storage_read_budget',{p_actor:await actor(env),p_id:crypto.randomUUID(),p_key:key,p_ceiling:ceiling,p_limits:operationBudgetLimits(env)});
  if(!Number.isSafeInteger(receipt.byteCount)||receipt.byteCount<1||receipt.byteCount>ceiling)throw Error('storage_budget_unavailable');expected=receipt.byteCount;
 }
 if(!options.headers&&!env.SUPABASE_SECRET_KEY)throw Error('storage_not_configured');
 const response=await fetch(base(env,false)+'/storage/v1/object/authenticated/ar-working-files/'+key,{headers:options.headers??{apikey:env.SUPABASE_SECRET_KEY!},redirect:'manual',signal:AbortSignal.timeout(options.timeoutMs??30000)});
 if(!response.ok||!response.body)return response;
 const length=response.headers.get('Content-Length');if(length&&Number(length)>expected){await response.body.cancel();throw Error(options.sizeError??'storage_object_size_changed');}
 let seen=0;const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){seen+=chunk.byteLength;if(seen>expected)throw Error(options.sizeError??'storage_object_size_changed');controller.enqueue(chunk);}}));
 return new Response(body,{status:response.status,headers:response.headers});
}
export async function writeManagedStorage(env:StorageBudgetEnv,key:string,bytes:Uint8Array,mime:string):Promise<void>{
 assertWritesEnabled(env);
 path(key);if(bytes.length<1||bytes.length>104857600)throw Error('storage_size_invalid');
 const enabled=env.OPERATIONS_BUDGET_ENABLED==='true';let owner='',id='';const digest=await sha(bytes);
 if(enabled){owner=await actor(env);id=await uploadId(owner,key);const receipt=await rpc<{id:string;proceed:boolean;verified:boolean}>(env,'ar_storage_write_begin',{p_actor:owner,p_id:id,p_key:key,p_bytes:bytes.length,p_sha256:digest,p_mime:mime,p_limits:operationBudgetLimits(env)});
  if(receipt.id!==id||typeof receipt.proceed!=='boolean'||typeof receipt.verified!=='boolean')throw Error('storage_budget_unavailable');
  if(receipt.verified)return;
  if(!receipt.proceed){const existing=await readManagedStorage(env,key,bytes.length);if(!existing.ok){await existing.body?.cancel();throw Error('storage_upload_uncertain');}const copy=await boundedBody(existing,bytes.length);if(copy.length!==bytes.length||await sha(copy)!==digest)throw Error('storage_object_changed');await rpc(env,'ar_storage_write_finish',{p_actor:owner,p_id:id,p_verified:true});return;}
 }
 try{
  const response=await fetch(base(env)+'/storage/v1/object/ar-working-files/'+key,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY!,'Content-Type':mime,'x-upsert':'false'},body:new Uint8Array(bytes).buffer,redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const status=response.status;await response.body?.cancel();if(status!==400&&status!==409)throw Error('storage_write_unconfirmed');const existing=await readManagedStorage(env,key,bytes.length);if(!existing.ok){await existing.body?.cancel();throw Error('storage_upload_uncertain');}const copy=await boundedBody(existing,bytes.length);if(copy.length!==bytes.length||await sha(copy)!==digest)throw Error('storage_object_changed');}else await response.body?.cancel();
  if(enabled)await rpc(env,'ar_storage_write_finish',{p_actor:owner,p_id:id,p_verified:true});
 }finally{
  if(enabled)try{await rpc(env,'ar_storage_write_finish',{p_actor:owner,p_id:id,p_verified:false});}catch{/* Uncertain writes retain their reservation. */}
 }
}
/** Read back an immutable reservation. Never repeats an unconfirmed POST. */
export async function reconcileStorageUpload(env:StorageBudgetEnv,owner:string,id:string){
 if(!uuid.test(owner)||!uuid.test(id))throw Error('budget_invalid');
 const r=await rpc<{id:string;key:string;byteCount:number;sha256:string;verified:boolean}>(env,'ar_storage_upload_recovery',{p_actor:owner,p_id:id});
 if(r.id!==id||!Number.isSafeInteger(r.byteCount)||r.byteCount<1||r.byteCount>104857600||!/^[0-9a-f]{64}$/.test(r.sha256))throw Error('storage_budget_unavailable');
 if(r.verified)return {verified:true};
 const response=await readManagedStorage(env,r.key,r.byteCount);if(!response.ok){await response.body?.cancel();throw Error('storage_upload_uncertain');}
 const bytes=await boundedBody(response,r.byteCount);if(bytes.length!==r.byteCount||await sha(bytes)!==r.sha256)throw Error('storage_object_changed');
 await rpc(env,'ar_storage_write_finish',{p_actor:owner,p_id:id,p_verified:true});return {verified:true};
}
