import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {probeTrackerVersions} from '../worker/tracker-sync/version-probe';
import {backendRpc} from '../worker/refresh/backend';
import {readTrackerFileVersion} from '../worker/tracker-sync/provider';
import {dispatchTrackerWakes} from '../worker/tracker-sync/watch';
vi.mock('../worker/refresh/backend',()=>({backendRpc:vi.fn()}));
vi.mock('../worker/tracker-sync/provider',()=>({readTrackerFileVersion:vi.fn()}));
vi.mock('../worker/tracker-sync/watch',()=>({dispatchTrackerWakes:vi.fn()}));
const file='synthetic_tracker_original_12345',owner='00000000-0000-4000-8000-000000000001';
const env={TRACKER_SYNC_ENABLED:'true',TRACKER_PUSH_ENABLED:'true',REPORT_SHEET_PHUKET_ID:file,REPORT_SHEET_KHAOLAK_ID:file};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(readTrackerFileVersion).mockResolvedValue('123');});
afterEach(()=>vi.restoreAllMocks());
it('uses one claimed metadata observation to durably enqueue changed-file work',async()=>{
 vi.mocked(backendRpc).mockImplementation(async(_env,name)=>name==='ar_tracker_probe_claim'?{status:'claimed',fileId:file,priorVersion:'122'}:{status:'changed',id:crypto.randomUUID()});
 await probeTrackerVersions(env,owner,['phuket']);
 expect(readTrackerFileVersion).toHaveBeenCalledExactlyOnceWith(env,owner,'phuket',file);
 const claim=vi.mocked(backendRpc).mock.calls.find(c=>c[1]==='ar_tracker_probe_claim')!;
 expect(backendRpc).toHaveBeenCalledWith(env,'ar_tracker_probe_finish',{p_region:'phuket',p_lock:claim[2].p_lock,p_version:'123'});
 expect(dispatchTrackerWakes).toHaveBeenCalledExactlyOnceWith(env);
});
it('does not read the provider for a shared busy lease or disabled runtime',async()=>{
 vi.mocked(backendRpc).mockResolvedValue({status:'busy'});
 await probeTrackerVersions(env,owner,['phuket']);expect(readTrackerFileVersion).not.toHaveBeenCalled();vi.mocked(backendRpc).mockClear();
 for(const disabled of [{...env,TRACKER_PUSH_ENABLED:'false'},{...env,TRACKER_SYNC_ENABLED:'false'},{...env,OPERATIONS_WRITE_HOLD:'true'}])await probeTrackerVersions(disabled,owner,['phuket']);
 expect(backendRpc).not.toHaveBeenCalled();
});
it('keeps unchanged observations cheap and scopes reads to authorized regions',async()=>{
 vi.mocked(backendRpc).mockImplementation(async(_env,name)=>name==='ar_tracker_probe_claim'?{status:'claimed',fileId:file,priorVersion:'123'}:{status:'unchanged'});
 await probeTrackerVersions(env,owner,['khao-lak','khao-lak']);
 expect(readTrackerFileVersion).toHaveBeenCalledExactlyOnceWith(env,owner,'khao-lak',file);expect(dispatchTrackerWakes).not.toHaveBeenCalled();
});
it('releases failed observations without advancing versions or blocking another region',async()=>{
 vi.mocked(backendRpc).mockImplementation(async(_env,name)=>name==='ar_tracker_probe_claim'?{status:'claimed',fileId:file}:{status:'failed'});
 vi.mocked(readTrackerFileVersion).mockRejectedValue(Error('synthetic provider timeout'));
 await expect(probeTrackerVersions(env,owner,['phuket','khao-lak'])).resolves.toBeUndefined();
 const finishes=vi.mocked(backendRpc).mock.calls.filter(c=>c[1]==='ar_tracker_probe_finish');expect(finishes).toHaveLength(2);
 expect(finishes.every(c=>c[2].p_version===null)).toBe(true);expect(dispatchTrackerWakes).not.toHaveBeenCalled();
});
it('rejects a substituted persisted file before provider access',async()=>{
 vi.mocked(backendRpc).mockImplementation(async(_env,name)=>name==='ar_tracker_probe_claim'?{status:'claimed',fileId:'different_original_123456789'}:{status:'failed'});
 await probeTrackerVersions(env,owner,['phuket']);expect(readTrackerFileVersion).not.toHaveBeenCalled();expect(dispatchTrackerWakes).not.toHaveBeenCalled();
});
it('retries a durable wake hint on a later unchanged probe after dispatch was unavailable',async()=>{
 const id=crypto.randomUUID();let finishes=0;
 vi.mocked(backendRpc).mockImplementation(async(_env,name)=>name==='ar_tracker_probe_claim'?{status:'claimed',fileId:file}:{status:++finishes===1?'changed':'unchanged',id});
 vi.mocked(dispatchTrackerWakes).mockRejectedValueOnce(Error('synthetic dispatch unavailable')).mockResolvedValueOnce(undefined);
 await probeTrackerVersions(env,owner,['phuket']);await probeTrackerVersions(env,owner,['phuket']);
 expect(dispatchTrackerWakes).toHaveBeenCalledTimes(2);
 expect(vi.mocked(backendRpc).mock.calls.filter(c=>c[1]==='ar_tracker_probe_finish')).toHaveLength(2);
});
