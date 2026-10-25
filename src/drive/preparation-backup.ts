import {strToU8,zipSync} from 'fflate';
export interface BackupObject {job_id:string;object_id:string;storage_key:string;byte_count:number;sha256:string;mime:'application/pdf'|'application/json'}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const maximumBytes=96*1024*1024;
export function parseBackupInventory(value:unknown):BackupObject[]{
 if(!value||typeof value!=='object'||!('objects'in value)||!Array.isArray(value.objects)||!value.objects.length||value.objects.length>500)throw Error('Choose a valid inventory with 1–500 objects.');
 let total=0;const ids=new Set<string>(),keys=new Set<string>();
 return value.objects.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('The inventory contains an invalid receipt.');
  const r=raw as Record<string,unknown>;const field=(snake:string,camel:string)=>{if(r[snake]!==undefined&&r[camel]!==undefined&&r[snake]!==r[camel])throw Error('The inventory contains conflicting receipt fields.');return r[snake]??r[camel];};
  const job_id=field('job_id','jobId'),object_id=field('object_id','objectId'),storage_key=field('storage_key','key'),byte_count=field('byte_count','byteCount'),sha256=r.sha256;
  const path=typeof storage_key==='string'&&typeof job_id==='string'?new RegExp(`^jobs/${job_id}/(originals|exports|projects)/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\\.(pdf|json)$`).exec(storage_key):null;
  const mime=path?.[2]==='json'?'application/json':'application/pdf';
  if(typeof job_id!=='string'||!uuid.test(job_id)||typeof object_id!=='string'||!uuid.test(object_id)||!path||path[1]==='projects'&&path[2]!=='json'||path[1]!=='projects'&&path[2]!=='pdf'||!Number.isSafeInteger(byte_count)||Number(byte_count)<1||Number(byte_count)>100*1024*1024||typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256)||r.mime!==undefined&&r.mime!==mime||r.mimetype!==undefined&&r.mimetype!==mime||ids.has(object_id)||keys.has(String(storage_key)))throw Error('The inventory contains an invalid or duplicate receipt.');
  total+=Number(byte_count);if(total>maximumBytes)throw Error('This inventory exceeds the 96 MiB backup limit.');ids.add(object_id);keys.add(String(storage_key));
  return {job_id,object_id,storage_key:storage_key as string,byte_count:Number(byte_count),sha256,mime};
 });
}
async function exactBytes(response:Response,size:number,signal:AbortSignal){
 const reader=response.body?.getReader();if(!reader)throw Error('Backup bytes are unavailable.');const bytes=new Uint8Array(size);let seen=0;
 try{while(true){signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;if(seen+chunk.value.length>size)throw Error('Backup bytes changed.');bytes.set(chunk.value,seen);seen+=chunk.value.length;}if(seen!==size)throw Error('Backup bytes changed.');return bytes;}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
export async function prepareBackup(objects:BackupObject[],token:string,signal:AbortSignal,fetcher:typeof fetch=fetch,onProgress?:(count:number,bytes:number)=>void){
 const rows=parseBackupInventory({objects}),controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);const files:Record<string,Uint8Array>={};let next=0,completed=0,byteCount=0;
 const worker=async()=>{while(next<rows.length){combined.throwIfAborted();const row=rows[next++];const response=await fetcher(`/api/documents/${row.job_id}/backup/${row.object_id}`,{headers:{Authorization:'Bearer '+token},signal:combined,redirect:'error',cache:'no-store'});
  if(!response.ok||response.headers.get('X-Ar-Backup-Sha256')!==row.sha256||response.headers.get('X-Ar-Backup-Byte-Count')!==String(row.byte_count)||response.headers.get('Content-Type')?.split(';')[0]!==row.mime){await response.body?.cancel();throw Error('A backup receipt did not match. No ZIP was prepared.');}
  const bytes=await exactBytes(response,row.byte_count,combined),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');combined.throwIfAborted();if(sha!==row.sha256)throw Error('Backup bytes changed. No ZIP was prepared.');
  files[row.object_id+(row.mime==='application/json'?'.json':'.pdf')]=bytes;completed++;byteCount+=bytes.length;onProgress?.(completed,byteCount);
 }};
 try{await Promise.all([worker(),worker()]);combined.throwIfAborted();files['manifest.json']=strToU8(JSON.stringify({version:1,objects:rows},null,2));const bytes=zipSync(files,{level:0});return {bytes,count:completed,byteCount};}catch(error){controller.abort();for(const key of Object.keys(files))delete files[key];throw error;}
}
