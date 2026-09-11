import {afterEach,expect,it,vi} from 'vitest';
import {driveApi} from '../worker/drive/api';
import {seal} from '../worker/email/crypto';
import {driveScope,type Target} from '../worker/drive/shared';
const owner='00000000-0000-4000-8000-000000000001',job='00000000-0000-4000-8000-000000000002',command='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret',GMAIL_CLIENT_ID:'synthetic-client',GMAIL_CLIENT_SECRET:'synthetic-oauth-secret',GMAIL_TOKEN_KEY:'11'.repeat(32),GOOGLE_PICKER_BROWSER_KEY:'synthetic-public-browser-key',GOOGLE_PROJECT_NUMBER:'1234567890'};
const t:Target={owner,folder_id:'SyntheticFolder00001',revision:1,name:'Synthetic destination',verified_at:'2026-01-01',visibility:'restricted',drive_id:null};
function post(path:string,body:unknown,origin='https://app.test'){return new Request('https://app.test'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});}
afterEach(()=>vi.unstubAllGlobals());
it('rejects missing actors, unconfirmed commands and cross-origin writes before any provider call',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);expect((await driveApi(new Request('https://app.test/api/drive/status'),env,'')).status).toBe(403);
 for(const path of ['/api/drive/test',`/api/drive/jobs/${job}`])expect((await driveApi(post(path,{commandId:command,documentRevision:1}),env,owner)).status).toBe(400);
 expect((await driveApi(post('/api/drive/connect',{},'https://evil.example.test'),env,owner)).status).toBe(403);expect(f).not.toHaveBeenCalled();
});
it('returns only authenticated public Picker configuration and never reads provider tokens',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json(t));vi.stubGlobal('fetch',f);const r=await driveApi(new Request('https://app.test/api/drive/config'),env,owner);
 expect(await r.json()).toEqual({clientId:env.GMAIL_CLIENT_ID,browserKey:env.GOOGLE_PICKER_BROWSER_KEY,projectNumber:env.GOOGLE_PROJECT_NUMBER,scope:driveScope,folderId:t.folder_id});expect(f).toHaveBeenCalledTimes(1);expect(f.mock.calls[0][0]).toContain('/ar_drive_target_get');
});
it('returns no archive for an owned unsaved revision zero without attempting an upload',async()=>{const f=vi.fn().mockResolvedValue(Response.json(null));vi.stubGlobal('fetch',f);const r=await driveApi(new Request(`https://app.test/api/drive/jobs/${job}?revision=0`),env,owner);expect(await r.json()).toEqual({archive:null});expect(f).toHaveBeenCalledTimes(1);expect(f.mock.calls[0][0]).toContain('/ar_drive_archive_get');});
it('rejects a Picker-selected folder different from the confirmed destination before Google access',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json(t));vi.stubGlobal('fetch',f);const r=await driveApi(post('/api/drive/verify-folder',{folderId:'WrongSyntheticFolder'}),env,owner);expect(r.status).toBe(400);expect(await r.json()).toEqual({error:'drive_folder_mismatch'});expect(f).toHaveBeenCalledTimes(1);
});
it('clears reported readiness after a fresh folder read fails despite its cached verification',async()=>{
 const payload=await seal(env.GMAIL_TOKEN_KEY,'drive:'+owner,{access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:Date.now()+3600000});
 vi.stubGlobal('fetch',async(url:string|URL)=>{const u=String(url);if(u.endsWith('/ar_drive_target_get'))return Response.json(t);if(u.endsWith('/ar_drive_connection_get'))return Response.json({email:'ar@katathani.com',scope:driveScope,revision:1,payload});if(u.includes('/about?'))return Response.json({user:{emailAddress:'ar@katathani.com'}});return new Response('synthetic inaccessible folder',{status:404});});
 const r=await driveApi(new Request('https://app.test/api/drive/status'),env,owner);expect(await r.json()).toMatchObject({configured:true,connected:true,email:'ar@katathani.com',folder:{id:t.folder_id,ready:false,verifiedAt:t.verified_at},error:'drive_folder_unavailable',cleanupDisabled:true});
});
it('rejects public target business archives after fresh permission verification',async()=>{
 const payload=await seal(env.GMAIL_TOKEN_KEY,'drive:'+owner,{access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:Date.now()+3600000});const calls:string[]=[];
 vi.stubGlobal('fetch',async(url:string|URL)=>{const u=String(url);calls.push(u);if(u.endsWith('/ar_document_get'))return Response.json({id:job,owner,lifecycle:'legacy'});if(u.endsWith('/ar_drive_target_get'))return Response.json(t);if(u.endsWith('/ar_drive_connection_get'))return Response.json({email:'ar@katathani.com',scope:driveScope,revision:1,payload});if(u.includes('/about?'))return Response.json({user:{emailAddress:'ar@katathani.com'}});if(u.includes('/permissions?'))return Response.json({permissions:[{type:'anyone',role:'reader'}]});if(u.endsWith('/ar_drive_target_verify'))return Response.json({...t,visibility:'public'});if(u.includes('/files/'))return Response.json({id:t.folder_id,mimeType:'application/vnd.google-apps.folder',trashed:false,owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true}});throw Error('unexpected write');});
 const r=await driveApi(post('/api/drive/jobs/'+job,{commandId:command,documentRevision:1,expectedTargetRevision:1,confirmed:true}),env,owner);expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'drive_target_not_private'});expect(calls.some(u=>u.includes('ar_drive_archive_open')||u.includes('/upload/')||u.includes('/storage/'))).toBe(false);
});
it('requires the confirmed target revision and rejects stale confirmations before any Google request',async()=>{
 const f=vi.fn().mockImplementation(async()=>Response.json({...t,revision:2}));vi.stubGlobal('fetch',f);
 for(const path of ['/api/drive/test','/api/drive/jobs/'+job]){
  expect((await driveApi(post(path,{commandId:command,documentRevision:1,confirmed:true}),env,owner)).status).toBe(400);
  const r=await driveApi(post(path,{commandId:command,documentRevision:1,expectedTargetRevision:1,confirmed:true}),env,owner);expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'drive_target_changed'});
 }expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls.every(c=>String(c[0]).endsWith('ar_drive_target_get'))).toBe(true);
});
it('passes the reviewed target revision into the locked command RPC and honors a concurrent target change',async()=>{
 const payload=await seal(env.GMAIL_TOKEN_KEY,'drive:'+owner,{access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:Date.now()+3600000});const calls:string[]=[];
 vi.stubGlobal('fetch',async(url:string|URL,init?:RequestInit)=>{const u=String(url);calls.push(u);if(u.endsWith('/ar_document_get'))return Response.json({id:job,owner,lifecycle:'legacy'});if(u.endsWith('/ar_drive_target_get')||u.endsWith('/ar_drive_target_verify'))return Response.json(t);if(u.endsWith('/ar_drive_connection_get'))return Response.json({email:'ar@katathani.com',scope:driveScope,revision:1,payload});if(u.includes('/about?'))return Response.json({user:{emailAddress:'ar@katathani.com'}});if(u.includes('/permissions?'))return Response.json({permissions:[{type:'user',role:'owner',emailAddress:'ar@katathani.com'}]});if(u.includes('/files/'))return Response.json({id:t.folder_id,mimeType:'application/vnd.google-apps.folder',trashed:false,owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true}});if(u.endsWith('/ar_drive_archive_open')){expect(JSON.parse(String(init?.body)).p_expected_target_revision).toBe(1);return Response.json({error:'drive_target_changed'});}throw Error('unexpected write');});
 for(const path of ['/api/drive/test','/api/drive/jobs/'+job]){const r=await driveApi(post(path,{commandId:command,documentRevision:1,expectedTargetRevision:1,confirmed:true}),env,owner);expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'drive_target_changed'});}expect(calls.some(u=>u.includes('/upload/')||u.includes('/storage/')||u.includes('/ar_drive_file_claim'))).toBe(false);
});
it('keeps raw database/provider errors and credentials out of all error responses',async()=>{
 vi.stubGlobal('fetch',async()=>new Response('synthetic-provider-secret raw database detail',{status:500}));const r=await driveApi(new Request('https://app.test/api/drive/status'),env,owner);expect(await r.text()).toBe('{"error":"drive_unavailable"}');
});
