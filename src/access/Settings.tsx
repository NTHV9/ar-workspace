import GmailSettings from '../email/GmailSettings';
import {useState,useCallback} from 'react';
import {useWorkspaceMember} from './context';
import UserAccounts from './UserAccounts';
import SignatureSettings from '../email/SignatureSettings';
import BulkAccountSettings from '../settings/BulkAccountSettings';
import type {SettingsAccount} from '../settings/bulk-model';
import type {AccountListContext} from '../settings/account-list-context';
export default function Settings({token,onDirtyChange,onOpenAccount,initialAccountList,onAccountListChange,initialTab,onTabChange,onNavigationLockChange}:{token:string;onDirtyChange:(value:boolean)=>void;onOpenAccount:(account:SettingsAccount)=>void;initialAccountList?:AccountListContext;onAccountListChange:(value:AccountListContext)=>void;initialTab?:string;onTabChange:(tab:string)=>void;onNavigationLockChange:(locked:boolean)=>void}){
 const admin=useWorkspaceMember()?.administrator===true;const [tab,setTab]=useState(initialTab==='accounts'?'accounts':admin?(['connected','failed'].includes(new URLSearchParams(location.search).get('gmail')??'')?'gmail':'users'):'signature'),[dirty,setDirty]=useState(false),[locked,setLocked]=useState(false);
 const navigationLock=useCallback((value:boolean)=>{setLocked(value);onNavigationLockChange(value);},[onNavigationLockChange]);
 const choose=(next:string)=>{if(locked||dirty&&!confirm('Discard unsaved changes?'))return;setTab(next);onTabChange(next);};
 const change=useCallback((value:boolean)=>{setDirty(value);onDirtyChange(value);},[onDirtyChange]);
 return <><nav className="settings-sections" aria-label="Settings sections"><button aria-pressed={tab==='accounts'} disabled={locked} onClick={()=>choose('accounts')}>Account settings</button>{admin&&<button aria-pressed={tab==='users'} disabled={locked} onClick={()=>choose('users')}>Users &amp; access</button>}{admin&&<button aria-pressed={tab==='gmail'} disabled={locked} onClick={()=>choose('gmail')}>Gmail connections</button>}<button aria-pressed={tab==='signature'} disabled={locked} onClick={()=>choose('signature')}>My email signature</button></nav>{admin&&tab==='gmail'?<GmailSettings token={token} onDirtyChange={change}/>:tab==='accounts'?<BulkAccountSettings token={token} onDirtyChange={change} onOpenAccount={onOpenAccount} initialContext={initialAccountList} onContextChange={onAccountListChange} onNavigationLockChange={navigationLock}/>:admin&&tab==='users'?<UserAccounts token={token} onDirtyChange={change}/>:<SignatureSettings token={token} onDirtyChange={change}/>}</>;
}
