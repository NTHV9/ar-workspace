import {useEffect,useRef,useState} from 'react';
import {ShieldCheck,UserPlus,Pencil,Search,Trash2} from 'lucide-react';
import {REGION_IDS,regionLabel,type RegionId} from '../domain/hotels';
import {parseAccess,memberLogin,type AccessList,type AccessMember} from './model';
import {normalizeLogin} from './identity';
import './users-access.css';

const messages:Record<string,string>={
 access_revision_conflict:'This user changed since you opened it. Reload the list and review the latest access.',
 access_command_conflict:'This request was already used for different details. Reload before trying again.',
 access_administrator_locked:'The administrator account is protected.',
 access_invalid:'Review the account details and select at least one region.',
 access_login_invalid:'Use a valid email or a username of 3–32 letters, numbers, dots, underscores or hyphens.',
 access_password_invalid:'Use at least 12 characters. Shorten very long passwords, especially with non-Latin characters.',
 access_user_exists:'This login already has an account. Its password has not been changed.',
 access_lifecycle_pending:'Account creation or deletion is still pending. Check the user row before another change.',
 access_user_missing:'The user or pending request could not be found. Reload the list.',
 access_forbidden:'Only the administrator can manage users.',
 access_auth_unavailable:'The login service is unavailable. Check the pending request before trying again.',
 access_auth_unverified:'The login identity could not be verified. Access has not been activated.',
};
class AccessError extends Error {constructor(readonly code:string){super(messages[code]??'The user service is unavailable. Check the list before trying again.');}}
async function api<T>(token:string,url:string,init:RequestInit={}):Promise<T>{
 const r=await fetch(url,{...init,headers:{Authorization:'Bearer '+token,...init.headers}});const v=await r.json();
 if(!r.ok)throw new AccessError(v&&typeof v==='object'&&'error'in v?String(v.error):'unavailable');return v as T;
}
const post=<T,>(token:string,path:string,body:unknown)=>api<T>(token,path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
type Result={state?:'pending'|'complete';kind?:'create'|'delete';commandId?:string;needsCleanup?:boolean};
type FormMode='create'|'edit';
const blank=()=>({login:'',displayName:'',position:'',regions:['phuket'] as RegionId[],active:true,revision:0});

function DeleteDialog({user,busy,error,onCancel,onConfirm}:{user:AccessMember;busy:boolean;error:string;onCancel:()=>void;onConfirm:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="access-delete-dialog" aria-labelledby="delete-user-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}>
  <h2 id="delete-user-title">Delete user</h2><p>Delete <strong>{memberLogin(user)}</strong>?</p>
  <p>Sign-in access and the login account will be removed. Billing, collection and document history will be kept.</p>
  {error&&<p role="alert" className="error-message">{error}</p>}
  <footer><button disabled={busy} onClick={onCancel}>Cancel</button><button className="access-delete-confirm" disabled={busy} onClick={onConfirm}>{busy?'Deleting…':'Delete user'}</button></footer>
 </dialog>;
}

export default function UserAccounts({token,onDirtyChange}:{token:string;onDirtyChange?:(dirty:boolean)=>void}){
 const [data,setData]=useState<AccessList|null>(null),[page,setPage]=useState(0),[search,setSearch]=useState('');
 const [mode,setMode]=useState<FormMode>('create'),[draft,setDraft]=useState(blank),[selected,setSelected]=useState<AccessMember|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState(''),[reload,setReload]=useState(0),[dirty,setDirty]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<AccessMember|null>(null),[deleteError,setDeleteError]=useState(''),[pendingCreate,setPendingCreate]=useState<string|null>(null);
 const lifetime=useRef(0),pending=useRef<{key:string;id:string}|null>(null),deletion=useRef<{key:string;id:string}|null>(null),loginField=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  let alive=true;const version=++lifetime.current;setLoading(true);setError('');
  api<AccessList>(token,'/api/access/users?'+new URLSearchParams({page:String(page),search})).then(v=>{
   if(!Array.isArray(v.rows)||!Number.isSafeInteger(v.total)||v.total<0)throw Error('The user list is unavailable.');
   for(const row of v.rows){parseAccess(row);if(typeof row.active!=='boolean'||typeof row.registered!=='boolean')throw Error('The user list is unavailable.');}
   if(alive&&lifetime.current===version)setData(v);
  }).catch(e=>{if(alive&&lifetime.current===version){setData(null);setError(e.message);}}).finally(()=>{if(alive&&lifetime.current===version)setLoading(false);});
  return()=>{alive=false;};
 },[token,page,search,reload]);
 useEffect(()=>{onDirtyChange?.(dirty||busy);return()=>onDirtyChange?.(false);},[dirty,busy,onDirtyChange]);
 useEffect(()=>()=>{lifetime.current++;},[]);
 useEffect(()=>{setBusy(false);},[token]);
 const reset=(next:FormMode='create')=>{setMode(next);setDraft(blank());setSelected(null);setDirty(false);setPendingCreate(null);pending.current=null;setError('');loginField.current?.focus();};
 const edit=(row:AccessMember)=>{
  if(busy||dirty&&!window.confirm('Discard unsaved user changes?'))return;
  reset('edit');setSelected(row);setDraft({login:memberLogin(row),displayName:row.displayName??'',position:row.position??'',regions:[...row.regions],active:row.active,revision:row.revision});setStatus('');
 };
 const refresh=()=>setReload(n=>n+1);
 const settled=(result:Result,commandId:string)=>{
  if(result.state==='pending'){
   setStatus(result.kind==='delete'?'Deletion needs checking. This user can no longer access the workspace.':result.needsCleanup?'No confirmed login account was found. Delete the incomplete entry before creating it again.':'Creation needs checking. Use Check setup before creating another account with this login.');
   if(result.kind==='create')setPendingCreate(commandId);
  }else{setStatus(result.kind==='delete'?'User deleted. Business history is retained.':result.kind==='create'?'User created. They can now sign in with Google.':'Access saved. No invitation email was sent.');reset();}
  refresh();
 };
 const save=async()=>{
  if(busy||pendingCreate||!draft.regions.length)return;setError('');setStatus('');
  try{if(normalizeLogin(draft.login).kind==='username'||!draft.displayName.trim())throw Error('Enter a Google email and staff name.');}catch{setError('Enter a valid Google email and staff name.');return;}
  const key=JSON.stringify({mode,...draft,login:draft.login.trim().toLowerCase(),memberId:selected?.memberId});
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};const cmd=pending.current;const version=lifetime.current;setBusy(true);
  try{
   let result:Result;
   if(mode==='edit'&&selected?.memberId)result=await post(token,`/api/access/users/${selected.memberId}/edit`,{commandId:cmd.id,displayName:draft.displayName.trim(),position:draft.position.trim(),regions:draft.regions,active:draft.active,revision:draft.revision});
   else result=await post(token,'/api/access/users',{commandId:cmd.id,email:draft.login.trim().toLowerCase(),displayName:draft.displayName.trim(),position:draft.position.trim(),regions:draft.regions,active:draft.active,revision:draft.revision});
   if(lifetime.current===version){settled(result,cmd.id);if(mode!=='create'&&!draft.active)setStatus('Access suspended. Future requests from this user will be denied.');}
  }catch(e){if(lifetime.current===version){setError(e instanceof Error?e.message:'User request failed.');if(e instanceof AccessError&&['access_revision_conflict','access_command_conflict','access_invalid'].includes(e.code))pending.current=null;}}
  finally{if(lifetime.current===version)setBusy(false);}
 };
 const check=async(commandId:string)=>{
  if(busy)return;setBusy(true);setError('');const version=lifetime.current;
  try{const result=await post<Result>(token,`/api/access/users/commands/${commandId}/check`,{});if(lifetime.current===version)settled(result,commandId);}
  catch(e){if(lifetime.current===version){setError(e instanceof Error?e.message:'Status check failed.');if(e instanceof AccessError&&e.code==='access_user_missing'){setPendingCreate(null);pending.current=null;}}}
  finally{if(lifetime.current===version)setBusy(false);}
 };
 const remove=async()=>{
  if(!deleteTarget?.memberId||busy)return;const key=deleteTarget.memberId+':'+deleteTarget.revision;
  if(deletion.current?.key!==key)deletion.current={key,id:crypto.randomUUID()};const cmd=deletion.current;setBusy(true);setDeleteError('');const version=lifetime.current;
  try{const result=await post<Result>(token,`/api/access/users/${deleteTarget.memberId}/delete`,{commandId:cmd.id,revision:deleteTarget.revision,confirmed:true});if(lifetime.current===version){setDeleteTarget(null);deletion.current=null;settled(result,cmd.id);}}
  catch(e){if(lifetime.current===version)setDeleteError(e instanceof Error?e.message:'Deletion could not be confirmed.');}
  finally{if(lifetime.current===version)setBusy(false);}
 };
 return <main className="page user-access">
  <header className="access-heading"><div><h1>Users &amp; Access</h1><p>Create staff accounts and choose where they can work.</p></div><span className="access-admin"><ShieldCheck size={17}/> Administrator settings</span></header>
  <section className="access-mail-policy" aria-label="Email delivery by region"><p><strong>Phuket</strong><span>Email enabled · ar@katathani.com</span></p><p><strong>Khao Lak</strong><span>Email delivery is not enabled. Documents and external billing remain available.</span></p></section>
  <section className="panel access-form">
   <div className="access-form-heading"><h2>{mode==='edit'?'Edit user':'Create user'}</h2></div>
   <form onSubmit={e=>{e.preventDefault();void save();}}>
    <label className="access-email">Google email<input ref={loginField} type="email" autoComplete="off" maxLength={254} required readOnly={mode==='edit'} disabled={busy} value={draft.login} onChange={e=>{setDraft({...draft,login:e.target.value});setDirty(true);}} placeholder="name@gmail.com"/></label>
    <label className="access-email">Name<input type="text" autoComplete="off" maxLength={100} required disabled={busy} value={draft.displayName} onChange={e=>{setDraft({...draft,displayName:e.target.value});setDirty(true);}}/></label>
    <label className="access-email">Position<input type="text" autoComplete="off" maxLength={100} disabled={busy} value={draft.position} onChange={e=>{setDraft({...draft,position:e.target.value});setDirty(true);}} placeholder="Job title"/></label>
    <fieldset disabled={busy||!!pendingCreate}><legend>Allowed regions</legend>{REGION_IDS.map(r=><label key={r}><input type="checkbox" checked={draft.regions.includes(r)} onChange={e=>{setDraft({...draft,regions:e.target.checked?REGION_IDS.filter(x=>x===r||draft.regions.includes(x)):draft.regions.filter(x=>x!==r)});setDirty(true);}}/>{regionLabel(r)}</label>)}</fieldset>
    {mode!=='create'&&<label className="access-state">Status<select aria-label="Status" disabled={busy} value={draft.active?'active':'suspended'} onChange={e=>{setDraft({...draft,active:e.target.value==='active'});setDirty(true);}}><option value="active">Active</option><option value="suspended">Suspended</option></select></label>}
    <div className="access-form-actions">{pendingCreate?<button type="button" className="primary-button" disabled={busy} onClick={()=>void check(pendingCreate)}>Check creation</button>:<button className="primary-button" disabled={busy||!draft.login.trim()||!draft.regions.length}><UserPlus size={15}/>{busy?'Saving…':mode==='edit'?'Save user':'Create user'}</button>}{(mode==='edit'||dirty||pendingCreate||selected)&&<button type="button" disabled={busy} onClick={()=>reset()}>Cancel</button>}</div>
   </form>
   <p className="access-help">Sign in with Google using this exact email. No invitation email is sent.</p>
  </section>
  {error&&<p role="alert" className="error-message">{error} <button disabled={busy} onClick={refresh}>Reload list</button></p>}{status&&<p role="status" className="access-notice">{status}</p>}
  <section className="panel access-list"><header><h2>Users{data&&<small>{data.total}</small>}</h2><label className="access-search"><Search size={15}/><input type="search" aria-label="Search users" disabled={busy} placeholder="Search name or email" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label></header>
   {loading?<p role="status" className="access-empty">Loading users…</p>:data&&<><div className="access-table-scroll"><table><thead><tr><th>Name / Google email</th><th>Position</th><th>Regions</th><th>Status</th><th>Sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.rows.map(row=><tr key={row.memberId??memberLogin(row)}>
    <td><strong>{row.displayName||memberLogin(row)}</strong>{row.displayName&&<small>{memberLogin(row)}</small>}{row.administrator&&<small>Administrator · protected</small>}</td><td>{row.position||'—'}</td><td>{row.regions.map(regionLabel).join(' · ')}</td>
    <td><span className={row.active?'access-active':'access-suspended'}>{row.setupState==='creating'?'Setup pending':row.setupState==='deleting'?'Deleting · access revoked':row.active?'Active':'Suspended'}</span></td>
    <td>{row.username?'Google email needed':row.registered?'Google':row.hasLoginAccount?'Email confirmation pending':'Awaiting first sign-in'}</td>
    <td>{row.administrator?<span className="access-locked"><ShieldCheck size={16}/> Both regions</span>:<div className="access-row-actions">{row.pendingCommand?<button disabled={busy} onClick={()=>void check(row.pendingCommand!)}>{row.setupState==='deleting'?'Check deletion':'Check setup'}</button>:<><button aria-label={'Edit access for '+memberLogin(row)} disabled={busy||!!row.username} onClick={()=>edit(row)}><Pencil size={14}/> Edit</button></>}{row.memberId&&row.setupState!=='deleting'&&<button className="access-delete-button" aria-label={'Delete '+memberLogin(row)} disabled={busy} onClick={()=>{setDeleteTarget(row);setDeleteError('');}}><Trash2 size={14}/> Delete</button>}</div>}</td>
   </tr>)}</tbody></table>{!data.rows.length&&<p className="access-empty">No users match this login.</p>}</div><footer><span>{data.total?`${page*25+1}–${Math.min((page+1)*25,data.total)} of ${data.total}`:'0 users'}</span><div><button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={busy||(page+1)*25>=data.total} onClick={()=>setPage(p=>p+1)}>Next</button></div></footer></>}
  </section>
  {deleteTarget&&<DeleteDialog user={deleteTarget} busy={busy} error={deleteError} onCancel={()=>{setDeleteTarget(null);setDeleteError('');}} onConfirm={()=>void remove()}/>}</main>;
}
