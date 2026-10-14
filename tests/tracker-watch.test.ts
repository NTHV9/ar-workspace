import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {trackerWatchCallback,ensureTrackerWatch,dispatchTrackerWakes,runTrackerWake} from '../worker/tracker-sync/watch';
import {backendRpc} from '../worker/refresh/backend';
import {driveToken} from '../worker/drive/oauth';
import {google,identity} from '../worker/drive/provider';
import {syncTracker} from '../worker/tracker-sync/service';
vi.mock('../worker/refresh/backend',()=>({backendRpc:vi.fn()}));
vi.mock('../worker/drive/oauth',()=>({driveToken:vi.fn()}));
vi.mock('../worker/drive/provider',()=>({google:vi.fn(),identity:vi.fn()}));
vi.mock('../worker/tracker-sync/service',async importOriginal=>({...await importOriginal<typeof import('../worker/tracker-sync/service')>(),syncTracker:vi.fn()}));
const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',file='synthetic_original_tracker_12345';
const create=vi.fn(async()=>({})),get=vi.fn(async()=>({status:async()=>({status:'running'})}));
const env={TRACKER_SYNC_ENABLED:'true',TRACKER_PUSH_ENABLED:'true',REPORT_SHEET_PHUKET_ID:file,REPORT_SHEET_KHAOLAK_ID:file,AR_TRACKER:{create,get}};
const headers={'X-Goog-Channel-ID':id,'X-Goog-Channel-Token':'a'.repeat(64),'X-Goog-Resource-ID':'resource-1','X-Goog-Message-Number':'2','X-Goog-Resource-State':'update'};
const request=(h=headers)=>new Request('https://ar-workspace.ar-c82.workers.dev/api/tracker/notifications',{method:'POST',headers:h});
beforeEach(()=>{vi.resetAllMocks();create.mockResolvedValue({});get.mockResolvedValue({status:async()=>({status:'running'})});vi.mocked(driveToken).mockResolvedValue('private-test-token');vi.mocked(identity).mockResolvedValue('ar@katathani.com');});
afterEach(()=>vi.restoreAllMocks());
describe('tracker file notification boundary',()=>{
 it('commits a verified notification before acknowledgement and dispatches only persisted IDs',async()=>{
  vi.mocked(backendRpc).mockImplementation(async(_e,name)=>name==='ar_tracker_watch_notify'?{status:'accepted',id,region:'phuket'}:[{id,region:'phuket'}]);
  const tasks:Promise<unknown>[]=[];const response=await trackerWatchCallback(request(),env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
  expect(response.status).toBe(204);expect(backendRpc).toHaveBeenCalledWith(env,'ar_tracker_watch_notify',expect.objectContaining({p_channel:id,p_message:'2',p_state:'update',p_token_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
  expect(create).toHaveBeenCalledWith({id,params:{id}});expect(google).not.toHaveBeenCalled();
 });
 it('rejects malformed callbacks before database work',async()=>{
  for(const h of [{...headers,'X-Goog-Channel-Token':''},{...headers,'X-Goog-Message-Number':'-2'},{...headers,'X-Goog-Resource-ID':'x'.repeat(1025)},{...headers,'X-Goog-Channel-ID':'bad'}])expect((await trackerWatchCallback(request(h),env)).status).toBe(400);
  expect(backendRpc).not.toHaveBeenCalled();
 });
 it('rejects invalid channels and does not wake on ignored notifications',async()=>{
  vi.mocked(backendRpc).mockResolvedValueOnce({status:'invalid'}).mockResolvedValueOnce({status:'ignored'});
  expect((await trackerWatchCallback(request(),env)).status).toBe(403);expect((await trackerWatchCallback(request(),env)).status).toBe(204);expect(create).not.toHaveBeenCalled();
 });
 it('does not acknowledge an uncommitted notification or process write-hold',async()=>{
  vi.mocked(backendRpc).mockRejectedValue(Error('db-down'));
  expect((await trackerWatchCallback(request(),env)).status).toBe(503);
  vi.mocked(backendRpc).mockClear();expect((await trackerWatchCallback(request(),{...env,OPERATIONS_WRITE_HOLD:'true'})).status).toBe(503);expect(backendRpc).not.toHaveBeenCalled();
 });
 it('leaves committed wake durable if dispatch fails',async()=>{
  vi.mocked(backendRpc).mockResolvedValue([{id,region:'phuket'}]);create.mockRejectedValue(Error('network'));get.mockRejectedValue(Error('missing'));
  await expect(dispatchTrackerWakes(env)).resolves.toBeUndefined();expect(backendRpc).toHaveBeenCalledTimes(1);
 });
 it('fences a terminal Workflow that failed before claiming its durable request',async()=>{
  vi.mocked(backendRpc).mockResolvedValue([{id,region:'phuket'}]);create.mockRejectedValue(Error('already-exists'));get.mockResolvedValue({status:async()=>({status:'errored'})});
  await dispatchTrackerWakes(env);expect(backendRpc).toHaveBeenCalledWith(env,'ar_tracker_wake_restart',{p_id:id});
 });
});
describe('watch registration',()=>{
 it('persists token hash first and pins the original file and callback',async()=>{
  vi.mocked(backendRpc).mockImplementation(async(_e,name)=>name==='ar_tracker_watch_prepare'?{status:'prepared',owner,fileId:file}:{status:'active'});
  vi.mocked(google).mockImplementation(async(_url,_token,init)=>{const body=JSON.parse(String(init?.body));expect(body.address).toBe('https://ar-workspace.ar-c82.workers.dev/api/tracker/notifications');expect(body.token).toMatch(/^[a-f0-9]{64}$/);return Response.json({id:body.id,resourceId:'resource-1',expiration:String(Date.now()+86400000)});});
  await ensureTrackerWatch(env,'phuket');expect(google).toHaveBeenCalledWith('https://www.googleapis.com/drive/v3/files/'+file+'/watch?supportsAllDrives=true','private-test-token',expect.objectContaining({method:'POST'}));
  expect(vi.mocked(backendRpc).mock.calls.map(c=>c[1])).toEqual(['ar_tracker_watch_prepare','ar_tracker_watch_activate']);
 });
 it('never registers a different persisted file or an already-current channel',async()=>{
  vi.mocked(backendRpc).mockResolvedValueOnce({status:'prepared',owner,fileId:'different'});await expect(ensureTrackerWatch(env,'phuket')).rejects.toThrow();
  vi.mocked(backendRpc).mockResolvedValueOnce({status:'current'});await ensureTrackerWatch(env,'phuket');expect(google).not.toHaveBeenCalled();
 });
 it('rejects mismatched registration response and leaves its outcome uncertain',async()=>{
  vi.mocked(backendRpc).mockResolvedValue({status:'prepared',owner,fileId:file});vi.mocked(google).mockResolvedValue(Response.json({id:'wrong',resourceId:'resource',expiration:String(Date.now()+86400000)}));
  await expect(ensureTrackerWatch(env,'phuket')).rejects.toThrow();expect(vi.mocked(backendRpc).mock.calls.map(c=>c[1])).toEqual(['ar_tracker_watch_prepare']);
 });
});
describe('durable wake execution',()=>{
 const step={sleep:vi.fn(async()=>{}),do:vi.fn(async(_name:string,options:unknown,fn?:()=>Promise<unknown>)=>typeof options==='function'?options():fn!())};
 it('re-reads exact persisted binding and uses the existing lock, then finishes captured generation',async()=>{
  vi.mocked(backendRpc).mockImplementation(async(_e,name)=>name==='ar_tracker_wake_begin'?{status:'ready',region:'phuket',owner,fileId:file,generation:'3'}:name==='ar_tracker_wake_pending'?[]:{status:'finished'});
  vi.mocked(syncTracker).mockResolvedValue({status:'checked'});await runTrackerWake(env,id,step as never);
  expect(syncTracker).toHaveBeenCalledWith(env,owner,owner,'phuket',expect.anything(),true);expect(backendRpc).toHaveBeenCalledWith(env,'ar_tracker_wake_finish',{p_id:id,p_generation:'3',p_success:true});
 });
 it('keeps busy or failed work pending and does not blindly replay a provider mutation',async()=>{
  vi.mocked(backendRpc).mockImplementation(async(_e,name)=>name==='ar_tracker_wake_begin'?{status:'ready',region:'phuket',owner,fileId:file,generation:'3'}:[]);
  vi.mocked(syncTracker).mockResolvedValue({status:'busy'});await runTrackerWake(env,id,step as never);
  expect(backendRpc).toHaveBeenCalledWith(env,'ar_tracker_wake_finish',{p_id:id,p_generation:'3',p_success:false});expect(syncTracker).toHaveBeenCalledTimes(1);
 });
});
