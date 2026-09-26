import {useEffect,useRef,useState} from 'react';
import {useCollectionPolicy} from '../collection/PolicyContext';
import {thaiToday} from '../domain/collection';
import {saveRegister} from './client';
import {registerError,type RegisterRow,type RegisterValues,type RegisterCommand} from './model';
import {planSheetPaste,type PasteColumn,type PasteEntry} from './paste';
export function RegisterPaste({text,rows,start,columns,values,token,onClose}:{text:string;rows:RegisterRow[];start:number;columns:PasteColumn[];values:RegisterValues;token:string;onClose:(saved:RegisterRow[],attempted:boolean)=>void}){
 const {policy}=useCollectionPolicy();const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),alive=useRef(true),saved=useRef<RegisterRow[]>([]);
 const [plan]=useState<{entries:PasteEntry[];error:string}>(()=>{try{return {entries:planSheetPaste(text,rows,start,columns,thaiToday(),policy?.rounds??[],values),error:''};}catch(e){return {entries:[],error:e instanceof Error?e.message:'Invalid paste'};}});
 const commands=useRef<RegisterCommand[]>([]);const [done,setDone]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;dialog.current?.showModal();return()=>{alive.current=false;};},[]);
 async function apply(){if(lock.current||!plan.entries.length)return;lock.current=true;setBusy(true);setError('');
  try{while(saved.current.length<plan.entries.length){if(!alive.current)return;const i=saved.current.length,e=plan.entries[i];commands.current[i]??={commandId:crypto.randomUUID(),revision:e.row.tracking_revision,workflowRevision:e.row.workflow_revision,exceptionRevision:e.row.exception_revision,values:e.values};const result=await saveRegister(e.row,commands.current[i],token);saved.current.push(result.row);if(alive.current)setDone(saved.current.length);}
   if(alive.current)onClose(saved.current,commands.current.length>0);
  }catch(e){if(alive.current)setError(registerError(e instanceof Error?e.message:''));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const count=plan.entries[0]?.cells.length??0;
 return <dialog ref={dialog} className="register-paste-dialog" aria-labelledby="paste-title" onCancel={e=>{e.preventDefault();if(!lock.current)onClose(saved.current,commands.current.length>0);}}>
  <header><div><h2 id="paste-title">Review pasted cells</h2><p>{plan.entries.length} invoice rows · {count} columns</p></div><button disabled={busy} onClick={()=>onClose(saved.current,commands.current.length>0)}>Close</button></header>
  {plan.error?<p role="alert">{plan.error}</p>:<div className="register-paste-preview"><table><thead><tr><th>Invoice</th>{columns.slice(0,count).map(c=><th key={c.field}>{c.label}</th>)}</tr></thead><tbody>{plan.entries.map((e,i)=><tr key={i}><th>{e.row.hotel} · {e.row.invoice_no??e.row.id}{i<done?' ✓':''}</th>{e.cells.map((c,j)=><td key={j}>{c||'—'}</td>)}</tr>)}</tbody></table></div>}
  {error&&<p role="alert">{error}</p>}
  <footer><span role="status">{done?`${done} of ${plan.entries.length} rows saved`:busy?'Saving...':'No changes saved yet'}</span><button disabled={busy} onClick={()=>onClose(saved.current,commands.current.length>0)}>{done?'Close — keep saved rows':'Cancel'}</button><button className="primary-button" disabled={busy||!!plan.error} onClick={()=>void apply()}>{busy?'Saving...':error?'Retry remaining rows':`Save ${plan.entries.length} rows`}</button></footer>
 </dialog>;
}
