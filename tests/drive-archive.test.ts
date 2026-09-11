import {afterEach,expect,it,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {byteRangeStream,runArchive,syntheticPdf} from '../worker/drive/archive';
import {hash,seal} from '../worker/email/crypto';
import {properties,type Metadata} from '../worker/drive/provider';
import {archiveView,type Archive,type DriveFile} from '../worker/drive/shared';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret',GMAIL_TOKEN_KEY:'11'.repeat(32)};
const owner='00000000-0000-4000-8000-000000000001',job='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
interface Options {kind?:'job'|'test';loseUploadResponse?:boolean;loseTrashResponse?:boolean;conflictOnBegin?:boolean;expiredSession?:boolean;wrongChecksum?:boolean;evilSession?:boolean;publicFolder?:boolean;resume?:boolean;noClaim?:boolean;sourceTooLong?:boolean;count?:number;failOrdinal?:number}
async function harness(options:Options={}){
 // Node has no Workers FixedLengthStream; preserve its exact-length stream contract in these provider mocks.
 vi.stubGlobal('FixedLengthStream',class extends TransformStream<Uint8Array,Uint8Array>{constructor(size:number){let written=0;super({transform(chunk,c){written+=chunk.length;if(written>size)throw Error('drive_source_changed');c.enqueue(chunk);},flush(){if(written!==size)throw Error('drive_source_changed');}});}});
 const bytes=syntheticPdf();const sha=await hash(bytes);const files:DriveFile[]=Array.from({length:options.count??1},(_,ordinal)=>({archive_id:id,ordinal,name:'Synthetic reviewed '+ordinal+'.pdf',storage_key:`jobs/${job}/exports/00000000-0000-4000-8000-00000000000${ordinal}.pdf`,byte_count:bytes.length,sha256:sha,drive_file_id:options.resume?'SyntheticFile000001':null,state:'pending',session:null,claim_token:null,url:null,error_code:null,read_verified:false}));
 const a:Archive={id,owner,kind:options.kind??'job',document_job_id:options.kind==='test'?null:job,document_revision:options.kind==='test'?null:1,target_revision:1,folder_id:'SyntheticFolder00001',created_at:'2026-01-01',files};
 const session='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic';
 if(options.resume)files[0].session=await seal(env.GMAIL_TOKEN_KEY,`drive-upload:${id}:0`,{url:session});
 const remote=new Map<string,Metadata>();const calls:{url:string;method:string;body?:unknown}[]=[];let uploads=0,generates=0,creates=0,trash=0;let metadataBody:Record<string,unknown>|null=null;
 const fetcher=vi.fn(async(input:string|URL,init:RequestInit={})=>{
  const url=String(input),method=init.method??'GET';const body=typeof init.body==='string'&&init.body.startsWith('{')?JSON.parse(init.body):init.body;calls.push({url,method,body});expect(init.redirect).toBe('manual');
  if(url.includes('/rpc/')){
   const p=body as Record<string,unknown>;
   if(url.endsWith('/ar_drive_archive_read'))return Response.json(a);
   const f=files[Number(p.p_ordinal)];
   if(url.endsWith('/ar_drive_file_claim')){if(options.noClaim)return Response.json({claimed:false,file:f});f.claim_token=String(p.p_claim);return Response.json({claimed:true,file:f});}
   if(url.endsWith('/ar_drive_file_update')){expect(p.p_claim).toBe(f.claim_token);const value=p.p_value as Record<string,unknown>;
    switch(p.p_action){case 'id':expect(f.drive_file_id).toBeNull();f.drive_file_id=String(value.id);break;case 'session':f.session=value?{iv:String(value.iv),data:String(value.data)}:null;break;case 'verified':f.state='verified';f.url=typeof value.url==='string'?value.url:null;f.read_verified=value.readVerified===true;break;case 'trashed':expect(f.read_verified).toBe(true);f.state='trashed';f.url=null;break;case 'error':f.state='error';f.error_code=String(value.error);break;default:throw Error('Unexpected mutation');}return Response.json(true);
   }throw Error('Unexpected RPC');
  }
  expect(new Headers(init.headers).get('Authorization')).toBe(url.includes('/storage/')?null:'Bearer synthetic-token');
  if(url.includes('/storage/'))return new Response(options.sourceTooLong?new Uint8Array(bytes.length+1):new Uint8Array(bytes));
  if(url.includes('/files/generateIds')){generates++;return Response.json({ids:['SyntheticFile00000'+generates]});}
  if(url.includes('/permissions?'))return Response.json({permissions:[options.publicFolder?{type:'anyone',role:'writer'}:{type:'user',role:'owner',emailAddress:'ar@katathani.com'}]});
  if(url.includes('/files/'+a.folder_id+'?'))return Response.json({id:a.folder_id,mimeType:'application/vnd.google-apps.folder',trashed:false,owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true}});
  if(url.includes('/upload/')){
   if(method==='POST'){creates++;metadataBody=body as Record<string,unknown>;expect(files.some(f=>f.drive_file_id===metadataBody?.id)).toBe(true);if(options.conflictOnBegin){const f=files.find(f=>f.drive_file_id===metadataBody?.id)!;remote.set(f.drive_file_id!,{id:f.drive_file_id!,mimeType:'application/pdf',trashed:false,size:String(f.byte_count),parents:[a.folder_id],owners:[{emailAddress:'ar@katathani.com'}],appProperties:properties(a,f),sha256Checksum:sha,webViewLink:'https://drive.google.com/file/d/'+f.drive_file_id+'/view'});return new Response(null,{status:409});}return new Response(null,{status:200,headers:{Location:options.evilSession?'https://evil.example.test/upload':session}});}
   const contentRange=new Headers(init.headers).get('Content-Range');if(contentRange?.startsWith('bytes */'))return options.expiredSession?new Response(null,{status:404}):new Response(null,{status:308,headers:{Range:'bytes=0-9'}});
   uploads++;const fid=String(metadataBody?.id??files[0].drive_file_id),f=files.find(x=>x.drive_file_id===fid)!;
   expect(f.session).not.toBeNull();const offset=options.resume&&!options.expiredSession?10:0;const content=new Uint8Array(await new Response(init.body).arrayBuffer());expect(content).toEqual(bytes.subarray(offset));expect(contentRange).toBe(`bytes ${offset}-${bytes.length-1}/${bytes.length}`);
   const m:Metadata={id:fid,mimeType:'application/pdf',trashed:false,name:f.name,size:String(bytes.length),parents:[a.folder_id],owners:[{emailAddress:'ar@katathani.com'}],appProperties:properties(a,f),sha256Checksum:options.wrongChecksum||options.failOrdinal===f.ordinal?'f'.repeat(64):sha,webViewLink:'https://drive.google.com/file/d/'+fid+'/view',capabilities:{canTrash:true}};remote.set(fid,m);
   if(options.loseUploadResponse&&uploads===1)throw Error('Synthetic connection lost after provider commit');return Response.json(m);
  }
  const fid=/\/files\/([\w-]+)\?/.exec(url)?.[1];if(!fid)throw Error('Unexpected provider request');
  if(url.includes('alt=media'))return new Response(new Uint8Array(bytes));
  if(method==='PATCH'){expect(a.kind).toBe('test');expect(files.find(f=>f.drive_file_id===fid)?.read_verified).toBe(true);expect(body).toEqual({trashed:true});trash++;remote.set(fid,{...remote.get(fid),trashed:true});if(options.loseTrashResponse&&trash===1)throw Error('Synthetic connection lost after trash');return Response.json({id:fid,trashed:true});}
  return remote.has(fid)?Response.json(remote.get(fid)):new Response(null,{status:404});
 });vi.stubGlobal('fetch',fetcher);
 return {a,remote,calls,fetcher,run:()=>runArchive(env,'synthetic-token',structuredClone(a)),stats:()=>({uploads,generates,creates,trash})};
}
afterEach(()=>vi.unstubAllGlobals());
it('creates a valid deterministic generic PDF with no clock or account input',async()=>{const bytes=syntheticPdf();expect(bytes).toEqual(syntheticPdf());expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);expect(new TextDecoder().decode(bytes)).toContain('no customer data');});
it('persists a generated ID and encrypted session before streaming and verifies a complete export',async()=>{const h=await harness();const result=await h.run();expect(archiveView(result).state).toBe('verified');expect(h.stats()).toEqual({uploads:1,generates:1,creates:1,trash:0});expect(h.calls.some(c=>c.url.includes('/storage/'))).toBe(true);expect(h.calls.filter(c=>c.method==='PATCH')).toHaveLength(0);});
it('recovers a lost upload response by verifying the exact persisted ID without another create',async()=>{const h=await harness({loseUploadResponse:true});expect(archiveView(await h.run()).state).toBe('error');expect(h.a.files[0].drive_file_id).not.toBeNull();const result=await h.run();expect(archiveView(result).state).toBe('verified');expect(h.stats()).toEqual({uploads:1,generates:1,creates:1,trash:0});});
it('refuses to mark a checksum mismatch verified and never overwrites the mismatched existing object',async()=>{const h=await harness({wrongChecksum:true});expect(archiveView(await h.run()).state).toBe('error');expect(h.a.files[0].error_code).toBe('drive_checksum_mismatch');await h.run();expect(h.stats()).toEqual({uploads:1,generates:1,creates:1,trash:0});expect(h.a.files[0].state).toBe('error');});
it('resumes the saved upload session using its acknowledged byte offset without another ID or create',async()=>{const h=await harness({resume:true});expect(archiveView(await h.run()).state).toBe('verified');expect(h.stats()).toEqual({uploads:1,generates:0,creates:0,trash:0});});
it('restarts an expired session using the same persisted Drive ID',async()=>{const h=await harness({resume:true,expiredSession:true});expect(archiveView(await h.run()).state).toBe('verified');expect(h.stats()).toEqual({uploads:1,generates:0,creates:1,trash:0});expect(h.a.files[0].drive_file_id).toBe('SyntheticFile000001');});
it('handles a 409 create response by reading and verifying the existing exact ID',async()=>{const h=await harness({conflictOnBegin:true});expect(archiveView(await h.run()).state).toBe('verified');expect(h.stats()).toEqual({uploads:0,generates:1,creates:1,trash:0});expect(h.calls.some(c=>c.url.includes('/storage/'))).toBe(false);});
it('never follows an attacker upload Location or sends private PDF bytes to it',async()=>{const h=await harness({evilSession:true});await h.run();expect(h.a.files[0].error_code).toBe('drive_unsafe_upload_url');expect(h.stats().uploads).toBe(0);expect(h.calls.some(c=>c.url.includes('evil.example.test')||c.url.includes('/storage/'))).toBe(false);});
it('checks current permissions before each business file and denies newly public targets',async()=>{const h=await harness({publicFolder:true});await h.run();expect(h.a.files[0].error_code).toBe('drive_target_not_private');expect(h.stats()).toEqual({uploads:0,generates:0,creates:0,trash:0});});
it('honors an existing claim without making any Drive request',async()=>{const h=await harness({noClaim:true});await h.run();expect(h.calls.every(c=>c.url.includes('/rpc/'))).toBe(true);});
it('uploads, downloads and verifies only the synthetic file before trashing its exact ID',async()=>{const h=await harness({kind:'test'});expect(archiveView(await h.run()).state).toBe('cleaned');expect(h.stats()).toEqual({uploads:1,generates:1,creates:1,trash:1});expect(h.calls.some(c=>c.url.includes('alt=media'))).toBe(true);const before=h.calls.length;await h.run();expect(h.calls.slice(before).every(c=>c.url.includes('/rpc/'))).toBe(true);expect(h.stats().trash).toBe(1);});
it('recovers a lost trash response using the durable synthetic read receipt without another create or PATCH',async()=>{const h=await harness({kind:'test',loseTrashResponse:true});expect(archiveView(await h.run()).state).toBe('error');expect(h.a.files[0].read_verified).toBe(true);expect(archiveView(await h.run()).state).toBe('cleaned');expect(h.stats()).toEqual({uploads:1,generates:1,creates:1,trash:1});});
it('keeps a successful file visible when another export fails verification',async()=>{const h=await harness({count:2,failOrdinal:1});const v=archiveView(await h.run());expect(v.state).toBe('partial');expect(v.files[0].state).toBe('verified');expect(v.files[1].state).toBe('error');expect(v.files[1].error).toBe('drive_checksum_mismatch');});
it('bounds each request while retaining and then completing the entire export set',async()=>{const h=await harness({count:6});const v=archiveView(await h.run());expect(v.state).toBe('partial');expect(v.files).toHaveLength(6);expect(h.stats().uploads).toBe(5);expect(archiveView(await h.run()).state).toBe('verified');expect(h.stats().uploads).toBe(6);});
it('does not accept a shorter, longer or forged source stream',async()=>{
 for(const size of [2,4]){const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(3));c.close();}});await expect(new Response(byteRangeStream(stream,0,size)).arrayBuffer()).rejects.toThrow('drive_source_changed');}
 const h=await harness({sourceTooLong:true});await h.run();expect(h.a.files[0].error_code).toBe('drive_source_changed');expect(h.remote.size).toBe(0);expect(h.a.files[0].state).toBe('error');
});
