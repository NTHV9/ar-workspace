import {readManagedStorage} from '../operations/storage';
import {hash,seal,unseal} from '../email/crypto';
import {driveRpc,safeError,type Archive,type DriveEnv,type DriveFile} from './shared';
import {beginUpload,generateId,metadata,readTest,trashTest,uploadPosition,uploadStream,verifyFolder,verifyMetadata} from './provider';

/** Fixed generic PDF; no account names, provider data, dates or customer bytes. Stable on every retry. */
export function syntheticPdf(){
 const stream='BT /F1 16 Tf 50 750 Td (AR synthetic connection test - no customer data) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return new TextEncoder().encode(pdf);
}
async function mutate(env:DriveEnv,a:Archive,f:DriveFile,action:string,value:unknown){const ok=await driveRpc<boolean>(env,'ar_drive_file_update',{p_owner:a.owner,p_archive:a.id,p_ordinal:f.ordinal,p_claim:f.claim_token,p_action:action,p_value:value});if(!ok)throw Error('drive_busy');}
export function byteRangeStream(body:ReadableStream<Uint8Array>,offset:number,size:number){
 let count=0;return body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){const previous=count;count+=chunk.byteLength;if(count>size)throw Error('drive_source_changed');if(count>offset)controller.enqueue(chunk.subarray(Math.max(0,offset-previous)));},flush(){if(count!==size)throw Error('drive_source_changed');}}));
}
async function source(env:DriveEnv,a:Archive,f:DriveFile,offset:number){
 if(a.kind==='test'){const bytes=syntheticPdf();if(bytes.length!==f.byte_count||await hash(bytes)!==f.sha256)throw Error('drive_source_changed');return new ReadableStream<Uint8Array>({start(c){c.enqueue(bytes.subarray(offset));c.close();}});}
 const key=f.storage_key;if(!key||!a.document_job_id||!key.startsWith(`jobs/${a.document_job_id}/exports/`)||!/^jobs\/[0-9a-f-]{36}\/exports\/[0-9a-f-]{36}\.pdf$/.test(key)||!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('drive_source_changed');
 const base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('drive_not_configured');
 const r=await readManagedStorage(env,key,f.byte_count,{timeoutMs:90000,sizeError:'drive_source_changed'});
 if(!r.ok||!r.body){await r.body?.cancel();throw Error('drive_source_unavailable');}
 const length=r.headers.get('Content-Length');if(length&&Number(length)!==f.byte_count){await r.body.cancel();throw Error('drive_source_changed');}
 return byteRangeStream(r.body,offset,f.byte_count);
}
async function finishVerified(env:DriveEnv,token:string,a:Archive,f:DriveFile){
 const m=await metadata(token,f.drive_file_id!);if(!m)throw Error('drive_upload_pending');
 const url=verifyMetadata(m,a,f,a.kind==='test');
 if(a.kind==='test'){
  // A durable read receipt must precede cleanup, including recovery after a lost PATCH response.
  if(!f.read_verified){if(m.trashed)throw Error('drive_cleanup_failed');const bytes=await readTest(token,a,f);if(bytes.length!==f.byte_count||await hash(bytes)!==f.sha256)throw Error('drive_checksum_mismatch');await mutate(env,a,f,'verified',{url,readVerified:true});}
  await trashTest(token,a,f);await mutate(env,a,f,'trashed',{});
 }else await mutate(env,a,f,'verified',{url});
}
export async function runArchive(env:DriveEnv,token:string,a:Archive){
 // One explicit command can be continued using its durable receipt. Bound each Worker request.
 let attempted=0;
 for(const current of a.files){
  if(current.state==='trashed'||(a.kind==='job'&&current.state==='verified'))continue;if(attempted>=5)break;
  const claim=await driveRpc<{claimed:boolean;file:DriveFile}>(env,'ar_drive_file_claim',{p_owner:a.owner,p_archive:a.id,p_ordinal:current.ordinal,p_claim:crypto.randomUUID()});if(!claim.claimed)continue;attempted++;
  const f=claim.file;
  try{
   if(a.kind==='job'&&(await verifyFolder(token,a.folder_id)).visibility!=='restricted')throw Error('drive_target_not_private');
   if(!f.drive_file_id){f.drive_file_id=await generateId(token);await mutate(env,a,f,'id',{id:f.drive_file_id});}
   // A previous create may have completed even if its response/receipt was lost. Never replace it.
   const existing=await metadata(token,f.drive_file_id);if(existing){verifyMetadata(existing,a,f,a.kind==='test');await finishVerified(env,token,a,f);continue;}
   let session=f.session?(await unseal<{url:string}>(env.GMAIL_TOKEN_KEY!,`drive-upload:${a.id}:${f.ordinal}`,f.session)).url:null;
   let offset=0;
   if(session){const position=await uploadPosition(token,session,f.byte_count);if(position.complete){await finishVerified(env,token,a,f);continue;}offset=position.offset;if(position.expired){session=null;await mutate(env,a,f,'session',null);}}
   if(!session){session=await beginUpload(token,a,f);if(!session){await finishVerified(env,token,a,f);continue;}await mutate(env,a,f,'session',await seal(env.GMAIL_TOKEN_KEY!,`drive-upload:${a.id}:${f.ordinal}`,{url:session}));}
   const bytes=await source(env,a,f,offset);await uploadStream(token,session,bytes,offset,f.byte_count);await finishVerified(env,token,a,f);
  }catch(error){try{await mutate(env,a,f,'error',{error:safeError(error)});}catch{/* The claimed immutable ID remains authoritative even if database persistence failed. */}}
 }
 return driveRpc<Archive>(env,'ar_drive_archive_read',{p_owner:a.owner,p_archive:a.id});
}
