import RetentionStatus from './RetentionStatus';
import StorageOperations from './StorageOperations';
import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Archive,CheckCircle2,ExternalLink,Folder,HardDrive,RefreshCw,ShieldCheck} from 'lucide-react';
import type {DocumentJob} from '../../worker/documents/jobs';
import {driveFolderReady,driveMessage,driveRequest,retainedCommand,safeDriveUrl,type DriveArchiveView,type DriveStatus} from './model';
import {openDriveFolderPicker,prepareDrivePicker,type DrivePickerConfig,type PickerRuntime} from './picker';
import './drive.css';
interface DestinationConfirmation {targetRevision:number;folderName:string;newTest?:boolean}

function errorText(error:unknown){return error instanceof TypeError?'Drive did not return a confirmed result. Check the result or retry the existing command.':error instanceof Error?error.message:'Drive is unavailable. Please retry.';}
function stamp(value:string|null){if(!value)return 'Not yet verified';const date=new Date(value);return Number.isNaN(date.getTime())?'Verification time unavailable':`${new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(date)} ICT`;}
function useDriveStatus(token:string){
 const [snapshot,setSnapshot]=useState<{token:string;status:DriveStatus}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const tokenRef=useRef(token),alive=useRef(false),request=useRef<AbortController|null>(null);tokenRef.current=token;
 const refresh=useCallback(async()=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);setError('');
  try{const status=await driveRequest<DriveStatus>('/api/drive/status',token,{signal:controller.signal});if(!alive.current||controller.signal.aborted||tokenRef.current!==token)return null;setSnapshot({token,status});return status;}
  catch(e){if(alive.current&&!controller.signal.aborted&&tokenRef.current===token)setError(errorText(e));return null;}
  finally{if(alive.current&&!controller.signal.aborted&&tokenRef.current===token)setLoading(false);}
 },[token]);
 useEffect(()=>{alive.current=true;setSnapshot(null);void refresh();return()=>{alive.current=false;request.current?.abort();};},[refresh]);
 return {status:snapshot?.token===token?snapshot.status:null,error,loading,refresh};
}
function ConfirmDialog({title,children,confirmLabel,onConfirm,onClose}:{title:string;children:ReactNode;confirmLabel:string;onConfirm:()=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{dialog.current?.showModal();return()=>{dialog.current?.close();};},[]);
 return <dialog ref={dialog} className="drive-confirm" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}><h2 id={titleId}>{title}</h2>{children}<footer><button autoFocus onClick={onClose}>Cancel</button><button className="primary-button" onClick={onConfirm}>{confirmLabel}</button></footer></dialog>;
}
function StatusBadge({good,children}:{good:boolean;children:ReactNode}){return <span className={`drive-badge${good?' is-ready':''}`}>{good&&<CheckCircle2 size={13} aria-hidden="true"/>}{children}</span>;}
function ArchiveResult({archive}:{archive:DriveArchiveView}){
 const count=archive.files.filter(file=>file.state==='verified').length;
 const labels={expired:'Completed files were deleted under the retention policy',pending:'Archive is pending',partial:'Some files need attention',verified:'All files verified in Drive',error:'Archive needs attention',cleaned:'Synthetic file verified and moved to Trash'};
 return <div className="drive-result" aria-live="polite"><div className="drive-result-title"><strong>{labels[archive.state]}</strong><span>{archive.state==='cleaned'?'Test complete':`${count} of ${archive.files.length} verified`}</span></div><ul className="drive-file-list">{archive.files.map(file=>{
  const url=file.state==='verified'?safeDriveUrl(file.url):null;
  return <li key={`${file.ordinal}:${file.driveFileId??''}`}><div><strong>{file.name}</strong>{file.error&&<p className="drive-file-error">{driveMessage(file.error)}</p>}</div><span className={`drive-file-state state-${file.state}`}>{file.state==='trashed'?'Moved to Trash':file.state==='uploading'?'Uploading':file.state[0].toUpperCase()+file.state.slice(1)}</span>{url&&<a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} in Drive`}><ExternalLink size={14} aria-hidden="true"/>Open in Drive</a>}</li>;
 })}</ul><p className="drive-archive-note">Started {stamp(archive.createdAt)}</p></div>;
}

export default function DriveStorage({token}:{token:string}){
 const {status,error:statusError,loading,refresh}=useDriveStatus(token);
 const [busy,setBusy]=useState<'connect'|'picker'|'verify'|'test'|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [picker,setPicker]=useState<{token:string;config:DrivePickerConfig;runtime:PickerRuntime}|null>(null),[pickerError,setPickerError]=useState(''),[pickerAttempt,setPickerAttempt]=useState(0);
 const [confirmTest,setConfirmTest]=useState<DestinationConfirmation|null>(null),[testResult,setTestResult]=useState<DriveArchiveView|null>(null),[testAttempted,setTestAttempted]=useState(false);
 const tokenRef=useRef(token),alive=useRef(true),operation=useRef<AbortController|null>(null),working=useRef(false);tokenRef.current=token;
 useEffect(()=>{alive.current=true;setBusy(null);setError('');setNotice('');setPicker(null);setTestResult(null);setTestAttempted(false);setConfirmTest(null);working.current=false;return()=>{alive.current=false;operation.current?.abort();};},[token]);
 useEffect(()=>setConfirmTest(null),[status?.folder?.id,status?.folder?.revision]);
 useEffect(()=>{
  const controller=new AbortController();setPicker(null);setPickerError('');
  if(status?.connected&&status.pickerConfigured){void Promise.all([driveRequest<DrivePickerConfig>('/api/drive/config',token,{signal:controller.signal}),prepareDrivePicker()]).then(([config,runtime])=>{if(!controller.signal.aborted&&tokenRef.current===token)setPicker({token,config,runtime});}).catch(e=>{if(!controller.signal.aborted&&tokenRef.current===token)setPickerError(e instanceof Error&&e.message.startsWith('drive_')?driveMessage(e.message):errorText(e));});}
  return()=>controller.abort();
 },[token,status?.connected,status?.pickerConfigured,status?.folder?.id,status?.folder?.revision,pickerAttempt]);
 const current=()=>alive.current&&tokenRef.current===token;
 function begin(kind:NonNullable<typeof busy>){if(working.current)return null;working.current=true;operation.current?.abort();const controller=new AbortController();operation.current=controller;setBusy(kind);setError('');setNotice('');return controller;}
 function finish(controller:AbortController){if(current()&&operation.current===controller){working.current=false;setBusy(null);}}
 async function connect(){
  const controller=begin('connect');if(!controller)return;
  try{const response=await driveRequest<{url:string}>('/api/drive/connect',token,{method:'POST',body:'{}',signal:controller.signal});if(!current()||controller.signal.aborted)return;const url=new URL(response.url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password)throw new Error('Drive returned an unexpected sign-in destination. Retry connecting.');location.assign(url.href);}
  catch(e){if(current()&&!controller.signal.aborted)setError(errorText(e));}finally{finish(controller);}
 }
 async function verify(folderId:string,controller:AbortController){
  await driveRequest('/api/drive/verify-folder',token,{method:'POST',body:JSON.stringify({folderId}),signal:controller.signal});
  if(!current()||controller.signal.aborted)return;const fresh=await refresh();if(!current()||controller.signal.aborted)return;
  setNotice(driveFolderReady(fresh)?'The confirmed destination is verified and ready for reviewed documents.':'Folder verification completed. Review the sharing and readiness details below.');
 }
 async function chooseFolder(){
  if(!picker||picker.token!==token)return;const controller=begin('picker');if(!controller)return;
  try{const folderId=await openDriveFolderPicker(picker.config,picker.runtime,controller.signal);if(!folderId||!current()||controller.signal.aborted)return;setBusy('verify');await verify(folderId,controller);}
  catch(e){if(current()&&!controller.signal.aborted)setError(e instanceof Error&&e.message.startsWith('drive_')?driveMessage(e.message):errorText(e));}finally{finish(controller);}
 }
 async function verifyAgain(){if(!status?.folder?.id)return;const controller=begin('verify');if(!controller)return;try{await verify(status.folder.id,controller);}catch(e){if(current()&&!controller.signal.aborted)setError(errorText(e));}finally{finish(controller);}}
 async function runTest(){
  const confirmed=confirmTest;setConfirmTest(null);if(!confirmed||confirmed.targetRevision!==status?.folder?.revision)return;const controller=begin('test');if(!controller)return;setTestAttempted(true);
  try{const commandId=retainedCommand(`ar-drive-synthetic-command:${confirmed.targetRevision}`,confirmed.newTest);if(confirmed.newTest)setTestResult(null);const response=await driveRequest<DriveArchiveView|{archive:DriveArchiveView}>('/api/drive/test',token,{method:'POST',body:JSON.stringify({commandId,expectedTargetRevision:confirmed.targetRevision,confirmed:true}),signal:controller.signal});if(current()&&!controller.signal.aborted)setTestResult('archive'in response?response.archive:response);}
  catch(e){if(current()&&!controller.signal.aborted)setError(errorText(e));}finally{finish(controller);}
 }
 const folder=status?.folder,ready=!loading&&!statusError&&driveFolderReady(status),canTest=!!(!loading&&!statusError&&!status?.error&&status?.connected&&folder?.configured&&folder.id&&folder.verifiedAt);
 const callbackFailed=new URLSearchParams(location.search).get('drive')==='failed';
 return <main className="page drive-storage"><div className="page-title"><div><h1>Storage</h1><p>Archive reviewed PDF exports in the confirmed Google Drive folder.</p></div><button className="drive-inline-button" disabled={loading||!!busy} onClick={()=>void refresh()}><RefreshCw size={14} aria-hidden="true"/>{loading?'Checking status…':'Refresh status'}</button></div>
  {(statusError||error)&&<p className="error-message" role="alert">{error||statusError}</p>}{!error&&callbackFailed&&!status?.connected&&<p className="information-note">{driveMessage('drive_connection_failed')}</p>}{notice&&<p className="drive-notice" role="status">{notice}</p>}
  <section className="panel drive-settings" aria-label="Google Drive storage settings">
   <div className="drive-setting-row"><div className="drive-section-heading"><HardDrive size={20} aria-hidden="true"/><div><h2>Google Drive connection</h2><p>Connect the AR Google account to store the files you choose to archive.</p></div></div><div className="drive-setting-value"><StatusBadge good={!!status?.connected}>{loading&&!status?'Checking connection':status?.connected?'Connected':status?.configured?'Not connected':'Setup required'}</StatusBadge>{status?.connected&&status.email&&<span>{status.email}</span>}{status?.error&&<p className="drive-file-error">{driveMessage(status.error)}</p>}<button disabled={!status?.configured||!!busy||loading} onClick={()=>void connect()}>{busy==='connect'?'Opening Google…':status?.connected?'Reconnect Google Drive':'Connect Google Drive'}</button>{status&&!status.configured&&<p>Application configuration is required before connecting.</p>}</div></div>
   <div className="drive-setting-row"><div className="drive-section-heading"><Folder size={20} aria-hidden="true"/><div><h2>Archive destination</h2><p>Authorize the folder confirmed by the owner, then verify access and sharing.</p></div></div><div className="drive-setting-value"><strong className="drive-folder-name">{folder?.name||'Confirmed folder awaiting authorization'}</strong><div className="drive-status-line"><StatusBadge good={ready}>{ready?'Ready for archiving':folder?.visibility==='public'?'Public sharing — action needed':folder?.visibility==='unknown'?'Sharing not verified':'Verification required'}</StatusBadge>{folder&&<span>Sharing: {folder.visibility==='restricted'?'Restricted':folder.visibility==='public'?'Public':'Unknown'}</span>}</div><p>Last verified: {stamp(folder?.verifiedAt??null)}</p><div className="drive-actions"><button disabled={!!busy||!picker||picker.token!==token||!status?.connected||loading||!!statusError} onClick={()=>void chooseFolder()}>{busy==='picker'?'Choose a folder in Google…':busy==='verify'?'Verifying folder…':'Choose confirmed folder'}</button><button disabled={!!busy||!folder?.id||!status?.connected||loading||!!statusError} onClick={()=>void verifyAgain()}>Verify folder again</button></div>{status?.connected&&!status.pickerConfigured&&<p>Google Picker setup is required to authorize this folder.</p>}{status?.connected&&status.pickerConfigured&&!picker&&!pickerError&&<p>Loading Google Picker…</p>}{pickerError&&<><p className="drive-file-error" role="alert">{pickerError}</p><button onClick={()=>setPickerAttempt(n=>n+1)}>Retry loading Picker</button></>}{folder?.visibility==='public'&&<p className="information-note">{driveMessage('drive_folder_public')}</p>}{folder?.visibility==='unknown'&&<p className="information-note">{driveMessage('drive_folder_visibility_unknown')}</p>}</div></div>
   <div className="drive-setting-row"><div className="drive-section-heading"><ShieldCheck size={20} aria-hidden="true"/><div><h2>Synthetic connection test</h2><p>Check upload, read-back and checksum verification using a synthetic PDF.</p></div></div><div className="drive-setting-value"><p>The test creates one clearly marked synthetic file in the confirmed folder. After verification, it moves only that exact test file to Trash.</p>{folder&&folder.visibility!=='restricted'&&<p className="information-note">This test contains no customer data and can run with unverified or public sharing. Real document archiving remains blocked.</p>}<button disabled={!canTest||!!busy} onClick={()=>setConfirmTest({targetRevision:folder!.revision!,folderName:folder!.name||'the confirmed folder',newTest:testResult?.state==='cleaned'})}>{busy==='test'?'Running synthetic test…':testResult?.state==='cleaned'?'Review new connection test':testAttempted?'Review retry of connection test':'Review connection test'}</button>{!canTest&&<p>Connect Drive and verify the confirmed folder before testing.</p>}{testAttempted&&!testResult&&busy!=='test'&&<p>There is no confirmed result yet. A retry reuses the same command and test file.</p>}{testResult&&<ArchiveResult archive={testResult}/>}</div></div>
  </section><p className="drive-policy"><Archive size={15} aria-hidden="true"/>Archive files from a reviewed document job when needed. Automatic archiving is disabled. {status?.cleanupDisabled?'Automatic cleanup is disabled.':'Completed app files follow the one-calendar-month retention policy below.'}</p>
  {confirmTest&&<ConfirmDialog title={testAttempted&&testResult?.state!=='cleaned'?'Retry the same synthetic test?':'Run a synthetic connection test?'} confirmLabel={testAttempted&&testResult?.state!=='cleaned'?'Retry existing test':'Run synthetic test'} onConfirm={()=>void runTest()} onClose={()=>setConfirmTest(null)}><p>Create, read back and verify one synthetic PDF in <strong>{confirmTest.folderName}</strong>, then move only that file to Trash.</p><p>{testAttempted&&testResult?.state!=='cleaned'?'This reuses the existing command so an uncertain result does not create another test file.':testResult?.state==='cleaned'?'The previous test is complete. This creates a new synthetic test file.':'The PDF contains synthetic test content. This action does not use account documents.'}</p></ConfirmDialog>}
 <p><a href="/?operations=1">Operations & recovery →</a></p><StorageOperations token={token}/><RetentionStatus token={token}/>
 </main>;
}

export function DriveArchive({token,job}:{token:string;job:DocumentJob}){
 const {status,error:statusError,loading,refresh}=useDriveStatus(token);
 const [archive,setArchive]=useState<DriveArchiveView|null>(null),[reading,setReading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<DestinationConfirmation|null>(null),[attempted,setAttempted]=useState(false);
 const tokenRef=useRef(token),jobRef=useRef(job),alive=useRef(false),controllerRef=useRef<AbortController|null>(null),working=useRef(false);tokenRef.current=token;jobRef.current=job;
 const current=()=>alive.current&&tokenRef.current===token&&jobRef.current.id===job.id&&jobRef.current.revision===job.revision;
 const path=`/api/drive/jobs/${encodeURIComponent(job.id)}`;
 const loadArchive=useCallback(async(signal:AbortSignal)=>{
  setReading(true);setError('');try{const response=await driveRequest<{archive:DriveArchiveView|null}>(`${path}?revision=${job.revision}`,token,{signal});if(!signal.aborted&&tokenRef.current===token&&jobRef.current.id===job.id&&jobRef.current.revision===job.revision)setArchive(response.archive);}
  catch(e){if(!signal.aborted&&tokenRef.current===token)setError(errorText(e));}finally{if(!signal.aborted&&tokenRef.current===token)setReading(false);}
 },[token,path,job.id,job.revision]);
 useEffect(()=>{alive.current=true;working.current=false;setArchive(null);setBusy(false);setConfirm(null);setAttempted(false);const controller=new AbortController();controllerRef.current=controller;void loadArchive(controller.signal);return()=>{alive.current=false;controller.abort();controllerRef.current?.abort();};},[loadArchive]);
 async function checkResult(){if(working.current)return;controllerRef.current?.abort();const controller=new AbortController();controllerRef.current=controller;await Promise.all([loadArchive(controller.signal),refresh()]);}
 async function archiveFiles(){
  const confirmed=confirm;setConfirm(null);if(!confirmed||confirmed.targetRevision!==status?.folder?.revision||working.current||!job.acknowledged||!job.exports.length||!driveFolderReady(status)||statusError)return;
  working.current=true;setBusy(true);setAttempted(true);setError('');controllerRef.current?.abort();const controller=new AbortController();controllerRef.current=controller;
  try{const commandId=retainedCommand(`ar-drive-job-command:${job.id}:${job.revision}:${confirmed.targetRevision}`);const response=await driveRequest<{archive:DriveArchiveView}>(path,token,{method:'POST',body:JSON.stringify({commandId,documentRevision:job.revision,expectedTargetRevision:confirmed.targetRevision,confirmed:true}),signal:controller.signal});if(current()&&!controller.signal.aborted)setArchive(response.archive);}
  catch(e){if(current()&&!controller.signal.aborted)setError(errorText(e));}finally{if(current()&&controllerRef.current===controller){working.current=false;setBusy(false);}}
 }
 useEffect(()=>{setConfirm(null);setAttempted(false);},[status?.folder?.id,status?.folder?.revision]);
 const priorDestination=!!(archive&&status?.folder?.revision!=null&&archive.targetRevision!==status.folder.revision);
 const retrying=!!(archive&&!priorDestination)||attempted;
 const eligible=job.acknowledged&&job.exports.length>0,ready=eligible&&!loading&&!statusError&&driveFolderReady(status),complete=archive?.state==='verified'&&!priorDestination;
 return <section className="drive-archive" aria-label="Archive reviewed files"><div className="drive-archive-heading"><div><h2><Archive size={16} aria-hidden="true"/>Archive in Google Drive</h2><p>Reviewed revision {job.revision} · {job.exports.length} {job.exports.length===1?'file':'files'}</p></div><a href="/?storage=1">Storage settings</a></div>
  {(statusError||error)&&<p className="error-message" role="alert">{error||statusError}</p>}
  {!eligible?<p>Save and acknowledge the reviewed PDF exports before archiving.</p>:<><p>{ready?<>Destination: <strong>{status?.folder?.name||'Confirmed folder'}</strong></>:loading?'Checking the archive destination…':'A verified Restricted folder is required before archiving documents.'}</p><div className="drive-actions"><button className="primary-button" disabled={!ready||busy||reading||complete||archive?.state==='expired'} onClick={()=>setConfirm({targetRevision:status!.folder!.revision!,folderName:status!.folder!.name||'the confirmed folder'})}>{busy?'Archiving reviewed files…':archive?.state==='expired'?'Files expired':complete?'Archived and verified':retrying?'Review archive retry':'Review archive'}</button><button disabled={busy||reading||loading} onClick={()=>void checkResult()}>{reading?'Checking archive…':'Check archive result'}</button></div>{attempted&&!archive&&!busy&&<p>No archive result has been confirmed. Check the result or retry the same command.</p>}</>}
  {priorDestination&&<p className="information-note">The receipt below belongs to earlier destination revision {archive!.targetRevision}. This export set has not been verified in the current destination revision {status!.folder!.revision}.</p>}
  {archive&&<ArchiveResult archive={archive}/>}<p className="drive-archive-note">Only this complete reviewed export set is archived. Archiving does not send email or change billing history.</p>
  {confirm&&<ConfirmDialog title={retrying?'Retry this reviewed archive?':'Archive all reviewed files?'} confirmLabel={retrying?'Retry existing archive':'Archive all files'} onConfirm={()=>void archiveFiles()} onClose={()=>setConfirm(null)}><p>Store all <strong>{job.exports.length} reviewed {job.exports.length===1?'file':'files'}</strong> from revision <strong>{job.revision}</strong> in <strong>{confirm.folderName}</strong>.</p><ul className="drive-confirm-files">{job.exports.map(file=><li key={file.storage_key}>{file.name}</li>)}</ul><p>{retrying?'This retry reuses the same command and reconciles individual file results.':'The complete export set will be uploaded after you confirm.'}</p></ConfirmDialog>}
 </section>;
}
