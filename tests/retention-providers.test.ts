import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../worker/drive/oauth',()=>({driveToken:async()=> 'synthetic-provider-token'}));
import {retentionProviders} from '../worker/operations/retention-providers';
import type {RetentionTarget} from '../worker/operations/retention';
const actor='00000000-0000-4000-8000-000000000001',item='00000000-0000-4000-8000-000000000002',claim='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-only'};
const bytes=new TextEncoder().encode('synthetic evidence');
const base={owner:actor,byteCount:bytes.length,sha256:''};
async function storageTarget():Promise<RetentionTarget>{return {...base,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),store:'supabase',objectId:item,bucket:'ar-working-files',key:`jobs/${item}/originals/${claim}.pdf`,updatedAt:'2026-01-01T00:00:00Z',etag:'synthetic'};}
afterEach(()=>vi.unstubAllGlobals());
it('checks exact Storage identity and bytes, deletes one key, then proves metadata absence',async()=>{
 const target=await storageTarget(),calls:string[]=[];let deleted=false;
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const u=new URL(String(input));calls.push((init.method??'GET')+' '+u.pathname);expect(init.redirect).toBe('manual');
  if(u.pathname.endsWith('ar_retention_inspect'))return Response.json(deleted?{state:'absent'}:{state:'present',identityVerified:true});
  if(u.pathname.endsWith('ar_retention_delete_ack'))return Response.json({acknowledged:true});
  if(init.method==='DELETE'){expect(JSON.parse(String(init.body))).toEqual({prefixes:[target.store==='supabase'?target.key:'']});deleted=true;return Response.json([]);}
  return new Response(bytes);
 });
 const p=retentionProviders(env,actor,item,claim).supabase;expect(await p.inspect(target)).toEqual({state:'present',identityVerified:true});await p.remove(target);expect(await p.inspect(target)).toEqual({state:'absent'});expect(calls.filter(c=>c.startsWith('DELETE'))).toHaveLength(1);
});
it('changed Storage metadata stops deletion before the provider write',async()=>{const target=await storageTarget();const f=vi.fn(async()=>Response.json({state:'present',identityVerified:false}));vi.stubGlobal('fetch',f);const p=retentionProviders(env,actor,item,claim).supabase;await expect(p.remove(target)).rejects.toThrow('retention_identity_mismatch');expect(f.mock.calls).toHaveLength(1);});
const driveTarget:RetentionTarget={...base,sha256:'a'.repeat(64),store:'drive',objectId:'syntheticDriveFileId',parentId:'syntheticParentFolder',archiveId:item,jobId:claim,documentRevision:1,ordinal:0};
function driveSetup({absent=false,acknowledged=false,mismatch=false}={}){
 let gone=absent,acked=acknowledged;const writes:string[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const u=new URL(String(input));expect(init.redirect).toBe('manual');
  if(u.pathname.endsWith('ar_retention_inspect'))return Response.json({deleteAcknowledged:acked});
  if(u.pathname.endsWith('ar_retention_delete_ack')){acked=true;return Response.json({acknowledged:true});}
  if(u.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'ar@katathani.com'}});
  if(u.pathname.endsWith('/permissions'))return Response.json({permissions:[{type:'user',role:'owner',emailAddress:'ar@katathani.com'}]});
  if(u.pathname.endsWith('/syntheticParentFolder'))return Response.json({id:'syntheticParentFolder',mimeType:'application/vnd.google-apps.folder',trashed:false,owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true}});
  if(init.method==='DELETE'){writes.push(u.pathname);gone=true;return new Response(null,{status:204});}
  if(gone)return new Response(null,{status:404});
  return Response.json({id:'syntheticDriveFileId',mimeType:'application/pdf',trashed:false,parents:['syntheticParentFolder'],owners:[{emailAddress:'ar@katathani.com'}],size:String(bytes.length),sha256Checksum:'a'.repeat(64),appProperties:{ar_owner:actor,ar_archive:item,ar_job:claim,ar_revision:'1',ar_test:'false',ar_sha256:mismatch?'b'.repeat(64):'a'.repeat(64),ar_ordinal:'0'}});
 });return writes;
}
it('Drive 404 is unknown without an acknowledged deletion',async()=>{driveSetup({absent:true});expect(await retentionProviders(env,actor,item,claim).drive.inspect(driveTarget)).toEqual({state:'unknown'});});
it('Drive verifies receipt properties and restricted owner folder before deletion',async()=>{const writes=driveSetup();const p=retentionProviders(env,actor,item,claim).drive;expect(await p.inspect(driveTarget)).toEqual({state:'present',identityVerified:true});await p.remove(driveTarget);expect(await p.inspect(driveTarget)).toEqual({state:'absent'});expect(writes).toEqual(['/drive/v3/files/syntheticDriveFileId']);});
it('Drive checksum/property mismatch never deletes a file',async()=>{const writes=driveSetup({mismatch:true});const p=retentionProviders(env,actor,item,claim).drive;expect(await p.inspect(driveTarget)).toEqual({state:'present',identityVerified:false});await expect(p.remove(driveTarget)).rejects.toThrow('retention_identity_mismatch');expect(writes).toHaveLength(0);});
it('cross-owner target is rejected before reading provider credentials',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);await expect(retentionProviders(env,actor,item,claim).drive.remove({...driveTarget,owner:claim})).rejects.toThrow('retention_forbidden');expect(f).not.toHaveBeenCalled();});
