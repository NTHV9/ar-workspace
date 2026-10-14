import {afterEach,expect,it,vi} from 'vitest';
import {OperaError} from '../worker/opera/client';
import {boundedBytes} from '../worker/drive/shared';
import {syncTracker,type TrackerAdapter,type ProviderSnapshot} from '../worker/tracker-sync/service';
const actor='00000000-0000-4000-8000-000000000001',file='synthetic_tracker_private_target';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret',REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'};
const row={rowKey:'private-row',hotel:'TSAN' as const,accountNo:'private-account',invoiceNo:'private-invoice',folio:null,fields:{U:null},locator:{row:2}};
const snapshot:ProviderSnapshot={version:'private-version',schemaFingerprint:'private-schema',rows:[row],capabilities:{conditionalWrite:'unverified',writeAssurance:'best-effort'}};
const item={id:'private-outbox',rowKey:row.rowKey,identity:{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folio:null},locator:row.locator,field:'U',expected:null,value:'2026-09-01',state:'pending'};
function setup(failRpc?:string,outbox:unknown[]=[]){
 const calls:{name:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
  const name=url.split('/').at(-1)!,body=JSON.parse(String(init.body));calls.push({name,body});
  if(name===failRpc)return Response.json({message:'private customer invoice token'},{status:503});
  return Response.json(name==='ar_tracker_claim'?{status:'claimed',fileId:file}:name==='ar_tracker_outbox'?outbox:name==='ar_tracker_write_result'?{state:body.p_state}:{});
 });
 const adapter:TrackerAdapter={read:vi.fn(async()=>structuredClone(snapshot)),write:vi.fn(async()=>({status:'written' as const}))};
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 return {adapter,log,calls};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('logs unknown provider failures without serializing messages, data or forged statuses',async()=>{
 const {adapter,log,calls}=setup();const error=Object.assign(Error('private customer token url'),{code:'provider_unavailable',upstreamStatus:401,providerMessage:'private message',data:row});
 adapter.read=vi.fn(async()=>{throw error;});
 await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toBe(error);
 expect(log.mock.calls).toEqual([[JSON.stringify({event:'tracker_sync_failure',region:'khao-lak',phase:'provider_read',code:'unknown_error'})]]);
 expect(calls.at(-1)?.body.p_error).toBe('tracker_unavailable');
});
it('logs only trusted allowlisted codes and numeric HTTP statuses from OperaError',async()=>{
 const {adapter,log}=setup();adapter.read=vi.fn(async()=>{throw new OperaError('provider_unavailable',429,'private-stage','private customer', {private:'secret'});});
 await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toThrow();
 expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({event:'tracker_sync_failure',region:'khao-lak',phase:'provider_read',code:'provider_unavailable',upstreamStatus:429});
});
it('collapses secret-shaped codes and invalid statuses without logging error causes',async()=>{
 const {adapter,log}=setup();const error=Object.assign(new OperaError('provider_unavailable'),{code:'tracker_schema_unverified private-token',upstreamStatus:'403',cause:{customer:'private customer'},stage:'private-stage'});
 adapter.read=vi.fn(async()=>{throw error;});await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toBe(error);
 expect(log.mock.calls).toEqual([[JSON.stringify({event:'tracker_sync_failure',region:'khao-lak',phase:'provider_read',code:'unknown_error'})]]);
});
it('retains the exact Drive response-cap code without exposing response contents',async()=>{
 const {adapter,log}=setup();adapter.read=vi.fn(async()=>{await boundedBytes(new Response('private customer response',{headers:{'Content-Length':String(16*1024*1024+1)}}),16*1024*1024);return snapshot;});
 await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toThrow('drive_response_too_large');
 expect(log.mock.calls).toEqual([[JSON.stringify({event:'tracker_sync_failure',region:'khao-lak',phase:'provider_read',code:'drive_response_too_large'})]]);
});
it('maps a genuine timeout DOMException to a static code without logging its message',async()=>{
 const {adapter,log}=setup();adapter.read=vi.fn(async()=>{throw new DOMException('private token customer timeout','TimeoutError');});
 await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toThrow();
 expect(log.mock.calls).toEqual([[JSON.stringify({event:'tracker_sync_failure',region:'khao-lak',phase:'provider_read',code:'timeout'})]]);
});
it.each(['drive_unavailable','drive_invalid','drive_not_configured','budget_database_exceeded','retention_busy'])('retains only the exact shared-helper code %s',async code=>{
 const {adapter,log}=setup();adapter.read=vi.fn(async()=>{throw Error(code);});await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toThrow(code);
 expect(JSON.parse(String(log.mock.calls[0][0])).code).toBe(code);
});
it.each([['ar_tracker_snapshot','snapshot_import'],['ar_tracker_membership','membership'],['ar_tracker_outbox','outbox'],['ar_tracker_write_result','write_result'],['ar_tracker_finish','finish']])('locates %s failure without recording business fields',async(rpc,phase)=>{
 const {adapter,log}=setup(rpc,rpc==='ar_tracker_write_result'?[{...item,value:null}]:[]);
 await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toThrow();
 expect(log.mock.calls).toEqual([[JSON.stringify({event:'tracker_sync_failure',region:'khao-lak',phase,code:'provider_unavailable',upstreamStatus:503})]]);
});
it('locates validation failure and keeps its original business error',async()=>{
 const {adapter,log}=setup();adapter.read=vi.fn(async()=>({...snapshot,rows:[row,row]}));
 await expect(syncTracker(env,actor,actor,'khao-lak',adapter)).rejects.toThrow('tracker_schema_unverified');
 expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({event:'tracker_sync_failure',region:'khao-lak',phase:'validate',code:'tracker_schema_unverified'});
});
it('preserves provider write uncertainty without emitting a global sync failure',async()=>{
 const {adapter,log,calls}=setup(undefined,[item]);adapter.write=vi.fn(async()=>{throw Error('tracker_provider_unavailable');});
 expect(await syncTracker(env,actor,actor,'khao-lak',adapter)).toEqual({status:'checked'});
 expect(log).not.toHaveBeenCalled();
 expect(calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['uncertain','uncertain']);
});
it('does not emit a failure event on successful synchronization',async()=>{
 const {adapter,log}=setup();expect(await syncTracker(env,actor,actor,'khao-lak',adapter)).toEqual({status:'checked'});expect(log).not.toHaveBeenCalled();
});
