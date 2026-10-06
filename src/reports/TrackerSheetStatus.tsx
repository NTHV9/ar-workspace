import {useEffect,useRef,useState} from 'react';
import type {RegionId} from '../domain/hotels';
import {notifyRegisterChanged} from '../register/model';
import {DRIVE_SCOPE,openDriveFilePicker,prepareDrivePicker,type DriveFilePickerConfig,type PickerRuntime} from '../drive/picker';
import {trackerConflictCategories,trackerConflictCategoryLabels,trackerConflictFieldLabels,validConflictPage,type TrackerConflictPage,type TrackerConflictCategory} from '../domain/tracker-conflicts';
interface Conflict {id:string;rowKey:string;field:string;reason:string;sheetValue:unknown;webValue:unknown;revision:number}
interface Status {connected:boolean;enabled:boolean;available:boolean;heldWrites?:number;writebackAvailable?:boolean;writeAssurance?:'cas'|'best-effort'|'held';bootstrapConfirmed?:boolean;revision:number;lastCheckedAt:string|null;pending:number;conflictCount:number;conflicts:Conflict[];sheetActivity?:{actualDate:string;field:string;invoices:number}[]}
interface Preview {previewId:string;snapshotHash:string;rowCount:number;matchedRows:number;heldRows:number;eligibleFields:number;reportedStatuses?:number;conflictingFields:number;details:{rowKey:string;field:string;sheetValue:unknown;webValue:unknown;decision:string}[]}
const value=(v:unknown)=>v===null||v===undefined?'Blank':String(v).slice(0,300);
const canAccept=(c:Conflict)=>c.reason!=='invalid_source_field'&&!['S','T','AA'].includes(c.field)&&!(c.field==='Y'&&c.sheetValue!==null&&!['','Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other'].includes(String(c.sheetValue)));
export function TrackerSheetStatus({token,region}:{token:string;region:RegionId}){
 const [result,setResult]=useState<{owner:string;status:Status}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[review,setReview]=useState(false);
 const owner=token+region,status=result?.owner===owner?result.status:null;
 const actorRef=useRef(owner);actorRef.current=owner;const pickerOperation=useRef<AbortController|null>(null);
 const [navigation,setNavigation]=useState<{owner:string;reload:number;category:TrackerConflictCategory;cursors:(string|null)[]}>({owner,reload:0,category:'all',cursors:[null]});
 const category=navigation.owner===owner?navigation.category:'all',cursors=navigation.owner===owner&&navigation.reload===revision?navigation.cursors:[null],cursor=cursors.at(-1)??null;
 const pageKey=JSON.stringify([owner,revision,category,cursor]),[pageResult,setPageResult]=useState<{key:string;page:TrackerConflictPage}|null>(null),[pageError,setPageError]=useState<{key:string;message:string}|null>(null),[pageRetry,setPageRetry]=useState(0),page=pageResult?.key===pageKey?pageResult.page:null;
 useEffect(()=>{setReview(false);setBusy(false);},[owner]);
 useEffect(()=>{
  if(!review)return;const controller=new AbortController();setPageError(null);setPageResult(null);
  const query=new URLSearchParams({region,category});if(cursor)query.set('cursor',cursor);
  void fetch('/api/reports/tracker-conflicts?'+query,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const data:unknown=await response.json();if(!validConflictPage(data,region,category))throw Error();if(!controller.signal.aborted&&actorRef.current===owner)setPageResult({key:pageKey,page:data});}).catch(()=>{if(!controller.signal.aborted&&actorRef.current===owner)setPageError({key:pageKey,message:'Differences could not be loaded. Retry this page.'});});return()=>controller.abort();
 },[review,token,region,owner,category,cursor,pageKey,pageRetry]);
 const [authorizationOwner,setAuthorizationOwner]=useState<string|null>(null),[pickerState,setPickerState]=useState<{owner:string;config:DriveFilePickerConfig;runtime:PickerRuntime}|null>(null),[pickerError,setPickerError]=useState(''),[pickerAttempt,setPickerAttempt]=useState(0);
 const needsAuthorization=authorizationOwner===owner,picker=pickerState?.owner===owner?pickerState:null;
 useEffect(()=>()=>{pickerOperation.current?.abort();},[owner]);
 useEffect(()=>{
  const controller=new AbortController();setPickerState(null);setPickerError('');
  if(needsAuthorization&&status?.available)void Promise.all([
   fetch(`/api/reports/tracker-picker?region=${region}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal}).then(async response=>{
    const data=await response.json() as DriveFilePickerConfig&{error?:string};if(!response.ok||data.error)throw Error(data.error??'tracker_picker_unavailable');
    if(data.scope!==DRIVE_SCOPE||typeof data.clientId!=='string'||typeof data.browserKey!=='string'||!/^\d{1,20}$/.test(data.projectNumber)||!/^[A-Za-z0-9_-]{20,200}$/.test(data.fileId)||!data.fileName||!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.google-apps.spreadsheet'].includes(data.mimeType)||data.accountEmail!=='ar@katathani.com')throw Error('tracker_picker_unavailable');return data;
   }),prepareDrivePicker(),
  ]).then(([config,runtime])=>{if(!controller.signal.aborted&&actorRef.current===owner)setPickerState({owner,config,runtime});}).catch(e=>{if(!controller.signal.aborted&&actorRef.current===owner)setPickerError(e instanceof Error&&e.message==='tracker_picker_drive_not_connected'?'Reconnect the AR Drive account in Storage, then retry Picker.':'Google Picker could not load. Retry to check its configuration and connection.');});
  return()=>controller.abort();
 },[needsAuthorization,status?.available,token,region,owner,pickerAttempt]);
 const [previewResult,setPreviewResult]=useState<{owner:string;value:Preview}|null>(null),preview=previewResult?.owner===owner?previewResult.value:null;
 useEffect(()=>{
  const controller=new AbortController();setResult(null);setError('');
  const read=async()=>{try{
   const response=await fetch(`/api/reports/tracker?region=${region}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
   if(!response.ok)throw Error();const data=await response.json() as Status;
   if(typeof data.connected!=='boolean'||typeof data.available!=='boolean'||!Array.isArray(data.conflicts)||!Number.isSafeInteger(data.pending)||!Number.isSafeInteger(data.conflictCount))throw Error();
   if(!controller.signal.aborted)setResult({owner,status:data});
  }catch{if(!controller.signal.aborted)setError('Tracker status could not be loaded. Retry to check the connection.');}};
  void read();const timer=setInterval(()=>void read(),60000);return()=>{controller.abort();clearInterval(timer);};
 },[token,region,owner,revision]);
 const command=async(input:Record<string,unknown>)=>{
  setBusy(true);setError('');try{
   const response=await fetch(`/api/reports/tracker?region=${region}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(input)});
   const data=await response.json() as Preview&{error?:string};if(!response.ok||data.error)throw Error(data.error);
   if(actorRef.current!==owner)return;
   if(input.action==='preview'){
    if(!data.previewId||!data.snapshotHash||!Array.isArray(data.details))throw Error();setPreviewResult({owner,value:data});
   }else{setPreviewResult(null);setAuthorizationOwner(null);setRevision(n=>n+1);notifyRegisterChanged();}
  }catch(e){if(actorRef.current!==owner)return;setPreviewResult(null);if(e instanceof Error&&e.message==='tracker_authorization_required')setAuthorizationOwner(owner);setError(e instanceof Error&&e.message==='tracker_authorization_required'?'Google access to this exact file is required. Authorize the file before reconnecting.':e instanceof Error&&['tracker_revision_conflict','tracker_preview_changed'].includes(e.message)?'This item changed. Load a fresh preview before reviewing again.':'Tracker update could not be confirmed. Retry to check the latest state.');}finally{if(actorRef.current===owner)setBusy(false);}
 };
 const authorizeOriginal=async()=>{
  if(!picker||busy||!status)return;const controller=new AbortController();pickerOperation.current?.abort();pickerOperation.current=controller;setBusy(true);setError('');
  try{
   const selected=await openDriveFilePicker(picker.config,picker.runtime,controller.signal);
   if(selected&&actorRef.current===owner&&!controller.signal.aborted)await command({action:'connect',revision:status.revision,selectedFileId:selected});
  }catch(e){if(actorRef.current===owner&&!controller.signal.aborted)setError(e instanceof Error&&e.message==='drive_file_mismatch'?'That file is not the configured original tracker. Open Picker again and select the original file.':e instanceof Error&&e.message==='drive_picker_scope_invalid'?'Google returned an unexpected permission grant. Retry with Drive file access only.':'File authorization was not confirmed. Retry and select the approved AR Drive account.');}
  finally{if(actorRef.current===owner)setBusy(false);if(pickerOperation.current===controller)pickerOperation.current=null;}
 };
 return <div className="report-tracker" aria-label={`${region} tracker synchronization`}>
  {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>setRevision(n=>n+1)}>Retry status</button></p>}
  {!status?<p role="status">Checking tracker connection…</p>:<>
   <p role="status">{!status.available?'Synchronization is awaiting activation.':!status.connected?'Tracker is ready to connect.':`${status.pending} pending writes · ${status.conflictCount} items to review`}{status.lastCheckedAt&&<> · Checked {new Date(status.lastCheckedAt).toLocaleString()}</>}</p>
   {status.connected&&status.writeAssurance==='best-effort'&&<p>Automatic date writeback uses best-effort updates. Concurrent edits may be overwritten. Uncertain writes are checked without another write attempt.</p>}
   {status.connected&&(status.writebackAvailable===false||!!status.heldWrites)&&<p>{status.writebackAvailable===false?'Writeback to this file is held until a safe update method is verified.':'Some date cells require source-field review before writeback.'} {status.heldWrites??0} confirmed Sent dates are retained for future writeback.</p>}
   {status.available&&<div className="report-tracker-actions">
    {!status.connected?<button disabled={busy} onClick={()=>void command({action:'connect',revision:status.revision})}>Connect tracker</button>:status.bootstrapConfirmed?<button disabled={busy} onClick={()=>void command({action:'sync'})}>{busy?'Checking…':'Check changes'}</button>:<button disabled={busy} onClick={()=>void command({action:'preview'})}>Preview tracker import</button>}
    {status.conflictCount>0&&<button aria-expanded={review} onClick={()=>setReview(v=>!v)}>Review differences ({status.conflictCount})</button>}
   </div>}
   {needsAuthorization&&status.available&&<div className="report-tracker-review"><p>Use the AR Drive account <strong>ar@katathani.com</strong> to authorize this region’s original tracker file. Selecting it grants file access; the backend checks its own AR connection before showing Connected.</p><div className="report-tracker-actions"><button disabled={busy||!picker} onClick={()=>void authorizeOriginal()}>Authorize original tracker file</button>{pickerError&&<button disabled={busy} onClick={()=>setPickerAttempt(n=>n+1)}>Retry loading Picker</button>}</div>{pickerError?<p role="alert">{pickerError}</p>:!picker&&<p role="status">Loading Google Picker…</p>}{picker&&<p>Only {picker.config.fileName} can be selected.</p>}</div>}
   {preview&&<div className="report-tracker-review"><strong>Review the initial tracker import</strong><p>{preview.matchedRows} matched rows · {preview.eligibleFields} eligible fields · {preview.reportedStatuses??0} reported sheet statuses · {preview.heldRows} held rows · {preview.conflictingFields} field differences. Confirming imports eligible history and preserves conflicts for review.</p>
    <div className="report-tracker-preview-scroll"><table><thead><tr><th>Invoice key</th><th>Field</th><th>Sheet</th><th>AR web</th><th>Decision</th></tr></thead><tbody>{preview.details.map((item,index)=><tr key={index}><td>{item.rowKey}</td><td>{item.field}</td><td>{value(item.sheetValue)}</td><td>{value(item.webValue)}</td><td>{item.decision}</td></tr>)}</tbody></table></div>
    <p>Showing up to 200 field differences. The confirmation covers the reviewed snapshot of {preview.rowCount} rows; a changed file requires a fresh preview.</p><div className="report-tracker-actions"><button disabled={busy} onClick={()=>void command({action:'confirm_preview',previewId:preview.previewId,snapshotHash:preview.snapshotHash})}>Confirm initial import</button><button disabled={busy} onClick={()=>setPreviewResult(null)}>Discard preview</button></div>
   </div>}
   {review&&<div className="report-tracker-review"><p>Review each difference before applying it. Credit terms and formulas remain reference values.</p>
    <div className="report-tracker-conflict-controls"><label>Difference type <select value={category} disabled={busy} onChange={e=>setNavigation({owner,reload:revision,category:e.target.value as TrackerConflictCategory,cursors:[null]})}>{trackerConflictCategories.map(c=><option key={c} value={c}>{trackerConflictCategoryLabels[c]}{page?` (${page.counts[c]})`:''}</option>)}</select></label><span>{page?`${page.counts[category]} pending · Page ${cursors.length}`:'Loading differences…'}</span></div>
    {pageError?.key===pageKey?<p role="alert">{pageError.message} <button onClick={()=>setPageRetry(n=>n+1)}>Retry differences</button></p>:!page?<p role="status">Loading differences…</p>:<>{page.rows.length===0&&<p>No pending differences in this category.</p>}
    {page.rows.map(c=><article key={c.id}><strong>{trackerConflictFieldLabels[c.field]??c.field}{/^[A-Z]{1,2}$/.test(c.field)&&<span className="report-tracker-field-code"> ({c.field})</span>} · {c.reason.replaceAll('_',' ')}</strong><p className="report-tracker-identity">{c.rowKey}</p><dl><div><dt>Sheet</dt><dd>{value(c.sheetValue)}</dd></div><div><dt>AR web</dt><dd>{value(c.webValue)}</dd></div></dl>
     {c.reason==='unmapped_tracking_status'&&<p>The sheet status is retained verbatim. A status mapping needs review before it can replace the AR status.</p>}
     {c.field!=='identity'&&<div className="report-tracker-actions"><button disabled={busy} onClick={()=>void command({action:'resolve',conflictId:c.id,revision:c.revision,choice:'keep_web'})}>Keep AR value</button>{canAccept(c)&&<button disabled={busy} onClick={()=>void command({action:'resolve',conflictId:c.id,revision:c.revision,choice:'accept_sheet'})}>Accept sheet value</button>}</div>}
    </article>)}<div className="report-tracker-actions report-tracker-pagination"><button disabled={busy||cursors.length===1} onClick={()=>setNavigation({owner,reload:revision,category,cursors:cursors.slice(0,-1)})}>Back</button><span>Showing {page.rows.length} of {page.counts[category]} pending differences</span><button disabled={busy||!page.nextCursor} onClick={()=>page.nextCursor&&setNavigation({owner,reload:revision,category,cursors:[...cursors,page.nextCursor]})}>Next</button></div></>}
   </div>}
   {!!status.sheetActivity?.length&&<details className="report-tracker-review"><summary>Activity recorded in the sheet</summary><p>Actual dates have day precision. Import time is separate; matching verified Gmail events are excluded. Sheet records do not establish message counts or historical amounts.</p><table><thead><tr><th>Actual date</th><th>Activity</th><th>Invoices</th></tr></thead><tbody>{status.sheetActivity.map(item=><tr key={item.actualDate+item.field}><td>{item.actualDate}</td><td>{item.field==='R'?'First billing':item.field==='U'?'Follow 1':item.field==='V'?'Follow 2':'Follow 3'}</td><td>{item.invoices}</td></tr>)}</tbody></table></details>}
  </>}
 </div>;
}
