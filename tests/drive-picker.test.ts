import {describe, expect, it, vi} from 'vitest';
import {DRIVE_SCOPE, openDriveFolderPicker, type PickerRuntime, type PickerTokenRequest} from '../src/drive/picker';
import {driveFolderReady, safeDriveUrl} from '../src/drive/model';

const config={clientId:'synthetic-client',browserKey:'synthetic-key',projectNumber:'123456',scope:DRIVE_SCOPE,folderId:'synthetic-confirmed-folder'};
function runtime(){
 let request:PickerTokenRequest|null=null;
 let selection:Parameters<PickerRuntime['createPicker']>[0]|null=null;
 const dispose=vi.fn(),show=vi.fn(),requestAccessToken=vi.fn();
 const api:PickerRuntime={authorize(options){request=options;return {requestAccessToken};},createPicker(options){selection=options;return {show,dispose};}};
 return {api,dispose,show,requestAccessToken,token:(scope:string=DRIVE_SCOPE)=>request!.callback({access_token:'synthetic-ephemeral-token',scope,expires_in:3600}),pick:(id:string)=>selection!.onPicked(id),cancel:()=>selection!.onCancel(),get request(){return request!;}};
}
describe('Drive Picker consent boundary',()=>{
 it('asks only for drive.file and selects the confirmed destination',async()=>{
  const r=runtime(),result=openDriveFolderPicker(config,r.api,new AbortController().signal);
  expect(r.request).toMatchObject({scope:DRIVE_SCOPE,include_granted_scopes:false,client_id:'synthetic-client'});
  expect(r.requestAccessToken).toHaveBeenCalledWith({prompt:'consent'});
  r.token();expect(r.show).toHaveBeenCalledOnce();r.pick(config.folderId);
  await expect(result).resolves.toBe(config.folderId);expect(r.dispose).toHaveBeenCalledOnce();
 });
 it('rejects a different folder without returning it for backend verification',async()=>{
  const r=runtime(),result=openDriveFolderPicker(config,r.api,new AbortController().signal);
  r.token();r.pick('another-folder');await expect(result).rejects.toThrow('drive_folder_mismatch');
 });
 it('does not use broader or Gmail grants in Picker',async()=>{
  const r=runtime(),result=openDriveFolderPicker(config,r.api,new AbortController().signal);
  r.token(`${DRIVE_SCOPE} https://www.googleapis.com/auth/gmail.send`);
  await expect(result).rejects.toThrow('drive_picker_scope_invalid');expect(r.show).not.toHaveBeenCalled();
 });
 it('ignores late token and Picker callbacks after cancellation',async()=>{
  const r=runtime(),controller=new AbortController(),result=openDriveFolderPicker(config,r.api,controller.signal);
  controller.abort();r.token();await expect(result).resolves.toBeNull();expect(r.show).not.toHaveBeenCalled();
  const next=runtime(),nextController=new AbortController(),nextResult=openDriveFolderPicker(config,next.api,nextController.signal);
  next.token();nextController.abort();next.pick(config.folderId);await expect(nextResult).resolves.toBeNull();expect(next.dispose).toHaveBeenCalledOnce();
 });
 it('handles a closed sign-in popup as a recoverable error',async()=>{
  const r=runtime(),result=openDriveFolderPicker(config,r.api,new AbortController().signal);
  r.request.error_callback({type:'popup_closed'});await expect(result).rejects.toThrow('drive_picker_popup_closed');
 });
 it('ignores duplicate token callbacks instead of opening another Picker',async()=>{
  const r=runtime(),result=openDriveFolderPicker(config,r.api,new AbortController().signal);
  r.token();r.token();expect(r.show).toHaveBeenCalledOnce();r.cancel();await expect(result).resolves.toBeNull();
 });
});
describe('Drive display safety',()=>{
 it('requires restricted sharing and complete backend readiness',()=>{
  const status={configured:true,connected:true,email:'synthetic@example.test',folder:{configured:true,id:'synthetic-folder',name:'Synthetic folder',revision:1,ready:true,verifiedAt:'2026-09-10T00:00:00Z',visibility:'restricted' as const},cleanupDisabled:true as const,pickerConfigured:true};
  expect(driveFolderReady(status)).toBe(true);
  expect(driveFolderReady({...status,folder:{...status.folder,visibility:'public'}})).toBe(false);
  expect(driveFolderReady({...status,folder:{...status.folder,visibility:'unknown'}})).toBe(false);
  expect(driveFolderReady({...status,error:'drive_status_unavailable'})).toBe(false);
  expect(driveFolderReady({...status,connected:false})).toBe(false);
  expect(driveFolderReady({...status,folder:{...status.folder,verifiedAt:null}})).toBe(false);
  expect(driveFolderReady({...status,folder:{...status.folder,id:null}})).toBe(false);
 });
 it('renders only HTTPS links on the exact Drive origin',()=>{
  expect(safeDriveUrl('https://drive.google.com/file/d/synthetic/view')).toBe('https://drive.google.com/file/d/synthetic/view');
  for(const url of ['javascript:alert(1)','https://drive.google.com.evil.test/file','https://drive.google.com@evil.test/file','https://user:pass@drive.google.com/file','http://drive.google.com/file','https://drive.google.com:444/file'])expect(safeDriveUrl(url)).toBeNull();
 });
});
