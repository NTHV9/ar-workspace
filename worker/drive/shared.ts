import type {EmailEnv} from '../email/shared';
import type {Cipher} from '../email/crypto';
export interface DriveEnv extends EmailEnv {GOOGLE_PICKER_BROWSER_KEY?:string;GOOGLE_PROJECT_NUMBER?:string}
export interface Target {owner:string;folder_id:string;revision:number;name:string|null;drive_id:string|null;verified_at:string|null;visibility:'public'|'restricted'|'unknown'}
export interface DriveFile {archive_id:string;ordinal:number;name:string;storage_key:string|null;byte_count:number;sha256:string;drive_file_id:string|null;state:'pending'|'uploading'|'verified'|'error'|'trashed';session:Cipher|null;claim_token:string|null;url:string|null;error_code:string|null;read_verified:boolean}
export interface Archive {id:string;owner:string;kind:'job'|'test';document_job_id:string|null;document_revision:number|null;target_revision:number;folder_id:string;created_at:string;files:DriveFile[]}
export const driveScope='https://www.googleapis.com/auth/drive.file';
export const allowedEmail='ar@katathani.com';
export const fileIdPattern=/^[A-Za-z0-9_-]{10,200}$/;
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function boundedBytes(r:Request|Response,max:number){
 if(Number(r.headers.get('Content-Length'))>max)throw Error('drive_response_too_large');
 const reader=r.body?.getReader();if(!reader)throw Error('drive_invalid');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>max){await reader.cancel();throw Error('drive_response_too_large');}chunks.push(p.value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
export async function readJson(r:Request|Response,max=262144):Promise<Record<string,unknown>>{const v:unknown=JSON.parse(new TextDecoder().decode(await boundedBytes(r,max)));if(!v||typeof v!=='object'||Array.isArray(v))throw Error('drive_invalid');return v as Record<string,unknown>;}
export async function requestJson(r:Request){if(!r.headers.get('Content-Type')?.includes('application/json'))throw Error('drive_invalid');return readJson(r,16384);}
export async function driveRpc<T>(env:DriveEnv,name:string,args:Record<string,unknown>):Promise<T>{
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('drive_not_configured');
 const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('drive_not_configured');
 const response=await fetch(url.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!response.ok){await response.body?.cancel();throw Error('drive_unavailable');}
 const value:unknown=JSON.parse(new TextDecoder().decode(await boundedBytes(response,16*1024*1024)));
 if(value&&typeof value==='object'&&'error' in value)throw Error(safeError(value.error));return value as T;
}
const errors=new Set(['drive_forbidden','drive_invalid','drive_not_configured','drive_not_connected','drive_reconnect_required','drive_unavailable','drive_missing','drive_target_missing','drive_target_changed','drive_target_not_ready','drive_target_not_private','drive_folder_mismatch','drive_folder_unavailable','drive_identity_mismatch','drive_command_conflict','drive_revision_conflict','drive_unreviewed','drive_incomplete','drive_busy','drive_source_changed','drive_source_unavailable','drive_checksum_mismatch','drive_metadata_mismatch','drive_upload_pending','drive_unsafe_upload_url','drive_response_too_large','drive_cleanup_failed']);
export function safeError(e:unknown){const value=e instanceof Error?e.message:String(e);return value==='storage_object_size_changed'||value==='storage_object_changed'?'drive_source_changed':/^(budget|storage)_[a-z_]+$/.test(value)?value:errors.has(value)?value:'drive_unavailable';}
export function folderView(t:Target|null,ready=false){return t?{configured:true,id:t.folder_id,name:t.name,revision:t.revision,ready,verifiedAt:t.verified_at,visibility:t.visibility}:{configured:false,id:null,name:null,revision:null,ready:false,verifiedAt:null,visibility:'unknown'};}
export function archiveView(a:Archive){
 const complete=a.files.length>0&&a.files.every(f=>a.kind==='test'?f.state==='trashed':f.state==='verified');
 const some=a.files.some(f=>['verified','trashed'].includes(f.state));
 const state=complete?(a.kind==='test'?'cleaned':'verified'):some?'partial':a.files.some(f=>f.state==='error')?'error':'pending';
 return {id:a.id,kind:a.kind,documentJobId:a.document_job_id,documentRevision:a.document_revision,targetRevision:a.target_revision,state,createdAt:a.created_at,files:a.files.map(f=>({ordinal:f.ordinal,name:f.name,state:f.state,driveFileId:f.drive_file_id,url:f.state==='verified'?f.url:null,error:f.error_code}))};
}
