import GmailSettings from '../email/GmailSettings';
import {useState,useCallback} from 'react';
import {useWorkspaceMember} from './context';
import UserAccounts from './UserAccounts';
import SignatureSettings from '../email/SignatureSettings';
import BulkAccountSettings from '../settings/BulkAccountSettings';
export default function Settings({token,onDirtyChange}:{token:string;onDirtyChange:(value:boolean)=>void}){
 const admin=useWorkspaceMember()?.administrator===true;const [tab,setTab]=useState(admin?(['connected','failed'].includes(new URLSearchParams(location.search).get('gmail')??'')?'gmail':'users'):'signature'),[dirty,setDirty]=useState(false);
 const change=useCallback((value:boolean)=>{setDirty(value);onDirtyChange(value);},[onDirtyChange]);
 return <><nav className="settings-sections" aria-label="Settings sections"><button aria-pressed={tab==='accounts'} onClick={()=>{if(!dirty||confirm('Discard unsaved changes?'))setTab('accounts');}}>Account settings</button>{admin&&<button aria-pressed={tab==='users'} onClick={()=>{if(!dirty||confirm('Discard unsaved changes?'))setTab('users');}}>Users &amp; access</button>}{admin&&<button aria-pressed={tab==='gmail'} onClick={()=>{if(!dirty||confirm('Discard unsaved changes?'))setTab('gmail');}}>Gmail connections</button>}<button aria-pressed={tab==='signature'} onClick={()=>{if(!dirty||confirm('Discard unsaved changes?'))setTab('signature');}}>My email signature</button></nav>{admin&&tab==='gmail'?<GmailSettings token={token} onDirtyChange={change}/>:tab==='accounts'?<BulkAccountSettings token={token} onDirtyChange={change}/>:admin&&tab==='users'?<UserAccounts token={token} onDirtyChange={change}/>:<SignatureSettings token={token} onDirtyChange={change}/>}</>;
}
