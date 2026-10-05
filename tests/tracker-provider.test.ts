import {afterEach,expect,it,vi} from 'vitest';
import {fixture,identity as rowIdentity} from './fixtures/tracker-workbook';
import {parseTrackerWorkbook,patchTrackerWorkbook} from '../worker/tracker-sync/workbook';
import {readTrackerWorkbook,writeTrackerCells,writeTrackerBatch} from '../worker/tracker-sync/provider';
import type {TrackerEnv,ProviderWrite} from '../worker/tracker-sync/service';
vi.mock('../worker/drive/oauth',()=>({driveToken:vi.fn(async()=> 'synthetic-token')}));
vi.mock('../worker/drive/provider',async importOriginal=>({...await importOriginal<typeof import('../worker/drive/provider')>(),identity:vi.fn(async()=> 'ar@katathani.com')}));
const fileId='SyntheticOriginalTracker00001',nativeId='SyntheticNativeTracker00002',owner='synthetic-owner';
const env={REPORT_SHEET_PHUKET_ID:fileId,REPORT_SHEET_KHAOLAK_ID:nativeId,TRACKER_BLOB_CAS_ENABLED:'true'} as TrackerEnv&{TRACKER_BLOB_CAS_ENABLED:string};
afterEach(()=>vi.unstubAllGlobals());
function fake(options:{staleOnUpload?:boolean;responseLost?:boolean;changedAfterUpload?:boolean;wrongIdentity?:boolean;missingTag?:boolean;churn?:boolean;readOnly?:boolean;contentReadOnly?:boolean;rows?:number}={}){
 let bytes=fixture({rows:options.rows}),tag='"synthetic-tag-1"',version=1;const writes:RequestInit[]=[];
 const fn=vi.fn(async(input:string|URL|Request,init:RequestInit={})=>{
  const url=new URL(String(input));
  if(url.pathname.startsWith('/upload/drive/v2/')){
   writes.push(init);expect(init.method).toBe('PUT');expect(new Headers(init.headers).get('If-Match')).toBe('"synthetic-tag-1"');
   if(options.staleOnUpload)return new Response(null,{status:412});
   bytes=new Uint8Array(init.body as Uint8Array);tag='"synthetic-tag-2"';version=2;
   if(options.changedAfterUpload){const row=parseTrackerWorkbook(bytes,'phuket').rows[0];bytes=patchTrackerWorkbook(bytes,'phuket',row.rowKey,rowIdentity,[{field:'U',value:'2026-11-11',expected:null}]);}
   if(options.responseLost)throw Error('synthetic network timeout');return Response.json({id:fileId});
  }
  if(url.pathname.startsWith('/drive/v2/'))return Response.json({id:fileId,title:'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',etag:options.missingTag?undefined:tag});
  if(url.searchParams.get('alt')==='media'){
   if(options.churn){version++;tag='"synthetic-tag-'+version+'"';}
   return new Response(bytes as BodyInit);
  }
  return Response.json({id:options.wrongIdentity?'OtherSyntheticTracker00003':fileId,name:'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',trashed:false,version:String(version),modifiedTime:'2026-10-06T00:00:00Z',size:String(bytes.length),capabilities:{canDownload:true,canEdit:!options.readOnly,canModifyContent:!options.contentReadOnly&&!options.readOnly}});
 });vi.stubGlobal('fetch',fn);return {fn,writes,bytes:()=>bytes};
}
const input=(version:string):ProviderWrite=>{const row=parseTrackerWorkbook(fixture(),'phuket').rows[0];return {version,rowKey:row.rowKey,expectedIdentity:{...rowIdentity,folio:rowIdentity.folioNo},locator:row.locator,changes:[{field:'R',value:'2026-10-06',expected:null}]};};
it('reads a bound snapshot through existing grant and exposes proven blob CAS only behind the explicit flag',async()=>{
 fake();const result=await readTrackerWorkbook(env,owner,'phuket',fileId);expect(result.version).toBe('v2:"synthetic-tag-1"');expect(result.capabilities.conditionalWrite).toBe('proven');expect(result.rows[0].invoiceNo).toBe('00017');
 const held=await readTrackerWorkbook({...env,TRACKER_BLOB_CAS_ENABLED:'false'} as TrackerEnv,owner,'phuket',fileId);expect(held.capabilities.conditionalWrite).toBe('unverified');
});
it.each([{readOnly:true},{contentReadOnly:true}])('never advertises proven write capability or uploads when provider rights are limited: %j',async rights=>{
 const state=fake(rights);const snapshot=await readTrackerWorkbook(env,owner,'phuket',fileId);expect(snapshot.capabilities.conditionalWrite).toBe('unverified');
 expect(await writeTrackerCells(env,owner,'phuket',fileId,input(snapshot.version))).toEqual({status:'conflict'});expect(state.writes).toHaveLength(0);
});
it('requires exact configured target and provider identity, never grants arbitrary URLs',async()=>{
 const state=fake();await expect(readTrackerWorkbook(env,owner,'phuket','OtherSyntheticTracker00003')).rejects.toThrow('tracker_target_conflict');expect(state.fn).not.toHaveBeenCalled();
 fake({wrongIdentity:true});await expect(readTrackerWorkbook(env,owner,'phuket',fileId)).rejects.toThrow('tracker_target_conflict');
});
it('uses one true conditional v2 upload and exact whole-byte readback before acknowledging',async()=>{
 const state=fake();const result=await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'));expect(result).toEqual({status:'written',version:'v2:"synthetic-tag-2"'});expect(state.writes).toHaveLength(1);expect(parseTrackerWorkbook(state.bytes(),'phuket').rows[0].fields.R).toBe('2026-10-06');
 const upload=state.fn.mock.calls.find(([url])=>String(url).includes('/upload/drive/v2/'))!;expect(upload[1]?.redirect).toBe('manual');expect(new Headers(upload[1]?.headers).get('Authorization')).toBe('Bearer synthetic-token');
});
it('stale or missing strong ETag and row-identity changes prevent any upload',async()=>{
 const state=fake();expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"older-tag"'))).toEqual({status:'conflict'});expect(state.writes).toHaveLength(0);
 fake({missingTag:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict'});
 const wrong=input('v2:"synthetic-tag-1"');wrong.expectedIdentity.invoiceNo='17';const guarded=fake();expect(await writeTrackerCells(env,owner,'phuket',fileId,wrong)).toEqual({status:'conflict'});expect(guarded.writes).toHaveLength(0);
});
it('412 holds a competitor and upload timeouts never retry or restore',async()=>{
 const stale=fake({staleOnUpload:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict'});expect(stale.writes).toHaveLength(1);expect(parseTrackerWorkbook(stale.bytes(),'phuket').rows[0].fields.R).toBeNull();
 const timeout=fake({responseLost:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'uncertain'});expect(timeout.writes).toHaveLength(1);
});
it('post-upload collaborator changes are not undone or falsely acknowledged',async()=>{
 const state=fake({changedAfterUpload:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict',version:'v2:"synthetic-tag-2"'});expect(state.writes).toHaveLength(1);expect(parseTrackerWorkbook(state.bytes(),'phuket').rows[0].fields.U).toBe('2026-11-11');
});
it('unproven native writes and disabled blob writes are held without obtaining a grant or touching a provider',async()=>{
 const state=fake();expect(await writeTrackerCells(env,owner,'khao-lak',nativeId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict'});expect(await writeTrackerCells({...env,TRACKER_BLOB_CAS_ENABLED:'false'} as TrackerEnv,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict'});expect(state.fn).not.toHaveBeenCalled();
});
it('metadata/content churn is bounded and file-scope denial asks for authorization',async()=>{
 const churn=fake({churn:true});await expect(readTrackerWorkbook(env,owner,'phuket',fileId)).rejects.toThrow('tracker_snapshot_changed');expect(churn.writes).toHaveLength(0);
 vi.stubGlobal('fetch',async()=>new Response(null,{status:404}));await expect(readTrackerWorkbook(env,owner,'phuket',fileId)).rejects.toThrow('tracker_authorization_required');
});
it.each([401,403,404])('sanitizes missing/expired/file-scope grants without surfacing provider bodies (%i)',async status=>{
 vi.stubGlobal('fetch',async()=>new Response('SYNTHETIC private-provider-error-body',{status}));
 try{await readTrackerWorkbook(env,owner,'phuket',fileId);throw Error('expected authorization hold');}catch(error){expect((error as Error).message).toBe('tracker_authorization_required');}
});
it('publishes a multi-invoice batch with one upload and one source/readback download pair',async()=>{
 const state=fake({rows:2}),rows=parseTrackerWorkbook(state.bytes(),'phuket').rows;
 const inputs=rows.map(row=>({version:'v2:"synthetic-tag-1"',rowKey:row.rowKey,expectedIdentity:{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folio:row.folio},locator:row.locator,changes:[{field:'R' as const,value:'2026-10-06',expected:null}]}));
 expect(await writeTrackerBatch(env,owner,'phuket',fileId,inputs)).toEqual({status:'written',version:'v2:"synthetic-tag-2"'});
 expect(state.writes).toHaveLength(1);expect(state.fn.mock.calls.filter(([url])=>String(url).includes('alt=media'))).toHaveLength(2);
 expect(parseTrackerWorkbook(state.bytes(),'phuket').rows.map(row=>row.fields.R)).toEqual(['2026-10-06','2026-10-06']);
});
it('validates every batch row before publishing and applies stale/uncertain outcomes to the complete batch without retries',async()=>{
 for(const mode of ['invalid','stale','timeout'] as const){const state=fake({rows:2,staleOnUpload:mode==='stale',responseLost:mode==='timeout'}),rows=parseTrackerWorkbook(state.bytes(),'phuket').rows;
  const inputs=rows.map(row=>({version:'v2:"synthetic-tag-1"',rowKey:row.rowKey,expectedIdentity:{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folio:row.folio},locator:row.locator,changes:[{field:'R' as const,value:'2026-10-06',expected:null}]}));
  if(mode==='invalid')inputs[1].expectedIdentity.invoiceNo='WRONG';
  expect((await writeTrackerBatch(env,owner,'phuket',fileId,inputs)).status).toBe(mode==='timeout'?'uncertain':'conflict');expect(state.writes).toHaveLength(mode==='invalid'?0:1);
 }
});
