import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {ProviderUsageContext} from '../operations/useProviderUsage';
import {quotaMetricSeverity,type ProviderUsage,type ProviderQuotaMetric} from '../operations/provider-usage';
import './storage-operations.css';
interface Status {enabled:boolean;activatedAt?:string;blocked?:boolean;active?:number;unresolved?:number;chargedEgress?:number;measurement?:{periodStart:string;periodEnd:string;used:{storedBytes:number|null;databaseBytes:number|null};observedAt:{storedBytes:string|null;databaseBytes:string|null}};pendingUploads?:{id:string;byteCount:number;createdAt:string;originFinished:boolean}[]}
function statusResponse(v:unknown):Status{if(!v||typeof v!=='object'||!('enabled'in v)||typeof v.enabled!=='boolean')throw Error('operations_unavailable');return v as Status;}
function errorCode(v:unknown){return v&&typeof v==='object'&&'error'in v&&typeof v.error==='string'?v.error:'operations_unavailable';}
const amount=(v:number|null|undefined)=>v==null?'Unavailable':new Intl.NumberFormat('en-GB',{maximumFractionDigits:1}).format(v>=1073741824?v/1073741824:v<1048576?v/1024:v/1048576)+(v>=1073741824?' GiB':v<1048576?' KiB':' MiB');
const stamp=(s:string|undefined|null)=>s&&Number.isFinite(Date.parse(s))?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date(s))+' ICT':'Unavailable';
function message(code:string){return ({budget_concurrency_exceeded:'Other uploads are still in progress. Check unconfirmed uploads before starting more.',storage_object_unavailable:'The uploaded object could not be verified. Its reservation is retained; no duplicate upload was started.',storage_upload_uncertain:'The upload is still unconfirmed. No duplicate upload was started.',storage_object_changed:'Stored bytes differ from the original receipt. The file needs review.'} as Record<string,string>)[code]??'Storage controls are unavailable. Retry to check the actual status.';}
function quantity(v:number|null,unit:ProviderQuotaMetric['unit']){return v===null?'Unavailable':unit==='bytes'?amount(v):new Intl.NumberFormat('en-GB',{maximumFractionDigits:3}).format(v);}
function ProviderMetric({metric:m,warningPercent}:{metric:ProviderQuotaMetric;warningPercent:number}){const severity=quotaMetricSeverity(m,warningPercent),percent=severity==='unknown'?null:m.used!/m.included!*100,stale=m.state==='stale',previous=!!m.periodEnd&&Date.parse(m.periodEnd)<=Date.now();return <div className="provider-metric" data-severity={severity} data-stale={stale}><h4>{m.label} · {m.product}</h4><p className="provider-quantity">{m.precision==='rounded'?'≈ ':''}{quantity(m.used,m.unit)} / {quantity(m.included,m.unit)}{m.unit==='bytes'?'':` ${m.unit}`}{percent!==null&&` · ${new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(percent)}%`}</p>{percent!==null&&<div className="provider-track" aria-hidden="true"><span style={{width:Math.min(100,percent)+'%'}}/></div>}<p>{m.state==='unavailable'?'Unavailable — current provider usage could not be verified.':stale?`${previous?'Previous billing cycle. ':''}Last-known snapshot — current usage is unverified.`:severity==='unknown'?'Percentage unavailable — usage or included quota is unknown.':severity==='exceeded'?'Included quota exceeded. Usage continues to be counted; the app has not paused work.':severity==='warning'?`Reached the ${warningPercent}% warning level. Work continues.`:'Below the saved warning level.'}</p><p className="provider-evidence">{m.scope}: {m.scopeLabel} · {m.periodBasis==='instantaneous'?'Instantaneous capacity':m.periodLabel} · Unit: {m.unit}</p><p className="provider-source">{m.source==='provider_snapshot'?'Verified snapshot · Last verified':'Provider API'} {stamp(m.verifiedAt)} · Observed {stamp(m.observedAt)} · Review due {stamp(m.staleAfter)}</p></div>;}
function ProviderSection({provider:p,token}:{provider:ProviderUsage;token:string}){
 const reader=useContext(ProviderUsageContext)!;
 const [value,setValue]=useState(String(p.warningPercent)),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const baseline=useRef({revision:p.settingsRevision,percent:p.warningPercent});
 const editing=useRef(false),alive=useRef(true),latest=useRef(p);latest.current=p;
 const command=useRef<{provider:ProviderUsage['provider'];warningPercent:number;expectedRevision:number;commandId:string}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!editing.current&&!command.current){baseline.current={revision:p.settingsRevision,percent:p.warningPercent};setValue(String(p.warningPercent));}
 },[p.settingsRevision,p.warningPercent]);
 useEffect(()=>{
  reader.setDirty(p.provider,editing.current||!!command.current);
  return()=>reader.setDirty(p.provider,false);
 },[reader.setDirty,value,notice,busy,p.provider]);
 const valid=/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=100;
 const name=p.provider==='cloudflare'?'Cloudflare':'Supabase';
 function changeValue(next:string){
  if(!editing.current)baseline.current={revision:p.settingsRevision,percent:p.warningPercent};
  editing.current=true;
  // Typing a different value is explicit changed intent; it cannot silently adopt a newer revision.
  if(command.current&&String(command.current.warningPercent)!==next)command.current=null;
  setValue(next);setNotice('');
 }
 async function save(){
  if(!valid||busy)return;
  const input=command.current??{provider:p.provider,warningPercent:Number(value),expectedRevision:baseline.current.revision,commandId:crypto.randomUUID()};
  command.current=input;setBusy(true);setNotice('');
  try{
   const response=await fetch('/api/operations/provider-alerts',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(!alive.current)return;
   if(response.status===409){
    const conflict=await response.json() as {latest?:{provider?:string;warningPercent?:number;revision?:number}};
    if(!alive.current)return;
    const saved=conflict.latest;
    if(saved?.provider===p.provider&&Number.isInteger(saved.warningPercent)&&saved.warningPercent!>=1&&saved.warningPercent!<=100&&Number.isSafeInteger(saved.revision)&&saved.revision!>=0){
     reader.updateSetting(p.provider,saved.warningPercent!,saved.revision!);
     baseline.current={revision:saved.revision!,percent:saved.warningPercent!};
    }
    // A definitive conflict resolves this command; another Save is an explicit reviewed retry.
    command.current=null;editing.current=true;
    setNotice('Alert changed elsewhere. Your unsaved value is retained. Review the latest saved level and save again.');
    await reader.refresh();return;
   }
   if(!response.ok){
    if([400,401,403].includes(response.status)){
     command.current=null;editing.current=true;
     setNotice(response.status===400?'The alert could not be accepted. Review the value and save again.':'Administrator access could not be verified. Sign in again.');return;
    }
    throw Error();
   }
   const result=await response.json() as {provider:string;warningPercent:number;revision:number};
   if(result.provider!==input.provider||result.warningPercent!==input.warningPercent||!Number.isSafeInteger(result.revision)||result.revision<0)throw Error();
   if(!alive.current)return;
   reader.updateSetting(p.provider,result.warningPercent,result.revision);
   command.current=null;baseline.current={revision:result.revision,percent:result.warningPercent};
   const superseded=latest.current.settingsRevision>result.revision;
   editing.current=superseded;
   setNotice(superseded?'Alert saved. A newer saved level is shown above; your value is retained for review.':'Alert saved.');
  }catch{if(alive.current){editing.current=true;setNotice('Save could not be confirmed. Retry Save alert to reuse the same command.');}}
  finally{if(alive.current)setBusy(false);}
 }
 return <section className="provider-section" aria-label={name+' provider usage'}><h3>{name}</h3><p className="provider-plan">{p.planLabel??'Plan unavailable'} · Saved warning level: {p.warningPercent}%</p>{p.metrics.length?p.metrics.map(m=><ProviderMetric key={m.id} metric={m} warningPercent={p.warningPercent}/>):<p>Unavailable — provider usage not connected. No usage is assumed to be zero.</p>}<div className="provider-alert-form"><label>Alert at %<input type="number" disabled={busy} min="1" max="100" step="1" value={value} aria-invalid={!valid} onChange={e=>changeValue(e.target.value)}/></label><button disabled={!valid||busy} onClick={()=>void save()}>{busy?'Saving…':'Save alert'}</button>{!valid&&<p>Enter a whole percentage from 1 to 100.</p>}{notice&&<p role="status">{notice}</p>}</div></section>;
}
export default function StorageOperations({token}:{token:string}){
 const provider=useContext(ProviderUsageContext);
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const current=useRef(token);current.current=token;
 const load=useCallback(async(signal?:AbortSignal)=>{setBusy(true);setError('');try{const r=await fetch('/api/operations/status',{headers:{Authorization:'Bearer '+token},signal});const v=await r.json();if(!r.ok)throw Error(errorCode(v));if(current.current===token&&!signal?.aborted)setStatus(statusResponse(v));}catch(e){if(current.current===token&&!signal?.aborted)setError(message(e instanceof Error?e.message:''));}finally{if(current.current===token&&!signal?.aborted)setBusy(false);}},[token]);
 useEffect(()=>{const controller=new AbortController();setStatus(null);setNotice('');void load(controller.signal);return()=>controller.abort();},[load]);
 async function reconcile(id:string){setBusy(true);setError('');setNotice('');try{const r=await fetch(`/api/operations/uploads/${id}/reconcile`,{method:'POST',headers:{Authorization:'Bearer '+token}});const v=await r.json();if(!r.ok)throw Error(errorCode(v));if(current.current===token){setNotice('The exact uploaded bytes were verified. No new upload was sent.');await load();}}catch(e){if(current.current===token)setError(message(e instanceof Error?e.message:''));}finally{if(current.current===token)setBusy(false);}}
 const m=status?.measurement;
 return <section className="panel storage-controls" aria-labelledby="storage-controls-title"><header><h2 id="storage-controls-title">Working files & usage</h2><button disabled={busy||provider?.loading} onClick={()=>{void load();void provider?.refresh();}}>{busy||provider?.loading?'Checking…':'Check usage'}</button></header>{provider?.error&&<p role="status">{provider.error}</p>}{provider&&!provider.data&&<p>Provider usage {provider.loading?'is being checked…':'is unavailable. Work continues.'}</p>}<div className="provider-sections">{provider?.data?.providers.map(p=><ProviderSection key={provider.identity+':'+p.provider} token={token} provider={p}/>)}</div>{error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{!status&&!error&&<p role="status">Loading storage controls…</p>}<h3>Application diagnostics — not provider billing</h3>{status?.enabled===false&&<p>Diagnostics are awaiting activation. No usage is assumed to be zero.</p>}{status?.enabled&&<>{status.blocked&&<p>Historical estimate overrun recorded for review. Work continues.</p>}<div className="storage-meters">{[{label:'Stored working files',used:m?.used.storedBytes,note:'Measured '+stamp(m?.observedAt.storedBytes)},{label:'Managed file transfers',used:status.chargedEgress,note:'Application calendar month (Asia/Bangkok): '+stamp(m?.periodStart)+' to '+stamp(m?.periodEnd)},{label:'Local database size',used:m?.used.databaseBytes,note:'Measured '+stamp(m?.observedAt.databaseBytes)}].map(item=><div key={item.label}><h3>{item.label}</h3><strong>{amount(item.used)}</strong><small>{item.note}</small></div>)}</div><p className="information-note">Managed transfers count application file traffic{status.activatedAt?` from ${stamp(status.activatedAt)}`:''}. Authentication, other API traffic and earlier usage are outside this diagnostic; these figures are not provider egress or provisioned database disk.</p><p>{status.active} active upload reservations · {status.unresolved} unconfirmed uploads</p>{!!status.pendingUploads?.length&&<><h3>Unconfirmed uploads</h3><p>Checking verifies the existing file without another upload.</p><ul className="storage-pending">{status.pendingUploads.map(row=><li key={row.id}><span>{stamp(row.createdAt)} · {amount(row.byteCount)}<small>Reference {row.id.slice(0,8)}</small></span><button disabled={busy} onClick={()=>void reconcile(row.id)}>Check uploaded file</button></li>)}</ul></>}</>}</section>;
}
