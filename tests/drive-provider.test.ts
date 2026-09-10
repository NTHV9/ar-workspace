import {afterEach,expect,it,vi} from 'vitest';
import {beginUpload,google,properties,trashTest,trustedSession,uploadPosition,verifyFolder,verifyMetadata,type Metadata} from '../worker/drive/provider';
import {archiveView,type Archive,type DriveFile} from '../worker/drive/shared';
const a:Archive={id:'00000000-0000-4000-8000-000000000001',owner:'00000000-0000-4000-8000-000000000002',kind:'job',document_job_id:'00000000-0000-4000-8000-000000000003',document_revision:1,target_revision:1,folder_id:'SyntheticFolder00001',created_at:'2026-01-01',files:[]};
const f:DriveFile={archive_id:a.id,ordinal:0,name:'Synthetic.pdf',storage_key:null,byte_count:20,sha256:'a'.repeat(64),drive_file_id:'SyntheticDrive000001',state:'pending',session:null,claim_token:null,url:null,error_code:null,read_verified:false};
const meta=():Metadata=>({id:f.drive_file_id!,mimeType:'application/pdf',parents:[a.folder_id],trashed:false,size:'20',sha256Checksum:f.sha256,owners:[{emailAddress:'ar@katathani.com'}],appProperties:properties(a,f),webViewLink:'https://drive.google.com/file/d/'+f.drive_file_id+'/view'});
afterEach(()=>vi.unstubAllGlobals());
it('requires matching ID, parent, mime, owner metadata, byte count and provider SHA256',()=>{
 expect(verifyMetadata(meta(),a,f)).toContain('https://drive.google.com/');
 for(const change of [{id:'OtherSynthetic00001'},{parents:['WrongFolder00001']},{mimeType:'application/octet-stream'},{size:'21'},{appProperties:{}},{owners:[{emailAddress:'other@example.test'}]},{trashed:true}])expect(()=>verifyMetadata({...meta(),...change},a,f)).toThrow('drive_metadata_mismatch');
 expect(()=>verifyMetadata({...meta(),sha256Checksum:'b'.repeat(64)},a,f)).toThrow('drive_checksum_mismatch');expect(()=>verifyMetadata({...meta(),sha256Checksum:undefined},a,f)).toThrow('drive_checksum_mismatch');
 expect(verifyMetadata({...meta(),webViewLink:'https://evil.example.test/'},a,f)).toBeNull();
});
it('accepts Shared Drive file metadata without inventing an owner',()=>{expect(verifyMetadata({...meta(),owners:undefined,driveId:'SyntheticShared00001'},a,f)).toContain('https://drive.google.com/');});
it('rejects hostile or redirected upload destinations before transmitting credentials',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const u of ['http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x','https://evil.example.test/upload/drive/v3/files?uploadType=resumable&upload_id=x','https://www.googleapis.com/other?uploadType=resumable&upload_id=x','https://www.googleapis.com:444/upload/drive/v3/files?uploadType=resumable&upload_id=x','https://user@www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x','https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable','https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x#fragment'])expect(()=>trustedSession(u)).toThrow('drive_unsafe_upload_url');
 await expect(google('https://evil.example.test/drive/v3/files','token')).rejects.toThrow('drive_unsafe_upload_url');expect(fetcher).not.toHaveBeenCalled();
 fetcher.mockResolvedValue(new Response(null,{status:200,headers:{Location:'https://evil.example.test/upload'}}));await expect(beginUpload('token',a,f)).rejects.toThrow('drive_unsafe_upload_url');expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
});
it('reads all permission pages and reports later-page public access',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:URL|string)=>{const u=String(url);calls.push(u);if(!u.includes('/permissions?'))return Response.json({id:a.folder_id,mimeType:'application/vnd.google-apps.folder',name:'Synthetic folder',trashed:false,owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true}});if(!u.includes('pageToken='))return Response.json({permissions:[{type:'user',role:'owner',emailAddress:'ar@katathani.com'}],nextPageToken:'page-two'});return Response.json({permissions:[{type:'anyone',role:'writer'}]});});
 expect((await verifyFolder('token',a.folder_id)).visibility).toBe('public');expect(calls).toHaveLength(3);expect(calls.every(u=>u.includes('supportsAllDrives=true'))).toBe(true);
});
it('never calls missing permission details restricted, and rejects shortcuts, trashed and nonwritable folders',async()=>{
 vi.stubGlobal('fetch',async(url:URL|string)=>String(url).includes('/permissions?')?Response.json({}):Response.json({id:a.folder_id,mimeType:'application/vnd.google-apps.folder',trashed:false,driveId:'SyntheticShared00001',capabilities:{canAddChildren:true}}));expect((await verifyFolder('token',a.folder_id)).visibility).toBe('unknown');
 for(const extra of [{mimeType:'application/vnd.google-apps.shortcut'},{trashed:true},{capabilities:{canAddChildren:false}}]){vi.stubGlobal('fetch',async()=>Response.json({id:a.folder_id,mimeType:'application/vnd.google-apps.folder',trashed:false,owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true},...extra}));await expect(verifyFolder('token',a.folder_id)).rejects.toThrow('drive_folder_unavailable');}
});
it('uses resumable Range evidence and does not follow a 308 response Location',async()=>{
 const fn=vi.fn().mockResolvedValue(new Response(null,{status:308,headers:{Range:'bytes=0-9',Location:'https://evil.example.test/'}}));vi.stubGlobal('fetch',fn);expect(await uploadPosition('token','https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic',20)).toEqual({complete:false,offset:10,expired:false});expect(fn).toHaveBeenCalledTimes(1);expect(fn.mock.calls[0][1].redirect).toBe('manual');
});
it('refuses every business-file cleanup and reports partial outputs honestly',async()=>{
 const fn=vi.fn();vi.stubGlobal('fetch',fn);await expect(trashTest('token',a,f)).rejects.toThrow('drive_forbidden');expect(fn).not.toHaveBeenCalled();
 const view=archiveView({...a,files:[{...f,state:'verified',url:'https://drive.google.com/file/d/synthetic/view'},{...f,ordinal:1,state:'error',error_code:'drive_checksum_mismatch'}]});expect(view.state).toBe('partial');expect(view.files[0].url).toContain('drive.google.com');expect(view.files[1].url).toBeNull();expect(JSON.stringify(view)).not.toContain('session');
});
