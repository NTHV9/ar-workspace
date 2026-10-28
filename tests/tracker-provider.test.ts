import {afterEach,expect,it,vi} from 'vitest';
import {fixture,identity as rowIdentity} from './fixtures/tracker-workbook';
import {parseTrackerWorkbook,patchTrackerWorkbook} from '../worker/tracker-sync/workbook';
import {readTrackerWorkbook,writeTrackerCells,writeTrackerBatch,readTrackerFileVersion} from '../worker/tracker-sync/provider';
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
 expect(await writeTrackerCells(env,owner,'phuket',fileId,input(snapshot.version))).toEqual({status:'conflict',diagnostic:{code:'not_editable',mutationStarted:false}});expect(state.writes).toHaveLength(0);
});
it('reads only the original file version without downloading or rewriting spreadsheet content',async()=>{
 const state=fake();expect(await readTrackerFileVersion(env,owner,'phuket',fileId)).toBe('1');
 expect(state.fn.mock.calls.some(([url])=>String(url).includes('alt=media')||String(url).includes('/export')||String(url).includes('/upload/'))).toBe(false);
 expect(state.writes).toHaveLength(0);
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
 const state=fake();expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"older-tag"'))).toEqual({status:'conflict',diagnostic:{code:'snapshot_changed',mutationStarted:false}});expect(state.writes).toHaveLength(0);
 fake({missingTag:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict',diagnostic:{code:'missing_etag',mutationStarted:false}});
 const wrong=input('v2:"synthetic-tag-1"');wrong.expectedIdentity.invoiceNo='17';const guarded=fake();expect(await writeTrackerCells(env,owner,'phuket',fileId,wrong)).toEqual({status:'conflict',diagnostic:{code:'row_identity_changed',mutationStarted:false}});expect(guarded.writes).toHaveLength(0);
});
it('412 holds a competitor and upload timeouts never retry or restore',async()=>{
 const stale=fake({staleOnUpload:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict',diagnostic:{code:'cas_412',mutationStarted:true,upstreamStatus:412}});expect(stale.writes).toHaveLength(1);expect(parseTrackerWorkbook(stale.bytes(),'phuket').rows[0].fields.R).toBeNull();
 const timeout=fake({responseLost:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'uncertain',diagnostic:{code:'upload_transport_unknown',mutationStarted:true}});expect(timeout.writes).toHaveLength(1);
});
it('post-upload collaborator changes are not undone or falsely acknowledged',async()=>{
 const state=fake({changedAfterUpload:true});expect(await writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict',version:'v2:"synthetic-tag-2"',diagnostic:{code:'readback_changed',mutationStarted:true}});expect(state.writes).toHaveLength(1);expect(parseTrackerWorkbook(state.bytes(),'phuket').rows[0].fields.U).toBe('2026-11-11');
});
it('unproven native writes and disabled blob writes are held without obtaining a grant or touching a provider',async()=>{
 const state=fake();expect(await writeTrackerCells(env,owner,'khao-lak',nativeId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict'});expect(await writeTrackerCells({...env,TRACKER_BLOB_CAS_ENABLED:'false'} as TrackerEnv,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).toEqual({status:'conflict',diagnostic:{code:'cas_disabled',mutationStarted:false}});expect(state.fn).not.toHaveBeenCalled();
});
it('metadata/content churn is bounded and file-scope denial asks for authorization',async()=>{
 const churn=fake({churn:true});await expect(readTrackerWorkbook(env,owner,'phuket',fileId)).rejects.toThrow('tracker_snapshot_changed');expect(churn.writes).toHaveLength(0);
 vi.stubGlobal('fetch',async()=>new Response(null,{status:404}));await expect(readTrackerWorkbook(env,owner,'phuket',fileId)).rejects.toThrow('tracker_authorization_required');
});
it.each([401,403,404])('sanitizes missing/expired/file-scope grants without surfacing provider bodies (%i)',async status=>{
 vi.stubGlobal('fetch',async()=>new Response('SYNTHETIC private-provider-error-body',{status}));
 try{await readTrackerWorkbook(env,owner,'phuket',fileId);throw Error('expected authorization hold');}catch(error){expect((error as Error).message).toBe('tracker_authorization_required');}
});
it.each([{trashed:true},{name:'Synthetic renamed copy.xlsx'},{mimeType:'application/vnd.google-apps.spreadsheet'}])('a changed original file metadata %j blocks both import and upload',async changed=>{
 const state=fake(),providerFetch=globalThis.fetch;
 vi.stubGlobal('fetch',async(url:RequestInfo|URL,init:RequestInit={})=>{
  const response=await providerFetch(url,init),parsed=new URL(String(url));
  if(parsed.pathname.startsWith('/drive/v3/files/')&&parsed.searchParams.has('fields')){
   const metadata:unknown=await response.json();
   if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw Error('synthetic_metadata_shape_invalid');
   return Response.json({...metadata,...changed});
  }
  return response;
 });
 await expect(readTrackerWorkbook(env,owner,'phuket',fileId)).rejects.toThrow('tracker_target_conflict');
 await expect(writeTrackerCells(env,owner,'phuket',fileId,input('v2:"synthetic-tag-1"'))).rejects.toThrow('tracker_target_conflict');
 expect(state.writes).toHaveLength(0);expect(state.fn.mock.calls.some(([url])=>String(url).includes('alt=media'))).toBe(false);
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

it.each([
 {kind:'snapshot',options:{},code:'snapshot_changed',status:'conflict',mutationStarted:false},
 {kind:'etag',options:{missingTag:true},code:'missing_etag',status:'conflict',mutationStarted:false},
 {kind:'rights',options:{readOnly:true},code:'not_editable',status:'conflict',mutationStarted:false},
 {kind:'identity',options:{},code:'row_identity_changed',status:'conflict',mutationStarted:false},
 {kind:'preimage',options:{},code:'cell_preimage_changed',status:'conflict',mutationStarted:false},
 {kind:'412',options:{staleOnUpload:true},code:'cas_412',status:'conflict',mutationStarted:true},
 {kind:'timeout',options:{responseLost:true},code:'upload_transport_unknown',status:'uncertain',mutationStarted:true},
 {kind:'readback',options:{changedAfterUpload:true},code:'readback_changed',status:'conflict',mutationStarted:true},
])('attributes $kind without leaking provider values into diagnostic metadata',async test=>{
 fake(test.options);const write=input(test.kind==='snapshot'?'v2:"SYNTHETIC-PRIVATE-VERSION"':'v2:"synthetic-tag-1"');
 if(test.kind==='identity')write.expectedIdentity.invoiceNo='SYNTHETIC-PRIVATE-INVOICE';
 if(test.kind==='preimage')write.changes[0].expected='2026-09-01';
 const result=await writeTrackerCells(env,owner,'phuket',fileId,write);
 expect(result).toMatchObject({status:test.status,diagnostic:{code:test.code,mutationStarted:test.mutationStarted}});
 const diagnostic=Reflect.get(result,'diagnostic');expect(JSON.stringify(diagnostic)).not.toMatch(/SYNTHETIC-PRIVATE|synthetic-token|SyntheticOriginalTracker|synthetic-tag/);
});
