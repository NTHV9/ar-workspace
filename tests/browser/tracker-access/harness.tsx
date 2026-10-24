import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceAccessContext} from '../../../src/access/context';
import type {UserAccess} from '../../../src/access/model';
import {GoogleSheetsReports} from '../../../src/reports/GoogleSheetsReports';
const admin:UserAccess={memberId:'admin',email:'ar@katathani.com',administrator:true,regions:['phuket','khao-lak'],revision:1};
const member:UserAccess={memberId:'member',email:'synthetic@example.invalid',administrator:false,regions:['phuket'],revision:1};
function Harness(){const [access,setAccess]=useState<UserAccess|null>(new URLSearchParams(location.search).has('admin')?admin:new URLSearchParams(location.search).has('unresolved')?null:member);return <><nav><button onClick={()=>setAccess(admin)}>Use admin</button><button onClick={()=>setAccess(member)}>Use member</button><button onClick={()=>setAccess({...member,memberId:'other-member',email:'other@example.invalid'})}>Use other member</button><button onClick={()=>setAccess(null)}>Clear context</button></nav><WorkspaceAccessContext.Provider value={access}><GoogleSheetsReports token="synthetic-token"/></WorkspaceAccessContext.Provider></>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
