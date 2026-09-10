import {test,expect,type Page} from '@playwright/test';
import type {DriveArchiveView,DriveStatus} from '../../src/drive/model';

const jobId='a1000000-0000-4000-8000-000000000001';
const user={id:'synthetic-drive-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-10T00:00:00Z'};
const folderId='synthetic-confirmed-folder';
const freshStatus=():DriveStatus=>({configured:true,connected:true,email:'ar@katathani.com',folder:{configured:true,id:folderId,name:'Synthetic AR archive',revision:1,ready:true,verifiedAt:'2026-09-10T00:00:00Z',visibility:'restricted'},cleanupDisabled:true,pickerConfigured:false});
const partialArchive=():DriveArchiveView=>({id:'b1000000-0000-4000-8000-000000000001',kind:'job',documentJobId:jobId,documentRevision:3,targetRevision:1,state:'partial',createdAt:'2026-09-10T00:00:00Z',files:[{ordinal:0,name:'Synthetic invoice A.pdf',state:'verified',driveFileId:'synthetic-file-a',url:'https://drive.google.com/file/d/synthetic-file-a/view'},{ordinal:1,name:'Synthetic invoice B.pdf',state:'error',driveFileId:'synthetic-file-b',url:'https://untrusted.example.test/file',error:'drive_checksum_mismatch'}]});
async function setup(page:Page){
 const job={id:jobId,owner:user.id,hotel:'KAT',account_id:'synthetic-account',account_name:'Synthetic Drive Account',content:'invoices',layout:'separate',purpose:'billing',invoice_ids:['synthetic-a','synthetic-b'],manifest:[],state:'ready',revision:3,project_key:null,exports:[{name:'Synthetic invoice A.pdf',storage_key:'synthetic/a.pdf',byte_count:100,sha256:'synthetic-a'},{name:'Synthetic invoice B.pdf',storage_key:'synthetic/b.pdf',byte_count:100,sha256:'synthetic-b'}],acknowledged:true,files:[],created_at:'2026-09-10T00:00:00Z'};
 const controls={status:freshStatus(),job,archive:null as DriveArchiveView|null,archiveWrites:[] as Record<string,unknown>[],testWrites:[] as Record<string,unknown>[],folderWrites:[] as Record<string,unknown>[],reads:[] as string[],unexpected:[] as string[],failArchiveOnce:false,statusFailure:false,holdArchive:false,release:()=>{}};
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-app-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',route=>route.fulfill({json:{user}}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-key'}});
  if(path==='/api/refresh')return route.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(path==='/api/portfolio')return route.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(path==='/api/documents/'+jobId)return route.fulfill({json:controls.job});
  if(path==='/api/documents')return route.fulfill({json:{jobs:[],hasMore:false}});
  if(path==='/api/drive/status')return controls.statusFailure?route.fulfill({status:503,json:{error:'drive_status_unavailable'}}):route.fulfill({json:controls.status});
  if(path==='/api/drive/config')return route.fulfill({json:{clientId:'synthetic-client',browserKey:'synthetic-key',projectNumber:'123456',scope:'https://www.googleapis.com/auth/drive.file',folderId:controls.status.folder?.id}});
  if(path==='/api/drive/verify-folder'){controls.folderWrites.push(request.postDataJSON());controls.status.folder!.ready=true;controls.status.folder!.verifiedAt='2026-09-10T01:00:00Z';return route.fulfill({json:controls.status.folder});}
  if(path==='/api/drive/jobs/'+jobId){
   if(request.method()==='GET'){controls.reads.push(url.search);return route.fulfill({json:{archive:controls.archive}});}
   controls.archiveWrites.push(request.postDataJSON());
   if(controls.holdArchive)await new Promise<void>(resolve=>{controls.release=resolve;});
   if(controls.failArchiveOnce){controls.failArchiveOnce=false;return route.abort('failed');}
   controls.archive??=partialArchive();return route.fulfill({json:{archive:controls.archive}});
  }
  if(path==='/api/drive/test'){controls.testWrites.push(request.postDataJSON());return route.fulfill({json:{...partialArchive(),kind:'test',documentJobId:null,documentRevision:null,state:'cleaned',files:[{ordinal:0,name:'SYNTHETIC Drive connection test.pdf',state:'trashed',driveFileId:'synthetic-test-file',url:null}]}});}
  controls.unexpected.push(`${request.method()} ${path}`);return route.fulfill({status:501,json:{error:'unmocked_synthetic_test_api'}});
 });
 return controls;
}

async function mockPicker(page:Page){
 await page.addInitScript(()=>{
  const state={requests:[] as unknown[],pickerCallback:null as ((value:unknown)=>void)|null,disposeCount:0};
  (window as any).__syntheticPicker=state;
  class DocsView {setIncludeFolders(){return this;}setSelectFolderEnabled(){return this;}setEnableDrives(){return this;}setLabel(){return this;}}
  class PickerBuilder {
   setDeveloperKey(){return this;}setAppId(){return this;}setOAuthToken(){return this;}setOrigin(){return this;}setTitle(){return this;}addView(){return this;}
   setCallback(callback:(value:unknown)=>void){state.pickerCallback=callback;return this;}
   build(){return {setVisible(){},dispose(){state.disposeCount++;}};}
  }
  (window as any).gapi={load:(_name:string,options:{callback:()=>void})=>options.callback()};
  (window as any).google={picker:{DocsView,ViewId:{FOLDERS:'folders'},PickerBuilder,Action:{PICKED:'picked',CANCEL:'cancel'}},accounts:{oauth2:{initTokenClient:(options:any)=>({requestAccessToken(){state.requests.push({scope:options.scope,include_granted_scopes:options.include_granted_scopes});options.callback({access_token:'synthetic-picker-memory-only',scope:options.scope,expires_in:3600});}})}}};
 });
}
test('storage desktop and mobile show explicit controls without upload or cleanup calls',async({page})=>{
 const controls=await setup(page);await page.goto('/?storage=1');await expect(page.getByRole('heading',{name:'Storage',exact:true})).toBeVisible();await expect(page.getByText('Ready for archiving',{exact:true})).toBeVisible();
 expect(controls.testWrites).toHaveLength(0);expect(controls.archiveWrites).toHaveLength(0);expect(controls.folderWrites).toHaveLength(0);expect(controls.unexpected).toEqual([]);
 await page.locator('.drive-storage').evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished));});await page.screenshot({path:'evidence/drive-storage-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Review connection test',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'evidence/drive-storage-mobile.png',fullPage:true});
});
test('synthetic test requires review and confirmation even with public sharing',async({page})=>{
 const controls=await setup(page);controls.status.folder!.visibility='public';controls.status.folder!.ready=false;await page.goto('/?storage=1');await page.getByRole('button',{name:'Review connection test',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('move only that file to Trash');expect(controls.testWrites).toHaveLength(0);await page.getByRole('button',{name:'Run synthetic test',exact:true}).click();
 await expect(page.getByText('Synthetic file verified and moved to Trash',{exact:true})).toBeVisible();expect(controls.testWrites[0]).toMatchObject({confirmed:true,expectedTargetRevision:1});expect(controls.testWrites[0].commandId).toMatch(/^[0-9a-f-]{36}$/);expect(controls.unexpected).toEqual([]);
 await page.getByRole('button',{name:'Review new connection test',exact:true}).click();expect(controls.testWrites).toHaveLength(1);await page.getByRole('button',{name:'Run synthetic test',exact:true}).click();await expect.poll(()=>controls.testWrites.length).toBe(2);expect(controls.testWrites[1].commandId).not.toBe(controls.testWrites[0].commandId);
});
test('reviewed archive is explicit, revision-bound and reports partial file results',async({page})=>{
 const controls=await setup(page);await page.goto(`/?documentJob=${jobId}`);const region=page.getByRole('region',{name:'Archive reviewed files'});
 await expect(region.getByRole('button',{name:'Review archive',exact:true})).toBeEnabled();expect(controls.archiveWrites).toHaveLength(0);expect(controls.reads).toContain('?revision=3');await region.getByRole('button',{name:'Review archive',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('revision 3');await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(2);expect(controls.archiveWrites).toHaveLength(0);await page.getByRole('button',{name:'Archive all files',exact:true}).click();
 await expect(region).toContainText('1 of 2 verified');await expect(region.getByRole('link',{name:'Open Synthetic invoice A.pdf in Drive'})).toHaveAttribute('href','https://drive.google.com/file/d/synthetic-file-a/view');await expect(region.getByRole('link',{name:'Open Synthetic invoice B.pdf in Drive'})).toHaveCount(0);await expect(region).toContainText('did not pass the checksum check');expect(controls.archiveWrites[0]).toMatchObject({documentRevision:3,expectedTargetRevision:1,confirmed:true});expect(controls.unexpected).toEqual([]);
 await page.screenshot({path:'evidence/drive-archive-partial.png',fullPage:true});
});
test('an uncertain upload keeps its command on retry and reload',async({page})=>{
 const controls=await setup(page);controls.failArchiveOnce=true;await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Review archive',exact:true}).click();await page.getByRole('button',{name:'Archive all files',exact:true}).click();await expect(page.getByRole('region',{name:'Archive reviewed files'}).getByRole('alert')).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Review archive',exact:true}).click();await page.getByRole('button',{name:'Archive all files',exact:true}).click();await expect(page.getByText('1 of 2 verified',{exact:true})).toBeVisible();expect(controls.archiveWrites).toHaveLength(2);expect(controls.archiveWrites[1].commandId).toBe(controls.archiveWrites[0].commandId);
});
for(const visibility of ['public','unknown'] as const)test(`real archive remains blocked for ${visibility} sharing`,async({page})=>{
 const controls=await setup(page);controls.status.folder!.visibility=visibility;await page.goto(`/?documentJob=${jobId}`);await expect(page.getByRole('button',{name:'Review archive',exact:true})).toBeDisabled();await expect(page.getByRole('region',{name:'Archive reviewed files'})).toContainText('verified Restricted folder');expect(controls.archiveWrites).toHaveLength(0);
});
test('status failure cannot retain an enabled archive action',async({page})=>{
 const controls=await setup(page);await page.goto(`/?documentJob=${jobId}`);await expect(page.getByRole('button',{name:'Review archive',exact:true})).toBeEnabled();controls.statusFailure=true;await page.getByRole('button',{name:'Check archive result',exact:true}).click();await expect(page.getByRole('region',{name:'Archive reviewed files'}).getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Review archive',exact:true})).toBeDisabled();expect(controls.archiveWrites).toHaveLength(0);
});
test('Picker rejects another folder, verifies only the fixed destination and never persists its token',async({page})=>{
 const controls=await setup(page);controls.status.pickerConfigured=true;controls.status.folder!.ready=false;await mockPicker(page);await page.goto('/?storage=1');await page.getByRole('button',{name:'Choose confirmed folder',exact:true}).click();
 await page.evaluate(()=>{(window as any).__syntheticPicker.pickerCallback({action:'picked',docs:[{id:'another-synthetic-folder'}]});});await expect(page.getByRole('alert')).toContainText('not the confirmed destination');expect(controls.folderWrites).toHaveLength(0);
 await page.getByRole('button',{name:'Choose confirmed folder',exact:true}).click();await page.evaluate(id=>{(window as any).__syntheticPicker.pickerCallback({action:'picked',docs:[{id}]});},folderId);await expect(page.getByText('Ready for archiving',{exact:true})).toBeVisible();expect(controls.folderWrites).toEqual([{folderId}]);
 const state=await page.evaluate(()=>({requests:(window as any).__syntheticPicker.requests,storage:JSON.stringify({...localStorage,...sessionStorage})}));expect(state.requests).toEqual(Array(2).fill({scope:'https://www.googleapis.com/auth/drive.file',include_granted_scopes:false}));expect(state.storage).not.toContain('synthetic-picker-memory-only');expect(controls.unexpected).toEqual([]);
});
test('cancelling review and an unacknowledged revision never uploads documents',async({page})=>{
 const controls=await setup(page);await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Review archive',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();expect(controls.archiveWrites).toHaveLength(0);
 controls.job.acknowledged=false;await page.reload();await expect(page.getByRole('heading',{name:'Reviewed files · revision 3'})).toBeVisible();await expect(page.getByRole('button',{name:'Review archive',exact:true})).toHaveCount(0);expect(controls.archiveWrites).toHaveLength(0);
});
test('an in-flight archive disables another upload action',async({page})=>{
 const controls=await setup(page);controls.holdArchive=true;await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Review archive',exact:true}).click();await page.getByRole('button',{name:'Archive all files',exact:true}).click();await expect(page.getByRole('button',{name:'Archiving reviewed files…',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Check archive result',exact:true})).toBeDisabled();await expect.poll(()=>controls.archiveWrites.length).toBe(1);controls.release();await expect(page.getByText('1 of 2 verified',{exact:true})).toBeVisible();expect(controls.archiveWrites).toHaveLength(1);
});
test('leaving Storage cancels Picker and ignores its late selection',async({page})=>{
 const controls=await setup(page);controls.status.pickerConfigured=true;await mockPicker(page);await page.goto('/?storage=1');await page.getByRole('button',{name:'Choose confirmed folder',exact:true}).click();await page.getByRole('button',{name:'Documents',exact:true}).click();await expect(page.getByRole('heading',{name:'Documents',exact:true})).toBeVisible();await page.evaluate(id=>(window as any).__syntheticPicker.pickerCallback({action:'picked',docs:[{id}]}),folderId);expect(controls.folderWrites).toHaveLength(0);expect(await page.evaluate(()=>(window as any).__syntheticPicker.disposeCount)).toBe(1);
});
test('a verified receipt for a previous destination does not mark the current destination archived',async({page})=>{
 const controls=await setup(page);controls.archive={...partialArchive(),state:'verified',files:partialArchive().files.map(file=>({...file,state:'verified'}))};controls.status.folder!.revision=2;controls.status.folder!.name='Synthetic revised destination';await page.goto(`/?documentJob=${jobId}`);
 await expect(page.getByRole('region',{name:'Archive reviewed files'})).toContainText('earlier destination revision 1');await expect(page.getByRole('button',{name:'Review archive',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Review archive',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Synthetic revised destination');controls.status.folder!.revision=3;controls.status.folder!.name='Synthetic third destination';await page.getByRole('button',{name:'Archive all files',exact:true}).click();await expect.poll(()=>controls.archiveWrites.length).toBe(1);expect(controls.archiveWrites[0].expectedTargetRevision).toBe(2);
});
test('Picker reloads its fixed target after the destination changes',async({page})=>{
 const controls=await setup(page);controls.status.pickerConfigured=true;await mockPicker(page);await page.goto('/?storage=1');await expect(page.getByRole('button',{name:'Choose confirmed folder',exact:true})).toBeEnabled();controls.status.folder!.id='synthetic-revised-folder';controls.status.folder!.revision=2;await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('button',{name:'Choose confirmed folder',exact:true}).click();await page.evaluate(()=>(window as any).__syntheticPicker.pickerCallback({action:'picked',docs:[{id:'synthetic-revised-folder'}]}));await expect.poll(()=>controls.folderWrites.length).toBe(1);expect(controls.folderWrites[0]).toEqual({folderId:'synthetic-revised-folder'});
});
