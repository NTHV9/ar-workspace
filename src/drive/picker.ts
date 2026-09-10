export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file' as const;
export interface DrivePickerConfig {clientId:string;browserKey:string;projectNumber:string;scope:typeof DRIVE_SCOPE;folderId:string}
interface TokenResponse {access_token?:string;scope?:string;expires_in?:number;error?:string}
export interface PickerTokenRequest {client_id:string;scope:string;include_granted_scopes:false;callback:(response:TokenResponse)=>void;error_callback:(error:{type?:string})=>void}
export interface PickerRuntime {
 authorize:(request:PickerTokenRequest)=>{requestAccessToken:(options:{prompt:'consent'})=>void};
 createPicker:(options:{developerKey:string;appId:string;accessToken:string;onPicked:(id:string)=>void;onCancel:()=>void})=>{show:()=>void;dispose:()=>void};
}
interface DocsView {setIncludeFolders:(include:boolean)=>DocsView;setSelectFolderEnabled:(enabled:boolean)=>DocsView;setEnableDrives:(enabled:boolean)=>DocsView;setLabel:(label:string)=>DocsView}
interface GooglePicker {setVisible:(visible:boolean)=>void;dispose:()=>void}
interface PickerBuilder {
 setDeveloperKey:(key:string)=>PickerBuilder;setAppId:(id:string)=>PickerBuilder;setOAuthToken:(token:string)=>PickerBuilder;
 setOrigin:(origin:string)=>PickerBuilder;setTitle:(title:string)=>PickerBuilder;addView:(view:DocsView)=>PickerBuilder;
 setCallback:(callback:(data:{action?:string;docs?:Array<{id?:string}>})=>void)=>PickerBuilder;build:()=>GooglePicker;
}
interface GoogleLibraries {
 accounts?:{oauth2:{initTokenClient:PickerRuntime['authorize']}};
 picker?:{DocsView:new(id:string)=>DocsView;ViewId:{FOLDERS:string};PickerBuilder:new()=>PickerBuilder;Action:{PICKED:string;CANCEL:string}};
}
interface PickerWindow extends Window {google?:GoogleLibraries;gapi?:{load:(name:string,options:{callback:()=>void;onerror:()=>void;timeout:number;ontimeout:()=>void})=>void}}
const scriptLoads=new Map<string,Promise<void>>();
function loadScript(src:'https://apis.google.com/js/api.js'|'https://accounts.google.com/gsi/client'){
 const cached=scriptLoads.get(src);if(cached)return cached;
 const promise=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.async=true;
  const timeout=setTimeout(()=>finish(false),15000);
  function finish(ok:boolean){clearTimeout(timeout);script.onload=null;script.onerror=null;if(ok)resolve();else{script.remove();reject(new Error('drive_picker_unavailable'));}}
  script.onload=()=>finish(true);script.onerror=()=>finish(false);document.head.appendChild(script);
 });
 scriptLoads.set(src,promise);void promise.catch(()=>scriptLoads.delete(src));return promise;
}
let runtimeLoad:Promise<PickerRuntime>|null=null;
/** Preload scripts without requesting consent or an access token. */
export function prepareDrivePicker():Promise<PickerRuntime>{
 if(runtimeLoad)return runtimeLoad;
 runtimeLoad=(async()=>{
  const browser=window as PickerWindow;
  await Promise.all([browser.gapi?Promise.resolve():loadScript('https://apis.google.com/js/api.js'),browser.google?.accounts?Promise.resolve():loadScript('https://accounts.google.com/gsi/client')]);
  if(!browser.google?.picker)await new Promise<void>((resolve,reject)=>{if(!browser.gapi)return reject(new Error('drive_picker_unavailable'));browser.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('drive_picker_unavailable')),timeout:15000,ontimeout:()=>reject(new Error('drive_picker_unavailable'))});});
  const picker=browser.google?.picker,accounts=browser.google?.accounts;if(!picker||!accounts)throw new Error('drive_picker_unavailable');
  return {
   authorize:request=>accounts.oauth2.initTokenClient(request),
   createPicker:options=>{
    const view=new picker.DocsView(picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true);view.setLabel('My Drive folders');
    const sharedView=new picker.DocsView(picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setEnableDrives(true);sharedView.setLabel('Shared Drive folders');
    const instance=new picker.PickerBuilder().setDeveloperKey(options.developerKey).setAppId(options.appId).setOAuthToken(options.accessToken).setOrigin(location.origin).setTitle('Select the confirmed AR archive folder').addView(view).addView(sharedView).setCallback(data=>{
     if(data.action===picker.Action.PICKED)options.onPicked(data.docs?.[0]?.id??'');else if(data.action===picker.Action.CANCEL)options.onCancel();
    }).build();
    return {show:()=>instance.setVisible(true),dispose:()=>{instance.setVisible(false);instance.dispose();}};
   },
  };
 })();
 void runtimeLoad.catch(()=>{runtimeLoad=null;});return runtimeLoad;
}

/** Starts synchronously from a user click. The GIS token remains in this closure only. */
export function openDriveFolderPicker(config:DrivePickerConfig,runtime:PickerRuntime,signal:AbortSignal):Promise<string|null>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){resolve(null);return;}
  if(config.scope!==DRIVE_SCOPE||!config.folderId||!config.clientId||!config.browserKey||!config.projectNumber){reject(new Error('drive_picker_unavailable'));return;}
  let active=true,grantReceived=false,accessToken='',picker:ReturnType<PickerRuntime['createPicker']>|null=null;
  const timeout=setTimeout(()=>finish(null,'drive_picker_expired'),120000);
  function abort(){finish(null);}
  function finish(id:string|null,error?:string){
   if(!active)return;active=false;clearTimeout(timeout);signal.removeEventListener('abort',abort);accessToken='';
   try{picker?.dispose();}catch{/* Closing a provider iframe must not prevent cancellation. */}picker=null;
   if(error)reject(new Error(error));else resolve(id);
  }
  signal.addEventListener('abort',abort,{once:true});
  try{
   const client=runtime.authorize({client_id:config.clientId,scope:DRIVE_SCOPE,include_granted_scopes:false,
    callback:response=>{
     if(!active||signal.aborted||grantReceived)return;grantReceived=true;
     if(response.error||!response.access_token){finish(null,'drive_picker_authorization_failed');return;}
     const scopes=response.scope?.trim().split(/\s+/)??[];
     if(scopes.length!==1||scopes[0]!==DRIVE_SCOPE){finish(null,'drive_picker_scope_invalid');return;}
     if(!response.expires_in||response.expires_in<=0){finish(null,'drive_picker_expired');return;}
     accessToken=response.access_token;
     try{picker=runtime.createPicker({developerKey:config.browserKey,appId:config.projectNumber,accessToken,onPicked:id=>finish(id===config.folderId?id:null,id===config.folderId?undefined:'drive_folder_mismatch'),onCancel:()=>finish(null)});accessToken='';picker.show();}catch{finish(null,'drive_picker_unavailable');}
    },error_callback:error=>finish(null,error.type==='popup_closed'?'drive_picker_popup_closed':'drive_picker_authorization_failed')});
   client.requestAccessToken({prompt:'consent'});
  }catch{finish(null,'drive_picker_authorization_failed');}
 });
}
