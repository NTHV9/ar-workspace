import {useEffect,useState} from 'react';
import {ExternalLink} from 'lucide-react';
import {useWorkspaceMember} from '../access/context';
import {isRegionId,regionLabel,type RegionId} from '../domain/hotels';
import './google-sheets.css';
import {TrackerSheetStatus} from './TrackerSheetStatus';

interface SheetLink {region:RegionId;url:string|null}
export function GoogleSheetsReports({token}:{token:string}){
 const member=useWorkspaceMember(),accessKey=JSON.stringify([member?.regions,member?.revision]);
 const [result,setResult]=useState<{owner:string;rows:SheetLink[]}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const owner=token+accessKey,rows=result?.owner===owner?result.rows:null;
 useEffect(()=>{
  const controller=new AbortController();setResult(null);setError('');
  void fetch('/api/reports/sheets',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error();const value=await response.json() as {rows?:unknown};
   if(!Array.isArray(value.rows)||value.rows.some(row=>!row||!isRegionId(row.region)||row.url!==null&&(typeof row.url!=='string'||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,200}\/edit$/.test(row.url))))throw Error();
   if(!controller.signal.aborted)setResult({owner,rows:value.rows});
  }).catch(()=>{if(!controller.signal.aborted)setError('Google Sheets links could not be loaded.');});
  return()=>controller.abort();
 },[token,owner,retry]);
 return <section className="report-sheets" aria-label="Google Sheets">

  {error?<div className="report-sheets-error" role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:rows===null?<p role="status">Loading Google Sheets links…</p>:<ul>{rows.map(row=><li key={row.region}>
   <h2>{regionLabel(row.region)}</h2>
   {row.url?<a href={row.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open ${regionLabel(row.region)} Google Sheet (opens in a new tab)`}>Open Google Sheet<ExternalLink size={16} aria-hidden="true"/></a>:<span>Link not configured</span>}
   {row.url&&<TrackerSheetStatus key={owner+row.region} token={token} region={row.region}/>}
  </li>)}</ul>}
 </section>;
}
