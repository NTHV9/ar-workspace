import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readTrackerFileVersion} from '../worker/tracker-sync/provider';
import {readNativeTrackerChangeHint} from '../worker/tracker-sync/native';
vi.mock('../worker/drive/oauth',()=>({driveToken:vi.fn(async()=> 'synthetic-token')}));
vi.mock('../worker/drive/provider',async original=>({...await original<typeof import('../worker/drive/provider')>(),identity:vi.fn(async()=> 'ar@katathani.com')}));
vi.mock('../worker/tracker-sync/native',()=>({readNativeTrackerChangeHint:vi.fn(),readNativeTracker:vi.fn(),writeNativeTrackerBatch:vi.fn()}));
const native='synthetic_native_hint_original_12345',blob='synthetic_blob_hint_original_12345',owner='synthetic-owner';
const env={REPORT_SHEET_KHAOLAK_ID:native,REPORT_SHEET_PHUKET_ID:blob};
beforeEach(()=>vi.resetAllMocks());afterEach(()=>vi.unstubAllGlobals());
function metadata(wrong=false){const calls:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{
 const url=String(input);calls.push(url);expect(init.redirect).toBe('manual');const isNative=url.includes(native);
 return Response.json({id:wrong?'different':isNative?native:blob,name:isNative?'Master_SAN_AR_Tracker':'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:isNative?'application/vnd.google-apps.spreadsheet':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',trashed:false,version:'10',modifiedTime:'2026-10-24T00:00:00Z',capabilities:{canDownload:true}});
});return calls;}
it('detects native values changing while Drive still reports the same version',async()=>{
 const calls=metadata();const a='9'+'1'.repeat(29),b='9'+'2'.repeat(29);
 vi.mocked(readNativeTrackerChangeHint).mockResolvedValueOnce(a).mockResolvedValueOnce(b);
 expect(await readTrackerFileVersion(env,owner,'khao-lak',native)).toBe(a);
 expect(await readTrackerFileVersion(env,owner,'khao-lak',native)).toBe(b);
 expect(readNativeTrackerChangeHint).toHaveBeenCalledTimes(2);expect(calls.some(u=>u.includes('alt=media'))).toBe(false);
});
it('keeps original XLSX probes metadata-only',async()=>{metadata();expect(await readTrackerFileVersion(env,owner,'phuket',blob)).toBe('10');expect(readNativeTrackerChangeHint).not.toHaveBeenCalled();});
it('falls back to the pinned Drive hint only for an oversized native projection',async()=>{
 metadata();vi.mocked(readNativeTrackerChangeHint).mockRejectedValue(Error('tracker_native_hint_too_large'));
 expect(await readTrackerFileVersion(env,owner,'khao-lak',native)).toBe('10');expect(readNativeTrackerChangeHint).toHaveBeenCalledTimes(1);
});
it('does not disguise native authorization or schema failures as a current hint',async()=>{
 metadata();vi.mocked(readNativeTrackerChangeHint).mockRejectedValue(Error('tracker_native_hint_invalid'));
 await expect(readTrackerFileVersion(env,owner,'khao-lak',native)).rejects.toThrow('tracker_native_hint_invalid');
});
it('validates original file metadata before reading the native projection',async()=>{
 metadata(true);await expect(readTrackerFileVersion(env,owner,'khao-lak',native)).rejects.toThrow('tracker_target_conflict');expect(readNativeTrackerChangeHint).not.toHaveBeenCalled();
});
