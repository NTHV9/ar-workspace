import {useState,useCallback} from 'react';
import {useWorkspaceMember} from './context';
import UserAccounts from './UserAccounts';
import SignatureSettings from '../email/SignatureSettings';
export default function Settings({token,onDirtyChange}:{token:string;onDirtyChange:(value:boolean)=>void}){
 const admin=useWorkspaceMember()?.administrator===true;const [tab,setTab]=useState(admin?'users':'signature'),[dirty,setDirty]=useState(false);
 const change=useCallback((value:boolean)=>{setDirty(value);onDirtyChange(value);},[onDirtyChange]);
 return <>{admin&&<nav className="settings-sections" aria-label="Settings sections"><button aria-pressed={tab==='users'} onClick={()=>{if(!dirty||confirm('Discard unsaved changes?'))setTab('users');}}>Users &amp; access</button><button aria-pressed={tab==='signature'} onClick={()=>{if(!dirty||confirm('Discard unsaved changes?'))setTab('signature');}}>My email signature</button></nav>}{admin&&tab==='users'?<UserAccounts token={token} onDirtyChange={change}/>:<SignatureSettings token={token} onDirtyChange={change}/>}</>;
}
