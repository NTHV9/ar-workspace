import {afterEach,expect,it,vi} from 'vitest';
import {transferWorkbook,transferInput} from './fixtures/tracker-transfer';
import {parseTrackerWorkbook} from '../worker/tracker-sync/workbook';
import {readTrackerWorkbook,writeTrackerTransfers} from '../worker/tracker-sync/provider';
import type {TrackerEnv} from '../worker/tracker-sync/service';
vi.mock('../worker/drive/oauth',()=>({driveToken:vi.fn(async()=> 'synthetic-token')}));
vi.mock('../worker/drive/provider',async original=>({...await original<typeof import('../worker/drive/provider')>(),identity:vi.fn(async()=> 'ar@katathani.com')}));
const file='synthetic_transfer_workbook_12345';
const env:TrackerEnv={REPORT_SHEET_PHUKET_ID:file,TRACKER_BLOB_CAS_ENABLED:'true',TRACKER_TRANSFER_IDENTITY_ENABLED:'true'};
function provider(options:{lost?:boolean;stale?:boolean;noTag?:boolean}={}){
 let bytes=transferWorkbook(),tag='"tag-1"',version=1;const writes:RequestInit[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{
  const u=new URL(String(input));expect(u.origin).toBe('https://www.googleapis.com');
  if(u.pathname.startsWith('/upload/')){
   writes.push(init);expect(new Headers(init.headers).get('If-Match')).toBe('"tag-1"');
   if(options.stale)return new Response(null,{status:412});
   bytes=Uint8Array.from(init.body as Uint8Array);tag='"tag-2"';version++;
   if(options.lost)throw Error('lost');
   return Response.json({id:file});
  }
  if(u.pathname.startsWith('/drive/v2/'))return Response.json({id:file,title:'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',etag:options.noTag?undefined:tag});
  if(u.searchParams.get('alt')==='media')return new Response(bytes as BodyInit);
  return Response.json({id:file,name:'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',trashed:false,version:String(version),modifiedTime:'2026-11-11T00:00:00Z',size:String(bytes.length),capabilities:{canDownload:true,canEdit:true,canModifyContent:true}});
 }));
 return {writes,bytes:()=>bytes};
}
afterEach(()=>vi.unstubAllGlobals());
it('uses one conditional upload and full-byte readback to confirm a transfer',async()=>{
 const h=provider(),snapshot=await readTrackerWorkbook(env,'owner','phuket',file);
 expect(await writeTrackerTransfers(env,'owner','phuket',file,[{...transferInput,version:snapshot.version}])).toMatchObject({status:'written',mutationStarted:true,version:'v2:"tag-2"'});
 expect(h.writes).toHaveLength(1);
 expect(parseTrackerWorkbook(h.bytes(),'phuket').rows[0]).toMatchObject({agent:transferInput.agent,accountNo:transferInput.accountNo,rowKey:transferInput.newRowKey,fields:{S:'30',R:null}});
});
it('a lost upload reply remains uncertain and does not retry the PUT',async()=>{
 const h=provider({lost:true}),snapshot=await readTrackerWorkbook(env,'owner','phuket',file);
 expect(await writeTrackerTransfers(env,'owner','phuket',file,[{...transferInput,version:snapshot.version}])).toMatchObject({status:'uncertain',mutationStarted:true});
 expect(h.writes).toHaveLength(1);
 const after=await readTrackerWorkbook(env,'owner','phuket',file);
 expect(after.rows[0].rowKey).toBe(transferInput.newRowKey);
});
it.each([{noTag:true},{stale:true}])('keeps CAS and permission boundaries for %j',async options=>{
 const h=provider(options),snapshot=await readTrackerWorkbook(env,'owner','phuket',file);
 expect(await writeTrackerTransfers(env,'owner','phuket',file,[{...transferInput,version:snapshot.version}])).toMatchObject({status:'conflict',mutationStarted:false});
 expect(h.writes).toHaveLength(options.noTag?0:1);expect(parseTrackerWorkbook(h.bytes(),'phuket').rows[0].rowKey).toBe(transferInput.rowKey);
});
it('does not grant transfer publication through the ordinary date writer or default-disabled flag',async()=>{
 const h=provider();
 expect(await writeTrackerTransfers({...env,TRACKER_TRANSFER_IDENTITY_ENABLED:'false'},'owner','phuket',file,[transferInput])).toMatchObject({status:'conflict',mutationStarted:false});
 expect(h.writes).toHaveLength(0);
});
