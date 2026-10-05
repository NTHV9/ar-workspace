import {useEffect,useState} from 'react';
import type {RegionId} from '../domain/hotels';
import {notifyRegisterChanged} from '../register/model';
interface Conflict {id:string;rowKey:string;field:string;reason:string;sheetValue:unknown;webValue:unknown;revision:number}
interface Status {connected:boolean;enabled:boolean;available:boolean;heldWrites?:number;writebackAvailable?:boolean;bootstrapConfirmed?:boolean;revision:number;lastCheckedAt:string|null;pending:number;conflictCount:number;conflicts:Conflict[];sheetActivity?:{actualDate:string;field:string;invoices:number}[]}
interface Preview {previewId:string;snapshotHash:string;rowCount:number;matchedRows:number;heldRows:number;eligibleFields:number;reportedStatuses?:number;conflictingFields:number;details:{rowKey:string;field:string;sheetValue:unknown;webValue:unknown;decision:string}[]}
const value=(v:unknown)=>v===null||v===undefined?'Blank':String(v).slice(0,300);
const canAccept=(c:Conflict)=>c.reason!=='invalid_source_field'&&!['S','T','AA'].includes(c.field)&&!(c.field==='Y'&&c.sheetValue!==null&&!['','Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other'].includes(String(c.sheetValue)));
export function TrackerSheetStatus({token,region}:{token:string;region:RegionId}){
 const [result,setResult]=useState<{owner:string;status:Status}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[review,setReview]=useState(false);
 const owner=token+region,status=result?.owner===owner?result.status:null;
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
   if(input.action==='preview'){
    if(!data.previewId||!data.snapshotHash||!Array.isArray(data.details))throw Error();setPreviewResult({owner,value:data});
   }else{setPreviewResult(null);setRevision(n=>n+1);notifyRegisterChanged();}
  }catch(e){setPreviewResult(null);setError(e instanceof Error&&e.message==='tracker_authorization_required'?'Google access to this exact file is required. Authorize the file before reconnecting.':e instanceof Error&&['tracker_revision_conflict','tracker_preview_changed'].includes(e.message)?'This item changed. Load a fresh preview before reviewing again.':'Tracker update could not be confirmed. Retry to check the latest state.');}finally{setBusy(false);}
 };
 return <div className="report-tracker" aria-label={`${region} tracker synchronization`}>
  {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>setRevision(n=>n+1)}>Retry status</button></p>}
  {!status?<p role="status">Checking tracker connection…</p>:<>
   <p role="status">{!status.available?'Synchronization is awaiting activation.':!status.connected?'Tracker is ready to connect.':`${status.pending} pending writes · ${status.conflictCount} items to review`}{status.lastCheckedAt&&<> · Checked {new Date(status.lastCheckedAt).toLocaleString()}</>}</p>
   {status.connected&&(status.writebackAvailable===false||!!status.heldWrites)&&<p>{status.writebackAvailable===false?'Writeback to this file is held until a safe update method is verified.':'Some date cells require source-field review before writeback.'} {status.heldWrites??0} confirmed Sent dates are retained for future writeback.</p>}
   {status.available&&<div className="report-tracker-actions">
    {!status.connected?<button disabled={busy} onClick={()=>void command({action:'connect',revision:status.revision})}>Connect tracker</button>:status.bootstrapConfirmed?<button disabled={busy} onClick={()=>void command({action:'sync'})}>{busy?'Checking…':'Check changes'}</button>:<button disabled={busy} onClick={()=>void command({action:'preview'})}>Preview tracker import</button>}
    {status.conflictCount>0&&<button aria-expanded={review} onClick={()=>setReview(v=>!v)}>Review differences ({status.conflictCount})</button>}
   </div>}
   {preview&&<div className="report-tracker-review"><strong>Review the initial tracker import</strong><p>{preview.matchedRows} matched rows · {preview.eligibleFields} eligible fields · {preview.reportedStatuses??0} reported sheet statuses · {preview.heldRows} held rows · {preview.conflictingFields} field differences. Confirming imports eligible history and preserves conflicts for review.</p>
    <div className="report-tracker-preview-scroll"><table><thead><tr><th>Invoice key</th><th>Field</th><th>Sheet</th><th>AR web</th><th>Decision</th></tr></thead><tbody>{preview.details.map((item,index)=><tr key={index}><td>{item.rowKey}</td><td>{item.field}</td><td>{value(item.sheetValue)}</td><td>{value(item.webValue)}</td><td>{item.decision}</td></tr>)}</tbody></table></div>
    <p>Showing up to 200 field differences. The confirmation covers the reviewed snapshot of {preview.rowCount} rows; a changed file requires a fresh preview.</p><div className="report-tracker-actions"><button disabled={busy} onClick={()=>void command({action:'confirm_preview',previewId:preview.previewId,snapshotHash:preview.snapshotHash})}>Confirm initial import</button><button disabled={busy} onClick={()=>setPreviewResult(null)}>Discard preview</button></div>
   </div>}
   {review&&status.conflicts.length>0&&<div className="report-tracker-review"><p>Review each difference before applying it. Credit terms and formulas remain reference values.</p>
    {status.conflicts.map(c=><article key={c.id}><strong>{c.field} · {c.reason.replaceAll('_',' ')}</strong><p className="report-tracker-identity">{c.rowKey}</p><dl><div><dt>Sheet</dt><dd>{value(c.sheetValue)}</dd></div><div><dt>AR web</dt><dd>{value(c.webValue)}</dd></div></dl>
     {c.reason==='unmapped_tracking_status'&&<p>The sheet status is retained verbatim. A status mapping needs review before it can replace the AR status.</p>}
     {c.field!=='identity'&&<div className="report-tracker-actions"><button disabled={busy} onClick={()=>void command({action:'resolve',conflictId:c.id,revision:c.revision,choice:'keep_web'})}>Keep AR value</button>{canAccept(c)&&<button disabled={busy} onClick={()=>void command({action:'resolve',conflictId:c.id,revision:c.revision,choice:'accept_sheet'})}>Accept sheet value</button>}</div>}
    </article>)}{status.conflictCount>status.conflicts.length&&<p>Showing the first {status.conflicts.length} items. Resolve these to load the next items.</p>}
   </div>}
   {!!status.sheetActivity?.length&&<details className="report-tracker-review"><summary>Activity recorded in the sheet</summary><p>Actual dates have day precision. Import time is separate; matching verified Gmail events are excluded. Sheet records do not establish message counts or historical amounts.</p><table><thead><tr><th>Actual date</th><th>Activity</th><th>Invoices</th></tr></thead><tbody>{status.sheetActivity.map(item=><tr key={item.actualDate+item.field}><td>{item.actualDate}</td><td>{item.field==='R'?'First billing':item.field==='U'?'Follow 1':item.field==='V'?'Follow 2':'Follow 3'}</td><td>{item.invoices}</td></tr>)}</tbody></table></details>}
  </>}
 </div>;
}
